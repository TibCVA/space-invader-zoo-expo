/**
 * Théorie musicale — couche purement arithmétique du moteur audio.
 *
 * Aucun accès à WebAudio, au DOM ni à `Math.random` : ce module est
 * déterministe, testable seul, et sert de source de vérité au compositeur.
 *
 * Le vocabulaire est celui de la musique modale médiévale : degrés (et non
 * fonctions tonales), cadences ouvertes, rythmes de danse.
 */

/* ------------------------------------------------------------------ */
/* Générateur pseudo-aléatoire déterministe                            */
/* ------------------------------------------------------------------ */

export interface Rng {
  /** Flottant dans [0, 1[. */
  next(): number;
  /** Entier dans [min, max] inclus. */
  int(min: number, max: number): number;
  /** Flottant dans [min, max[. */
  range(min: number, max: number): number;
  /** Vrai avec la probabilité `p`. */
  chance(p: number): boolean;
  /** Élément tiré au sort dans une liste non vide. */
  pick<T>(items: readonly T[]): T;
  /** Tirage pondéré : `weights` doit avoir la même longueur que `items`. */
  weighted<T>(items: readonly T[], weights: readonly number[]): T;
  /** Graine courante, pour dériver un flux indépendant. */
  fork(salt: number): Rng;
}

/**
 * Mulberry32 : petit, rapide, de bonne qualité pour de la musique.
 * Le même `seed` produit toujours exactement la même suite.
 */
export function createRng(seed: number): Rng {
  let state = (seed >>> 0) || 0x9e3779b9;
  const next = (): number => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const rng: Rng = {
    next,
    int: (min, max) => min + Math.floor(next() * (max - min + 1)),
    range: (min, max) => min + next() * (max - min),
    chance: (p) => next() < p,
    pick: (items) => items[Math.floor(next() * items.length)] as never,
    weighted: (items, weights) => {
      let total = 0;
      for (const w of weights) total += w > 0 ? w : 0;
      if (total <= 0) return items[0] as never;
      let roll = next() * total;
      for (let i = 0; i < items.length; i += 1) {
        const w = weights[i] ?? 0;
        if (w <= 0) continue;
        roll -= w;
        if (roll <= 0) return items[i] as never;
      }
      return items[items.length - 1] as never;
    },
    fork: (salt) => createRng(hashSeed(`${seed}:${salt}`)),
  };
  return rng;
}

/** Hachage FNV-1a 32 bits : transforme une chaîne en graine stable. */
export function hashSeed(text: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i += 1) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/* ------------------------------------------------------------------ */
/* Modes anciens                                                       */
/* ------------------------------------------------------------------ */

export type ModeName =
  | 'dorien'
  | 'eolien'
  | 'mixolydien'
  | 'phrygien'
  | 'lydien'
  | 'ionien'
  | 'locrien';

/** Intervalles en demi-tons depuis la finale du mode. */
export const MODES: Readonly<Record<ModeName, readonly number[]>> = Object.freeze({
  dorien: Object.freeze([0, 2, 3, 5, 7, 9, 10]),
  eolien: Object.freeze([0, 2, 3, 5, 7, 8, 10]),
  mixolydien: Object.freeze([0, 2, 4, 5, 7, 9, 10]),
  phrygien: Object.freeze([0, 1, 3, 5, 7, 8, 10]),
  lydien: Object.freeze([0, 2, 4, 6, 7, 9, 11]),
  ionien: Object.freeze([0, 2, 4, 5, 7, 9, 11]),
  locrien: Object.freeze([0, 1, 3, 5, 6, 8, 10]),
});

export const MODE_NAMES: readonly ModeName[] = Object.freeze([
  'dorien',
  'eolien',
  'mixolydien',
  'phrygien',
  'lydien',
  'ionien',
  'locrien',
]);

/** Étiquettes françaises, pour l'interface d'options ou le codex. */
export const MODE_LABELS: Readonly<Record<ModeName, string>> = Object.freeze({
  dorien: 'mode dorien',
  eolien: 'mode éolien',
  mixolydien: 'mode mixolydien',
  phrygien: 'mode phrygien',
  lydien: 'mode lydien',
  ionien: 'mode ionien',
  locrien: 'mode locrien',
});

/** Degrés « colorants » d'un mode : ceux qui le distinguent de l'éolien. */
export const MODE_COLOUR_DEGREE: Readonly<Record<ModeName, number>> = Object.freeze({
  dorien: 5,
  eolien: 5,
  mixolydien: 6,
  phrygien: 1,
  lydien: 3,
  ionien: 2,
  locrien: 4,
});

