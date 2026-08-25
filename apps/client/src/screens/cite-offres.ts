/**
 * CE QU'ON PEUT BÂTIR ET RECRUTER DANS UNE CITÉ — les décisions, sans l'écran.
 *
 * **Pourquoi ce fichier existe.** Mesuré aujourd'hui : le moteur accepte vingt
 * commandes, le client n'en émettait que quatre — `MoveHero`, `CombatAction`,
 * `AutoResolveCombat` et `EndTurn`. Ni `BuildInTown`, ni `RecruitCreatures`.
 * On pouvait donc marcher, se battre et rendre la main, mais **jamais faire
 * grandir quoi que ce soit** : pas un bâtiment, pas une recrue. Une partie de
 * HMM3 sans croissance n'est pas une partie, c'est une promenade.
 *
 * Tout ce qui suit est une fonction PURE, et c'est délibéré. Le dépôt éprouve
 * la logique en environnement `node` — pas de jsdom, pas de rendu React. Les
 * décisions vivent donc ici et sont tenues par des tests ; `cite-commandes.tsx`
 * ne fait que les mettre en page. Les deux noms diffèrent exprès : un
 * `cite-commandes.ts` à côté d'un `cite-commandes.tsx` fait résoudre
 * `./cite-commandes.js` vers le mauvais des deux, sans le moindre avertissement.
 *
 * Aucune règle n'est réécrite : les possibilités, les coûts et les refus
 * viennent de `canBuild`, `buildCost`, `canRecruit` et `recruitCost`. Le moteur
 * rend déjà ses refus en français — « Une seule construction par cité et par
 * jour », « Il faut d'abord bâtir le Fort » —, et les recopier ici les ferait
 * mentir le jour où une règle change.
 */

import {
  buildCost,
  canBuild,
  canRecruit,
  canUpgrade,
  countInTown,
  recruitCost,
  upgradeUnitCost,
  upgradesOf,
} from '@auvergne/engine';
import type {
  BuildingId,
  CreatureId,
  GameState,
  HeroUid,
  Resources,
  TownState,
} from '@auvergne/engine';
import { BUILDINGS, CREATURES } from '@auvergne/content';

/** Un bâtiment proposé au chantier, avec son coût et, s'il est refusé, pourquoi. */
export interface OffreBatiment {
  readonly id: BuildingId;
  readonly nom: string;
  readonly description: string;
  readonly cout: Partial<Resources>;
  readonly possible: boolean;
  /** Phrase du moteur quand ce n'est pas possible. */
  readonly refus: string | null;
}

/** Une créature proposée au recrutement cette semaine. */
export interface OffreRecrue {
  readonly id: CreatureId;
  readonly nom: string;
  readonly nomPluriel: string;
  readonly rang: number;
  /** Portée disponible à la cité. */
  readonly disponibles: number;
  /** Coût d'UNE recrue. */
  readonly coutUnitaire: Partial<Resources>;
  /** Combien la bourse permet d'en prendre, plafonné par la disponibilité. */
  readonly abordables: number;
  /**
   * La demeure qui loge cette créature — « ni où elles sont », disait le
   * propriétaire. Sans ce nom, la liste des recrues est une liste d'espèces
   * flottantes : on ne sait pas quel bâtiment on a levé pour les obtenir, ni
   * lequel lever pour obtenir les suivantes.
   */
  readonly demeure: string | null;
  /**
   * Ce qu'on achète, en quatre nombres. Ce sont ceux que HMM3 met en avant au
   * moment de recruter : ce que la pile encaisse, ce qu'elle rend, et à quelle
   * vitesse elle traverse le champ.
   */
  readonly vie: number;
  readonly attaque: number;
  readonly defense: number;
  readonly vitesse: number;
  readonly degats: { readonly min: number; readonly max: number };
}

/**
 * Le bâtiment qui loge une créature donnée.
 *
 * On interroge les octrois (`grants`) des bâtiments plutôt qu'une table
 * parallèle : c'est la même source que celle dont le moteur se sert pour
 * remplir `town.available`, et une table recopiée finirait par mentir.
 */
export function demeureDe(creature: CreatureId): string | null {
  for (const def of Object.values(BUILDINGS)) {
    for (const octroi of def.grants) {
      if (octroi.kind === 'dwelling' && octroi.creature === creature) return def.name;
    }
  }
  return null;
}

