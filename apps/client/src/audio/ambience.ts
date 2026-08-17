/**
 * Nappes d'ambiance.
 *
 * Cinq lieux sonores — forêt, rivière, vent, foire, cloches — plus le silence.
 * Chaque nappe est un lit continu (bruit filtré, modulé par des oscillateurs
 * très lents et décorrélés) sur lequel se posent des événements épisodiques
 * planifiés par un minuteur : un oiseau, un clapot, une enclume, une volée.
 *
 * Rien ne boucle de façon audible : les périodes de modulation sont premières
 * entre elles et les événements sont tirés au sort. Les fondus d'entrée et de
 * sortie durent plusieurs secondes — une ambiance ne doit jamais claquer.
 */

import { noiseBuffer, type AudioGraph } from './context.js';
import { createRng, midiToFreq, type Rng } from './theory.js';
import { playCloche, playFlute, playPsalterion, voiceBus, type VoiceBus } from './instruments.js';

export type AmbienceKey = 'foret' | 'riviere' | 'vent' | 'foire' | 'cloches' | 'aucune';

export const AMBIENCE_KEYS: readonly AmbienceKey[] = Object.freeze([
  'foret',
  'riviere',
  'vent',
  'foire',
  'cloches',
  'aucune',
]);

export const AMBIENCE_LABELS: Readonly<Record<AmbienceKey, string>> = Object.freeze({
  foret: 'forêt',
  riviere: 'rivière',
  vent: 'vent',
  foire: 'foire',
  cloches: 'cloches',
  aucune: 'aucune',
});

/* ------------------------------------------------------------------ */
/* Outils                                                              */
/* ------------------------------------------------------------------ */

const MIN_GAIN = 0.0001;

interface Layer {
  key: AmbienceKey;
  /** Nœud de niveau de la nappe entière. */
  level: GainNode;
  /** Sources à arrêter. */
  sources: AudioScheduledSourceNode[];
  /** Minuteurs d'événements épisodiques. */
  timers: ReturnType<typeof setTimeout>[];
  /** Programme le prochain événement épisodique. */
  tick?: () => void;
  stopped: boolean;
}

function loopNoise(ctx: AudioContext, rate: number, offset: number): AudioBufferSourceNode {
  const src = ctx.createBufferSource();
  src.buffer = noiseBuffer(ctx);
  src.loop = true;
  src.playbackRate.value = rate;
  src.start(ctx.currentTime, offset % 2.9);
  return src;
}