/**
 * Note MIDI d'un degré, les degrés hors [0,6] débordant sur les octaves
 * voisines (degré 7 = tonique à l'octave, degré -1 = sensible en dessous).
 */
export function degreeToMidi(root: number, mode: ModeName, degree: number): number {
  const steps = MODES[mode];
  const size = steps.length;
  const octave = Math.floor(degree / size);
  const index = degree - octave * size;
  return root + octave * 12 + (steps[index] as number);
}

/** Gamme complète sur `octaves` octaves, tonique incluse au sommet. */
export function scale(root: number, mode: ModeName, octaves = 1): number[] {
  const out: number[] = [];
  const size = MODES[mode].length;
  for (let d = 0; d < size * octaves; d += 1) out.push(degreeToMidi(root, mode, d));
  out.push(root + 12 * octaves);
  return out;
}

/** Classes de hauteur (0–11) du mode, triées. */
export function pitchClasses(root: number, mode: ModeName): number[] {
  return MODES[mode].map((s) => (((root + s) % 12) + 12) % 12).sort((a, b) => a - b);
}

/** Vrai si la note appartient au mode, toutes octaves confondues. */
export function inMode(midi: number, root: number, mode: ModeName): boolean {
  return pitchClasses(root, mode).includes((((midi % 12) + 12) % 12));
}

/** Rabat une note quelconque sur le degré modal le plus proche (vers le bas à égalité). */
export function quantizeToMode(midi: number, root: number, mode: ModeName): number {
  if (inMode(midi, root, mode)) return midi;
  for (let delta = 1; delta <= 6; delta += 1) {
    if (inMode(midi - delta, root, mode)) return midi - delta;
    if (inMode(midi + delta, root, mode)) return midi + delta;
  }
  return midi;
}

/** Accord par superposition de tierces modales (triade par défaut). */
export function chord(root: number, mode: ModeName, degree: number, size = 3): number[] {
  const out: number[] = [];
  for (let i = 0; i < size; i += 1) out.push(degreeToMidi(root, mode, degree + i * 2));
  return out;
}

/** Quinte à vide (organum) — la sonorité de base du bourdon. */
export function openFifth(root: number, mode: ModeName, degree: number): number[] {
  return [degreeToMidi(root, mode, degree), degreeToMidi(root, mode, degree + 4)];
}

export function transpose(notes: readonly number[], semitones: number): number[] {
  return notes.map((n) => n + semitones);
}

/** Fréquence tempérée d'une note MIDI (la3 = 69 = 440 Hz). */
export function midiToFreq(midi: number, referenceA = 440): number {
  return referenceA * Math.pow(2, (midi - 69) / 12);
}

/**
 * Fréquence en tempérament mésotonique adouci : les tierces sont légèrement
 * resserrées et les quintes très peu élargies. L'oreille y entend « ancien »
 * sans entendre « faux ». `amount` va de 0 (tempérament égal) à 1.
 */
export function midiToFreqAncient(midi: number, amount = 0.55, referenceA = 440): number {
  const pc = (((midi % 12) + 12) % 12);
  // Écarts en centièmes de demi-ton par rapport au tempérament égal.
  const offsets = [0, -8, -3, 6, -10, -1, -7, 2, -9, -5, 4, -12];
  const cents = (offsets[pc] as number) * amount;
  return midiToFreq(midi, referenceA) * Math.pow(2, cents / 1200);
}

/* ------------------------------------------------------------------ */
/* Cadences modales                                                    */
/* ------------------------------------------------------------------ */

export type CadenceName =
  | 'plagale'
  | 'phrygienne'
  | 'sous_finale'
  | 'ouverte'
  | 'suspendue'
  | 'landini'
  | 'antique';

/** Suites de degrés (0 = finale du mode). Aucune sensible tonale. */
export const CADENCES: Readonly<Record<CadenceName, readonly number[]>> = Object.freeze({
  /** IV → I, la cadence d'église. */
  plagale: Object.freeze([3, 0]),
  /** ♭II → I, descente par demi-ton, sombre. */
  phrygienne: Object.freeze([1, 0]),
  /** ♭VII → I, la cadence modale par excellence. */
  sous_finale: Object.freeze([6, 0]),
  /** I → V, reste en suspens : sert de fin de phrase intérieure. */
  ouverte: Object.freeze([0, 4]),
  /** IV → V, se referme ailleurs. */
  suspendue: Object.freeze([3, 4]),
  /** VI → VII → I, avec broderie de Landini. */
  landini: Object.freeze([5, 6, 0]),
  /** VII → V → I, longue, pour les fins de section. */
  antique: Object.freeze([6, 4, 0]),
});

