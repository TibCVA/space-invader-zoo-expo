/**
 * Lutherie synthétique.
 *
 * Sept timbres, tous construits à partir d'oscillateurs, de bruit filtré et de
 * lignes à retard : vielle à roue, flûte, tambour sur cadre, cordes graves,
 * cloches, chœur, psaltérion. Aucun échantillon, aucun fichier.
 *
 * Règles de facture appliquées partout :
 *  - aucune enveloppe ne se termine par une coupure nette : la dernière rampe
 *    est linéaire vers zéro sur au moins 25 ms ;
 *  - chaque note a son propre placement stéréo et son propre dosage de
 *    réverbération ;
 *  - toute note est déterministe si on lui passe une graine.
 */

import { noiseBuffer, type AudioGraph, type BusName } from './context.js';
import { createRng } from './theory.js';

/** Destination d'une voix : une entrée sèche et une entrée réverbérée. */
export interface VoiceBus {
  readonly ctx: AudioContext;
  readonly dry: AudioNode;
  readonly wet: AudioNode;
}

/** Raccourci : extrait le bus voulu du graphe. */
export function voiceBus(graph: AudioGraph, bus: BusName): VoiceBus {
  return { ctx: graph.ctx, dry: graph.dry[bus], wet: graph.wet[bus] };
}

export type InstrumentName =
  | 'vielle'
  | 'flute'
  | 'tambour'
  | 'cordes'
  | 'cloche'
  | 'choeur'
  | 'psalterion';

export const INSTRUMENT_NAMES: readonly InstrumentName[] = Object.freeze([
  'vielle',
  'flute',
  'tambour',
  'cordes',
  'cloche',
  'choeur',
  'psalterion',
]);

export const INSTRUMENT_LABELS: Readonly<Record<InstrumentName, string>> = Object.freeze({
  vielle: 'vielle à roue',
  flute: 'flûte',
  tambour: 'tambour sur cadre',
  cordes: 'cordes graves',
  cloche: 'cloches',
  choeur: 'chœur',
  psalterion: 'psaltérion',
});

export interface NoteSpec {
  /** Fréquence fondamentale en hertz. */
  freq: number;
  /** Instant de départ, dans l'horloge de l'`AudioContext`. */
  time: number;
  /** Durée de la partie tenue, en secondes (hors extinction). */
  duration: number;
  /** 0–1. Défaut 0,8. */
  velocity?: number;
  /** −1 (gauche) à +1 (droite). Défaut 0. */
  pan?: number;
  /** Dosage de réverbération, 0–1. Défaut propre à l'instrument. */
  wet?: number;
  /** Gain multiplicatif supplémentaire. Défaut 1. */
  gain?: number;
  /** Ouverture du timbre, 0 (sourd) à 1 (clair). Défaut 0,5. */
  brightness?: number;
  /** Graine des micro-variations (jeu humain). Défaut dérivée de `time`. */
  seed?: number;
  /** Voyelle du chœur. */
  vowel?: Vowel;
}

export type Vowel = 'a' | 'e' | 'i' | 'o' | 'u';

const MIN_GAIN = 0.0001;
/** Extinction minimale : en dessous, l'oreille entend un clic. */
const MIN_RELEASE = 0.035;

/* ------------------------------------------------------------------ */
/* Outils communs                                                      */
/* ------------------------------------------------------------------ */

interface Channel {
  /** Y brancher les sources. */
  input: GainNode;
  /** Instant après lequel les nœuds peuvent être libérés. */
  release(endTime: number): void;
}

/**
 * Sortie d'une voix : gain de niveau, panoramique constant-power, et départ
 * de réverbération dosé note par note.
 */
function channel(bus: VoiceBus, level: number, pan: number, wet: number): Channel {
  const { ctx } = bus;
  const input = ctx.createGain();
  input.gain.value = level;

  const panner = ctx.createStereoPanner();
  panner.pan.value = Math.max(-1, Math.min(1, pan));
  input.connect(panner);

  panner.connect(bus.dry);

  const send = ctx.createGain();
  send.gain.value = Math.max(0, Math.min(1.4, wet));
  panner.connect(send);
  send.connect(bus.wet);

  return {
    input,
    release(endTime: number) {
      scheduleTeardown(ctx, endTime, () => {
        try {
          panner.disconnect();
          send.disconnect();
          input.disconnect();
        } catch {
          /* déjà libéré */
        }
      });
    },
  };
}

/** Libère les nœuds une fois la note vraiment terminée. */
function scheduleTeardown(ctx: AudioContext, endTime: number, fn: () => void): void {
  const delay = Math.max(0, endTime - ctx.currentTime) * 1000 + 120;
  setTimeout(fn, delay);
}

/**
 * Enveloppe ADSR sur un paramètre de gain.
 * Retourne l'instant de fin réel (extinction comprise).
 */
