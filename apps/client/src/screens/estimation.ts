/**
 * `screens/estimation.ts` — la fiche d'inspection d'un lieu, d'une cité ou d'un
 * héros adverse, à la manière de HMM3.
 *
 * ## Pourquoi ce fichier existe
 *
 * La demande était : « il faut qu'en cliquant sur un château ou un ennemi ou un
 * héros concurrent on ait une indication de sa force et du type d'unités et de
 * la difficulté comme dans HMM3 ». Le client n'en offrait **rien** : le rappel
 * `onPickObject` du contrat des vues n'était même pas branché par
 * `screens/vues.tsx`, et cliquer sur une garde neutre, une cité adverse ou un
 * héros concurrent ne produisait aucun renseignement. Mesuré sur la carte de
 * démonstration : cent trente-six lieux dans le cadre, dont quarante-neuf
 * gardés, et pas une seule fiche pour en dire la force.
 *
 * ## Ce que HMM3 montre, et ce qu'il cache
 *
 * HMM3 ne donne jamais l'effectif exact d'une compagnie qu'on n'a pas
 * reconnue : il donne un **paquet flou** — « quelques Loups », « une horde de
 * Gobelins » — et l'effectif ne devient exact qu'avec la vision (l'œil du
 * héros, sa Reconnaissance). C'est un choix de jeu, pas une coquetterie : le
 * joueur doit décider avec un renseignement incomplet, et payer la
 * reconnaissance qui le complète.
 *
 * On transpose la même échelle à neuf crans. Chaque cran donne un mot **et** un
 * intervalle : c'est l'intervalle qui permet de chiffrer une fourchette de
 * puissance, donc une appréciation de difficulté, sans jamais divulguer le
 * nombre.
 *
 * ## Ce que ce module ne fait pas
 *
 * Il ne calcule aucune règle (non négociable n°4). La puissance d'une armée
 * vient de `armyPower` du moteur, les noms de créature du contenu, la
 * propriété d'un lieu de `render/pavois.ts`. Ce qui est écrit ici, et ici
 * seulement, c'est la **mise en mots** : l'échelle des paquets, l'échelle de
 * difficulté et leurs libellés français.
 */

import {
  REGION_LABELS,
  TERRAIN_LABELS,
  armyPower,
  regionAt,
  resourceLabel,
  skillRank,
  terrainAt,
  terrainCost,
} from '@auvergne/engine';
import type {
  ArmyStack,
  CreatureId,
  GameState,
  HeroInstance,
  MapCoord,
  MapObject,
  PlayerId,
  ResourceKey,
  TownState,
  WorldMap,
} from '@auvergne/engine';
import { CREATURES, HEROES } from '@auvergne/content';
import { OBJECT_KIND_LABELS } from '@auvergne/engine';
import { proprietaireLieu, rangBanniere } from '../render/pavois.js';
import { nombre } from './format.js';

/* ═════════════════════════ 1. Les paquets flous ═══════════════════════════ */

/** Un cran de l'échelle : le mot, et l'effectif qu'il recouvre. */
export interface Paquet {
  /** effectif minimal couvert par ce cran */
  readonly min: number;
  /** effectif maximal couvert par ce cran */
  readonly max: number;
  /** le mot, accordé pour être suivi d'un nom au pluriel */
  readonly mot: string;
}

/**
 * L'échelle des paquets, du plus petit au plus grand.
 *
 * Neuf crans, comme HMM3, et des bornes qui doublent ou presque à chaque cran :
 * c'est ce qui fait qu'un mot reste informatif — passer de « une bande » à « une
 * horde » veut dire cinq fois plus de monde, pas dix pour cent de plus. Les mots
 * sont ceux du Forez : on lève des bandes et des troupes, pas des « essaims ».
 */
