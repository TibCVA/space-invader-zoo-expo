/**
 * Effets sonores.
 *
 * Tous synthétisés, tous sur le bus « effets ». Chaque effet est construit à
 * partir de trois briques : un choc (bruit court filtré), un corps (oscillateur
 * enveloppé) et une résonance (bande étroite qui traîne). C'est la recette qui
 * distingue un vrai bruit d'objet d'un « bip ».
 *
 * Contraintes tenues :
 *  - un appel construit au plus une quinzaine de nœuds et rend la main
 *    immédiatement (aucune allocation de tampon, aucune boucle sur des
 *    échantillons : le bruit vient du tampon partagé) ;
 *  - douze effets peuvent sonner en même temps sans saturer, grâce au budget
 *    de voix et à la baisse automatique du niveau quand ça se bouscule ;
 *  - chaque appel varie légèrement (hauteur, panoramique, timbre) : deux clics
 *    de suite ne sont jamais identiques.
 */

import { noiseBuffer, type AudioGraph } from './context.js';
import { createRng, midiToFreq, type Rng } from './theory.js';
import { playCloche, playPsalterion, voiceBus, type VoiceBus } from './instruments.js';

/** Clefs imposées par `docs/02-API.md`. */
export type SfxKey =
  | 'clic'
  | 'clic_lourd'
  | 'page'
  | 'piece'
  | 'construction'
  | 'recrutement'
  | 'pas_terre'
  | 'pas_pierre'
  | 'epee'
  | 'arc'
  | 'impact'
  | 'mort'
  | 'sort'
  | 'victoire'
  | 'defaite'
  | 'alerte'
  | 'borne'
  | 'niveau';

export const SFX_KEYS: readonly SfxKey[] = Object.freeze([
  'clic',
  'clic_lourd',
  'page',
  'piece',
  'construction',
  'recrutement',
  'pas_terre',
  'pas_pierre',
  'epee',
  'arc',
  'impact',
  'mort',
  'sort',
  'victoire',
  'defaite',
  'alerte',
  'borne',
  'niveau',
]);

export const SFX_LABELS: Readonly<Record<SfxKey, string>> = Object.freeze({
  clic: 'clic',
  clic_lourd: 'clic lourd',
  page: 'page tournée',
  piece: 'pièce de monnaie',
  construction: 'construction',
  recrutement: 'recrutement',
  pas_terre: 'pas sur la terre',
  pas_pierre: 'pas sur la pierre',
  epee: 'épée',
  arc: 'arc',
  impact: 'impact',
  mort: 'mort',
  sort: 'sortilège',
  victoire: 'victoire',
  defaite: 'défaite',
  alerte: 'alerte',
  borne: 'borne',
  niveau: 'niveau gagné',
});

const MIN_GAIN = 0.0001;

/** Douze voix simultanées, comme exigé par le cahier des charges. */
const VOICE_BUDGET = 12;

/** Durée pendant laquelle une voix est comptée comme active, par effet. */
const VOICE_HOLD_MS: Readonly<Record<SfxKey, number>> = Object.freeze({
  clic: 120,
  clic_lourd: 200,
  page: 320,
  piece: 620,
  construction: 700,
  recrutement: 900,
  pas_terre: 180,
  pas_pierre: 260,
  epee: 380,
  arc: 340,
  impact: 420,
  mort: 900,
  sort: 1100,
  victoire: 1800,
  defaite: 1600,
  alerte: 900,
  borne: 1400,
  niveau: 1500,
});

/* ------------------------------------------------------------------ */
/* Briques élémentaires                                                */
/* ------------------------------------------------------------------ */

interface Ctxs {
  ctx: AudioContext;
  bus: VoiceBus;
  out: GainNode;
}

function makeOut(bus: VoiceBus, level: number, pan: number, wet: number): GainNode {
  const { ctx } = bus;
  const out = ctx.createGain();
  out.gain.value = level;
  const panner = ctx.createStereoPanner();
  panner.pan.value = Math.max(-1, Math.min(1, pan));
  out.connect(panner);
  panner.connect(bus.dry);
  const send = ctx.createGain();
  send.gain.value = wet;
  panner.connect(send);
  send.connect(bus.wet);
  setTimeout(() => {
    try {
      send.disconnect();
      panner.disconnect();
      out.disconnect();
    } catch {
      /* déjà libéré */
    }
  }, 4000);
  return out;
}

