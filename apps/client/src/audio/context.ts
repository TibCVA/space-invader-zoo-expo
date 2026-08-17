/**
 * Contexte audio et chaîne de bus.
 *
 * L'`AudioContext` n'est jamais créé au chargement du module : les navigateurs
 * l'interdisent hors geste utilisateur. Tout passe par `createAudioGraph()`,
 * appelé depuis `AudioEngine.init()`.
 *
 * Chaîne, pour chacun des trois bus :
 *
 *   voix (sec)  ─────────────────────────────────┐
 *   voix (réverbérée) → passe-haut → convolution ┤→ volume du bus → somme
 *                                     → teinte ──┘
 *   somme → compresseur de programme → limiteur de crête → passe-haut → sortie
 *
 * Le volume est appliqué **après** la réverbération : baisser un bus baisse
 * aussi sa queue de réverbe, sans jamais la couper net. La réponse
 * impulsionnelle est entièrement synthétisée (aucun fichier).
 */

import { createRng } from './theory.js';

export type BusName = 'musique' | 'effets' | 'ambiance';

export interface BusVolumes {
  musique: number;
  effets: number;
  ambiance: number;
}

/** Clef de persistance imposée par le brief. */
export const STORAGE_KEY = 'auvergne.audio';

export const BUS_NAMES: readonly BusName[] = Object.freeze(['musique', 'effets', 'ambiance']);

export const DEFAULT_VOLUMES: Readonly<BusVolumes> = Object.freeze({
  musique: 62,
  effets: 78,
  ambiance: 52,
});

/**
 * Marge de sécurité par bus : le mixage final ne doit jamais dépendre du
 * limiteur pour rester propre. Le limiteur est un filet, pas un outil.
 */
const BUS_HEADROOM: Readonly<Record<BusName, number>> = Object.freeze({
  musique: 0.5,
  effets: 0.62,
  ambiance: 0.4,
});

/** Niveau de retour de réverbération par bus. */
const BUS_WET_RETURN: Readonly<Record<BusName, number>> = Object.freeze({
  musique: 0.62,
  effets: 0.42,
  ambiance: 0.34,
});

/** Longueur de la queue de réverbération par bus, en secondes. */
const BUS_REVERB_SECONDS: Readonly<Record<BusName, number>> = Object.freeze({
  musique: 3.1,
  effets: 1.5,
  ambiance: 2.1,
});

/* ------------------------------------------------------------------ */
/* Persistance                                                         */
/* ------------------------------------------------------------------ */

function clampVolume(v: unknown, fallback: number): number {
  const n = typeof v === 'number' ? v : Number(v);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(100, Math.max(0, Math.round(n)));
}

/** Lit les volumes mémorisés. Ne lève jamais (mode privé, quota, SSR). */
export function loadVolumes(): BusVolumes {
  const base: BusVolumes = { ...DEFAULT_VOLUMES };
  try {
    if (typeof localStorage === 'undefined') return base;
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return base;
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return base;
    const rec = parsed as Record<string, unknown>;
    return {
      musique: clampVolume(rec.musique, base.musique),
      effets: clampVolume(rec.effets, base.effets),
      ambiance: clampVolume(rec.ambiance, base.ambiance),
    };
  } catch {
    return base;
  }
}

/** Mémorise les volumes. Ne lève jamais. */
export function saveVolumes(volumes: BusVolumes): void {
  try {
    if (typeof localStorage === 'undefined') return;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(volumes));
  } catch {
    /* quota dépassé ou stockage refusé : le son marche quand même. */
  }
}

/* ------------------------------------------------------------------ */
/* Disponibilité                                                       */
/* ------------------------------------------------------------------ */

type AudioContextCtor = new (options?: AudioContextOptions) => AudioContext;

function audioContextCtor(): AudioContextCtor | null {
  if (typeof globalThis === 'undefined') return null;
  const scope = globalThis as unknown as {
    AudioContext?: AudioContextCtor;
    webkitAudioContext?: AudioContextCtor;
  };
  return scope.AudioContext ?? scope.webkitAudioContext ?? null;
}