function biquad(
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

/**
 * Oscillateur très lent servant de modulateur.
 *
 * `phase` (en tours, 0–1) décale réellement la sinusoïde : sans cela, toutes
 * les modulations d'une nappe repartiraient du même point au démarrage et
 * l'oreille entendrait une pulsation commune. Le décalage passe par une onde
 * périodique à un seul harmonique, seule façon de fixer la phase en WebAudio.
 */
function slowLfo(
  ctx: AudioContext,
  hz: number,
  depth: number,
  target: AudioParam,
  phase: number,
): OscillatorNode {
  const o = ctx.createOscillator();
  const angle = phase * Math.PI * 2;
  o.setPeriodicWave(
    ctx.createPeriodicWave(
      Float32Array.from([0, Math.sin(angle)]),
      Float32Array.from([0, Math.cos(angle)]),
      { disableNormalization: true },
    ),
  );
  o.frequency.value = hz;
  const g = ctx.createGain();
  g.gain.value = depth;
  o.connect(g).connect(target);
  o.start(ctx.currentTime);
  return o;
}

/* ------------------------------------------------------------------ */
/* Constructeurs de nappes                                             */
/* ------------------------------------------------------------------ */

function buildVent(bus: VoiceBus, rng: Rng): Layer {
  const { ctx } = bus;
  const level = ctx.createGain();
  level.gain.value = MIN_GAIN;
  level.connect(bus.dry);
  const send = ctx.createGain();
  send.gain.value = 0.28;
  level.connect(send);
  send.connect(bus.wet);

  const sources: AudioScheduledSourceNode[] = [];

  // Deux souffles décorrélés, un par côté : c'est ce qui donne la largeur.
  for (let i = 0; i < 2; i += 1) {
    const src = loopNoise(ctx, 0.72 + i * 0.11, rng.range(0, 2.8));
    const lp = biquad(ctx, 'lowpass', 480, 0.6);
    const hp = biquad(ctx, 'highpass', 90, 0.5);
    const g = ctx.createGain();
    g.gain.value = 0.5;
    const pan = ctx.createStereoPanner();
    pan.pan.value = i === 0 ? -0.62 : 0.62;
    src.connect(hp).connect(lp).connect(g).connect(pan).connect(level);
    sources.push(src);
    // Rafales : la coupure monte et redescend sur 12 à 30 secondes.
    sources.push(slowLfo(ctx, rng.range(0.033, 0.082), 260, lp.frequency, rng.next()));
    sources.push(slowLfo(ctx, rng.range(0.017, 0.041), 0.22, g.gain, rng.next()));
  }

  // Sifflement d'arête rocheuse : bande étroite qui va et vient.
  const whistle = loopNoise(ctx, 1, rng.range(0, 2.8));
  const bp = biquad(ctx, 'bandpass', 1450, 7);
  const wg = ctx.createGain();
  wg.gain.value = 0.045;
  const wpan = ctx.createStereoPanner();
  wpan.pan.value = rng.range(-0.4, 0.4);
  whistle.connect(bp).connect(wg).connect(wpan).connect(level);
  sources.push(whistle);
  sources.push(slowLfo(ctx, 0.061, 520, bp.frequency, rng.next()));
  sources.push(slowLfo(ctx, 0.023, 0.035, wg.gain, rng.next()));

  return { key: 'vent', level, sources, timers: [], stopped: false };
}

function buildForet(bus: VoiceBus, rng: Rng): Layer {
  const { ctx } = bus;
  const layer = buildVent(bus, rng);
  layer.key = 'foret';
  const { level } = layer;

  // Le vent de forêt est plus feutré : on ajoute le froissement des aiguilles.
  for (let i = 0; i < 2; i += 1) {
    const src = loopNoise(ctx, 1.6 + i * 0.23, rng.range(0, 2.8));
    const hp = biquad(ctx, 'highpass', 2600, 0.7);
    const lp = biquad(ctx, 'lowpass', 8200, 0.6);
    const g = ctx.createGain();
    g.gain.value = 0.03;
    const pan = ctx.createStereoPanner();
    pan.pan.value = i === 0 ? -0.5 : 0.55;
    src.connect(hp).connect(lp).connect(g).connect(pan).connect(level);
    layer.sources.push(src);
    layer.sources.push(slowLfo(ctx, rng.range(0.07, 0.19), 0.026, g.gain, rng.next()));
  }

  // Bourdon de sous-bois : la masse d'air entre les troncs.
  const deep = loopNoise(ctx, 0.42, rng.range(0, 2.8));
  const deepLp = biquad(ctx, 'lowpass', 190, 0.8);
  const deepG = ctx.createGain();
  deepG.gain.value = 0.12;
  deep.connect(deepLp).connect(deepG).connect(level);
  layer.sources.push(deep);

  // Oiseaux : deux à trois notes montantes, très loin, jamais deux fois pareil.
  const bird = () => {
    if (layer.stopped) return;
    const t = ctx.currentTime + rng.range(0.05, 0.4);
    const pan = rng.range(-0.8, 0.8);
    const base = rng.range(1900, 3400);
    const count = rng.int(2, 4);
    for (let i = 0; i < count; i += 1) {
      const o = ctx.createOscillator();
      o.type = 'sine';
      const start = t + i * rng.range(0.09, 0.17);
      const f0 = base * Math.pow(1.09, i);
      o.frequency.setValueAtTime(f0 * 0.86, start);
      o.frequency.exponentialRampToValueAtTime(f0, start + 0.03);
      o.frequency.exponentialRampToValueAtTime(f0 * 0.94, start + 0.07);
      const g = ctx.createGain();
      const p = ctx.createStereoPanner();
      p.pan.value = pan;
      const soften = biquad(ctx, 'lowpass', 5200, 0.7);
      o.connect(g).connect(soften).connect(p).connect(level);
      g.gain.setValueAtTime(MIN_GAIN, start);
      g.gain.linearRampToValueAtTime(rng.range(0.02, 0.05), start + 0.012);
      g.gain.exponentialRampToValueAtTime(MIN_GAIN, start + 0.075);
      g.gain.linearRampToValueAtTime(0, start + 0.09);
      o.start(start);
      o.stop(start + 0.12);
      setTimeout(
        () => {
          try {
            p.disconnect();
            soften.disconnect();
            g.disconnect();
          } catch {
            /* déjà libéré */
          }
        },
        (start - ctx.currentTime + 0.4) * 1000,
      );
    }
    layer.timers.push(setTimeout(bird, rng.range(5200, 17000)));
  };
  layer.tick = bird;
  layer.timers.push(setTimeout(bird, rng.range(1800, 6000)));

  return layer;
}

function buildRiviere(bus: VoiceBus, rng: Rng): Layer {
  const { ctx } = bus;
  const level = ctx.createGain();
  level.gain.value = MIN_GAIN;
  level.connect(bus.dry);
  const send = ctx.createGain();
  send.gain.value = 0.2;
  level.connect(send);
  send.connect(bus.wet);

  const sources: AudioScheduledSourceNode[] = [];

  // Le lit du courant : trois bandes larges superposées, modulées lentement.
  const bands: [number, number, number, number][] = [
    [420, 0.7, 0.3, -0.55],
    [1250, 0.9, 0.22, 0.15],
    [3100, 1.1, 0.11, 0.6],
  ];
  for (let i = 0; i < bands.length; i += 1) {
    const [freq, q, gain, pan] = bands[i] as [number, number, number, number];
    const src = loopNoise(ctx, 0.9 + i * 0.17, rng.range(0, 2.8));
    const bp = biquad(ctx, 'bandpass', freq, q);
    const g = ctx.createGain();
    g.gain.value = gain;
    const p = ctx.createStereoPanner();
    p.pan.value = pan;
    src.connect(bp).connect(g).connect(p).connect(level);
    sources.push(src);
    sources.push(slowLfo(ctx, rng.range(0.09, 0.31), gain * 0.28, g.gain, rng.next()));
    sources.push(slowLfo(ctx, rng.range(0.05, 0.14), freq * 0.16, bp.frequency, rng.next()));
  }

  // Le grave du volume d'eau, sous le sifflement.
  const deep = loopNoise(ctx, 0.5, rng.range(0, 2.8));
  const lp = biquad(ctx, 'lowpass', 220, 0.9);
  const dg = ctx.createGain();
  dg.gain.value = 0.16;
  deep.connect(lp).connect(dg).connect(level);
  sources.push(deep);

  const layer: Layer = { key: 'riviere', level, sources, timers: [], stopped: false };

  // Clapots : une poche d'air qui remonte, hauteur qui monte puis s'éteint.
  const gurgle = () => {
    if (layer.stopped) return;
    const t = ctx.currentTime + rng.range(0.02, 0.2);
    const o = ctx.createOscillator();
    o.type = 'sine';
    const f = rng.range(220, 720);
    o.frequency.setValueAtTime(f * 0.55, t);
    o.frequency.exponentialRampToValueAtTime(f, t + rng.range(0.05, 0.13));
    const g = ctx.createGain();
    const p = ctx.createStereoPanner();
    p.pan.value = rng.range(-0.7, 0.7);
    o.connect(g).connect(p).connect(level);
    g.gain.setValueAtTime(MIN_GAIN, t);
    g.gain.linearRampToValueAtTime(rng.range(0.02, 0.055), t + 0.014);
    g.gain.exponentialRampToValueAtTime(MIN_GAIN, t + 0.14);
    g.gain.linearRampToValueAtTime(0, t + 0.17);
    o.start(t);
    o.stop(t + 0.2);
    setTimeout(
      () => {
        try {
          p.disconnect();
          g.disconnect();
        } catch {
          /* déjà libéré */
        }
      },
      (t - ctx.currentTime + 0.5) * 1000,
    );
    layer.timers.push(setTimeout(gurgle, rng.range(400, 2400)));
  };
  layer.tick = gurgle;
  layer.timers.push(setTimeout(gurgle, rng.range(200, 1200)));

  return layer;
}

function buildFoire(bus: VoiceBus, rng: Rng): Layer {
  const { ctx } = bus;
  const level = ctx.createGain();
  level.gain.value = MIN_GAIN;
  level.connect(bus.dry);
  const send = ctx.createGain();
  send.gain.value = 0.34;
  level.connect(send);
  send.connect(bus.wet);

  const sources: AudioScheduledSourceNode[] = [];

  // Rumeur de foule : bruit passé dans des formants vocaliques mouvants.
  // Aucun mot n'est prononcé, mais l'oreille entend « des gens ».
  const formants: [number, number, number][] = [
    [520, 6, -0.4],
    [1180, 8, 0.32],
    [2350, 9, 0.05],
  ];
  for (let i = 0; i < formants.length; i += 1) {
    const [freq, q, pan] = formants[i] as [number, number, number];
    const src = loopNoise(ctx, 0.55 + i * 0.13, rng.range(0, 2.8));
    const bp = biquad(ctx, 'bandpass', freq, q);
    const g = ctx.createGain();
    g.gain.value = 0.12 / (i + 1);
    const p = ctx.createStereoPanner();
    p.pan.value = pan;
    src.connect(bp).connect(g).connect(p).connect(level);
    sources.push(src);
    sources.push(slowLfo(ctx, rng.range(0.6, 1.7), freq * 0.14, bp.frequency, rng.next()));
    sources.push(slowLfo(ctx, rng.range(0.21, 0.63), 0.06, g.gain, rng.next()));
  }

  // Fond de place : réverbération naturelle d'un espace ouvert entouré de murs.
  const room = loopNoise(ctx, 0.4, rng.range(0, 2.8));
  const roomLp = biquad(ctx, 'lowpass', 700, 0.7);
  const roomG = ctx.createGain();
  roomG.gain.value = 0.07;
  room.connect(roomLp).connect(roomG).connect(level);
  sources.push(room);

  const layer: Layer = { key: 'foire', level, sources, timers: [], stopped: false };
  const voice: VoiceBus = { ctx, dry: level, wet: send };

  // Épisodes : coup de maillet du tonnelier, cri lointain, ou trait de flûte
  // d'un ménétrier à l'autre bout de la place.
  const episode = () => {
    if (layer.stopped) return;
    const t = ctx.currentTime + rng.range(0.05, 0.5);
    const roll = rng.next();
    if (roll < 0.42) {
      // Maillet sur bois. La source est créée à la main : elle démarre à
      // l'instant planifié, pas tout de suite comme `loopNoise`.
      const src = ctx.createBufferSource();
      src.buffer = noiseBuffer(ctx);
      src.loop = true;
      const bp = biquad(ctx, 'bandpass', rng.range(680, 1500), 3.5);
      const g = ctx.createGain();
      const p = ctx.createStereoPanner();
      p.pan.value = rng.range(-0.75, 0.75);
      src.connect(bp).connect(g).connect(p).connect(level);
      g.gain.setValueAtTime(MIN_GAIN, t);
      g.gain.linearRampToValueAtTime(rng.range(0.05, 0.11), t + 0.002);
      g.gain.exponentialRampToValueAtTime(MIN_GAIN, t + 0.09);
      g.gain.linearRampToValueAtTime(0, t + 0.11);
      src.start(t, rng.range(0, 2.8));
      src.stop(t + 0.14);
      setTimeout(
        () => {
          try {
            p.disconnect();
            g.disconnect();
            bp.disconnect();
          } catch {
            /* déjà libéré */
          }
        },
        (t - ctx.currentTime + 0.5) * 1000,
      );
    } else if (roll < 0.72) {
      // Psaltérion d'un marchand : deux notes, très en arrière.
      const midi = rng.int(64, 76);
      playPsalterion(voice, {
        freq: midiToFreq(midi),
        time: t,
        duration: 0.45,
        velocity: rng.range(0.1, 0.2),
        pan: rng.range(-0.7, 0.7),
        wet: 0.9,
        gain: 0.5,
        brightness: 0.4,
      });
    } else {
      // Trait de flûte d'un ménétrier.
      const midi = rng.int(69, 81);
      playFlute(voice, {
        freq: midiToFreq(midi),
        time: t,
        duration: rng.range(0.2, 0.5),
        velocity: rng.range(0.08, 0.16),
        pan: rng.range(-0.8, 0.8),
        wet: 0.95,
        gain: 0.45,
        brightness: 0.35,
      });
    }
    layer.timers.push(setTimeout(episode, rng.range(900, 4200)));
  };
  layer.tick = episode;
  layer.timers.push(setTimeout(episode, rng.range(400, 2000)));

  return layer;
}

function buildCloches(bus: VoiceBus, rng: Rng): Layer {
  const { ctx } = bus;
  const level = ctx.createGain();
  level.gain.value = MIN_GAIN;
  level.connect(bus.dry);
  const send = ctx.createGain();
  send.gain.value = 0.5;
  level.connect(send);
  send.connect(bus.wet);

  const sources: AudioScheduledSourceNode[] = [];

  // Lit d'air de montagne, très bas : les cloches ne sonnent pas dans le vide.
  const air = loopNoise(ctx, 0.6, rng.range(0, 2.8));
  const airLp = biquad(ctx, 'lowpass', 330, 0.7);
  const airG = ctx.createGain();
  airG.gain.value = 0.1;
  air.connect(airLp).connect(airG).connect(level);
  sources.push(air);
  sources.push(slowLfo(ctx, 0.047, 0.04, airG.gain, rng.next()));

  const layer: Layer = { key: 'cloches', level, sources, timers: [], stopped: false };
  const voice: VoiceBus = { ctx, dry: level, wet: send };

  // Volées irrégulières de deux à cinq coups, sur une quinte à vide.
  const bells = [57, 60, 64, 67]; // la2, do3, mi3, sol3
  const peal = () => {
    if (layer.stopped) return;
    const count = rng.int(2, 5);
    const gap = rng.range(0.55, 1.15);
    let t = ctx.currentTime + rng.range(0.1, 0.6);
    for (let i = 0; i < count; i += 1) {
      const midi = rng.pick(bells) - (rng.chance(0.3) ? 12 : 0);
      playCloche(voice, {
        freq: midiToFreq(midi),
        time: t,
        duration: 1.4,
        velocity: rng.range(0.24, 0.44),
        pan: rng.range(-0.5, 0.5),
        wet: 1,
        gain: 0.7,
        brightness: rng.range(0.35, 0.6),
        seed: (rng.next() * 0xffffff) >>> 0,
      });
      t += gap * rng.range(0.9, 1.12);
    }
    layer.timers.push(setTimeout(peal, rng.range(9000, 26000)));
  };
  layer.tick = peal;
  layer.timers.push(setTimeout(peal, rng.range(1200, 4000)));

  return layer;
}

/* ------------------------------------------------------------------ */
/* Contrôleur                                                          */
/* ------------------------------------------------------------------ */

/** Niveau nominal de chaque nappe, pour équilibrer les cinq entre elles. */
const AMBIENCE_LEVEL: Readonly<Record<AmbienceKey, number>> = Object.freeze({
  foret: 0.62,
  riviere: 0.56,
  vent: 0.5,
  foire: 0.66,
  cloches: 0.6,
  aucune: 0,
});

/**
 * Gère la nappe courante et les fondus enchaînés. Une seule nappe sonne à la
 * fois ; le passage de l'une à l'autre est un croisement, jamais une coupure.
 */
export class AmbienceController {
  private readonly graph: AudioGraph;
  private readonly bus: VoiceBus;
  private current: Layer | null = null;
  private currentKey: AmbienceKey = 'aucune';
  private counter = 0;
  private suspended = false;

  constructor(graph: AudioGraph) {
    this.graph = graph;
    this.bus = voiceBus(graph, 'ambiance');
  }

  get key(): AmbienceKey {
    return this.currentKey;
  }

  /** Passe à la nappe demandée. Sans effet si c'est déjà celle qui joue. */
  set(key: AmbienceKey, fadeMs = 2600): void {
    if (key === this.currentKey) return;
    this.currentKey = key;
    const previous = this.current;
    this.current = null;
    if (previous) this.fadeOut(previous, fadeMs);
    if (key === 'aucune') return;

    this.counter += 1;
    const rng = createRng(0xa11b1e ^ (this.counter * 2654435761));
    let layer: Layer;
    switch (key) {
      case 'foret':
        layer = buildForet(this.bus, rng);
        break;
      case 'riviere':
        layer = buildRiviere(this.bus, rng);
        break;
      case 'foire':
        layer = buildFoire(this.bus, rng);
        break;
      case 'cloches':
        layer = buildCloches(this.bus, rng);
        break;
      case 'vent':
      default:
        layer = buildVent(this.bus, rng);
        break;
    }
    this.current = layer;
    const t = this.graph.now();
    const target = AMBIENCE_LEVEL[key];
    layer.level.gain.cancelScheduledValues(t);
    layer.level.gain.setValueAtTime(MIN_GAIN, t);
    layer.level.gain.linearRampToValueAtTime(target, t + Math.max(0.4, fadeMs / 1000));
    if (this.suspended) this.pauseTimers(layer);
  }

  /** Coupe toute ambiance. */
  stop(fadeMs = 1800): void {
    this.set('aucune', fadeMs);
  }

  /** Arrête les minuteurs (onglet en arrière-plan). Le lit continu reste. */
  suspend(): void {
    this.suspended = true;
    if (this.current) this.pauseTimers(this.current);
  }

  /** Relance les événements épisodiques. */
  resume(): void {
    if (!this.suspended) return;
    this.suspended = false;
    const layer = this.current;
    if (!layer || layer.stopped || !layer.tick) return;
    layer.timers.push(setTimeout(layer.tick, 600 + Math.floor(this.counter % 7) * 130));
  }

  /** Libère tout, sans fondu (fermeture du contexte). */
  dispose(): void {
    if (this.current) {
      this.teardown(this.current);
      this.current = null;
    }
    this.currentKey = 'aucune';
  }

  private pauseTimers(layer: Layer): void {
    for (const timer of layer.timers) clearTimeout(timer);
    layer.timers.length = 0;
  }

  private fadeOut(layer: Layer, fadeMs: number): void {
    layer.stopped = true;
    this.pauseTimers(layer);
    const t = this.graph.now();
    const fade = Math.max(0.3, fadeMs / 1000);
    const g = layer.level.gain;
    g.cancelScheduledValues(t);
    g.setValueAtTime(Math.max(MIN_GAIN, g.value), t);
    g.exponentialRampToValueAtTime(MIN_GAIN, t + fade);
    g.linearRampToValueAtTime(0, t + fade + 0.08);
    setTimeout(() => this.teardown(layer), (fade + 0.4) * 1000);
  }

  private teardown(layer: Layer): void {
    layer.stopped = true;
    this.pauseTimers(layer);
    for (const src of layer.sources) {
      try {
        src.stop();
      } catch {
        /* déjà arrêté */
      }
      try {
        src.disconnect();
      } catch {
        /* déjà libéré */
      }
    }
    layer.sources.length = 0;
    try {
      layer.level.disconnect();
    } catch {
      /* déjà libéré */
    }
  }
}
