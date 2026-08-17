/**
 * Registre des icônes — résolution par clef d'atlas.
 *
 * Les clefs `competence_*`, `sort_*` et `artefact_*` sont **imposées** par
 * `packages/content` : elles sont honorées telles quelles, sans renommage.
 * S'y ajoutent `ressource_*`, `ecole_*` et les clefs générales d'interface.
 */

import type { ReactElement } from 'react';
import type { IconComponent, IconProps } from './kit.js';
import * as Core from './core-icons.js';
import * as Res from './resource-icons.js';
import * as School from './school-icons.js';
import { SKILL_ICONS, SKILL_LABELS } from './skill-icons.js';
import { SPELL_ICONS, SPELL_LABELS } from './spell-icons.js';
import { ARTIFACT_ICONS, ARTIFACT_RARITY } from './artifact-icons.js';

/** Icônes générales d'interface, clef courte. */
export const CORE_ICONS: Readonly<Record<string, IconComponent>> = {
  epee: Core.IconEpee,
  bouclier: Core.IconBouclier,
  aile: Core.IconAile,
  arc: Core.IconArc,
  fleche: Core.IconFleche,
  combat: Core.IconCombat,
  coeur: Core.IconCoeur,
  vitesse: Core.IconVitesse,
  moral: Core.IconMoral,
  fortune: Core.IconFortune,
  oeil: Core.IconOeil,
  cle: Core.IconCle,
  banniere: Core.IconBanniere,
  cloche: Core.IconCloche,
  marteau: Core.IconMarteau,
  parchemin: Core.IconParchemin,
  engrenage: Core.IconEngrenage,
  son: Core.IconSon,
  croix: Core.IconCroix,
  sablier: Core.IconSablier,
  chevron: Core.IconChevron,
  fermer: Core.IconFermer,
  valider: Core.IconValider,
  plus: Core.IconPlus,
  moins: Core.IconMoins,
  menu: Core.IconMenu,
  information: Core.IconInformation,
  alerte: Core.IconAlerte,
  verrou: Core.IconVerrou,
  loupe: Core.IconLoupe,
  livre: Core.IconLivre,
  carte: Core.IconCarte,
  coffre: Core.IconCoffre,
  tour: Core.IconTour,
  cite: Core.IconCite,
  mine: Core.IconMine,
  etoile: Core.IconEtoile,
  pas: Core.IconPas,
  feu: Core.IconFeu,
  goutte: Core.IconGoutte,
  soleil: Core.IconSoleil,
};

/** Icônes des sept ressources, clef `ressource_<clef>`. */
export const RESOURCE_ICONS: Readonly<Record<string, IconComponent>> = {
  ecus: Res.IconEcus,
  bois: Res.IconBois,
  granit: Res.IconGranit,
  fer: Res.IconFer,
  sel: Res.IconSel,
  essence: Res.IconEssence,
  filDor: Res.IconFilDor,
};

/** Libellés français des ressources. */
export const RESOURCE_LABELS: Readonly<Record<string, string>> = {
  ecus: 'Écus',
  bois: 'Bois',
  granit: 'Granit',
  fer: 'Fer',
  sel: 'Sel',
  essence: 'Essence',
  filDor: "Fil d'or",
};

/** Icônes des quatre écoles, clef `ecole_<id>`. */
export const SCHOOL_ICONS: Readonly<Record<string, IconComponent>> = {
  braises: School.IconEcoleBraises,
  sources: School.IconEcoleSources,
  brumes: School.IconEcoleBrumes,
  racines: School.IconEcoleRacines,
};

/** Libellés français des écoles. */
export const SCHOOL_LABELS: Readonly<Record<string, string>> = {
  braises: 'Braises',
  sources: 'Sources',
  brumes: 'Brumes',
  racines: 'Racines',
};

function withPrefix(
  prefix: string,
  table: Readonly<Record<string, IconComponent>>,
): Record<string, IconComponent> {
  const out: Record<string, IconComponent> = {};
  for (const [k, v] of Object.entries(table)) out[`${prefix}${k}`] = v;
  return out;
}

/**
 * Toutes les icônes du jeu, indexées par clef d'atlas.
 * Les clefs longues (`competence_*`, `sort_*`, `artefact_*`, `ressource_*`,
 * `ecole_*`) et les clefs courtes d'interface coexistent sans collision.
 */
export const ICONS: Readonly<Record<string, IconComponent>> = {
  ...CORE_ICONS,
  ...withPrefix('ressource_', RESOURCE_ICONS),
  ...withPrefix('ecole_', SCHOOL_ICONS),
  ...withPrefix('competence_', SKILL_ICONS),
  ...withPrefix('sort_', SPELL_ICONS),
  ...withPrefix('artefact_', ARTIFACT_ICONS),
};

/** Vrai si la clef d'atlas est fournie par le design system. */
export function hasIcon(name: string): boolean {
  return Object.prototype.hasOwnProperty.call(ICONS, name);
}

/** Liste triée de toutes les clefs disponibles. */
export function iconKeys(): string[] {
  return Object.keys(ICONS).sort();
}

export interface NamedIconProps extends IconProps {
  /** clef d'atlas, par exemple `competence_logistique` ou `epee` */
  name: string;
}

/**
 * Icône résolue par clef. Si la clef est inconnue, un cartouche vide et
 * silencieux est rendu plutôt qu'une erreur : l'interface ne casse jamais pour
 * une icône manquante.
 */
export function Icon({ name, ...rest }: NamedIconProps): ReactElement {
  const Found = ICONS[name];
  if (Found) return <Found {...rest} />;
  return <IconManquante {...rest} />;
}

/** Cartouche de repli, visiblement « à faire », jamais un carré vide. */
const IconManquante = Core.IconInformation;

export { SKILL_ICONS, SKILL_LABELS, SPELL_ICONS, SPELL_LABELS, ARTIFACT_ICONS, ARTIFACT_RARITY };