export const CADENCE_NAMES: readonly CadenceName[] = Object.freeze([
  'plagale',
  'phrygienne',
  'sous_finale',
  'ouverte',
  'suspendue',
  'landini',
  'antique',
]);

/** Copie mutable de la cadence demandée. */
export function cadence(name: CadenceName): number[] {
  return [...CADENCES[name]];
}

/** Vrai si la cadence se referme sur la finale. */
export function isClosing(name: CadenceName): boolean {
  return CADENCES[name][CADENCES[name].length - 1] === 0;
}

/**
 * Suite de degrés d'accompagnement pour `bars` mesures, se terminant par la
 * cadence demandée. Déterministe pour une graine donnée.
 */
export function progression(
  seed: number,
  mode: ModeName,
  bars: number,
  cadenceName: CadenceName,
): number[] {
  const rng = createRng(seed);
  const tail = cadence(cadenceName);
  const head = Math.max(0, bars - tail.length);
  // Degrés stables du langage modal : finale, sous-finale, quarte, quinte, tierce.
  const pool = [0, 6, 3, 4, 2, 5];
  const weights = [7, 4, 5, 5, 3, 2];
  const out: number[] = [];
  let previous = 0;
  for (let i = 0; i < head; i += 1) {
    let degree = rng.weighted(pool, weights);
    if (degree === previous) degree = rng.weighted(pool, weights);
    out.push(degree);
    previous = degree;
  }
  out.push(...tail);
  return out.slice(0, Math.max(bars, tail.length));
}

/* ------------------------------------------------------------------ */
/* Rythmes médiévaux                                                   */
/* ------------------------------------------------------------------ */

export type RhythmName =
  | 'estampie'
  | 'saltarelle'
  | 'ductia'
  | 'carole'
  | 'bourree'
  | 'procession'
  | 'tourdion'
  | 'libre';

export interface RhythmDef {
  readonly name: RhythmName;
  readonly label: string;
  /** Battues par mesure. */
  readonly beatsPerBar: number;
  /** Durées successives, en battues ; la somme vaut `beatsPerBar`. */
  readonly pattern: readonly number[];
  /** Accentuation par battue, 0–1, appliquée aux vélocités. */
  readonly accents: readonly number[];
  /** Frappes de tambour : position en battues et force 0–1. */
  readonly drum: readonly { readonly at: number; readonly force: number }[];
}

const rhythm = (d: RhythmDef): RhythmDef => Object.freeze(d);

export const RHYTHMS: Readonly<Record<RhythmName, RhythmDef>> = Object.freeze({
  estampie: rhythm({
    name: 'estampie',
    label: 'estampie',
    beatsPerBar: 6,
    pattern: [1, 0.5, 0.5, 1, 1, 1, 1],
    accents: [1, 0.45, 0.7, 0.5, 0.8, 0.45],
    drum: [
      { at: 0, force: 1 },
      { at: 2, force: 0.5 },
      { at: 3, force: 0.78 },
      { at: 4.5, force: 0.36 },
    ],
  }),
  saltarelle: rhythm({
    name: 'saltarelle',
    label: 'saltarelle',
    beatsPerBar: 6,
    pattern: [1.5, 0.5, 1, 1.5, 0.5, 1],
    accents: [1, 0.4, 0.62, 0.85, 0.4, 0.6],
    drum: [
      { at: 0, force: 1 },
      { at: 1.5, force: 0.4 },
      { at: 3, force: 0.82 },
      { at: 5, force: 0.45 },
    ],
  }),
  ductia: rhythm({
    name: 'ductia',
    label: 'ductia',
    beatsPerBar: 4,
    pattern: [1, 1, 0.5, 0.5, 1],
    accents: [1, 0.55, 0.75, 0.5],
    drum: [
      { at: 0, force: 0.95 },
      { at: 2, force: 0.7 },
      { at: 3.5, force: 0.34 },
    ],
  }),
  carole: rhythm({
    name: 'carole',
    label: 'carole',
    beatsPerBar: 4,
    pattern: [0.5, 0.5, 1, 0.5, 0.5, 1],
    accents: [1, 0.5, 0.8, 0.55],
    drum: [
      { at: 0, force: 0.9 },
      { at: 1, force: 0.38 },
      { at: 2, force: 0.72 },
      { at: 3, force: 0.42 },
    ],
  }),
  bourree: rhythm({
    name: 'bourree',
    label: 'bourrée',
    beatsPerBar: 2,
    pattern: [0.5, 0.5, 0.5, 0.5],
    accents: [1, 0.62],
    drum: [
      { at: 0, force: 0.92 },
      { at: 1, force: 0.6 },
      { at: 1.5, force: 0.3 },
    ],
  }),
  procession: rhythm({
    name: 'procession',
    label: 'procession',
    beatsPerBar: 4,
    pattern: [2, 1, 1],
    accents: [1, 0.42, 0.66, 0.42],
    drum: [
      { at: 0, force: 0.86 },
      { at: 2, force: 0.52 },
    ],
  }),
  tourdion: rhythm({
    name: 'tourdion',
    label: 'tourdion',
    beatsPerBar: 3,
    pattern: [1, 0.5, 0.5, 1],
    accents: [1, 0.5, 0.68],
    drum: [
      { at: 0, force: 0.94 },
      { at: 1.5, force: 0.44 },
      { at: 2, force: 0.6 },
    ],
  }),
  libre: rhythm({
    name: 'libre',
    label: 'libre',
    beatsPerBar: 4,
    pattern: [2, 2],
    accents: [0.8, 0.6, 0.7, 0.55],
    drum: [],
  }),
});

