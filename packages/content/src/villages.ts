/**
 * Chartes de village et identité des localités (document maître §7.3 et §7.4).
 *
 * À la première prise d'un village, le joueur choisit l'une des trois chartes.
 * La décision est permanente jusqu'à ce qu'un adversaire reprenne la place :
 * c'est un engagement, pas un réglage.
 *
 * Les localités sont les lieux réels du Forez retenus par le document maître.
 * Leur identité (ce qu'elles produisent, ce qu'elles permettent) est fixée ici,
 * la géographie étant du ressort de `@auvergne/map`.
 */
import type { Charter, RegionId, Resources, SkillEffect } from '@auvergne/engine';

/* ── Chartes ─────────────────────────────────────────────────────────────── */

export interface CharterDef {
  id: Charter;
  name: string;
  /** Formule courte affichée sur le bouton de choix. */
  summary: string;
  description: string;
  /** Effets appliqués tant que la charte tient. */
  effects: (SkillEffect | { kind: string; [k: string]: unknown })[];
  /** Ce que la charte coûte, en clair, pour que le choix soit un vrai choix. */
  tradeoff: string;
}

export const CHARTERS: readonly CharterDef[] = [
  {
    id: 'marchande',
    name: 'Charte marchande',
    summary: 'Revenus et taux de change.',
    description:
      "Le village obtient droit de marché hebdomadaire, poids étalonnés et un juré pour trancher les litiges. Les étals attirent les muletiers, les changeurs suivent, et la recette monte d'un cinquième. En contrepartie, la milice reste ce qu'elle était : des marchands.",
    effects: [
      { kind: 'income_bp', bp: 12000 },
      { kind: 'trade_bp', bp: 10600 },
    ],
    tradeoff: 'Aucune milice, aucun gain de croissance : la place se défend mal.',
  },
  {
    id: 'militaire',
    name: 'Charte militaire',
    summary: 'Milice et recrutement.',
    description:
      "Le village lève une milice, entretient un râtelier d'armes et tient le guet à tour de rôle. Les demeures alentour livrent un dixième de recrues supplémentaires et la garnison n'est plus symbolique. Les paysans y perdent des journées de travail, et le disent.",
    effects: [
      { kind: 'growth_bp', bp: 1000 },
      { kind: 'militia', count: 12 },
      { kind: 'morale', value: 1 },
    ],
    tradeoff: 'Revenus inchangés, agitation plus prompte à monter en cas de gabelle forte.',
  },
  {
    id: 'spirituelle',
    name: 'Charte spirituelle',
    summary: 'Mana, soins et réputation.',
    description:
      "On relève la chapelle, on rouvre la source et l'on reprend les processions. Les héros qui font halte y récupèrent leur mana, les blessés y sont mieux soignés, et la réputation de la bannière s'en trouve améliorée auprès des communautés.",
    effects: [
      { kind: 'mana_regen', value: 2 },
      { kind: 'heal_bp', bp: 11000 },
      { kind: 'reputation', value: 2 },
    ],
    tradeoff: 'Revenus modestes : le village produit de l’essence, pas des écus.',
  },
];

export const CHARTERS_BY_ID: Readonly<Record<Charter, CharterDef>> = {
  marchande: CHARTERS[0],
  militaire: CHARTERS[1],
  spirituelle: CHARTERS[2],
};

/* ── Localités ───────────────────────────────────────────────────────────── */

export type LocalityKind = 'capitale' | 'neutre' | 'site';

export interface VillageDef {
  key: string;
  name: string;
  region: RegionId;
  kind: LocalityKind;
  /** Résumé d'une ligne, tel que le document maître §7.4 le formule. */
  identity: string;
  description: string;
  /** Production quotidienne propre à la localité, une fois tenue. */
  production: Partial<Resources>;
  /** Charte que la place appelle naturellement (conseil, jamais contrainte). */
  suggestedCharter: Charter;
}

