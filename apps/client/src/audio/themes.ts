/**
 * Les sept thèmes du jeu et la couleur musicale des douze régions du Forez.
 *
 * Un thème n'est pas une mélodie écrite : c'est un **cahier des charges** que
 * le compositeur applique en temps réel. Mode, finale, tempo, rythme, plan de
 * sections, orchestration par couche et par palier d'intensité. La mélodie
 * elle-même naît du générateur déterministe de `theory.ts` : elle n'est donc
 * jamais la copie de quoi que ce soit, et reste identique d'une partie à
 * l'autre pour une même graine.
 */

import type { CadenceName, ModeName, RhythmName } from './theory.js';
import type { InstrumentName } from './instruments.js';
import type { AmbienceKey } from './ambience.js';
import type { RegionId } from '@auvergne/engine';

/** Clefs imposées par `docs/02-API.md`. */
export type ThemeKey =
  | 'accueil'
  | 'aventure'
  | 'cite_granit'
  | 'cite_ermitage'
  | 'combat'
  | 'victoire'
  | 'defaite';

export const THEME_KEYS: readonly ThemeKey[] = Object.freeze([
  'accueil',
  'aventure',
  'cite_granit',
  'cite_ermitage',
  'combat',
  'victoire',
  'defaite',
]);

/** Paliers d'intensité adaptative. */
export type Intensity = 'calme' | 'tension' | 'combat';

export const INTENSITY_RANK: Readonly<Record<Intensity, number>> = Object.freeze({
  calme: 0,
  tension: 1,
  combat: 2,
});

export type LayerRole =
  | 'melodie'
  | 'contrechant'
  | 'nappe'
  | 'harmonie'
  | 'percussion'
  | 'ornement';

export interface LayerDef {
  readonly role: LayerRole;
  readonly instrument: InstrumentName;
  /** Transposition en octaves par rapport à la finale du thème. */
  readonly octave: number;
  /** Niveau relatif, 0–1. */
  readonly gain: number;
  /** Placement stéréo, −1 à +1. */
  readonly pan: number;
  /** Dosage de réverbération, 0–1. */
  readonly wet: number;
  /** Ouverture du timbre, 0–1. */
  readonly brightness: number;
  /** Palier à partir duquel la couche entre. */
  readonly from: Intensity;
  /** Palier au-delà duquel la couche sort (facultatif). */
  readonly until?: Intensity;
  /** Une note sur `sparsity` est jouée (1 = toutes). */
  readonly sparsity?: number;
}

export interface SectionDef {
  readonly name: string;
  /** Nombre de mesures. */
  readonly bars: number;
  /** La mélodie principale sonne-t-elle dans cette section ? */
  readonly melody: boolean;
  /** Cadence qui referme la section. */
  readonly cadence: CadenceName;
  /** Décalage de la finale, en degrés (0 = pas de transposition). */
  readonly shift: number;
  /** Multiplicateur de niveau global de la section, 0–1. */
  readonly level: number;
}

export interface ThemeDef {
  readonly key: ThemeKey;
  readonly label: string;
  readonly mode: ModeName;
  /** Finale, en note MIDI. */
  readonly root: number;
  /** Tempo de base, borné à 62–96. */
  readonly bpm: number;
  readonly rhythm: RhythmName;
  readonly seed: number;
  readonly sections: readonly SectionDef[];
  readonly layers: readonly LayerDef[];
  /** Bourdon tenu : degré et niveau, ou `null` pour aucun. */
  readonly bourdon: { readonly degree: number; readonly level: number; readonly octave: number } | null;
  /** Ambiance suggérée quand le thème démarre sans consigne contraire. */
  readonly ambience: AmbienceKey;
  /** Le thème boucle-t-il, ou se joue-t-il une seule fois ? */
  readonly loop: boolean;
  /** Mobilité mélodique, 0–1. */
  readonly mobility: number;
  /** Densité d'ornements, 0–1. */
  readonly ornamentation: number;
}

const layer = (d: LayerDef): LayerDef => Object.freeze(d);
const section = (d: SectionDef): SectionDef => Object.freeze(d);

/* ------------------------------------------------------------------ */
/* Les sept thèmes                                                     */
/* ------------------------------------------------------------------ */

/**
 * Accueil — « Le Forez au petit jour ». Dorien sur ré, très lent, presque
 * immobile : bourdon de vielle, chœur lointain, une flûte qui cherche son
 * chemin. Aucune percussion : la page d'accueil ne doit pas presser le joueur.
 */