export const PAQUETS: readonly Paquet[] = [
  { min: 1, max: 4, mot: 'une poignée de' },
  { min: 5, max: 9, mot: 'quelques' },
  { min: 10, max: 19, mot: 'une bande de' },
  { min: 20, max: 49, mot: 'une troupe de' },
  { min: 50, max: 99, mot: 'une horde de' },
  { min: 100, max: 249, mot: 'une foule de' },
  { min: 250, max: 499, mot: 'une nuée de' },
  { min: 500, max: 999, mot: 'une multitude de' },
  { min: 1000, max: Number.POSITIVE_INFINITY, mot: 'une légion de' },
];

/** Le cran qui recouvre cet effectif. Jamais `undefined` : les bornes se touchent. */
export function paquetDe(effectif: number): Paquet {
  const n = Math.max(1, Math.trunc(effectif));
  for (const p of PAQUETS) {
    if (n <= p.max) return p;
  }
  return PAQUETS[PAQUETS.length - 1];
}

/* ══════════════════════ 2. L'échelle de difficulté ════════════════════════ */

export type Difficulte =
  | 'sans_peril'
  | 'aise'
  | 'favorable'
  | 'incertain'
  | 'rude'
  | 'redoutable'
  | 'hors_de_portee'
  | 'inconnue';

/** Libellé français de chaque cran. La couleur ne porte jamais seule le sens. */
export const LIBELLES_DIFFICULTE: Readonly<Record<Difficulte, string>> = {
  sans_peril: 'Sans péril',
  aise: 'Aisé',
  favorable: 'À notre avantage',
  incertain: 'Incertain',
  rude: 'Rude',
  redoutable: 'Redoutable',
  hors_de_portee: 'Hors de portée',
  inconnue: 'Aucun héros pour juger',
};

/** Teinte de pastille de chaque cran, prise dans les tons du design system. */
export const TONS_DIFFICULTE: Readonly<Record<Difficulte, 'sinople' | 'or' | 'grenat' | 'neutre'>> = {
  sans_peril: 'sinople',
  aise: 'sinople',
  favorable: 'sinople',
  incertain: 'or',
  rude: 'or',
  redoutable: 'grenat',
  hors_de_portee: 'grenat',
  inconnue: 'neutre',
};

/**
 * Bornes de l'échelle, en rapport `puissance de la cible / puissance du héros`.
 *
 * Le cran est celui du **premier** seuil que le rapport ne dépasse pas. Les
 * valeurs sont resserrées autour de 1 : c'est là que la décision se joue, et
 * c'est là que le joueur a besoin de nuances. Au-delà de 4,5, il n'y a plus
 * rien à nuancer.
 */
export const SEUILS_DIFFICULTE: readonly { readonly max: number; readonly cran: Difficulte }[] = [
  { max: 0.15, cran: 'sans_peril' },
  { max: 0.45, cran: 'aise' },
  { max: 0.85, cran: 'favorable' },
  { max: 1.25, cran: 'incertain' },
  { max: 2.2, cran: 'rude' },
  { max: 4.5, cran: 'redoutable' },
];

/**
 * Difficulté d'un affrontement, du point de vue du héros de référence.
 *
 * `puissanceHeros <= 0` (aucun héros sélectionné, ou un héros sans armée) rend
 * `inconnue` plutôt qu'un rapport infini : dire « hors de portée » à un joueur
 * qui n'a rien sélectionné serait un renseignement faux.
 */
export function difficulteDe(puissanceCible: number, puissanceHeros: number): Difficulte {
  if (puissanceHeros <= 0) return 'inconnue';
  if (puissanceCible <= 0) return 'sans_peril';
  const rapport = puissanceCible / puissanceHeros;
  for (const s of SEUILS_DIFFICULTE) {
    if (rapport <= s.max) return s.cran;
  }
  return 'hors_de_portee';
}

/* ══════════════════════════ 3. La fiche ═══════════════════════════════════ */

/** Une pile d'armée telle qu'on la laisse voir. */
export interface PileEstimee {
  readonly creature: CreatureId;
  /** nom français, au singulier ou au pluriel selon l'effectif */
  readonly nom: string;
  /** « une horde de » quand on n'a pas la vision, « 64 » quand on l'a */
  readonly quantite: string;
  /** effectif exact, ou `null` si on ne l'a pas reconnu */
  readonly effectif: number | null;
}