function bq(ctx: AudioContext, type: BiquadFilterType, freq: number, q: number, gainDb = 0): BiquadFilterNode {
  const f = ctx.createBiquadFilter();
  f.type = type;
  f.frequency.value = Math.max(20, Math.min(ctx.sampleRate / 2 - 200, freq));
  f.Q.value = q;
  f.gain.value = gainDb;
  return f;
}

/** Enveloppe percussive, terminée par une rampe linéaire vers zéro. */
function hit(param: AudioParam, t: number, peak: number, attack: number, decay: number): void {
  const p = Math.max(MIN_GAIN * 2, peak);
  param.setValueAtTime(MIN_GAIN, t);
  param.linearRampToValueAtTime(p, t + Math.max(0.0006, attack));
  param.exponentialRampToValueAtTime(MIN_GAIN, t + attack + Math.max(0.01, decay));
  param.linearRampToValueAtTime(0, t + attack + decay + 0.015);
}

/** Éclat de bruit filtré : le « choc » de l'objet. */
function burst(
  c: Ctxs,
  t: number,
  options: { type: BiquadFilterType; freq: number; q: number; peak: number; decay: number; attack?: number; sweepTo?: number; offset: number },
): void {
  const src = c.ctx.createBufferSource();
  src.buffer = noiseBuffer(c.ctx);
  src.loop = true;
  const f = bq(c.ctx, options.type, options.freq, options.q);
  if (options.sweepTo !== undefined) {
    f.frequency.setValueAtTime(options.freq, t);
    f.frequency.exponentialRampToValueAtTime(Math.max(30, options.sweepTo), t + options.decay);
  }
  const g = c.ctx.createGain();
  const attack = options.attack ?? 0.001;
  src.connect(f).connect(g).connect(c.out);
  hit(g.gain, t, options.peak, attack, options.decay);
  src.start(t, options.offset % 2.9);
  src.stop(t + attack + options.decay + 0.06);
}

/** Corps sonore : oscillateur à hauteur descendante ou montante. */
function tone(
  c: Ctxs,
  t: number,
  options: { type: OscillatorType; from: number; to?: number; glide?: number; peak: number; attack?: number; decay: number },
): void {
  const o = c.ctx.createOscillator();
  o.type = options.type;
  o.frequency.setValueAtTime(options.from, t);
  if (options.to !== undefined) {
    o.frequency.exponentialRampToValueAtTime(Math.max(20, options.to), t + (options.glide ?? options.decay));
  }
  const g = c.ctx.createGain();
  o.connect(g).connect(c.out);
  hit(g.gain, t, options.peak, options.attack ?? 0.0015, options.decay);
  o.start(t);
  o.stop(t + (options.attack ?? 0.0015) + options.decay + 0.06);
}

/**
 * Cri formantique : une source glottale (dent de scie à hauteur mobile) filtrée
 * par deux formants qui se déplacent. Aucune voix échantillonnée.
 */
function cry(
  c: Ctxs,
  t: number,
  options: { f0: number; f0End: number; formants: [number, number]; formantsEnd: [number, number]; peak: number; duration: number; rough: number },
): void {
  const o = c.ctx.createOscillator();
  o.type = 'sawtooth';
  o.frequency.setValueAtTime(options.f0, t);
  o.frequency.exponentialRampToValueAtTime(Math.max(30, options.f0End), t + options.duration);

  // Rugosité : une modulation rapide et irrégulière de la hauteur.
  const rough = c.ctx.createOscillator();
  rough.type = 'triangle';
  rough.frequency.value = 27 + options.rough * 42;
  const roughG = c.ctx.createGain();
  roughG.gain.setValueAtTime(options.f0 * 0.06 * options.rough, t);
  roughG.gain.linearRampToValueAtTime(0, t + options.duration);
  rough.connect(roughG).connect(o.frequency);

  const g = c.ctx.createGain();
  const f1 = bq(c.ctx, 'bandpass', options.formants[0], 6);
  const f2 = bq(c.ctx, 'bandpass', options.formants[1], 8);
  f1.frequency.exponentialRampToValueAtTime(Math.max(80, options.formantsEnd[0]), t + options.duration);
  f2.frequency.exponentialRampToValueAtTime(Math.max(120, options.formantsEnd[1]), t + options.duration);
  const mix = c.ctx.createGain();
  mix.gain.value = 0.55;
  o.connect(f1).connect(mix);
  o.connect(f2).connect(mix);
  mix.connect(g).connect(c.out);

  g.gain.setValueAtTime(MIN_GAIN, t);
  g.gain.linearRampToValueAtTime(options.peak, t + 0.03);
  g.gain.setValueAtTime(options.peak, t + options.duration * 0.55);
  g.gain.exponentialRampToValueAtTime(MIN_GAIN, t + options.duration);
  g.gain.linearRampToValueAtTime(0, t + options.duration + 0.05);

  o.start(t);
  rough.start(t);
  o.stop(t + options.duration + 0.1);
  rough.stop(t + options.duration + 0.1);
}