export const VILLAGES: readonly VillageDef[] = [
  {
    key: 'arconsat',
    name: 'Arconsat',
    region: 'hauts_arconsat',
    kind: 'capitale',
    identity: 'Bois et reconnaissance.',
    description:
      "Départ nord, adossé aux sources de la Durolle. Sapinières profondes, relief prononcé, bois en abondance et deux passages seulement pour descendre vers le centre : la position se tient à peu de frais, mais elle s'ouvre lentement. On y voit venir de loin, ce qui compense le reste.",
    production: { bois: 3 },
    suggestedCharter: 'militaire',
  },
  {
    key: 'chabreloche',
    name: 'Chabreloche',
    region: 'vallee_durolle',
    kind: 'neutre',
    identity: 'Marché et relais.',
    description:
      "Grand relais marchand sur la route la plus rapide entre le nord et l'ouest, avec sa foire, ses changeurs et sa cour de poste où l'on relaie six fois par jour. C'est aussi le point le plus exposé du comté : tout le monde y passe, y compris ceux qu'on n'attendait pas.",
    production: { ecus: 250, sel: 1 },
    suggestedCharter: 'marchande',
  },
  {
    key: 'le_lac',
    name: 'Le Lac',
    region: 'lac_sagnes',
    kind: 'neutre',
    identity: 'Caravanes de Sel.',
    description:
      "Hameau de quelques feux — le nom désigne le lieu-dit, pas une étendue d'eau — posé sur le passage des caravanes de sel qui montent vers la Maison du Trésor. Chemins étroits, lisières et cols : on y contrôle un trafic bien plus important que la taille du hameau ne le laisse croire.",
    production: { sel: 3 },
    suggestedCharter: 'marchande',
  },
  {
    key: 'cervieres',
    name: 'Cervières',
    region: 'chatellenie_cervieres',
    kind: 'capitale',
    identity: "Défense et Fil d'or.",
    description:
      "Bourg fortifié en hauteur, maisons de granit serrées, deux portes — les Farges et Bise — et un belvédère qui découvre toute la châtellenie. Les ateliers de broderie au fil d'or y travaillent depuis trois générations et fournissent les bannières de tout le comté. C'est la place la plus difficile à prendre du Forez.",
    production: { filDor: 2 },
    suggestedCharter: 'militaire',
  },
  {
    key: 'viscomtat',
    name: 'Viscomtat',
    region: 'futaies_viscomtat',
    kind: 'capitale',
    identity: 'Essence sylvestre et embuscades.',
    description:
      "Départ ouest, enfoncé dans des futaies si denses qu'on y perd le nord à cent pas du chemin. On y récolte l'essence sylvestre, on y connaît des layons que nulle charte n'a notés, et l'on y tend des embuscades depuis toujours. La contrepartie est une visibilité déplorable et des sièges pénibles à mener.",
    production: { essence: 3 },
    suggestedCharter: 'spirituelle',
  },
  {
    key: 'noiretable',
    name: 'Noirétable',
    region: 'pays_noiretable',
    kind: 'capitale',
    identity: 'Revenus et recrutement.',
    description:
      "Départ sud-est, au carrefour commercial et militaire du pays. Foires régulières, auberges pleines, gens de guerre disponibles : c'est la position qui s'étend le plus vite. Elle est aussi celle qu'on attaque le plus tôt, car chacun sait ce qu'elle rapporte.",
    production: { ecus: 300 },
    suggestedCharter: 'marchande',
  },
  {
    key: 'vollore_montagne',
    name: 'Vollore-Montagne',
    region: 'vollore_pamole',
    kind: 'neutre',
    identity: 'Granit et vision.',
    description:
      "Hautes terres du sud-ouest, carrières ouvertes en plein vent et points d'observation qui découvrent la moitié du sud. Le granit qu'on y taille est celui des remparts de tout le comté. Depuis la Pierre Pamole, on voit venir une armée deux jours à l'avance.",
    production: { granit: 3 },
    suggestedCharter: 'militaire',
  },
  {
    key: 'renaudie',
    name: 'La Renaudie',
    region: 'marche_renaudie',
    kind: 'capitale',
    identity: 'Croissance et réserves.',
    description:
      "Départ sud, le plus éloigné du centre, compensé par de meilleures réserves initiales, une croissance supérieure et un relais de borne accessible plus tôt que partout ailleurs. On y démarre lentement et l'on y arrive fort — à condition que la partie dure.",
    production: { ecus: 150, bois: 2 },
    suggestedCharter: 'militaire',
  },
  {
    key: 'hermitage',
    name: "Notre-Dame de l'Hermitage",
    region: 'hermitage_peyrotine',
    kind: 'neutre',
    identity: 'Mana, guérison et réputation.',
    description:
      "Sanctuaire majeur dans un vallon forestier à mille cent dix mètres, entre deux versants, avec sa source, son hospice et ses cloches qu'on entend de Noirétable par temps clair. On y soigne sans demander la bannière. Le tenir vaut autant pour la réputation que pour le mana.",
    production: { essence: 2 },
    suggestedCharter: 'spirituelle',
  },
  {
    key: 'maison_tresor',
    name: 'La Maison du Trésor',
    region: 'maison_tresor',
    kind: 'site',
    identity: 'Objectif de victoire et limite de la gabelle.',
    description:
      "Clairière fortifiée sur le chemin du Trésor, ancien poste de contrôle du sel et limite entre pays de gabelle et pays franc. Le Grand Livre y est scellé : serments, dettes, droits de passage et titres de propriété. Trois Sceaux des Marches ouvrent sa porte ; il faut ensuite battre sa garde, proclamer, et tenir vingt-et-un jours pendant que le comté entier regarde le compte à rebours.",
    production: { ecus: 350, sel: 4 },
    suggestedCharter: 'marchande',
  },
];

export const VILLAGES_BY_KEY: Readonly<Record<string, VillageDef>> = Object.fromEntries(
  VILLAGES.map((v) => [v.key, v]),
);

/** Localités capturables en cours de partie (ni capitales, ni objectif final). */
export function neutralLocalities(): VillageDef[] {
  return VILLAGES.filter((v) => v.kind === 'neutre');
}