const ACCUEIL: ThemeDef = Object.freeze({
  key: 'accueil',
  label: 'Le Forez au petit jour',
  mode: 'dorien',
  root: 50, // ré2
  bpm: 64,
  rhythm: 'procession',
  seed: 0x41757665,
  loop: true,
  mobility: 0.32,
  ornamentation: 0.3,
  ambience: 'vent',
  bourdon: { degree: 0, level: 0.62, octave: 0 },
  sections: Object.freeze([
    section({ name: 'ouverture', bars: 4, melody: false, cadence: 'ouverte', shift: 0, level: 0.55 }),
    section({ name: 'chant', bars: 8, melody: true, cadence: 'sous_finale', shift: 0, level: 0.9 }),
    section({ name: 'réponse', bars: 8, melody: true, cadence: 'plagale', shift: 3, level: 0.82 }),
    section({ name: 'apaisement', bars: 6, melody: true, cadence: 'antique', shift: 0, level: 0.7 }),
  ]),
  layers: Object.freeze([
    layer({ role: 'melodie', instrument: 'flute', octave: 2, gain: 0.7, pan: -0.16, wet: 0.62, brightness: 0.5, from: 'calme' }),
    layer({ role: 'nappe', instrument: 'choeur', octave: 1, gain: 0.5, pan: 0.1, wet: 0.85, brightness: 0.4, from: 'calme', sparsity: 2 }),
    layer({ role: 'harmonie', instrument: 'cordes', octave: 0, gain: 0.55, pan: 0.24, wet: 0.7, brightness: 0.34, from: 'calme', sparsity: 2 }),
    layer({ role: 'ornement', instrument: 'psalterion', octave: 2, gain: 0.34, pan: 0.42, wet: 0.6, brightness: 0.62, from: 'tension', sparsity: 3 }),
  ]),
});

/**
 * Aventure — « Chemins de la Durolle ». Mixolydien sur sol : la septième
 * abaissée donne cette clarté un peu rustique qui n'est ni gaie ni triste.
 * C'est le thème le plus long, celui qu'on entend des heures : il respire.
 */
const AVENTURE: ThemeDef = Object.freeze({
  key: 'aventure',
  label: 'Chemins de la Durolle',
  mode: 'mixolydien',
  root: 55, // sol2
  bpm: 78,
  rhythm: 'ductia',
  seed: 0x64757261,
  loop: true,
  mobility: 0.52,
  ornamentation: 0.28,
  ambience: 'foret',
  bourdon: { degree: 0, level: 0.5, octave: 0 },
  sections: Object.freeze([
    section({ name: 'départ', bars: 8, melody: true, cadence: 'ouverte', shift: 0, level: 0.78 }),
    section({ name: 'marche', bars: 8, melody: true, cadence: 'sous_finale', shift: 0, level: 0.92 }),
    section({ name: 'halte', bars: 6, melody: true, cadence: 'plagale', shift: 4, level: 0.62 }),
    section({ name: 'reprise', bars: 8, melody: true, cadence: 'landini', shift: 0, level: 0.95 }),
    section({ name: 'horizon', bars: 6, melody: false, cadence: 'antique', shift: 0, level: 0.55 }),
  ]),
  layers: Object.freeze([
    layer({ role: 'melodie', instrument: 'vielle', octave: 1, gain: 0.72, pan: -0.2, wet: 0.4, brightness: 0.52, from: 'calme' }),
    layer({ role: 'contrechant', instrument: 'flute', octave: 2, gain: 0.42, pan: 0.34, wet: 0.58, brightness: 0.58, from: 'tension' }),
    layer({ role: 'harmonie', instrument: 'cordes', octave: 0, gain: 0.5, pan: 0.14, wet: 0.62, brightness: 0.36, from: 'calme', sparsity: 2 }),
    layer({ role: 'percussion', instrument: 'tambour', octave: -2, gain: 0.5, pan: 0.06, wet: 0.24, brightness: 0.5, from: 'tension' }),
    layer({ role: 'ornement', instrument: 'psalterion', octave: 2, gain: 0.36, pan: 0.46, wet: 0.52, brightness: 0.66, from: 'calme', sparsity: 3 }),
    layer({ role: 'nappe', instrument: 'choeur', octave: 1, gain: 0.34, pan: -0.34, wet: 0.86, brightness: 0.34, from: 'combat', sparsity: 2 }),
  ]),
});