export const RHYTHM_NAMES: readonly RhythmName[] = Object.freeze([
  'estampie',
  'saltarelle',
  'ductia',
  'carole',
  'bourree',
  'procession',
  'tourdion',
  'libre',
]);

/** Somme des durées d'un motif rythmique. */
export function patternLength(name: RhythmName): number {
  return RHYTHMS[name].pattern.reduce((a, b) => a + b, 0);
}

/**
 * Déroule le motif rythmique sur `bars` mesures et renvoie les positions de
 * départ (en battues) et leurs durées.
 */
export function rhythmGrid(name: RhythmName, bars: number): { start: number; duration: number }[] {
  const def = RHYTHMS[name];
  const out: { start: number; duration: number }[] = [];
  const barLength = def.beatsPerBar;
  for (let bar = 0; bar < bars; bar += 1) {
    let cursor = 0;
    let index = 0;
    while (cursor < barLength - 1e-6) {
      const raw = def.pattern[index % def.pattern.length] as number;
      const duration = Math.min(raw, barLength - cursor);
      out.push({ start: bar * barLength + cursor, duration });
      cursor += duration;
      index += 1;
    }
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* Génération mélodique                                                */
/* ------------------------------------------------------------------ */

export interface MelodyNote {
  /** Position de départ, en battues depuis le début de la phrase. */
  start: number;
  /** Durée en battues. */
  duration: number;
  /** Hauteur MIDI. */
  midi: number;
  /** Degré modal correspondant (peut sortir de [0,6]). */
  degree: number;
  /** Vélocité 0–1. */
  velocity: number;
  /** Vrai pour les notes de broderie ajoutées comme ornement. */
  ornament: boolean;
}

export interface MelodyOptions {
  seed: number;
  root: number;
  mode: ModeName;
  bars: number;
  rhythm: RhythmName;
  cadence: CadenceName;
  /** Étendue en degrés autour de la finale (défaut 7 = une octave). */
  ambitus?: number;
  /** 0 = quasi immobile, 1 = très mobile. Défaut 0,5. */
  mobility?: number;
  /** Densité de broderies, 0–1. Défaut 0,25. */
  ornamentation?: number;
}

/**
 * Mélodie modale originale, entièrement déterminée par `options.seed`.
 *
 * La méthode est celle d'un chant : marche conjointe dominante, sauts rares et
 * compensés par un mouvement contraire, arcs de phrase, appui sur la finale et
 * la corde de récitation, cadence imposée sur la dernière mesure. Rien n'est
 * recopié d'une œuvre existante — la suite provient du seul PRNG.
 */
export function generateMelody(options: MelodyOptions): MelodyNote[] {
  const {
    seed,
    root,
    mode,
    bars,
    rhythm: rhythmName,
    cadence: cadenceName,
    ambitus = 7,
    mobility = 0.5,
    ornamentation = 0.25,
  } = options;

  const rng = createRng(seed);
  const def = RHYTHMS[rhythmName];
  const grid = rhythmGrid(rhythmName, bars);
  if (grid.length === 0) return [];

  const cadenceDegrees = cadence(cadenceName);
  // La corde de récitation : quinte du mode, quarte pour le phrygien.
  const reciting = mode === 'phrygien' ? 3 : 4;
  const low = -Math.round(ambitus * 0.35);
  const high = Math.round(ambitus * 0.75);

  const notes: MelodyNote[] = [];
  let degree = rng.chance(0.55) ? 0 : reciting;
  let lastLeap = 0;

  const cadenceStart = bars * def.beatsPerBar - def.beatsPerBar;

  for (let i = 0; i < grid.length; i += 1) {
    const cell = grid[i] as { start: number; duration: number };
    const beatInBar = cell.start % def.beatsPerBar;
    const accent = def.accents[Math.floor(beatInBar) % def.accents.length] ?? 0.6;
    const isLast = i === grid.length - 1;

    if (cell.start >= cadenceStart) {
      // Dernière mesure : la mélodie suit strictement la cadence.
      const remaining = grid.length - i;
      const idx = Math.min(
        cadenceDegrees.length - 1,
        cadenceDegrees.length - Math.max(1, Math.min(remaining, cadenceDegrees.length)),
      );
      degree = cadenceDegrees[idx] as number;
      if (isLast) degree = cadenceDegrees[cadenceDegrees.length - 1] as number;
    } else {
      // Arc de phrase : tension montante au milieu, détente aux extrémités.
      const phase = cell.start / (bars * def.beatsPerBar);
      const arc = Math.sin(phase * Math.PI);
      const target = Math.round(low + (high - low) * (0.25 + 0.55 * arc));

      const leapChance = 0.1 + 0.28 * mobility;
      let step: number;
      if (lastLeap !== 0) {
        // Un saut se compense par un mouvement contraire conjoint.
        step = lastLeap > 0 ? -1 : 1;
        lastLeap = 0;
      } else if (rng.chance(leapChance)) {
        const leaps = [3, 4, -3, -4, 2, -2];
        const chosen = rng.weighted(leaps, [3, 2, 3, 2, 4, 4]);
        step = chosen;
        lastLeap = chosen;
      } else {
        const pull = degree < target ? 0.66 : degree > target ? 0.34 : 0.5;
        step = rng.chance(pull) ? 1 : -1;
        if (rng.chance(0.16 - 0.1 * mobility)) step = 0;
      }
      degree += step;
      if (degree > high) degree = high - 1;
      if (degree < low) degree = low + 1;
    }

    const midi = degreeToMidi(root, mode, degree);
    const velocity = clamp01(0.42 + 0.36 * accent + rng.range(-0.05, 0.05));
    notes.push({
      start: cell.start,
      duration: cell.duration,
      midi,
      degree,
      velocity,
      ornament: false,
    });

    // Broderies : la note supérieure puis retour, sur les valeurs longues.
    if (
      !isLast &&
      cell.duration >= 1 &&
      cell.start < cadenceStart &&
      rng.chance(ornamentation * 0.8)
    ) {
      const last = notes[notes.length - 1] as MelodyNote;
      const cut = cell.duration * 0.62;
      last.duration = cut;
      const upper = rng.chance(0.7) ? degree + 1 : degree - 1;
      notes.push({
        start: cell.start + cut,
        duration: cell.duration - cut,
        midi: degreeToMidi(root, mode, upper),
        degree: upper,
        velocity: clamp01(velocity * 0.72),
        ornament: true,
      });
    }
  }

  return notes;
}

/**
 * Contrechant : suit la mélodie à la quinte ou à la tierce inférieure, avec
 * quelques unissons aux cadences — la texture de l'organum.
 */
export function counterLine(melody: readonly MelodyNote[], root: number, mode: ModeName, seed: number): MelodyNote[] {
  const rng = createRng(seed ^ 0x5bf03635);
  const out: MelodyNote[] = [];
  for (let i = 0; i < melody.length; i += 1) {
    const n = melody[i] as MelodyNote;
    if (n.ornament) continue;
    if (n.duration < 0.5) continue;
    const interval = rng.weighted([-4, -2, 0], [5, 3, 2]);
    const degree = n.degree + interval;
    out.push({
      start: n.start,
      duration: n.duration,
      midi: degreeToMidi(root, mode, degree),
      degree,
      velocity: clamp01(n.velocity * 0.62),
      ornament: false,
    });
  }
  return out;
}

/** Durée d'une battue en secondes. */
export function beatSeconds(bpm: number): number {
  return 60 / bpm;
}

/** Tempo borné à la fourchette imposée par la bible artistique (62–96). */
export function clampBpm(bpm: number): number {
  return Math.min(96, Math.max(62, Math.round(bpm)));
}

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}