function envelope(
  param: AudioParam,
  t0: number,
  peak: number,
  attack: number,
  decay: number,
  sustain: number,
  duration: number,
  release: number,
): number {
  const p = Math.max(MIN_GAIN * 2, peak);
  const a = Math.max(0.002, attack);
  const d = Math.max(0.004, decay);
  const r = Math.max(MIN_RELEASE, release);
  const hold = Math.max(a + d, duration);

  param.cancelScheduledValues(t0);
  param.setValueAtTime(MIN_GAIN, t0);
  param.exponentialRampToValueAtTime(p, t0 + a);
  param.exponentialRampToValueAtTime(Math.max(MIN_GAIN * 2, p * sustain), t0 + a + d);
  param.setValueAtTime(Math.max(MIN_GAIN * 2, p * sustain), t0 + hold);
  param.exponentialRampToValueAtTime(MIN_GAIN, t0 + hold + r);
  // Dernier segment linéaire : l'exponentielle n'atteint jamais zéro.
  param.linearRampToValueAtTime(0, t0 + hold + r + 0.02);
  return t0 + hold + r + 0.02;
}

/** Enveloppe percussive : attaque immédiate, extinction exponentielle. */
function percussive(param: AudioParam, t0: number, peak: number, attack: number, decay: number): number {
  const p = Math.max(MIN_GAIN * 2, peak);
  const a = Math.max(0.0008, attack);
  const d = Math.max(0.02, decay);
  param.cancelScheduledValues(t0);
  param.setValueAtTime(MIN_GAIN, t0);
  param.linearRampToValueAtTime(p, t0 + a);
  param.exponentialRampToValueAtTime(MIN_GAIN, t0 + a + d);
  param.linearRampToValueAtTime(0, t0 + a + d + 0.02);
  return t0 + a + d + 0.02;
}

/** Source de bruit en boucle, prête à filtrer. */
function noiseSource(ctx: AudioContext, time: number, playbackRate = 1, offset = 0): AudioBufferSourceNode {
  const src = ctx.createBufferSource();
  src.buffer = noiseBuffer(ctx);
  src.loop = true;
  src.playbackRate.value = playbackRate;
  src.start(time, offset % 2.9);
  return src;
}

function osc(ctx: AudioContext, type: OscillatorType, freq: number, time: number, detuneCents = 0): OscillatorNode {
  const o = ctx.createOscillator();
  o.type = type;
  o.frequency.setValueAtTime(freq, time);
  o.detune.setValueAtTime(detuneCents, time);
  o.start(time);
  return o;
}

function filter(
  ctx: AudioContext,
  type: BiquadFilterType,
  freq: number,
  q: number,
  gainDb = 0,
): BiquadFilterNode {
  const f = ctx.createBiquadFilter();
  f.type = type;
  f.frequency.value = Math.max(20, Math.min(ctx.sampleRate / 2 - 200, freq));
  f.Q.value = q;
  f.gain.value = gainDb;
  return f;
}

function seedOf(spec: NoteSpec): number {
  if (spec.seed !== undefined) return spec.seed >>> 0;
  return (Math.floor(spec.time * 1000) ^ Math.floor(spec.freq * 7)) >>> 0;
}

/* ------------------------------------------------------------------ */
/* Vielle à roue                                                       */
/* ------------------------------------------------------------------ */

/**
 * Vielle à roue : deux dents de scie filtrées très légèrement désaccordées,
 * le crissement continu de la roue enduite de colophane, et le « coup de
 * chien » — le petit grésillement du chevalet sauteur à chaque attaque.
 */