/**
 * Les bâtiments à montrer dans l'onglet « Bâtir ».
 *
 * On écarte ce qui est déjà levé et ce qui n'appartient pas à l'architecture
 * de la cité — deux cas où l'entrée serait un rebut permanent. On GARDE en
 * revanche ce qui est refusé faute d'argent ou de prérequis : c'est ce qui dit
 * au joueur vers quoi épargner, et c'est exactement ce que montre HMM3.
 *
 * L'ordre place devant ce qui est faisable tout de suite, puis le moins cher —
 * en écus, la ressource que l'on compare le plus vite.
 */
export function offresBatiments(game: GameState, town: TownState): OffreBatiment[] {
  const offres: OffreBatiment[] = [];
  for (const def of Object.values(BUILDINGS)) {
    if (town.built.includes(def.id)) continue;
    if (def.faction !== 'commun' && def.faction !== town.faction) continue;
    const verdict = canBuild(game, town, def.id);
    offres.push({
      id: def.id,
      nom: def.name,
      description: def.description,
      cout: buildCost(game, town, def.id),
      possible: verdict.ok,
      refus: verdict.ok ? null : (verdict.reason ?? 'Impossible pour l’instant.'),
    });
  }
  offres.sort((a, b) => {
    if (a.possible !== b.possible) return a.possible ? -1 : 1;
    return (a.cout.ecus ?? 0) - (b.cout.ecus ?? 0);
  });
  return offres;
}

/**
 * Combien de recrues la bourse permet de prendre.
 *
 * On ne divise pas la bourse par le coût unitaire : une créature peut coûter
 * plusieurs ressources à la fois, et c'est la plus contraignante qui décide.
 * On demande donc au moteur, par bissection, le plus grand nombre qu'il
 * accepte. C'est quelques appels de plus et aucune règle dupliquée — le jour
 * où une remise de héros s'applique au recrutement, ce compte la suivra sans
 * qu'on y touche.
 */
export function recruesAbordables(
  game: GameState,
  town: TownState,
  creature: CreatureId,
): number {
  const plafond = town.available[creature] ?? 0;
  if (plafond <= 0) return 0;
  if (canRecruit(game, town, creature, plafond).ok) return plafond;

  let bas = 0;
  let haut = plafond;
  while (bas + 1 < haut) {
    const milieu = Math.floor((bas + haut) / 2);
    if (canRecruit(game, town, creature, milieu).ok) bas = milieu;
    else haut = milieu;
  }
  return bas;
}

/**
 * Les créatures à montrer dans l'onglet « Recruter ».
 *
 * On montre toute demeure levée, **y compris quand la portée de la semaine est
 * épuisée** : une ligne à zéro dit « cette demeure existe, elle rendra lundi »,
 * là où une ligne absente laisse croire qu'on ne l'a jamais bâtie.
 */
export function offresRecrues(game: GameState, town: TownState): OffreRecrue[] {
  const offres: OffreRecrue[] = [];
  for (const id of Object.keys(town.available) as CreatureId[]) {
    const def = CREATURES[id];
    if (!def) continue;
    offres.push({
      id,
      nom: def.name,
      nomPluriel: def.namePlural,
      rang: def.tier,
      disponibles: town.available[id] ?? 0,
      coutUnitaire: recruitCost(id, 1),
      abordables: recruesAbordables(game, town, id),
      demeure: demeureDe(id),
      vie: def.hp,
      attaque: def.attack,
      defense: def.defense,
      vitesse: def.speed,
      degats: { min: def.dmgMin, max: def.dmgMax },
    });
  }
  offres.sort((a, b) => a.rang - b.rang);
  return offres;
}

/**
 * Où vont les recrues : au héros présent, sinon à la garnison.
 *
 * Le geste de HMM3, et le seul qui évite au joueur un aller-retour : on
 * recrute pour partir en campagne, pas pour laisser les hommes derrière. Un
 * héros en visite compte autant qu'un héros en garnison — les deux sont dans
 * la cité.
 */
export function destinataireRecrues(town: TownState): HeroUid | null {
  return town.visitingHero ?? town.garrisonHero ?? null;
}

