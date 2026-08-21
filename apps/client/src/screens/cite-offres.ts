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

import { buildCost, canBuild, canRecruit, recruitCost } from '@auvergne/engine';
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