/**
 * Cité de la Châtellenie de Granit — « Sous les remparts ». Éolien sur la,
 * carré, martial sans être belliqueux : cordes graves, tambour de garde,
 * cloche de beffroi aux fins de section.
 */
const CITE_GRANIT: ThemeDef = Object.freeze({
  key: 'cite_granit',
  label: 'Sous les remparts',
  mode: 'eolien',
  root: 45, // la1
  bpm: 72,
  rhythm: 'procession',
  seed: 0x67726e74,
  loop: true,
  mobility: 0.38,
  ornamentation: 0.18,
  ambience: 'foire',
  bourdon: { degree: 0, level: 0.58, octave: 0 },
  sections: Object.freeze([
    section({ name: 'porte', bars: 6, melody: false, cadence: 'ouverte', shift: 0, level: 0.6 }),
    section({ name: 'cour', bars: 8, melody: true, cadence: 'plagale', shift: 0, level: 0.88 }),
    section({ name: 'forge', bars: 8, melody: true, cadence: 'suspendue', shift: 2, level: 0.94 }),
    section({ name: 'donjon', bars: 8, melody: true, cadence: 'antique', shift: 0, level: 0.8 }),
  ]),
  layers: Object.freeze([
    layer({ role: 'melodie', instrument: 'vielle', octave: 2, gain: 0.62, pan: -0.24, wet: 0.46, brightness: 0.44, from: 'calme' }),
    layer({ role: 'harmonie', instrument: 'cordes', octave: 0, gain: 0.66, pan: 0.16, wet: 0.66, brightness: 0.3, from: 'calme' }),
    layer({ role: 'percussion', instrument: 'tambour', octave: -2, gain: 0.56, pan: 0, wet: 0.22, brightness: 0.42, from: 'calme' }),
    layer({ role: 'ornement', instrument: 'cloche', octave: 2, gain: 0.3, pan: 0.5, wet: 0.9, brightness: 0.5, from: 'tension', sparsity: 8 }),
    layer({ role: 'nappe', instrument: 'choeur', octave: 1, gain: 0.36, pan: -0.4, wet: 0.84, brightness: 0.28, from: 'tension', sparsity: 2 }),
  ]),
});

/**
 * Cité de l'Ermitage des Bois Noirs — « Les sapins et le silence ». Phrygien
 * sur mi : le demi-ton initial installe immédiatement quelque chose d'ancien
 * et d'un peu inquiet. Presque pas de percussion, beaucoup d'air.
 */
const CITE_ERMITAGE: ThemeDef = Object.freeze({
  key: 'cite_ermitage',
  label: 'Les sapins et le silence',
  mode: 'phrygien',
  root: 52, // mi2
  bpm: 66,
  rhythm: 'libre',
  seed: 0x65726d69,
  loop: true,
  mobility: 0.34,
  ornamentation: 0.36,
  ambience: 'foret',
  bourdon: { degree: 0, level: 0.54, octave: 0 },
  sections: Object.freeze([
    section({ name: 'lisière', bars: 6, melody: false, cadence: 'ouverte', shift: 0, level: 0.5 }),
    section({ name: 'cloître', bars: 8, melody: true, cadence: 'phrygienne', shift: 0, level: 0.84 }),
    section({ name: 'source', bars: 8, melody: true, cadence: 'plagale', shift: 3, level: 0.72 }),
    section({ name: 'veille', bars: 8, melody: true, cadence: 'phrygienne', shift: 0, level: 0.9 }),
  ]),
  layers: Object.freeze([
    layer({ role: 'melodie', instrument: 'flute', octave: 2, gain: 0.66, pan: 0.2, wet: 0.74, brightness: 0.44, from: 'calme' }),
    layer({ role: 'nappe', instrument: 'choeur', octave: 1, gain: 0.56, pan: -0.18, wet: 0.9, brightness: 0.3, from: 'calme', sparsity: 2 }),
    layer({ role: 'harmonie', instrument: 'cordes', octave: 0, gain: 0.5, pan: 0.3, wet: 0.72, brightness: 0.26, from: 'calme', sparsity: 2 }),
    layer({ role: 'ornement', instrument: 'psalterion', octave: 2, gain: 0.4, pan: -0.44, wet: 0.66, brightness: 0.7, from: 'tension', sparsity: 2 }),
    layer({ role: 'ornement', instrument: 'cloche', octave: 3, gain: 0.24, pan: 0.52, wet: 0.95, brightness: 0.6, from: 'tension', sparsity: 11 }),
    layer({ role: 'percussion', instrument: 'tambour', octave: -2, gain: 0.4, pan: 0, wet: 0.3, brightness: 0.4, from: 'combat' }),
  ]),
});