/** Fourchette de puissance : exacte avec la vision, encadrée sans elle. */
export interface Force {
  readonly min: number;
  readonly max: number;
  readonly exacte: boolean;
}

/** Ce que la fiche d'inspection affiche. Aucun de ces champs n'est une règle. */
export interface Fiche {
  /** nom propre du lieu, de la cité ou du héros */
  readonly titre: string;
  /** genre du lieu, en français : « Gisement », « Cité », « Héros » */
  readonly nature: string;
  /** bannière qui tient les lieux, ou `null` pour un lieu neutre */
  readonly proprietaire: { readonly id: PlayerId; readonly nom: string; readonly rang: 1 | 2 | 3 | 4 | 5 } | null;
  /** vrai quand le lieu n'appartient à personne — le mot compte, à l'écran */
  readonly neutre: boolean;
  /** les piles présentes, garde neutre, garnison ou armée de héros */
  readonly piles: readonly PileEstimee[];
  /** force estimée ; `null` quand il n'y a rien à combattre */
  readonly force: Force | null;
  /**
   * Appréciation de difficulté, ou `null` quand la comparaison n'a **pas de
   * sens** : ce qu'on tient déjà (héros, cité, gisement) et ce qui n'oppose
   * personne. Voir `jugement`.
   *
   * `null` et `'inconnue'` ne disent pas la même chose, et la capture l'a
   * montré : la fiche de Clotilde affichait la pastille « Aucun héros pour
   * juger » alors que Clotilde était précisément le héros qui juge. Le carton
   * annonçait une lacune qui n'existait pas.
   */
  readonly difficulte: Difficulte | null;
  /** ce que le héros de référence apporte au jugement, en une ligne */
  readonly juge: string | null;
  /** renseignements complémentaires : production, récit, état */
  readonly notes: readonly string[];
  readonly at: MapCoord;
}

/** Ce que l'appelant sait du joueur qui regarde. */
export interface Regard {
  /** bannière de cet appareil */
  readonly moi: PlayerId;
  /** voile du joueur local : 0 inconnu, 1 exploré, 2 sous les yeux */
  readonly fog: Uint8Array | null;
  /** largeur de la carte, pour indexer le voile */
  readonly cols: number;
  /** héros dont l'armée sert de mesure ; `null` si aucun n'est sélectionné */
  readonly heros: HeroInstance | null;
  /**
   * Pavois d'affichage des routes `#/demo/*`, construit par
   * `render/pavois.ts`. La carte le consulte pour planter ses drapeaux ; la
   * fiche doit consulter le même, sans quoi le drapeau annoncerait une place
   * prise que le carton déclarerait neutre.
   */
  readonly pavoisDemo?: ReadonlyMap<string, PlayerId>;
}

/** Rang de Reconnaissance à partir duquel un héros compte les rangs adverses. */
export const RANG_RECONNAISSANCE_EXACTE = 2;

/**
 * A-t-on le renseignement exact sur cette case ?
 *
 * Deux façons de l'obtenir, toutes deux prises de HMM3 : **la case est sous les
 * yeux** (voile à 2, un héros ou une place la surveille en ce moment), ou le
 * héros de référence est un éclaireur — Reconnaissance au rang d'Expert ou de
 * Maître, l'équivalent forézien du Scouting. Les lieux qu'on tient soi-même
 * sont évidemment comptés au grain près.
 */
export function visionExacte(regard: Regard, at: MapCoord, aMoi: boolean): boolean {
  if (aMoi) return true;
  if (regard.heros && skillRank(regard.heros, 'reconnaissance') >= RANG_RECONNAISSANCE_EXACTE) return true;
  const fog = regard.fog;
  if (!fog || regard.cols <= 0) return false;
  const index = at.row * regard.cols + at.col;
  if (index < 0 || index >= fog.length) return false;
  return fog[index] >= 2;
}

/** Nom français d'une créature, accordé à l'effectif annoncé. */
function nomCreature(id: CreatureId, pluriel: boolean): string {
  const def = CREATURES[id];
  if (!def) return id;
  return pluriel ? def.namePlural : def.name;
}