/* ------------------------------------------------------------------ */
/* Lecteur                                                             */
/* ------------------------------------------------------------------ */

/**
 * Joue les effets et tient le budget de voix. Une même clef rejouée très vite
 * (marteau de forge, volée de flèches) est légèrement variée puis atténuée :
 * jamais de somme cohérente qui pousse le limiteur.
 */
export class SfxPlayer {
  private readonly graph: AudioGraph;
  private readonly bus: VoiceBus;
  private readonly rng: Rng;
  private active = 0;
  private readonly lastAt = new Map<SfxKey, number>();

  constructor(graph: AudioGraph) {
    this.graph = graph;
    this.bus = voiceBus(graph, 'effets');
    this.rng = createRng(0x5f7c0000);
  }

  /** Nombre d'effets en cours (pour les tests et le diagnostic). */
  get voices(): number {
    return this.active;
  }

  play(key: SfxKey): void {
    if (!SFX_LABELS[key]) return;
    if (this.active >= VOICE_BUDGET) return;

    const now = this.graph.now();
    // Anti-empilement : deux appels à moins de 18 ms sont fondus en un seul.
    const last = this.lastAt.get(key) ?? -1;
    if (now - last < 0.018) return;
    this.lastAt.set(key, now);

    // Plus il y a de voix, plus chacune s'efface : le mixage reste tenu.
    const crowd = 1 - (this.active / VOICE_BUDGET) * 0.42;

    this.active += 1;
    const hold = VOICE_HOLD_MS[key] ?? 400;
    setTimeout(() => {
      this.active = Math.max(0, this.active - 1);
    }, hold);

    try {
      this.render(key, now + 0.002, crowd);
    } catch {
      /* un effet raté ne doit jamais interrompre le jeu. */
    }
  }