export function playVielle(bus: VoiceBus, spec: NoteSpec): number {
  const { ctx } = bus;
  const t = spec.time;
  const rng = createRng(seedOf(spec));
  const velocity = spec.velocity ?? 0.8;
  const brightness = spec.brightness ?? 0.5;
  const ch = channel(bus, 0.2 * (spec.gain ?? 1), spec.pan ?? 0, spec.wet ?? 0.42);

  // Corps : deux scies, l'une très légèrement plus haute (battements lents).
  const body = ctx.createGain();
  const lp = filter(ctx, 'lowpass', spec.freq * (2.6 + brightness * 5.4), 3.4);
  const shape = filter(ctx, 'peaking', spec.freq * 2.1, 1.4, 4.5);

  const a = osc(ctx, 'sawtooth', spec.freq, t, rng.range(-4, -1));
  const b = osc(ctx, 'sawtooth', spec.freq, t, rng.range(2, 6));
  const aG = ctx.createGain();
  aG.gain.value = 0.62;
  const bG = ctx.createGain();
  bG.gain.value = 0.44;
  a.connect(aG).connect(lp);
  b.connect(bG).connect(lp);
  lp.connect(shape).connect(body);
  body.connect(ch.input);

  // La roue met un instant à entraîner la corde : attaque de 40–70 ms.
  const attack = 0.04 + rng.range(0, 0.03) + (1 - velocity) * 0.03;
  const end = envelope(body.gain, t, velocity, attack, 0.12, 0.86, spec.duration, 0.13);

  // Le filtre s'ouvre avec l'appui, puis se referme : la roue ralentit.
  lp.frequency.setValueAtTime(spec.freq * (1.6 + brightness * 2), t);
  lp.frequency.linearRampToValueAtTime(spec.freq * (2.6 + brightness * 5.4), t + attack + 0.06);
  lp.frequency.linearRampToValueAtTime(spec.freq * (2.1 + brightness * 3.2), end);

  // Crissement de roue : bruit large bande modulé par la rotation.
  const wheel = noiseSource(ctx, t, 1, rng.range(0, 2.8));
  const wheelBp = filter(ctx, 'bandpass', 1900 + brightness * 1500, 1.6);
  const wheelG = ctx.createGain();
  wheelG.gain.value = 0;
  wheel.connect(wheelBp).connect(wheelG).connect(ch.input);
  envelope(wheelG.gain, t, 0.05 * velocity, attack * 0.7, 0.1, 0.9, spec.duration, 0.12);

  // Modulation d'amplitude : un tour de roue toutes ~190 ms, irrégulier.
  const wheelLfo = osc(ctx, 'sine', rng.range(4.6, 6.1), t);
  const wheelLfoG = ctx.createGain();
  wheelLfoG.gain.value = 0.02 * velocity;
  wheelLfo.connect(wheelLfoG).connect(wheelG.gain);

  // Coup de chien : grésillement bref du chevalet sauteur.
  const dog = noiseSource(ctx, t, 1, rng.range(0, 2.8));
  const dogBp = filter(ctx, 'bandpass', 1250 + rng.range(-180, 220), 5.5);
  const dogG = ctx.createGain();
  dogG.gain.value = 0;
  dog.connect(dogBp).connect(dogG).connect(ch.input);
  percussive(dogG.gain, t, 0.14 * velocity, 0.004, 0.05 + rng.range(0, 0.03));

  const stop = end + 0.05;
  a.stop(stop);
  b.stop(stop);
  wheel.stop(stop);
  wheelLfo.stop(stop);
  dog.stop(t + 0.24);
  ch.release(stop);
  return end;
}

/**
 * Bourdon continu à la quinte : deux cordes tenues, jamais coupées net.
 * C'est la basse permanente de la vielle, gérée hors de la mélodie.
 */
export interface Drone {
  /** Change le niveau en douceur. */
  setLevel(level: number, fadeMs?: number): void;
  /** Transpose le bourdon en douceur (glissando). */
  setFreq(freq: number, glideMs?: number): void;
  /** Éteint et libère. */
  stop(fadeMs?: number): void;
}

export function startBourdon(
  bus: VoiceBus,
  options: { freq: number; time?: number; level?: number; pan?: number; wet?: number; seed?: number },
): Drone {
  const { ctx } = bus;
  const t = options.time ?? ctx.currentTime;
  const rng = createRng((options.seed ?? 0x600d0000) >>> 0);
  const ch = channel(bus, 0.16, options.pan ?? 0, options.wet ?? 0.5);

  const level = ctx.createGain();
  level.gain.setValueAtTime(MIN_GAIN, t);
  level.gain.exponentialRampToValueAtTime(Math.max(MIN_GAIN * 2, options.level ?? 0.7), t + 1.6);
  level.connect(ch.input);

  const lp = filter(ctx, 'lowpass', options.freq * 6.5, 1.4);
  lp.connect(level);

  // Corde de bourdon (fondamentale) et corde de mouche (quinte au-dessus).
  const parts: OscillatorNode[] = [];
  const ratios: [number, number, number][] = [
    [1, 0.62, -3],
    [1, 0.3, 4],
    [1.5, 0.34, -2],
    [1.5, 0.18, 5],
    [0.5, 0.28, 0],
  ];
  for (const [ratio, gain, detune] of ratios) {
    const o = osc(ctx, ratio === 0.5 ? 'triangle' : 'sawtooth', options.freq * ratio, t, detune + rng.range(-2, 2));
    const g = ctx.createGain();
    g.gain.value = gain;
    o.connect(g).connect(lp);
    parts.push(o);
  }

  // Souffle de roue permanent, très bas : le bourdon n'est jamais « propre ».
  const wheel = noiseSource(ctx, t, 1, rng.range(0, 2.8));
  const wheelBp = filter(ctx, 'bandpass', 1500, 1.1);
  const wheelG = ctx.createGain();
  wheelG.gain.value = 0.026;
  wheel.connect(wheelBp).connect(wheelG).connect(level);

  // Respiration lente de la manivelle : ±3 % sur trois périodes décorrélées.
  const breathTargets = [level.gain];
  for (let i = 0; i < 2; i += 1) {
    const lfo = osc(ctx, 'sine', rng.range(0.13, 0.31), t);
    const lfoG = ctx.createGain();
    lfoG.gain.value = 0.03;
    lfo.connect(lfoG);
    for (const target of breathTargets) lfoG.connect(target);
    parts.push(lfo);
  }

  let stopped = false;
  return {
    setLevel(value, fadeMs = 900) {
      if (stopped) return;
      const now = ctx.currentTime;
      level.gain.cancelScheduledValues(now);
      level.gain.setValueAtTime(Math.max(MIN_GAIN, level.gain.value), now);
      level.gain.linearRampToValueAtTime(Math.max(0, value), now + Math.max(0.05, fadeMs / 1000));
    },
    setFreq(freq, glideMs = 1200) {
      if (stopped) return;
      const now = ctx.currentTime;
      const glide = Math.max(0.08, glideMs / 1000);
      for (let i = 0; i < ratios.length; i += 1) {
        const node = parts[i];
        const ratio = ratios[i]?.[0] ?? 1;
        if (!node) continue;
        node.frequency.cancelScheduledValues(now);
        node.frequency.setValueAtTime(node.frequency.value, now);
        node.frequency.exponentialRampToValueAtTime(Math.max(20, freq * ratio), now + glide);
      }
      lp.frequency.cancelScheduledValues(now);
      lp.frequency.setValueAtTime(lp.frequency.value, now);
      lp.frequency.linearRampToValueAtTime(freq * 6.5, now + glide);
    },
    stop(fadeMs = 1800) {
      if (stopped) return;
      stopped = true;
      const now = ctx.currentTime;
      const fade = Math.max(0.12, fadeMs / 1000);
      level.gain.cancelScheduledValues(now);
      level.gain.setValueAtTime(Math.max(MIN_GAIN, level.gain.value), now);
      level.gain.exponentialRampToValueAtTime(MIN_GAIN, now + fade);
      level.gain.linearRampToValueAtTime(0, now + fade + 0.05);
      const stopAt = now + fade + 0.1;
      for (const p of parts) {
        try {
          p.stop(stopAt);
        } catch {
          /* déjà arrêté */
        }
      }
      try {
        wheel.stop(stopAt);
      } catch {
        /* déjà arrêté */
      }
      ch.release(stopAt);
    },
  };
}