/**
 * Combat — « La bataille des marches ». Dorien sur ré, saltarelle à 92 :
 * c'est un rythme de danse détourné en rythme de guerre, comme le faisaient
 * les tambours de bande. La montée en intensité ajoute le chœur et la vielle
 * aiguë, jamais un changement de tempo brutal.
 */
const COMBAT: ThemeDef = Object.freeze({
  key: 'combat',
  label: 'La bataille des marches',
  mode: 'dorien',
  root: 50,
  bpm: 92,
  rhythm: 'saltarelle',
  seed: 0x62617461,
  loop: true,
  mobility: 0.72,
  ornamentation: 0.2,
  ambience: 'aucune',
  bourdon: { degree: 0, level: 0.66, octave: 0 },
  sections: Object.freeze([
    section({ name: 'engagement', bars: 8, melody: true, cadence: 'ouverte', shift: 0, level: 0.86 }),
    section({ name: 'mêlée', bars: 8, melody: true, cadence: 'sous_finale', shift: 0, level: 1 }),
    section({ name: 'reflux', bars: 6, melody: true, cadence: 'suspendue', shift: 4, level: 0.72 }),
    section({ name: 'assaut', bars: 8, melody: true, cadence: 'landini', shift: 0, level: 1 }),
  ]),
  layers: Object.freeze([
    layer({ role: 'percussion', instrument: 'tambour', octave: -2, gain: 0.7, pan: 0, wet: 0.2, brightness: 0.56, from: 'calme' }),
    layer({ role: 'melodie', instrument: 'vielle', octave: 1, gain: 0.72, pan: -0.26, wet: 0.36, brightness: 0.66, from: 'calme' }),
    layer({ role: 'harmonie', instrument: 'cordes', octave: 0, gain: 0.62, pan: 0.2, wet: 0.5, brightness: 0.44, from: 'calme' }),
    layer({ role: 'contrechant', instrument: 'vielle', octave: 2, gain: 0.4, pan: 0.4, wet: 0.42, brightness: 0.74, from: 'tension' }),
    layer({ role: 'nappe', instrument: 'choeur', octave: 1, gain: 0.44, pan: -0.36, wet: 0.7, brightness: 0.38, from: 'tension', sparsity: 2 }),
    layer({ role: 'ornement', instrument: 'cloche', octave: 2, gain: 0.3, pan: 0.46, wet: 0.85, brightness: 0.7, from: 'combat', sparsity: 6 }),
  ]),
});

/**
 * Victoire — « La Couronne du Forez ». Ionien sur sol, court, non bouclé :
 * cloches, chœur ouvert, cordes en tenue. Il se termine, il ne s'éteint pas.
 */
const VICTOIRE: ThemeDef = Object.freeze({
  key: 'victoire',
  label: 'La Couronne du Forez',
  mode: 'ionien',
  root: 55,
  bpm: 84,
  rhythm: 'tourdion',
  seed: 0x76696374,
  loop: false,
  mobility: 0.56,
  ornamentation: 0.34,
  ambience: 'cloches',
  bourdon: { degree: 0, level: 0.44, octave: 0 },
  sections: Object.freeze([
    section({ name: 'proclamation', bars: 6, melody: true, cadence: 'ouverte', shift: 0, level: 0.94 }),
    section({ name: 'liesse', bars: 8, melody: true, cadence: 'plagale', shift: 0, level: 1 }),
    section({ name: 'couronnement', bars: 6, melody: true, cadence: 'antique', shift: 0, level: 0.88 }),
  ]),
  layers: Object.freeze([
    layer({ role: 'melodie', instrument: 'vielle', octave: 2, gain: 0.68, pan: -0.2, wet: 0.5, brightness: 0.68, from: 'calme' }),
    layer({ role: 'ornement', instrument: 'cloche', octave: 2, gain: 0.44, pan: 0.34, wet: 0.9, brightness: 0.7, from: 'calme', sparsity: 3 }),
    layer({ role: 'nappe', instrument: 'choeur', octave: 1, gain: 0.6, pan: 0.08, wet: 0.82, brightness: 0.5, from: 'calme', sparsity: 2 }),
    layer({ role: 'harmonie', instrument: 'cordes', octave: 0, gain: 0.56, pan: 0.24, wet: 0.68, brightness: 0.44, from: 'calme' }),
    layer({ role: 'percussion', instrument: 'tambour', octave: -2, gain: 0.48, pan: 0, wet: 0.26, brightness: 0.5, from: 'calme' }),
    layer({ role: 'contrechant', instrument: 'flute', octave: 3, gain: 0.36, pan: 0.48, wet: 0.66, brightness: 0.7, from: 'tension' }),
  ]),
});