/**
 * Vrai si ce bâtiment loge une créature.
 *
 * Sert à décider de l'onglet quand on touche un bâtiment de la maquette : une
 * demeure appelle « Recruter », tout le reste « Bâtir ».
 */
export function estUneDemeure(batiment: BuildingId): boolean {
  const def = BUILDINGS[batiment];
  if (!def) return false;
  return def.grants.some((o) => o.kind === 'dwelling');
}

/* ───────────────────────────── Amélioration ─────────────────────────────── */

/**
 * Une promotion possible : des créatures présentes à la cité, et le bâtiment
 * amélioré qui sait les élever.
 */
export interface OffreAmelioration {
  readonly de: CreatureId;
  readonly vers: CreatureId;
  readonly nomDe: string;
  readonly nomVers: string;
  /** créatures de ce type présentes à la cité (garnison + héros de passage) */
  readonly presentes: number;
  /** coût de la promotion d'UNE créature */
  readonly coutUnitaire: Partial<Resources>;
  /** combien la bourse permet d'en élever, plafonné par les présentes */
  readonly abordables: number;
  /** ce que la promotion change, chiffré — la raison de payer */
  readonly gain: string;
}

/** Le plus grand nombre de promotions que la bourse permet (bisection). */
export function ameliorationsAbordables(
  game: GameState,
  town: TownState,
  de: CreatureId,
  presentes: number,
): number {
  if (presentes <= 0) return 0;
  if (canUpgrade(game, town, de, presentes).ok) return presentes;
  let bas = 0;
  let haut = presentes;
  while (bas + 1 < haut) {
    const milieu = Math.floor((bas + haut) / 2);
    if (canUpgrade(game, town, de, milieu).ok) bas = milieu;
    else haut = milieu;
  }
  return bas;
}

/** Ce que la promotion change, dans l'ordre où HMM3 le fait lire. */
function gainDePromotion(de: CreatureId, vers: CreatureId): string {
  const a = CREATURES[de];
  const b = CREATURES[vers];
  if (!a || !b) return '';
  const morceaux: string[] = [];
  if (b.attack !== a.attack) morceaux.push(`Att ${a.attack} → ${b.attack}`);
  if (b.defense !== a.defense) morceaux.push(`Déf ${a.defense} → ${b.defense}`);
  if (b.hp !== a.hp) morceaux.push(`PV ${a.hp} → ${b.hp}`);
  if (b.dmgMin !== a.dmgMin || b.dmgMax !== a.dmgMax) {
    morceaux.push(`Dég ${a.dmgMin}–${a.dmgMax} → ${b.dmgMin}–${b.dmgMax}`);
  }
  if (b.speed !== a.speed) morceaux.push(`Vit ${a.speed} → ${b.speed}`);
  return morceaux.join(' · ');
}

/**
 * Les promotions à montrer dans l'onglet « Recruter », sous les recrues.
 *
 * Mesuré avant le correctif : `UpgradeCreatures` n'était émis NULLE PART —
 * les bâtiments d'amélioration se levaient, et les créatures restaient au
 * rang de base pour toujours. Dans HMM3, promouvoir sa semaine de recrues est
 * un rendez-vous hebdomadaire.
 *
 * On ne liste que les couples réellement promouvables ICI : le bâtiment
 * amélioré est levé (`upgradesOf`), ET des créatures du rang de base sont
 * présentes à la cité. Une ligne à zéro abordable reste affichée avec la
 * phrase du moteur — elle dit vers quoi épargner.
 */
export function offresAmelioration(game: GameState, town: TownState): OffreAmelioration[] {
  const offres: OffreAmelioration[] = [];
  for (const [de, vers] of upgradesOf(town)) {
    const presentes = countInTown(game, town, de);
    if (presentes <= 0) continue;
    const a = CREATURES[de];
    const b = CREATURES[vers];
    if (!a || !b) continue;
    offres.push({
      de,
      vers,
      nomDe: a.namePlural,
      nomVers: b.namePlural,
      presentes,
      coutUnitaire: upgradeUnitCost(de, vers),
      abordables: ameliorationsAbordables(game, town, de, presentes),
      gain: gainDePromotion(de, vers),
    });
  }
  offres.sort((x, y) => (CREATURES[x.de]?.tier ?? 0) - (CREATURES[y.de]?.tier ?? 0));
  return offres;
}