/* ------------------------------------------------------------------ */
/* Flûte                                                               */
/* ------------------------------------------------------------------ */

/**
 * Flûte à bec de bois : sinus fondamental, harmonique paire discrète, souffle
 * filtré permanent, et une articulation nette au départ (le coup de langue et
 * le petit dérapage de justesse avant que la colonne d'air se stabilise).
 */
export function playFlute(bus: VoiceBus, spec: NoteSpec): number {
  const { ctx } = bus;
  const t = spec.time;
  const rng = createRng(seedOf(spec));
  const velocity = spec.velocity ?? 0.75;
  const brightness = spec.brightness ?? 0.5;
  const ch = channel(bus, 0.26 * (spec.gain ?? 1), spec.pan ?? 0, spec.wet ?? 0.5);

  const body = ctx.createGain();
  body.connect(ch.input);

  const fundamental = osc(ctx, 'sine', spec.freq, t);
  const fG = ctx.createGain();
  fG.gain.value = 1;
  fundamental.connect(fG).connect(body);

  // Le timbre de flûte tient à une deuxième et une troisième harmonique faibles.
  const h2 = osc(ctx, 'sine', spec.freq * 2, t, rng.range(-3, 3));
  const h2G = ctx.createGain();
  h2G.gain.value = 0.1 + brightness * 0.14;
  h2.connect(h2G).connect(body);

  const h3 = osc(ctx, 'triangle', spec.freq * 3, t, rng.range(-4, 4));
  const h3G = ctx.createGain();
  h3G.gain.value = 0.03 + brightness * 0.05;
  h3.connect(h3G).connect(body);

  // Articulation : la hauteur monte de 12 centièmes vers la justesse.
  const scoop = rng.range(0.6, 1.4) * (0.4 + velocity * 0.6);
  for (const [o, mult] of [
    [fundamental, 1],
    [h2, 2],
    [h3, 3],
  ] as const) {
    o.frequency.cancelScheduledValues(t);
    o.frequency.setValueAtTime(spec.freq * mult * (1 - 0.012 * scoop), t);
    o.frequency.exponentialRampToValueAtTime(spec.freq * mult, t + 0.05);
  }

  const attack = 0.03 + rng.range(0, 0.02);
  const end = envelope(body.gain, t, velocity * 0.9, attack, 0.09, 0.88, spec.duration, 0.14);

  // Souffle : bruit passe-bande autour de la fondamentale et de son octave.
  const breath = noiseSource(ctx, t, 1, rng.range(0, 2.8));
  const bp = filter(ctx, 'bandpass', spec.freq * 2.05, 1.1);
  const hs = filter(ctx, 'highshelf', 4200, 0.7, 4);
  const breathG = ctx.createGain();
  breathG.gain.value = 0;
  breath.connect(bp).connect(hs).connect(breathG).connect(ch.input);
  // Le souffle est plus fort à l'attaque, puis se stabilise bas.
  breathG.gain.setValueAtTime(MIN_GAIN, t);
  breathG.gain.linearRampToValueAtTime(0.085 * velocity, t + 0.02);
  breathG.gain.exponentialRampToValueAtTime(Math.max(MIN_GAIN * 2, 0.03 * velocity), t + 0.16);
  breathG.gain.setValueAtTime(Math.max(MIN_GAIN * 2, 0.03 * velocity), t + Math.max(0.2, spec.duration));
  breathG.gain.exponentialRampToValueAtTime(MIN_GAIN, end - 0.02);
  breathG.gain.linearRampToValueAtTime(0, end);

  // Vibrato retardé : il n'apparaît que sur les notes tenues.
  const vibrato = osc(ctx, 'sine', rng.range(4.4, 5.4), t);
  const vibG = ctx.createGain();
  vibG.gain.setValueAtTime(0, t);
  if (spec.duration > 0.45) {
    vibG.gain.setValueAtTime(0, t + 0.22);
    vibG.gain.linearRampToValueAtTime(spec.freq * 0.006, t + Math.min(spec.duration, 0.7));
  }
  vibrato.connect(vibG);
  vibG.connect(fundamental.frequency);

  const stop = end + 0.05;
  fundamental.stop(stop);
  h2.stop(stop);
  h3.stop(stop);
  breath.stop(stop);
  vibrato.stop(stop);
  ch.release(stop);
  return end;
}