/**
 * Les piles d'une même créature, additionnées en une seule.
 *
 * **C'est une correction, et elle change le verdict.** Le générateur de carte
 * pose volontiers deux emplacements de la même créature sur un même lieu :
 * soixante-trois des cent soixante-cinq lieux gardés de la carte de
 * démonstration. Chabreloche portait
 * `[{ermitage_t5,2},{granit_t5,2},{granit_t5,2}]`, et la fiche affichait
 * « Sangliers Cuirassés » deux fois de suite — mais surtout, chaque
 * emplacement recevait son propre paquet flou, donc sa propre fourchette. Deux
 * fois « une poignée de » (1 à 4) au lieu d'une fois « quelques » (5 à 9) :
 * fourchette 3 306–13 224 pour une puissance réelle de 6 612, médiane 8 265,
 * pastille « Hors de portée » sur un combat que le héros de référence
 * (puissance 1 682) livre au cran « Redoutable ». Le renseignement était faux
 * d'un cran, du mauvais côté : le joueur renonçait à un combat gagnable.
 *
 * L'ordre de première apparition est conservé — c'est celui du champ de
 * bataille, et la fiche doit se lire comme les rangs se présentent.
 */
function regrouperParCreature(piles: readonly (ArmyStack | null)[]): ArmyStack[] {
  const ordre: CreatureId[] = [];
  const totaux = new Map<CreatureId, number>();
  for (const s of piles) {
    if (!s || s.count <= 0) continue;
    const dejaVu = totaux.get(s.creature);
    if (dejaVu === undefined) ordre.push(s.creature);
    totaux.set(s.creature, (dejaVu ?? 0) + s.count);
  }
  return ordre.map((creature) => ({ creature, count: totaux.get(creature) ?? 0 }));
}

/** Les piles telles qu'on les laisse voir, et la fourchette de force qui va avec. */
function estimerPiles(
  piles: readonly (ArmyStack | null)[],
  exacte: boolean,
): { piles: PileEstimee[]; force: Force | null } {
  const vues: PileEstimee[] = [];
  let min = 0;
  let max = 0;
  for (const s of regrouperParCreature(piles)) {
    if (exacte) {
      vues.push({
        creature: s.creature,
        nom: nomCreature(s.creature, s.count > 1),
        quantite: nombre(s.count),
        effectif: s.count,
      });
      const p = armyPower([s]);
      min += p;
      max += p;
      continue;
    }
    const cran = paquetDe(s.count);
    vues.push({
      creature: s.creature,
      nom: nomCreature(s.creature, cran.max > 1),
      quantite: cran.mot,
      effectif: null,
    });
    /*
     * La fourchette se déduit des bornes du cran, pas de l'effectif réel : c'est
     * ce qui garantit qu'aucun nombre ne fuit par la porte de derrière. Le cran
     * ouvert (« une légion ») est borné à dix fois son plancher, sinon la
     * fourchette serait infinie et la difficulté toujours « hors de portée ».
     */
    min += armyPower([{ creature: s.creature, count: cran.min }]);
    const plafond = Number.isFinite(cran.max) ? cran.max : cran.min * 10;
    max += armyPower([{ creature: s.creature, count: plafond }]);
  }
  if (vues.length === 0) return { piles: [], force: null };
  return { piles: vues, force: { min, max, exacte } };
}

/** Le milieu de la fourchette : c'est lui qu'on compare à l'armée du héros. */
export function forceMediane(force: Force | null): number {
  if (!force) return 0;
  return (force.min + force.max) / 2;
}

/** Nom d'une bannière, ou son identifiant si l'état ne la connaît pas. */
function nomJoueur(etat: GameState, id: PlayerId): string {
  return etat.players[id]?.name ?? id;
}

function proprietaireFiche(
  etat: GameState,
  id: PlayerId | null,
): Fiche['proprietaire'] {
  if (!id) return null;
  return { id, nom: nomJoueur(etat, id), rang: rangBanniere(id) };
}