/**
 * Défaite — « Le vent sur les cendres ». Éolien sur ré, très lent, non bouclé,
 * réduit à trois voix. Le bourdon s'éteint le dernier.
 */
const DEFAITE: ThemeDef = Object.freeze({
  key: 'defaite',
  label: 'Le vent sur les cendres',
  mode: 'eolien',
  root: 50,
  bpm: 62,
  rhythm: 'libre',
  seed: 0x64656661,
  loop: false,
  mobility: 0.24,
  ornamentation: 0.1,
  ambience: 'vent',
  bourdon: { degree: 0, level: 0.5, octave: 0 },
  sections: Object.freeze([
    section({ name: 'silence', bars: 4, melody: false, cadence: 'ouverte', shift: 0, level: 0.4 }),
    section({ name: 'lamentation', bars: 8, melody: true, cadence: 'phrygienne', shift: 0, level: 0.76 }),
    section({ name: 'cendres', bars: 6, melody: true, cadence: 'plagale', shift: 0, level: 0.5 }),
  ]),
  layers: Object.freeze([
    layer({ role: 'melodie', instrument: 'choeur', octave: 1, gain: 0.6, pan: -0.12, wet: 0.92, brightness: 0.24, from: 'calme' }),
    layer({ role: 'harmonie', instrument: 'cordes', octave: 0, gain: 0.58, pan: 0.2, wet: 0.78, brightness: 0.2, from: 'calme', sparsity: 2 }),
    layer({ role: 'ornement', instrument: 'cloche', octave: 1, gain: 0.28, pan: 0.4, wet: 0.95, brightness: 0.34, from: 'calme', sparsity: 9 }),
  ]),
});

export const THEMES: Readonly<Record<ThemeKey, ThemeDef>> = Object.freeze({
  accueil: ACCUEIL,
  aventure: AVENTURE,
  cite_granit: CITE_GRANIT,
  cite_ermitage: CITE_ERMITAGE,
  combat: COMBAT,
  victoire: VICTOIRE,
  defaite: DEFAITE,
});

export function theme(key: ThemeKey): ThemeDef {
  return THEMES[key] ?? AVENTURE;
}

/* ------------------------------------------------------------------ */
/* Couleur régionale                                                   */
/* ------------------------------------------------------------------ */

/**
 * Chaque région du Forez teinte le thème en cours sans le remplacer : la
 * finale glisse de quelques degrés, le mode se colore, le tempo respire, un
 * instrument passe au premier plan et l'ambiance change. C'est ainsi qu'on
 * reconnaît un lieu à l'oreille sans changer de morceau.
 */
export interface RegionColour {
  readonly label: string;
  /** Transposition de la finale, en demi-tons. */
  readonly rootOffset: number;
  /** Mode imposé, ou `null` pour garder celui du thème. */
  readonly mode: ModeName | null;
  /** Écart de tempo, en battues par minute. */
  readonly bpmDelta: number;
  /** Rythme imposé, ou `null`. */
  readonly rhythm: RhythmName | null;
  /** Instrument mis en avant (gain doublé sur sa couche). */
  readonly feature: InstrumentName;
  /** Correction d'ouverture du timbre, −0,3 à +0,3. */
  readonly brightness: number;
  /** Correction de réverbération, −0,3 à +0,3. */
  readonly wet: number;
  /** Ambiance associée. */
  readonly ambience: AmbienceKey;
}

const colour = (d: RegionColour): RegionColour => Object.freeze(d);