/* ------------------------------------------------------------------ */
/* Tambour sur cadre                                                   */
/* ------------------------------------------------------------------ */

/**
 * Tambour sur cadre (le bendir des ménétriers) : la frappe de la peau, le
 * corps grave qui descend, et la résonance du cadre qui traîne un peu.
 */
export function playTambour(bus: VoiceBus, spec: NoteSpec): number {
  const { ctx } = bus;
  const t = spec.time;
  const rng = createRng(seedOf(spec));
  const velocity = spec.velocity ?? 0.8;
  // Une peau tendue sur un cadre de bois sonne entre 60 et 180 Hz, quelle que
  // soit la note que le compositeur lui envoie : on borne, sinon la frappe
  // descend sous le seuil d'audition des petits haut-parleurs et ne reste
  // qu'un souffle. L'écart entre frappe au centre et frappe au bord subsiste.
  const freq = Math.min(180, Math.max(58, spec.freq > 0 ? spec.freq * 2 : 96));
  const ch = channel(bus, 0.42 * (spec.gain ?? 1), spec.pan ?? 0, spec.wet ?? 0.26);

  // Corps : sinus dont la hauteur chute d'une quinte et demie.
  const bodyOsc = osc(ctx, 'sine', freq * 2.1, t);
  bodyOsc.frequency.exponentialRampToValueAtTime(freq * 0.78, t + 0.085);
  const bodyG = ctx.createGain();
  bodyOsc.connect(bodyG).connect(ch.input);
  const bodyEnd = percussive(bodyG.gain, t, velocity * 0.85, 0.0015, 0.22 + velocity * 0.16);

  // Peau : bruit passe-bande, très court.
  const skin = noiseSource(ctx, t, 1, rng.range(0, 2.8));
  const skinBp = filter(ctx, 'bandpass', 300 + rng.range(-40, 60), 0.9);
  const skinG = ctx.createGain();
  skin.connect(skinBp).connect(skinG).connect(ch.input);
  percussive(skinG.gain, t, velocity * 0.5, 0.001, 0.1);

  // Résonance du cadre : bande étroite qui sonne après la frappe.
  const ring = noiseSource(ctx, t, 1, rng.range(0, 2.8));
  const ringBp = filter(ctx, 'bandpass', freq * 3.6 + rng.range(-20, 30), 11);
  const ringG = ctx.createGain();
  ring.connect(ringBp).connect(ringG).connect(ch.input);
  const ringEnd = percussive(ringG.gain, t, velocity * 0.17, 0.006, 0.42 + rng.range(0, 0.2));

  // Claque de la main : très haute, très brève, donne la définition.
  const slap = noiseSource(ctx, t, 1, rng.range(0, 2.8));
  const slapHp = filter(ctx, 'highpass', 3800, 0.8);
  const slapG = ctx.createGain();
  slap.connect(slapHp).connect(slapG).connect(ch.input);
  percussive(slapG.gain, t, velocity * 0.2, 0.0008, 0.032);

  const end = Math.max(bodyEnd, ringEnd);
  const stop = end + 0.05;
  bodyOsc.stop(stop);
  skin.stop(t + 0.3);
  ring.stop(stop);
  slap.stop(t + 0.14);
  ch.release(stop);
  return end;
}

/* ------------------------------------------------------------------ */
/* Cordes graves                                                       */
/* ------------------------------------------------------------------ */

/**
 * Cordes graves (vièles d'archet) : trois triangles désaccordés passés dans un
 * chorus à deux lignes à retard modulées — l'épaisseur d'un pupitre, pas d'un
 * instrument solo. Attaque lente d'archet, extinction longue.
 */