/** La ligne qui dit avec quoi on juge, pour qu'aucune pastille ne soit orpheline. */
function ligneDeJuge(regard: Regard): string | null {
  const h = regard.heros;
  if (!h) return null;
  const def = HEROES[h.def];
  const nom = def?.name ?? h.def;
  return `Jugé sur l’armée de ${nom} (puissance ${nombre(armyPower(h.army))}).`;
}

/**
 * La pastille et la ligne qui l'accompagne — ou rien du tout.
 *
 * **Deux silences, et tous deux corrigent un contresens vu à l'écran.**
 *
 * 1. *Ce qui est à moi ne se jauge pas.* Cliquer sa propre cité de Cervières
 *    affichait « Sans péril » et « Jugé sur l'armée de Clotilde (puissance
 *    1 682) » ; cliquer sa propre mine annonçait « Redoutable ». Il n'y a
 *    aucun combat à livrer contre sa propre garnison. Le garde-fou existait
 *    déjà pour les héros (`ficheDuHeros`), il manquait aux lieux et aux cités.
 *
 * 2. *Une place vide ne se combat pas.* Une scierie neutre que personne ne
 *    garde rendait `force = null` — « aucune compagnie » — et pourtant une
 *    pastille verte « Sans péril », comme s'il y avait là un affrontement
 *    facile. Il n'y a pas d'affrontement du tout.
 *
 * Le silence se dit `null`, jamais `'inconnue'` : `'inconnue'` annonce une
 * lacune de renseignement, ce qui serait une troisième contrevérité.
 * `difficulteDe` n'est pas touchée — elle garde son propre contrat, y compris
 * « une place vide est sans péril », que son test verrouille.
 */
function jugement(
  force: Force | null,
  regard: Regard,
  aMoi: boolean,
): { difficulte: Difficulte | null; juge: string | null } {
  if (aMoi || !force) return { difficulte: null, juge: null };
  return {
    difficulte: difficulteDe(forceMediane(force), regard.heros ? armyPower(regard.heros.army) : 0),
    juge: ligneDeJuge(regard),
  };
}

/* ── Lieux de carte ─────────────────────────────────────────────────────── */

/**
 * Fiche d'un lieu de carte : garde neutre, gisement, demeure, repaire, sceau,
 * Maison du Trésor…
 *
 * L'état vivant du lieu (`state.objects`) fait foi sur le gabarit de la carte :
 * un gisement pris, une garde décimée, un coffre vidé n'existent que là.
 */
export function ficheDuLieu(etat: GameState, gabarit: MapObject, regard: Regard): Fiche {
  const objet = etat.objects?.[gabarit.uid] ?? gabarit;
  const nature = OBJECT_KIND_LABELS[objet.kind] ?? 'Lieu';
  const titre = (objet.data?.name as string | undefined) ?? nature;
  const proprietaire = proprietaireLieu(etat, objet, regard.pavoisDemo);
  const aMoi = proprietaire === regard.moi;
  const exacte = visionExacte(regard, objet.at, aMoi);
  const garde = objet.guard ?? [];
  const { piles, force } = estimerPiles(garde, exacte);

  const notes: string[] = [];
  const ressource = objet.data?.resource as string | undefined;
  const montant = objet.data?.amount;
  if (objet.kind === 'mine' && ressource && typeof montant === 'number') {
    notes.push(`Rend ${nombre(montant)} ${resourceLabel(ressource as ResourceKey).toLowerCase()} par jour à qui la tient.`);
  }
  const creature = objet.data?.creature as CreatureId | undefined;
  if (objet.kind === 'demeure' && creature) {
    notes.push(`Enrôle des ${nomCreature(creature, true)} chaque semaine.`);
  }
  if (objet.spent) notes.push('Déjà vidé : il n’y a plus rien à prendre.');
  if (piles.length === 0 && pavoisableSansGarde(objet)) {
    notes.push('Aucune compagnie ne le garde : il suffit d’y entrer.');
  }
  const lore = objet.data?.lore as string | undefined;
  if (lore) notes.push(lore);

  return {
    titre,
    nature,
    proprietaire: proprietaireFiche(etat, proprietaire),
    neutre: proprietaire === null,
    piles,
    force,
    ...jugement(force, regard, aMoi),
    notes,
    at: objet.at,
  };
}

