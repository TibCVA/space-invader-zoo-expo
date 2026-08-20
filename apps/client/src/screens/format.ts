/**
 * Mise en forme française partagée par les écrans.
 *
 * Rien ici ne calcule une règle : ce sont uniquement des libellés. Les nombres
 * viennent du moteur, ce module ne fait que les habiller (espace insécable
 * fine avant les unités, séparateur de milliers, dates locales).
 */

import { dayOf, weekOf, rondeOf } from '@auvergne/engine';
import type { ArtifactSlot, GabellePolicy, SealId, WeatherKind } from '@auvergne/engine';

/** Espace fine insécable, celle que la typographie française exige. */
export const FINE = ' ';
/** Espace insécable normale. */
export const NBSP = ' ';

const NOMBRE = new Intl.NumberFormat('fr-FR');

/**
 * « 18 450 », avec l'espace insécable de groupement.
 *
 * Le séparateur est ramené à l'espace insécable normale (U+00A0), et non laissé
 * à l'espace fine insécable (U+202F) que rend `Intl` pour le français.
 *
 * Ce n'est pas une coquetterie typographique : **aucune des trois familles du
 * jeu ne dessine U+202F**. Mesuré sur la capture de la carte d'aventure —
 * « entre 85225 et 170526 » et « puissance 1682 » — le caractère tombe sur un
 * glyphe absent, de largeur nulle, et le séparateur de milliers disparaît
 * purement et simplement. Tous les nombres au-dessus du millier s'affichaient
 * donc collés, sur tous les écrans du client : trésor, revenus, puissance
 * d'armée, expérience.
 */
export function nombre(valeur: number): string {
  return NOMBRE.format(Math.trunc(valeur)).replace(/\u202F/g, NBSP);
}

/** « +240 » ou « −18 » ; le zéro reste « 0 » sans signe. */
export function signe(valeur: number): string {
  if (valeur === 0) return '0';
  return valeur > 0 ? `+${nombre(valeur)}` : `−${nombre(Math.abs(valeur))}`;
}

/** Points de base rendus en pourcentage lisible : 9000 → « −10 % ». */
export function pourcentageBp(bp: number): string {
  const ecart = Math.round((bp - 10000) / 100);
  return `${ecart >= 0 ? '+' : '−'}${Math.abs(ecart)}${FINE}%`;
}

/** « Semaine 6, jour 3 » — le calendrier du brief §4. */
export function calendrier(turn: number): string {
  return `Semaine${NBSP}${weekOf(turn)}, jour${NBSP}${dayOf(turn)}`;
}

/** « Ronde 2 · semaine 6 · jour 3 », pour les bandeaux. */
export function calendrierLong(turn: number): string {
  return `Ronde${NBSP}${rondeOf(turn)} · semaine${NBSP}${weekOf(turn)} · jour${NBSP}${dayOf(turn)}`;
}

/** Date locale abrégée d'un horodatage ISO. Jamais « Invalid Date ». */
export function dateCourte(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return 'date inconnue';
  return d.toLocaleString('fr-FR', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/** Nom français des dix emplacements d'artefact. */
export const NOMS_EMPLACEMENTS: Readonly<Record<ArtifactSlot, string>> = {
  tete: 'Tête',
  cou: 'Cou',
  torse: 'Torse',
  mains: 'Mains',
  anneau1: 'Anneau senestre',
  anneau2: 'Anneau dextre',
  ceinture: 'Ceinture',
  pieds: 'Pieds',
  banniere: 'Bannière',
  relique: 'Relique',
};

/** Ordre d'affichage de la poupée d'équipement, de la tête aux pieds. */
export const ORDRE_EMPLACEMENTS: readonly ArtifactSlot[] = [
  'tete',
  'cou',
  'torse',
  'mains',
  'anneau1',
  'anneau2',
  'ceinture',
  'pieds',
  'banniere',
  'relique',
];

/** Libellé des trois rangs de compétence (Novice, Expert, Maître). */
export const RANGS: readonly string[] = ['Novice', 'Expert', 'Maître'];

/** Nom français des cinq Sceaux des Marches. */
export const NOMS_SCEAUX: Readonly<Record<SealId, string>> = {
  hautes_futaies: 'Hautes Futaies',
  farges: 'Farges',
  pamole: 'Pierre Pamole',
  hermitage: "Notre-Dame de l'Hermitage",
  brumes: 'Marche des Brumes',
};

/** Nom français des cinq temps. */
export const NOMS_METEO: Readonly<Record<WeatherKind, string>> = {
  eclaircie: 'Éclaircie',
  pluie: 'Pluie',
  brume: 'Brume',
  givre: 'Givre',
  vent: 'Vent',
};

/** Nom français des trois politiques de gabelle. */
export const NOMS_GABELLE: Readonly<Record<GabellePolicy, string>> = {
  franchise: 'Franchise',
  mesure: 'Mesure',
  forte: 'Forte',
};

/** Libellé des quatre conditions de victoire. */
export const NOMS_VICTOIRE: Readonly<Record<string, string>> = {
  couronne: 'La Couronne du Forez',
  derniere_banniere: 'La dernière bannière',
  maitre_marches: 'Maître des Marches',
  chronique: 'Chronique du Forez',
};

/** Accord de « jour » et autres pluriels simples. */
export function pluriel(n: number, singulier: string, plurielMot = `${singulier}s`): string {
  return `${nombre(n)}${NBSP}${Math.abs(n) > 1 ? plurielMot : singulier}`;
}