export function playCordes(bus: VoiceBus, spec: NoteSpec): number {
  const { ctx } = bus;
  const t = spec.time;
  const rng = createRng(seedOf(spec));
  const velocity = spec.velocity ?? 0.6;
  const brightness = spec.brightness ?? 0.4;
  const ch = channel(bus, 0.17 * (spec.gain ?? 1), spec.pan ?? 0, spec.wet ?? 0.6);

  const body = ctx.createGain();
  const lp = filter(ctx, 'lowpass', spec.freq * (4 + brightness * 6) + 220, 0.9);
  const warmth = filter(ctx, 'peaking', spec.freq * 1.9, 1.1, 3);
  lp.connect(warmth);

  const detunes = [rng.range(-9, -5), rng.range(-2, 2), rng.range(5, 9)];
  const oscs: OscillatorNode[] = [];
  for (let i = 0; i < detunes.length; i += 1) {
    const o = osc(ctx, i === 1 ? 'sawtooth' : 'triangle', spec.freq, t, detunes[i] as number);
    const g = ctx.createGain();
    g.gain.value = i === 1 ? 0.28 : 0.42;
    o.connect(g).connect(lp);
    oscs.push(o);
  }
  // Octave inférieure discrète : assoit le pupitre.
  const sub = osc(ctx, 'sine', spec.freq * 0.5, t);
  const subG = ctx.createGain();
  subG.gain.value = 0.24;
  sub.connect(subG).connect(lp);
  oscs.push(sub);

  // Chorus : deux retards courts modulés lentement, à des phases différentes.
  const dryG = ctx.createGain();
  dryG.gain.value = 0.62;
  warmth.connect(dryG).connect(body);

  for (let i = 0; i < 2; i += 1) {
    const delay = ctx.createDelay(0.06);
    delay.delayTime.value = 0.016 + i * 0.011;
    const lfo = osc(ctx, 'sine', 0.19 + i * 0.13 + rng.range(-0.03, 0.03), t);
    const lfoG = ctx.createGain();
    lfoG.gain.value = 0.0028 + i * 0.0011;
    lfo.connect(lfoG).connect(delay.delayTime);
    const wetG = ctx.createGain();
    wetG.gain.value = 0.34;
    const side = ctx.createStereoPanner();
    side.pan.value = i === 0 ? -0.42 : 0.42;
    warmth.connect(delay).connect(wetG).connect(side).connect(body);
    oscs.push(lfo);
  }

  body.connect(ch.input);

  const attack = 0.24 + rng.range(0, 0.12) + (1 - velocity) * 0.14;
  const end = envelope(body.gain, t, velocity * 0.85, attack, 0.3, 0.82, spec.duration, 0.65);

  // L'archet ouvre le timbre en s'appuyant, puis le referme.
  lp.frequency.setValueAtTime(spec.freq * 2.2 + 140, t);
  lp.frequency.linearRampToValueAtTime(spec.freq * (4 + brightness * 6) + 220, t + attack + 0.2);
  lp.frequency.linearRampToValueAtTime(spec.freq * 2.6 + 160, end);

  const stop = end + 0.05;
  for (const o of oscs) o.stop(stop);
  ch.release(stop);
  return end;
}

/* ------------------------------------------------------------------ */
/* Cloches                                                             */
/* ------------------------------------------------------------------ */

/**
 * Cloche : modulation de fréquence à deux opérateurs, rapport inharmonique
 * 1:1,41 (la racine de deux, cœur du timbre de bronze), index décroissant
 * rapidement, plus deux partiels libres — le hum grave et la quinte.
 */
export function playCloche(bus: VoiceBus, spec: NoteSpec): number {
  const { ctx } = bus;
  const t = spec.time;
  const rng = createRng(seedOf(spec));
  const velocity = spec.velocity ?? 0.7;
  const brightness = spec.brightness ?? 0.5;
  const ch = channel(bus, 0.2 * (spec.gain ?? 1), spec.pan ?? 0, spec.wet ?? 0.72);

  const tail = 2.2 + spec.duration * 0.8 + brightness * 1.6;

  // --- Opérateur porteur + modulateur ------------------------------------
  const carrier = osc(ctx, 'sine', spec.freq, t);
  const modulator = osc(ctx, 'sine', spec.freq * 1.4142 * (1 + rng.range(-0.004, 0.004)), t);
  const modDepth = ctx.createGain();
  modDepth.gain.setValueAtTime(spec.freq * (5 + brightness * 6), t);
  modDepth.gain.exponentialRampToValueAtTime(Math.max(1, spec.freq * 0.28), t + 0.5);
  modDepth.gain.exponentialRampToValueAtTime(Math.max(0.5, spec.freq * 0.03), t + tail * 0.6);
  modulator.connect(modDepth).connect(carrier.frequency);

  const carrierG = ctx.createGain();
  carrier.connect(carrierG).connect(ch.input);
  const mainEnd = percussive(carrierG.gain, t, velocity * 0.6, 0.004, tail);

  // --- Partiels libres ----------------------------------------------------
  const partials: [number, number, number][] = [
    [0.5, 0.3, tail * 1.15], // hum
    [1.19, 0.14, tail * 0.7], // tierce mineure
    [1.5, 0.11, tail * 0.6], // quinte
    [2.0, 0.09, tail * 0.45], // nominale
    [2.66, 0.05, tail * 0.3],
  ];
  const nodes: OscillatorNode[] = [carrier, modulator];
  let end = mainEnd;
  for (const [ratio, gain, decay] of partials) {
    const o = osc(ctx, 'sine', spec.freq * ratio * (1 + rng.range(-0.003, 0.003)), t, rng.range(-5, 5));
    const g = ctx.createGain();
    const pan = ctx.createStereoPanner();
    pan.pan.value = rng.range(-0.3, 0.3);
    o.connect(g).connect(pan).connect(ch.input);
    const e = percussive(g.gain, t, velocity * gain, 0.006, decay);
    if (e > end) end = e;
    nodes.push(o);
  }

  // --- Choc du battant ----------------------------------------------------
  const strike = noiseSource(ctx, t, 1, rng.range(0, 2.8));
  const strikeBp = filter(ctx, 'bandpass', spec.freq * 6 + 900, 1.4);
  const strikeG = ctx.createGain();
  strike.connect(strikeBp).connect(strikeG).connect(ch.input);
  percussive(strikeG.gain, t, velocity * 0.13, 0.001, 0.06);

  const stop = end + 0.05;
  for (const n of nodes) n.stop(stop);
  strike.stop(t + 0.2);
  ch.release(stop);
  return end;
}