/** Un lieu qu'on peut prendre et que personne ne garde mérite qu'on le dise. */
function pavoisableSansGarde(objet: MapObject): boolean {
  return objet.kind === 'mine' || objet.kind === 'demeure' || objet.kind === 'sceau';
}

/* ── Terrain nu ─────────────────────────────────────────────────────────── */

/**
 * LA FICHE D'UNE CASE SANS RIEN DESSUS — le clic droit de HMM3.
 *
 * Dans HMM3, le clic droit sur l'herbe répond « Grass ». Ici il ne répondait
 * rien : `ficheDe` rendait `null` pour une case nue, si bien que l'appui long
 * — le geste d'information du doigt — n'avait aucun effet sur les neuf
 * dixièmes de la carte. L'épreuve de bout en bout l'attendait déjà et
 * échouait ; personne n'avait écrit ce qu'elle attendait.
 *
 * Ce que la fiche dit, et pourquoi : le NOM du terrain (on ne devine pas
 * toujours une lande d'une prairie à l'œil, sous la pluie), sa RÉGION (les
 * douze pays du Forez donnent le sens de l'orientation), et surtout son COÛT
 * DE MARCHE — le renseignement qui décide d'un trajet, et que rien n'affichait
 * nulle part. Une case infranchissable le dit en toutes lettres.
 *
 * Aucune règle n'est calculée : le coût vient de `terrainCost` du moteur,
 * mesuré sur un pas droit depuis la case elle-même.
 */
export function ficheDuTerrain(world: WorldMap, at: MapCoord, regard: Regard): Fiche | null {
  if (at.col < 0 || at.row < 0 || at.col >= world.cols || at.row >= world.rows) return null;
  /*
   * Sous le voile, la case ne dit RIEN. C'est l'équité du brouillard, la même
   * règle que pour les armées : on n'apprend pas d'un carton ce qu'on n'a pas
   * exploré. Le voile à 1 (déjà parcouru, plus surveillé) suffit — on se
   * souvient d'un terrain qu'on a traversé.
   */
  if (!explorée(regard, at)) return null;
  const terrain = terrainAt(world, at.col, at.row);
  const nom = TERRAIN_LABELS[terrain];

  const notes: string[] = [`Dans ${REGION_LABELS[regionAt(world, at.col, at.row)]}.`];
  /* Le coût d'un pas DROIT pour entrer ici : on part de la case voisine de
     gauche, ou de droite au bord. La diagonale coûte 41 % de plus, ce n'est
     pas ce qu'on annonce — on annonce le tarif de base. */
  const depuis = { col: at.col > 0 ? at.col - 1 : at.col + 1, row: at.row };
  const cout = terrainCost(world, depuis, at, []);
  if (cout >= Number.MAX_SAFE_INTEGER) {
    notes.push('Infranchissable : aucune troupe n’y passe.');
  } else {
    notes.push(`Coûte ${nombre(cout)} points de marche pour y entrer.`);
  }

  return {
    titre: capitale(nom),
    nature: 'Terrain',
    proprietaire: null,
    neutre: true,
    piles: [],
    force: null,
    difficulte: null,
    juge: null,
    notes,
    at,
  };
}

function capitale(s: string): string {
  return s.length === 0 ? s : s[0].toUpperCase() + s.slice(1);
}

/**
 * La case a-t-elle été explorée au moins une fois ?
 *
 * Sans voile connu (démonstration, revue d'art), tout est visible : la carte
 * de démonstration n'a pas de joueur à protéger.
 */
function explorée(regard: Regard, at: MapCoord): boolean {
  const fog = regard.fog;
  if (!fog || regard.cols <= 0) return true;
  const index = at.row * regard.cols + at.col;
  if (index < 0 || index >= fog.length) return false;
  return fog[index] >= 1;
}