/** Vrai si WebAudio est utilisable dans cet environnement. */
export function isAudioSupported(): boolean {
  return audioContextCtor() !== null;
}

/* ------------------------------------------------------------------ */
/* Courbe de volume                                                    */
/* ------------------------------------------------------------------ */

/**
 * 0–100 → gain linéaire. Courbe puissance 2 : l'oreille perçoit une
 * progression régulière, et 0 coupe vraiment.
 */
export function volumeToGain(value0to100: number): number {
  const v = Math.min(100, Math.max(0, value0to100)) / 100;
  return v <= 0 ? 0 : v * v;
}

/* ------------------------------------------------------------------ */
/* Réponse impulsionnelle synthétisée                                  */
/* ------------------------------------------------------------------ */

/**
 * Réverbération de nef : quelques réflexions précoces puis une queue de bruit
 * décroissante, assombrie dans le temps et décorrélée entre les deux canaux.
 * Tout est calculé ; aucun échantillon n'est chargé.
 */
export function buildImpulseResponse(
  ctx: BaseAudioContext,
  seconds = 2.9,
  decay = 3.1,
  seed = 0x5eed1e,
): AudioBuffer {
  const rate = ctx.sampleRate;
  const length = Math.max(1, Math.floor(rate * seconds));
  const buffer = ctx.createBuffer(2, length, rate);
  const rng = createRng(seed);

  // Réflexions précoces : distances et gains irréguliers, jamais périodiques.
  const early: { delay: number; gain: number; side: number }[] = [];
  for (let i = 0; i < 14; i += 1) {
    early.push({
      delay: rng.range(0.006, 0.085) + i * 0.0042,
      gain: rng.range(0.16, 0.46) * Math.pow(0.86, i),
      side: rng.chance(0.5) ? 0 : 1,
    });
  }

  for (let channel = 0; channel < 2; channel += 1) {
    const data = buffer.getChannelData(channel);
    // Filtre passe-bas d'ordre 1 dont la coupure descend avec le temps :
    // la queue s'assombrit, comme dans une vraie pierre.
    let lp = 0;
    let lp2 = 0;
    for (let i = 0; i < length; i += 1) {
      const t = i / length;
      const envelope = Math.pow(1 - t, decay);
      const noise = rng.range(-1, 1);
      // Coupure de 0,52 à 0,06 en coefficient normalisé.
      const k = 0.52 - 0.46 * t;
      lp += k * (noise - lp);
      lp2 += k * (lp - lp2);
      data[i] = lp2 * envelope;
    }
    // Injection des réflexions précoces.
    for (const r of early) {
      const index = Math.floor(r.delay * rate) + (channel === r.side ? 0 : Math.floor(0.0017 * rate));
      if (index < length) {
        const g = r.gain * (channel === r.side ? 1 : 0.68);
        data[index] = (data[index] as number) + g;
      }
    }
    // Fondu d'entrée très court : évite le clic de la première réflexion.
    const fade = Math.floor(rate * 0.004);
    for (let i = 0; i < fade && i < length; i += 1) data[i] = (data[i] as number) * (i / fade);
    // Fondu de sortie : évite la coupure nette de la queue.
    const tail = Math.floor(rate * 0.12);
    for (let i = 0; i < tail && i < length; i += 1) {
      const idx = length - 1 - i;
      data[idx] = (data[idx] as number) * (i / tail);
    }
  }

  // Normalisation par la crête, pour un dosage prévisible.
  let peak = 0;
  for (let c = 0; c < 2; c += 1) {
    const data = buffer.getChannelData(c);
    for (let i = 0; i < length; i += 1) {
      const v = Math.abs(data[i] as number);
      if (v > peak) peak = v;
    }
  }
  if (peak > 0) {
    const scale = 0.86 / peak;
    for (let c = 0; c < 2; c += 1) {
      const data = buffer.getChannelData(c);
      for (let i = 0; i < length; i += 1) data[i] = (data[i] as number) * scale;
    }
  }
  return buffer;
}

/* ------------------------------------------------------------------ */
/* Bruit blanc partagé                                                 */
/* ------------------------------------------------------------------ */