/* ------------------------------------------------------------------ */
/* Chœur                                                               */
/* ------------------------------------------------------------------ */

/** Formants : fréquences, gains relatifs et sélectivité par voyelle. */
const FORMANTS: Readonly<Record<Vowel, readonly [number, number, number]>> = Object.freeze({
  a: [730, 1090, 2440],
  e: [530, 1840, 2480],
  i: [270, 2290, 3010],
  o: [570, 840, 2410],
  u: [325, 700, 2530],
});

const FORMANT_GAINS: readonly [number, number, number] = [1, 0.42, 0.18];
const FORMANT_Q: readonly [number, number, number] = [9, 11, 13];

/**
 * Chœur d'hommes bouche fermée : deux voix légèrement désaccordées, filtrées
 * par trois résonances formantiques, plus un souffle de salle. Entrée et
 * sortie très lentes : une nappe de chœur ne doit jamais s'arrêter net.
 */
export function playChoeur(bus: VoiceBus, spec: NoteSpec): number {
  const { ctx } = bus;
  const t = spec.time;
  const rng = createRng(seedOf(spec));
  const velocity = spec.velocity ?? 0.55;
  const vowel: Vowel = spec.vowel ?? 'o';
  const ch = channel(bus, 0.24 * (spec.gain ?? 1), spec.pan ?? 0, spec.wet ?? 0.78);

  const source = ctx.createGain();
  source.gain.value = 1;

  const nodes: OscillatorNode[] = [];
  for (let i = 0; i < 2; i += 1) {
    const o = osc(ctx, 'sawtooth', spec.freq, t, i === 0 ? rng.range(-11, -5) : rng.range(5, 11));
    const g = ctx.createGain();
    g.gain.value = 0.4;
    o.connect(g).connect(source);
    nodes.push(o);

    // Vibrato de choriste : lent, peu profond, et différent pour chaque voix.
    const vib = osc(ctx, 'sine', rng.range(4.1, 5.3), t);
    const vibG = ctx.createGain();
    vibG.gain.setValueAtTime(0, t);
    vibG.gain.linearRampToValueAtTime(spec.freq * 0.005, t + Math.min(1.2, spec.duration * 0.6 + 0.3));
    vib.connect(vibG).connect(o.frequency);
    nodes.push(vib);
  }
  // Fondamentale sinus : le grave que la scie seule ne donne pas.
  const sub = osc(ctx, 'sine', spec.freq, t);
  const subG = ctx.createGain();
  subG.gain.value = 0.22;
  sub.connect(subG).connect(source);
  nodes.push(sub);

  const body = ctx.createGain();
  const table = FORMANTS[vowel];
  for (let i = 0; i < 3; i += 1) {
    const bp = filter(ctx, 'bandpass', table[i] as number, FORMANT_Q[i] as number);
    const g = ctx.createGain();
    g.gain.value = FORMANT_GAINS[i] as number;
    const pan = ctx.createStereoPanner();
    pan.pan.value = rng.range(-0.25, 0.25);
    source.connect(bp).connect(g).connect(pan).connect(body);
  }
  // Un peu de signal non filtré : sinon le chœur devient nasillard.
  const bleed = ctx.createGain();
  bleed.gain.value = 0.1;
  const bleedLp = filter(ctx, 'lowpass', 2600, 0.7);
  source.connect(bleedLp).connect(bleed).connect(body);

  body.connect(ch.input);

  const attack = 0.34 + rng.range(0, 0.16);
  const end = envelope(body.gain, t, velocity * 0.8, attack, 0.4, 0.86, spec.duration, 0.9);

  const stop = end + 0.05;
  for (const n of nodes) n.stop(stop);
  ch.release(stop);
  return end;
}

/* ------------------------------------------------------------------ */
/* Psaltérion (Karplus-Strong)                                         */
/* ------------------------------------------------------------------ */

const pluckCache = new WeakMap<AudioContext, Map<string, AudioBuffer>>();

/**
 * Corde pincée par la méthode de Karplus-Strong : une ligne à retard remplie
 * de bruit, rebouclée à travers un filtre moyenneur. Le tampon est calculé une
 * fois par hauteur puis mis en cache — coût négligeable en jeu.
 */