/* ── Cités ──────────────────────────────────────────────────────────────── */

/**
 * Fiche d'une cité. La garnison **et** le héros qui la garde comptent : c'est
 * ce qu'un assaillant rencontrera, et HMM3 les additionne de la même façon.
 */
export function ficheDeLaCite(etat: GameState, cite: TownState, regard: Regard): Fiche {
  const aMoi = cite.owner === regard.moi;
  const exacte = visionExacte(regard, cite.at, aMoi);
  const defenseurs: (ArmyStack | null)[] = [...cite.garrison];
  const gardien = cite.garrisonHero ? etat.heroes[cite.garrisonHero] : null;
  if (gardien) defenseurs.push(...gardien.army);
  const { piles, force } = estimerPiles(defenseurs, exacte);

  const notes: string[] = [];
  if (cite.isCapital) notes.push('Capitale : sa prise couperait la maison de sa tête.');
  notes.push(`${cite.built.length} bâtiment${cite.built.length > 1 ? 's' : ''} levé${cite.built.length > 1 ? 's' : ''}.`);
  if (gardien) {
    const def = HEROES[gardien.def];
    notes.push(`${def?.name ?? gardien.def} tient la garnison.`);
  }
  if (cite.visitingHero && cite.visitingHero !== cite.garrisonHero) {
    notes.push('Un héros y séjourne : son armée défendra la place.');
  }
  if (piles.length === 0) notes.push('Aucune garnison : les portes ne tiendront personne.');

  return {
    titre: cite.name,
    nature: cite.isCapital ? 'Capitale' : 'Cité',
    proprietaire: proprietaireFiche(etat, cite.owner),
    neutre: cite.owner === null,
    piles,
    force,
    ...jugement(force, regard, aMoi),
    notes,
    at: cite.at,
  };
}

/* ── Héros ──────────────────────────────────────────────────────────────── */

/** Fiche d'un héros — le sien comme celui d'en face. */
export function ficheDuHeros(etat: GameState, heros: HeroInstance, regard: Regard): Fiche {
  const aMoi = heros.owner === regard.moi;
  const exacte = visionExacte(regard, heros.at, aMoi);
  const { piles, force } = estimerPiles(heros.army, exacte);
  const def = HEROES[heros.def];

  const notes: string[] = [];
  if (def?.class) notes.push(`${def.class}, niveau ${nombre(heros.level)}.`);
  if (!exacte) notes.push('Effectifs estimés de loin : reconnaissez-le pour les compter.');
  if (heros.downUntilTurn > etat.turn) notes.push('Défait récemment : il n’est pas en état de se battre.');

  return {
    titre: def?.name ?? heros.def,
    nature: aMoi ? 'Votre héros' : 'Héros concurrent',
    proprietaire: proprietaireFiche(etat, heros.owner),
    neutre: false,
    piles,
    force,
    ...jugement(force, regard, aMoi),
    notes,
    at: heros.at,
  };
}

/* ── Mise en mots de la force ───────────────────────────────────────────── */

/**
 * Sous-titre du carton : le genre du lieu, ou rien.
 *
 * Beaucoup de lieux portent pour nom celui de leur genre — « Maison du
 * Trésor », « Moulin », « Montjoie », « Cartographe ». Vu en capture : le
 * carton affichait « MAISON DU TRÉSOR » puis, juste dessous, « Maison du
 * Trésor » en italique. Deux lignes pour un seul renseignement, sur un panneau
 * qui doit tenir dans un coin de la carte.
 */
export function sousTitreDe(fiche: Fiche): string | null {
  return fiche.nature === fiche.titre ? null : fiche.nature;
}

/** « 12 400 » avec la vision, « entre 8 200 et 21 000 » sans elle. */
export function forceEnMots(force: Force | null): string {
  if (!force) return 'aucune compagnie';
  if (force.exacte) return nombre(Math.round(force.min));
  if (force.min === force.max) return `environ ${nombre(Math.round(force.min))}`;
  return `entre ${nombre(Math.round(force.min))} et ${nombre(Math.round(force.max))}`;
}