export const REGION_COLOURS: Readonly<Record<RegionId, RegionColour>> = Object.freeze({
  /** Les foires de Chabreloche : la seule couleur franchement joyeuse. */
  hauts_arconsat: colour({
    label: 'foires de Chabreloche',
    rootOffset: 2,
    mode: 'mixolydien',
    bpmDelta: 8,
    rhythm: 'bourree',
    feature: 'psalterion',
    brightness: 0.16,
    wet: -0.12,
    ambience: 'foire',
  }),
  /** La Durolle et ses moulins : le roulement de l'eau et des rouets. */
  vallee_durolle: colour({
    label: 'Durolle et moulins',
    rootOffset: 0,
    mode: 'dorien',
    bpmDelta: 4,
    rhythm: 'ductia',
    feature: 'vielle',
    brightness: 0.06,
    wet: 0.04,
    ambience: 'riviere',
  }),
  lac_sagnes: colour({
    label: 'eaux dormantes du Lac',
    rootOffset: -3,
    mode: 'eolien',
    bpmDelta: -8,
    rhythm: 'libre',
    feature: 'choeur',
    brightness: -0.14,
    wet: 0.2,
    ambience: 'riviere',
  }),
  maison_tresor: colour({
    label: 'seuil de la Maison du Trésor',
    rootOffset: -1,
    mode: 'phrygien',
    bpmDelta: -2,
    rhythm: 'procession',
    feature: 'cloche',
    brightness: -0.04,
    wet: 0.22,
    ambience: 'vent',
  }),
  /** Le vent de Cervières : haut, sec, coupant. */
  chatellenie_cervieres: colour({
    label: 'vent de Cervières',
    rootOffset: 5,
    mode: 'dorien',
    bpmDelta: 6,
    rhythm: 'estampie',
    feature: 'vielle',
    brightness: 0.2,
    wet: -0.08,
    ambience: 'vent',
  }),
  futaies_viscomtat: colour({
    label: 'futaies de Viscomtat',
    rootOffset: -2,
    mode: 'dorien',
    bpmDelta: -4,
    rhythm: 'ductia',
    feature: 'flute',
    brightness: -0.02,
    wet: 0.1,
    ambience: 'foret',
  }),
  /** La brume des Bois Noirs : le mode le plus sombre du jeu. */
  coeur_bois_noirs: colour({
    label: 'brume des Bois Noirs',
    rootOffset: -4,
    mode: 'phrygien',
    bpmDelta: -10,
    rhythm: 'libre',
    feature: 'choeur',
    brightness: -0.22,
    wet: 0.26,
    ambience: 'foret',
  }),
  pays_noiretable: colour({
    label: 'pays de Noirétable',
    rootOffset: 3,
    mode: 'eolien',
    bpmDelta: 2,
    rhythm: 'carole',
    feature: 'cordes',
    brightness: 0,
    wet: 0.02,
    ambience: 'vent',
  }),
  /** Les cloches de l'Hermitage : tout le reste s'efface derrière elles. */
  hermitage_peyrotine: colour({
    label: "cloches de l'Hermitage",
    rootOffset: 0,
    mode: 'ionien',
    bpmDelta: -6,
    rhythm: 'procession',
    feature: 'cloche',
    brightness: 0.08,
    wet: 0.28,
    ambience: 'cloches',
  }),
  /** Les roches de Pamole : granit nu, quintes à vide, presque pas de mélodie. */
  vollore_pamole: colour({
    label: 'roches de Pamole',
    rootOffset: -5,
    mode: 'eolien',
    bpmDelta: -6,
    rhythm: 'procession',
    feature: 'cordes',
    brightness: -0.16,
    wet: 0.14,
    ambience: 'vent',
  }),
  marche_renaudie: colour({
    label: 'marche de La Renaudie',
    rootOffset: 4,
    mode: 'mixolydien',
    bpmDelta: 5,
    rhythm: 'saltarelle',
    feature: 'tambour',
    brightness: 0.12,
    wet: -0.04,
    ambience: 'foire',
  }),
  grande_chaussee: colour({
    label: 'grande chaussée',
    rootOffset: 7,
    mode: 'mixolydien',
    bpmDelta: 7,
    rhythm: 'ductia',
    feature: 'tambour',
    brightness: 0.1,
    wet: -0.06,
    ambience: 'foret',
  }),
});

export function regionColour(region: RegionId | undefined): RegionColour | null {
  if (!region) return null;
  return REGION_COLOURS[region] ?? null;
}