const noiseCache = new WeakMap<BaseAudioContext, AudioBuffer>();

/**
 * Tampon de bruit stéréo de 3 s, réutilisé en boucle par tous les
 * instruments et ambiances : une seule allocation pour toute la session.
 */
export function noiseBuffer(ctx: BaseAudioContext): AudioBuffer {
  const cached = noiseCache.get(ctx);
  if (cached) return cached;
  const length = Math.floor(ctx.sampleRate * 3);
  const buffer = ctx.createBuffer(2, length, ctx.sampleRate);
  const rng = createRng(0x0b7a1e);
  for (let c = 0; c < 2; c += 1) {
    const data = buffer.getChannelData(c);
    for (let i = 0; i < length; i += 1) data[i] = rng.range(-1, 1);
    // Raccord de boucle : recouvrement croisé sur 40 ms pour supprimer le clic.
    const overlap = Math.floor(ctx.sampleRate * 0.04);
    for (let i = 0; i < overlap; i += 1) {
      const a = data[length - overlap + i] as number;
      const b = data[i] as number;
      const t = i / overlap;
      data[length - overlap + i] = a * (1 - t) + b * t;
    }
  }
  noiseCache.set(ctx, buffer);
  return buffer;
}

/* ------------------------------------------------------------------ */
/* Graphe                                                              */
/* ------------------------------------------------------------------ */

export interface AudioGraph {
  readonly ctx: AudioContext;
  /** Entrée sèche de chaque bus : y brancher la sortie directe des voix. */
  readonly dry: Readonly<Record<BusName, GainNode>>;
  /** Entrée réverbérée de chaque bus : y brancher le départ des voix. */
  readonly wet: Readonly<Record<BusName, GainNode>>;
  /** Nœud de volume de chaque bus (lecture seule ; passer par setBusVolume). */
  readonly volume: Readonly<Record<BusName, GainNode>>;
  readonly master: GainNode;
  readonly limiter: DynamicsCompressorNode;
  now(): number;
  volumes(): BusVolumes;
  setBusVolume(bus: BusName, value0to100: number): void;
  /** Coupe la sortie en douceur (onglet en arrière-plan). */
  mute(fadeMs?: number): void;
  /** Rétablit la sortie en douceur. */
  unmute(fadeMs?: number): void;
  /** Reprend le contexte s'il a été suspendu par le navigateur. */
  resume(): Promise<void>;
  suspend(): Promise<void>;
  close(): Promise<void>;
}

/**
 * Construit le graphe complet. Renvoie `null` si WebAudio est indisponible ou
 * si la création échoue : l'appelant bascule alors en mode silencieux.
 * Doit être appelé depuis un geste utilisateur.
 */