export function pluckBuffer(ctx: AudioContext, freq: number, brightness = 0.5, seed = 1): AudioBuffer {
  let cache = pluckCache.get(ctx);
  if (!cache) {
    cache = new Map();
    pluckCache.set(ctx, cache);
  }
  const key = `${Math.round(freq * 2)}:${Math.round(brightness * 4)}`;
  const cached = cache.get(key);
  if (cached) return cached;

  const rate = ctx.sampleRate;
  const seconds = 2.1;
  const length = Math.floor(rate * seconds);
  const buffer = ctx.createBuffer(1, length, rate);
  const data = buffer.getChannelData(0);
  const n = Math.max(2, Math.round(rate / Math.max(20, freq)));
  const rng = createRng(seed >>> 0);

  // Excitation : bruit adouci — un plectre n'injecte pas de bruit blanc pur.
  let previous = 0;
  const smoothing = 0.35 + brightness * 0.5;
  for (let i = 0; i < n; i += 1) {
    const white = rng.range(-1, 1);
    previous += smoothing * (white - previous);
    data[i] = previous;
  }

  // Boucle : moyenne glissante (amortissement des aigus) + perte globale.
  const damping = 0.4 + brightness * 0.12;
  const loss = 0.9965 + brightness * 0.0022;
  for (let i = n; i < length; i += 1) {
    const a = data[i - n] as number;
    const b = data[i - n - 1] ?? a;
    data[i] = (a * (1 - damping) + b * damping) * loss;
  }

  // Extinction finale garantie : pas de résidu qui claque à la fin du tampon.
  const fade = Math.floor(rate * 0.25);
  for (let i = 0; i < fade; i += 1) {
    const idx = length - 1 - i;
    data[idx] = (data[idx] as number) * (i / fade);
  }

  cache.set(key, buffer);
  return buffer;
}

/**
 * Psaltérion : la corde pincée, colorée par la caisse (deux résonances) et
 * accompagnée du bruit du plectre.
 */
export function playPsalterion(bus: VoiceBus, spec: NoteSpec): number {
  const { ctx } = bus;
  const t = spec.time;
  const rng = createRng(seedOf(spec));
  const velocity = spec.velocity ?? 0.7;
  const brightness = spec.brightness ?? 0.55;
  const ch = channel(bus, 0.3 * (spec.gain ?? 1), spec.pan ?? 0, spec.wet ?? 0.5);

  const src = ctx.createBufferSource();
  src.buffer = pluckBuffer(ctx, spec.freq, brightness, 0x5111 + Math.round(spec.freq));
  src.playbackRate.value = 1;
  src.start(t);

  const body = ctx.createGain();
  const resonance1 = filter(ctx, 'peaking', 420 + rng.range(-30, 30), 2.2, 5);
  const resonance2 = filter(ctx, 'peaking', 1180 + rng.range(-70, 70), 2.6, 3.5);
  const tilt = filter(ctx, 'highshelf', 3600, 0.7, -4 + brightness * 8);
  src.connect(resonance1).connect(resonance2).connect(tilt).connect(body);
  body.connect(ch.input);

  // Une corde pincée décroît d'elle-même : l'enveloppe ne fait qu'étouffer
  // la note quand elle doit s'arrêter, avec un amortissement de paume doux.
  const hold = Math.max(0.2, Math.min(spec.duration, 1.9));
  body.gain.setValueAtTime(MIN_GAIN, t);
  body.gain.linearRampToValueAtTime(velocity, t + 0.004);
  body.gain.setValueAtTime(velocity, t + hold);
  body.gain.exponentialRampToValueAtTime(Math.max(MIN_GAIN * 2, velocity * 0.02), t + hold + 0.28);
  body.gain.linearRampToValueAtTime(0, t + hold + 0.34);

  // Bruit du plectre.
  const pick = noiseSource(ctx, t, 1, rng.range(0, 2.8));
  const pickBp = filter(ctx, 'bandpass', 2600 + rng.range(-300, 300), 2.4);
  const pickG = ctx.createGain();
  pick.connect(pickBp).connect(pickG).connect(ch.input);
  percussive(pickG.gain, t, velocity * 0.1, 0.001, 0.03);

  const end = t + hold + 0.34;
  src.stop(end + 0.02);
  pick.stop(t + 0.12);
  ch.release(end);
  return end;
}

/* ------------------------------------------------------------------ */
/* Aiguillage                                                          */
/* ------------------------------------------------------------------ */

/** Joue une note sur l'instrument demandé. Retourne l'instant de fin réel. */
export function playNote(bus: VoiceBus, instrument: InstrumentName, spec: NoteSpec): number {
  switch (instrument) {
    case 'vielle':
      return playVielle(bus, spec);
    case 'flute':
      return playFlute(bus, spec);
    case 'tambour':
      return playTambour(bus, spec);
    case 'cordes':
      return playCordes(bus, spec);
    case 'cloche':
      return playCloche(bus, spec);
    case 'choeur':
      return playChoeur(bus, spec);
    case 'psalterion':
      return playPsalterion(bus, spec);
    default:
      return spec.time;
  }
}