  private render(key: SfxKey, t: number, crowd: number): void {
    const rng = this.rng;
    const { ctx } = this.bus;

    switch (key) {
      /* --- Interface ---------------------------------------------------- */
      case 'clic': {
        // Ongle sur bois ciré : un choc bref et une résonance de planche.
        const c: Ctxs = { ctx, bus: this.bus, out: makeOut(this.bus, 0.5 * crowd, rng.range(-0.1, 0.1), 0.14) };
        burst(c, t, { type: 'bandpass', freq: rng.range(2300, 3100), q: 2.2, peak: 0.5, decay: 0.018, offset: rng.range(0, 2.8) });
        tone(c, t, { type: 'triangle', from: rng.range(780, 900), to: rng.range(560, 660), peak: 0.16, decay: 0.05 });
        break;
      }
      case 'clic_lourd': {
        // Loquet de fer sur pierre.
        const c: Ctxs = { ctx, bus: this.bus, out: makeOut(this.bus, 0.55 * crowd, rng.range(-0.08, 0.08), 0.22) };
        burst(c, t, { type: 'bandpass', freq: rng.range(900, 1200), q: 1.6, peak: 0.42, decay: 0.05, offset: rng.range(0, 2.8) });
        tone(c, t, { type: 'sine', from: rng.range(190, 230), to: 120, peak: 0.36, decay: 0.11 });
        tone(c, t + 0.004, { type: 'triangle', from: rng.range(1650, 1850), peak: 0.09, decay: 0.09 });
        break;
      }
      case 'page': {
        // Parchemin : deux froissements, l'un qui s'ouvre, l'autre qui retombe.
        const c: Ctxs = { ctx, bus: this.bus, out: makeOut(this.bus, 0.44 * crowd, rng.range(-0.25, 0.25), 0.2) };
        burst(c, t, { type: 'highpass', freq: 1400, q: 0.7, peak: 0.2, attack: 0.02, decay: 0.1, sweepTo: 4200, offset: rng.range(0, 2.8) });
        burst(c, t + rng.range(0.1, 0.15), { type: 'bandpass', freq: 3200, q: 1.1, peak: 0.16, attack: 0.012, decay: 0.09, sweepTo: 1500, offset: rng.range(0, 2.8) });
        break;
      }

      /* --- Ressources et cité ------------------------------------------- */
      case 'piece': {
        // Deniers d'argent : deux partiels inharmoniques et un tintement.
        const c: Ctxs = { ctx, bus: this.bus, out: makeOut(this.bus, 0.34 * crowd, rng.range(-0.2, 0.2), 0.42) };
        const base = rng.range(2350, 2750);
        tone(c, t, { type: 'sine', from: base, peak: 0.3, decay: 0.26 });
        tone(c, t, { type: 'sine', from: base * 1.61, peak: 0.16, decay: 0.19 });
        tone(c, t + rng.range(0.035, 0.07), { type: 'sine', from: base * 2.37, peak: 0.11, decay: 0.14 });
        burst(c, t, { type: 'highpass', freq: 5200, q: 0.8, peak: 0.11, decay: 0.02, offset: rng.range(0, 2.8) });
        break;
      }
      case 'construction': {
        // Bloc de granit posé : chute sourde, gravier, puis coup de ciseau.
        const c: Ctxs = { ctx, bus: this.bus, out: makeOut(this.bus, 0.6 * crowd, rng.range(-0.12, 0.12), 0.34) };
        tone(c, t, { type: 'sine', from: 118, to: 52, glide: 0.09, peak: 0.62, decay: 0.3 });
        burst(c, t, { type: 'bandpass', freq: 640, q: 0.8, peak: 0.34, decay: 0.13, offset: rng.range(0, 2.8) });
        burst(c, t + 0.02, { type: 'highpass', freq: 2600, q: 0.7, peak: 0.14, decay: 0.22, offset: rng.range(0, 2.8) });
        tone(c, t + rng.range(0.16, 0.22), { type: 'triangle', from: rng.range(1750, 2050), peak: 0.13, decay: 0.16 });
        break;
      }
      case 'recrutement': {
        // Appel de deux cors à la quinte : bref, la musique reprend derrière.
        const c: Ctxs = { ctx, bus: this.bus, out: makeOut(this.bus, 0.3 * crowd, rng.range(-0.14, 0.14), 0.6) };
        const root = midiToFreq(57 + rng.int(-1, 1));
        for (const [ratio, delay, level] of [
          [1, 0, 0.34],
          [1.5, 0.005, 0.26],
          [2, 0.18, 0.24],
          [3, 0.185, 0.12],
        ] as const) {
          const o = ctx.createOscillator();
          o.type = 'sawtooth';
          o.frequency.value = root * ratio;
          const f = bq(ctx, 'lowpass', root * ratio * 3.4, 1.3);
          const g = ctx.createGain();
          o.connect(f).connect(g).connect(c.out);
          const start = t + delay;
          g.gain.setValueAtTime(MIN_GAIN, start);
          g.gain.linearRampToValueAtTime(level, start + 0.035);
          g.gain.setValueAtTime(level, start + 0.22);
          g.gain.exponentialRampToValueAtTime(MIN_GAIN, start + 0.5);
          g.gain.linearRampToValueAtTime(0, start + 0.56);
          o.start(start);
          o.stop(start + 0.62);
        }
        break;
      }

      /* --- Déplacement --------------------------------------------------- */
      case 'pas_terre': {
        // Terre battue et herbe : sourd, avec un froissement au relevé.
        const c: Ctxs = { ctx, bus: this.bus, out: makeOut(this.bus, 0.4 * crowd, rng.range(-0.3, 0.3), 0.12) };
        tone(c, t, { type: 'sine', from: rng.range(88, 108), to: 46, glide: 0.05, peak: 0.4, decay: 0.09 });
        burst(c, t, { type: 'lowpass', freq: rng.range(520, 700), q: 0.7, peak: 0.28, decay: 0.06, offset: rng.range(0, 2.8) });
        burst(c, t + 0.035, { type: 'bandpass', freq: rng.range(2600, 3600), q: 1.2, peak: 0.05, decay: 0.05, offset: rng.range(0, 2.8) });
        break;
      }
      case 'pas_pierre': {
        // Semelle cloutée sur dalle : claquement net et petite résonance.
        const c: Ctxs = { ctx, bus: this.bus, out: makeOut(this.bus, 0.4 * crowd, rng.range(-0.3, 0.3), 0.34) };
        burst(c, t, { type: 'bandpass', freq: rng.range(1500, 2100), q: 1.5, peak: 0.34, decay: 0.035, offset: rng.range(0, 2.8) });
        tone(c, t, { type: 'sine', from: rng.range(150, 185), to: 96, glide: 0.04, peak: 0.26, decay: 0.08 });
        tone(c, t + 0.006, { type: 'triangle', from: rng.range(3100, 3900), peak: 0.06, decay: 0.11 });
        break;
      }

      /* --- Combat --------------------------------------------------------- */
      case 'epee': {
        // Lame tirée puis fendant l'air : bande étroite qui balaie vers l'aigu.
        const c: Ctxs = { ctx, bus: this.bus, out: makeOut(this.bus, 0.46 * crowd, rng.range(-0.35, 0.35), 0.3) };
        burst(c, t, { type: 'bandpass', freq: 900, q: 3.2, peak: 0.3, attack: 0.006, decay: 0.16, sweepTo: rng.range(4200, 5400), offset: rng.range(0, 2.8) });
        tone(c, t + 0.02, { type: 'triangle', from: rng.range(2400, 3000), peak: 0.1, decay: 0.2 });
        tone(c, t + 0.02, { type: 'sine', from: rng.range(4700, 5600), peak: 0.05, decay: 0.16 });
        break;
      }
      case 'arc': {
        // Décoche : la corde claque, puis la flèche siffle en s'éloignant.
        const c: Ctxs = { ctx, bus: this.bus, out: makeOut(this.bus, 0.44 * crowd, rng.range(-0.3, 0.3), 0.26) };
        tone(c, t, { type: 'triangle', from: rng.range(230, 290), to: 140, glide: 0.05, peak: 0.34, decay: 0.09 });
        burst(c, t, { type: 'bandpass', freq: 1800, q: 2.4, peak: 0.22, decay: 0.05, offset: rng.range(0, 2.8) });
        burst(c, t + 0.03, { type: 'bandpass', freq: 3400, q: 4, peak: 0.11, attack: 0.02, decay: 0.24, sweepTo: 1500, offset: rng.range(0, 2.8) });
        break;
      }
      case 'impact': {
        // Coup porté : cuir, os, métal — les trois ensemble.
        const c: Ctxs = { ctx, bus: this.bus, out: makeOut(this.bus, 0.58 * crowd, rng.range(-0.22, 0.22), 0.28) };
        tone(c, t, { type: 'sine', from: rng.range(140, 175), to: 58, glide: 0.06, peak: 0.6, decay: 0.16 });
        burst(c, t, { type: 'bandpass', freq: rng.range(700, 950), q: 0.9, peak: 0.44, decay: 0.075, offset: rng.range(0, 2.8) });
        burst(c, t + 0.008, { type: 'highpass', freq: 3600, q: 0.7, peak: 0.14, decay: 0.06, offset: rng.range(0, 2.8) });
        tone(c, t + 0.004, { type: 'triangle', from: rng.range(1250, 1600), peak: 0.1, decay: 0.18 });
        break;
      }
      case 'mort': {
        // Cri qui descend puis s'étouffe, et la chute du corps sur le sol.
        const c: Ctxs = { ctx, bus: this.bus, out: makeOut(this.bus, 0.42 * crowd, rng.range(-0.28, 0.28), 0.45) };
        cry(c, t, {
          f0: rng.range(180, 260),
          f0End: rng.range(70, 105),
          formants: [rng.range(640, 780), rng.range(1150, 1420)],
          formantsEnd: [rng.range(380, 470), rng.range(820, 980)],
          peak: 0.26,
          duration: rng.range(0.42, 0.6),
          rough: rng.range(0.4, 0.85),
        });
        tone(c, t + rng.range(0.3, 0.42), { type: 'sine', from: 96, to: 44, glide: 0.08, peak: 0.4, decay: 0.22 });
        burst(c, t + rng.range(0.3, 0.42), { type: 'lowpass', freq: 780, q: 0.7, peak: 0.24, decay: 0.14, offset: rng.range(0, 2.8) });
        break;
      }
      case 'sort': {
        // Sortilège : un souffle qui monte, un accord inharmonique, du scintillement.
        const c: Ctxs = { ctx, bus: this.bus, out: makeOut(this.bus, 0.34 * crowd, rng.range(-0.12, 0.12), 0.85) };
        burst(c, t, { type: 'bandpass', freq: 400, q: 1.4, peak: 0.2, attack: 0.12, decay: 0.36, sweepTo: 5200, offset: rng.range(0, 2.8) });
        const base = midiToFreq(72 + rng.int(-2, 3));
        for (const [ratio, level, decay] of [
          [1, 0.16, 0.9],
          [1.4142, 0.1, 0.7],
          [2.09, 0.07, 0.55],
          [3.11, 0.045, 0.4],
        ] as const) {
          tone(c, t + rng.range(0, 0.05), { type: 'sine', from: base * ratio, peak: level, attack: 0.02, decay });
        }
        break;
      }

      /* --- Signaux -------------------------------------------------------- */
      case 'victoire': {
        // Deux cloches à la quinte, brèves : le thème de victoire prend la suite.
        playCloche(this.bus, { freq: midiToFreq(74), time: t, duration: 0.9, velocity: 0.5 * crowd, pan: -0.22, wet: 0.9, brightness: 0.62, seed: 0x7d1 });
        playCloche(this.bus, { freq: midiToFreq(79), time: t + 0.16, duration: 1.1, velocity: 0.44 * crowd, pan: 0.24, wet: 0.9, brightness: 0.66, seed: 0x7d2 });
        break;
      }
      case 'defaite': {
        // Une cloche grave, un souffle qui s'éteint.
        const c: Ctxs = { ctx, bus: this.bus, out: makeOut(this.bus, 0.4 * crowd, 0, 0.8) };
        playCloche(this.bus, { freq: midiToFreq(45), time: t, duration: 1.6, velocity: 0.46 * crowd, pan: -0.1, wet: 0.95, brightness: 0.24, seed: 0xdef });
        tone(c, t + 0.05, { type: 'triangle', from: midiToFreq(45), to: midiToFreq(43), glide: 1.2, peak: 0.14, attack: 0.25, decay: 1.3 });
        break;
      }
      case 'alerte': {
        // Deux coups de corne à la tierce mineure : reconnaissable, jamais strident.
        const c: Ctxs = { ctx, bus: this.bus, out: makeOut(this.bus, 0.32 * crowd, 0, 0.55) };
        for (const [midi, delay] of [
          [69, 0],
          [72, 0.22],
        ] as const) {
          const f = midiToFreq(midi);
          for (const [ratio, level] of [
            [1, 0.28],
            [2, 0.14],
            [3, 0.06],
          ] as const) {
            tone(c, t + delay, { type: 'triangle', from: f * ratio, peak: level, attack: 0.02, decay: 0.3 });
          }
        }
        break;
      }
      case 'borne': {
        // Petit carillon de borne milliaire : une seule cloche claire.
        playCloche(this.bus, { freq: midiToFreq(84), time: t, duration: 0.5, velocity: 0.34 * crowd, pan: rng.range(-0.3, 0.3), wet: 0.9, brightness: 0.7, seed: 0xb04 });
        break;
      }
      case 'niveau': {
        // Montée de quatre notes au psaltérion, couronnée d'une cloche.
        const degrees = [0, 4, 7, 12];
        for (let i = 0; i < degrees.length; i += 1) {
          playPsalterion(this.bus, {
            freq: midiToFreq(69 + (degrees[i] as number)),
            time: t + i * 0.085,
            duration: 0.6,
            velocity: (0.38 + i * 0.05) * crowd,
            pan: -0.24 + i * 0.16,
            wet: 0.62,
            brightness: 0.6 + i * 0.05,
            seed: 0x1e0 + i,
          });
        }
        playCloche(this.bus, { freq: midiToFreq(88), time: t + 0.34, duration: 0.7, velocity: 0.28 * crowd, pan: 0.2, wet: 0.92, brightness: 0.72, seed: 0x1ef });
        break;
      }
      default:
        break;
    }
  }
}