export async function createAudioGraph(volumes: BusVolumes): Promise<AudioGraph | null> {
  const Ctor = audioContextCtor();
  if (!Ctor) return null;

  let ctx: AudioContext;
  try {
    ctx = new Ctor({ latencyHint: 'interactive' });
  } catch {
    return null;
  }

  try {
    // --- Sortie : compresseur de programme puis limiteur de crête. ---------
    const master = ctx.createGain();
    master.gain.value = 0.92;

    const compressor = ctx.createDynamicsCompressor();
    compressor.threshold.value = -16;
    compressor.knee.value = 14;
    compressor.ratio.value = 2.6;
    compressor.attack.value = 0.008;
    compressor.release.value = 0.3;

    const limiter = ctx.createDynamicsCompressor();
    limiter.threshold.value = -1.4;
    limiter.knee.value = 0;
    limiter.ratio.value = 20;
    limiter.attack.value = 0.0012;
    limiter.release.value = 0.08;

    // Filtre de sortie : on retire l'infra-grave inutile qui mange la marge.
    const highPass = ctx.createBiquadFilter();
    highPass.type = 'highpass';
    highPass.frequency.value = 28;
    highPass.Q.value = 0.6;

    const sum = ctx.createGain();
    sum.gain.value = 1;

    sum.connect(compressor);
    compressor.connect(limiter);
    limiter.connect(highPass);
    highPass.connect(master);
    master.connect(ctx.destination);

    // --- Bus ---------------------------------------------------------------
    // Une convolution par bus, toutes construites depuis la même méthode mais
    // avec des longueurs différentes : la musique respire dans une nef, les
    // effets dans une salle, l'ambiance entre les deux.
    const dry = {} as Record<BusName, GainNode>;
    const wet = {} as Record<BusName, GainNode>;
    const volume = {} as Record<BusName, GainNode>;
    const current: BusVolumes = { ...volumes };

    for (let i = 0; i < BUS_NAMES.length; i += 1) {
      const name = BUS_NAMES[i] as BusName;

      const busVolume = ctx.createGain();
      busVolume.gain.value = volumeToGain(current[name]) * BUS_HEADROOM[name];
      busVolume.connect(sum);
      volume[name] = busVolume;

      const dryIn = ctx.createGain();
      dryIn.gain.value = 1;
      dryIn.connect(busVolume);
      dry[name] = dryIn;

      // Départ réverbération : pas de grave (qui boue), pas de sifflante.
      const wetIn = ctx.createGain();
      wetIn.gain.value = 1;

      const preHigh = ctx.createBiquadFilter();
      preHigh.type = 'highpass';
      preHigh.frequency.value = 180;
      preHigh.Q.value = 0.7;

      const convolver = ctx.createConvolver();
      convolver.normalize = false;
      convolver.buffer = buildImpulseResponse(
        ctx,
        BUS_REVERB_SECONDS[name],
        3.1,
        0x5eed1e + i * 7919,
      );

      const tone = ctx.createBiquadFilter();
      tone.type = 'highshelf';
      tone.frequency.value = 3400;
      tone.gain.value = -7;

      const wetReturn = ctx.createGain();
      wetReturn.gain.value = BUS_WET_RETURN[name];

      wetIn.connect(preHigh);
      preHigh.connect(convolver);
      convolver.connect(tone);
      tone.connect(wetReturn);
      wetReturn.connect(busVolume);
      wet[name] = wetIn;
    }

    const graph: AudioGraph = {
      ctx,
      dry,
      wet,
      volume,
      master,
      limiter,
      now: () => ctx.currentTime,
      volumes: () => ({ ...current }),
      setBusVolume(name, value) {
        current[name] = Math.min(100, Math.max(0, Math.round(value)));
        const target = volumeToGain(current[name]) * BUS_HEADROOM[name];
        const node = volume[name];
        const t = ctx.currentTime;
        node.gain.cancelScheduledValues(t);
        node.gain.setValueAtTime(node.gain.value, t);
        // 60 ms : assez lent pour ne pas claquer, assez vif pour un curseur.
        node.gain.linearRampToValueAtTime(target, t + 0.06);
        saveVolumes({ ...current });
      },
      mute(fadeMs = 220) {
        const t = ctx.currentTime;
        master.gain.cancelScheduledValues(t);
        master.gain.setValueAtTime(master.gain.value, t);
        master.gain.linearRampToValueAtTime(0, t + Math.max(0.02, fadeMs / 1000));
      },
      unmute(fadeMs = 320) {
        const t = ctx.currentTime;
        master.gain.cancelScheduledValues(t);
        master.gain.setValueAtTime(master.gain.value, t);
        master.gain.linearRampToValueAtTime(0.92, t + Math.max(0.02, fadeMs / 1000));
      },
      async resume() {
        try {
          if (ctx.state !== 'running') await ctx.resume();
        } catch {
          /* le navigateur refuse : on reste silencieux. */
        }
      },
      async suspend() {
        try {
          if (ctx.state === 'running') await ctx.suspend();
        } catch {
          /* sans conséquence. */
        }
      },
      async close() {
        try {
          await ctx.close();
        } catch {
          /* sans conséquence. */
        }
      },
    };

    try {
      if (ctx.state !== 'running') await ctx.resume();
    } catch {
      /* certains navigateurs refusent hors geste : init() sera rappelé. */
    }

    return graph;
  } catch {
    try {
      await ctx.close();
    } catch {
      /* ignoré */
    }
    return null;
  }
}
