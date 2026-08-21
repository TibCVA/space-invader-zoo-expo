/**
 * LES DÉCISIONS DE LA FICHE DE HÉROS — trois commandes qui n'étaient émises
 * nulle part.
 *
 * **Ce que la mesure a trouvé.** Le moteur accepte vingt commandes
 * (`packages/engine/src/types.ts`, union `Command`). Le client en émettait
 * quatre : `MoveHero`, `CombatAction`, `AutoResolveCombat`, `EndTurn`. Compté
 * sur l'arbre du client, hors tests :
 *
 * ```
 * SwapArmy 0   EquipArtifact 0   UnequipArtifact 0   ChooseLevelUp 0
 * ```
 *
 * La conséquence la plus lourde est la troisième. `leveling.ts:288-290`
 * applique **d'office la première des deux propositions** dès qu'un second
 * niveau tombe sur un choix non résolu — et comme aucun écran ne posait la
 * question, ce chemin « faute de réponse » était le SEUL par lequel un héros
 * apprenait quoi que ce soit. Le document maître §11 promet que le joueur « ne
 * doit jamais être forcé d'accepter une compétence inutile » : il l'était à
 * tous les niveaux, sans même le savoir.
 *
 * **Pourquoi ce fichier est séparé de `heros.tsx`.** Le dépôt teste la logique
 * pure en environnement `node` — ni jsdom, ni @testing-library. Tout ce qui se
 * décide (qui a le droit d'agir, quelles voies s'ouvrent, où un artefact se
 * porte, ce qu'un second clic sur une pile va produire) vit donc ici, en
 * fonctions pures et exportées, et `heros-actions.test.ts` les confronte au
 * moteur par `applyCommand`. Le composant, lui, ne fait plus que rendre ces
 * décisions et appeler `dispatch`.
 *
 * **Rien n'est recalculé ici.** Les emplacements admissibles viennent de
 * `slotsFor`, le verdict d'équipement de `canEquip`, les libellés d'offre de
 * `describeOffer`, les effets d'un rang de `skillEffectsAt`, les noms de
 * créature du contenu. Ce module choisit *ce qu'on propose au joueur*, jamais
 * *ce que vaut une règle*.
 */

import {
  ARTIFACT_RARITY_LABELS,
  ARTIFACT_SLOT_LABELS,
  PRIMARY_LABELS,
  artifactDefOf,
  canEquip,
  describeEffectList,
  describeOffer,
  freeSlotFor,
  heroProgress,
  skillEffectsAt,
  skillRank,
  slotsFor,
} from '@auvergne/engine';
import type {
  ArmyHolderRef,
  ArmyStack,
  ArtifactId,
  ArtifactSlot,
  Command,
  GameState,
  HeroInstance,
  PlayerId,
  SkillId,
  SkillRank,
} from '@auvergne/engine';
import { CREATURES } from '@auvergne/content';

/* ─────────────────────── Qui a le droit d'agir, et pourquoi ─────────────── */

/**
 * La fiche est-elle une fiche vivante ou une fiche de lecture ?
 *
 * Le moteur reste seul juge : `applyCommand` refuse de lui-même une commande
 * hors tour, en plein combat ou sur un héros abattu. Cette fonction ne rejuge
 * rien — elle évite d'**offrir** un geste dont on sait qu'il sera refusé, et
 * elle dit au joueur pourquoi. Un bouton qui échoue en silence coûte plus cher
 * qu'un bouton absent qui s'explique.
 */
export type MainSurLeHeros =
  | { readonly ouverte: true }
  | { readonly ouverte: false; readonly raison: string };

/** Ce que la fiche a besoin de savoir du magasin, et rien de plus. */
export interface RegardDuMagasin {
  readonly game: GameState | null;
  readonly localPlayer: PlayerId | null;
}

export function mainSurLeHeros(
  affiche: GameState,
  magasin: RegardDuMagasin,
  uid: string,
): MainSurLeHeros {
  /*
   * `#/demo/heros` rend `etatDemo()`, un état composé à la main qui n'est PAS
   * celui du magasin : une commande partie de là muterait la partie en cours
   * du joueur, ou serait refusée faute de partie chargée. L'identité de l'objet
   * est le seul test fiable — le drapeau `demo` du magasin, lui, reste faux
   * quand aucune partie n'est ouverte.
   */
  if (!magasin.game || affiche !== magasin.game) {
    return { ouverte: false, raison: 'Fiche de démonstration : aucun coup n’en part.' };
  }
  const jeu = magasin.game;
  const hero = jeu.heroes[uid];
  if (!hero) return { ouverte: false, raison: 'Ce héros n’est plus en lice.' };
  if (jeu.phase === 'termine') {
    return { ouverte: false, raison: 'La partie est terminée.' };
  }
  if (jeu.phase === 'combat' || jeu.combat) {
    return { ouverte: false, raison: 'Un combat est engagé : la fiche attend son issue.' };
  }
  if (!magasin.localPlayer || hero.owner !== magasin.localPlayer) {
    return { ouverte: false, raison: 'Ce héros ne porte pas votre bannière.' };
  }
  if (jeu.activePlayer !== hero.owner) {
    const qui = jeu.players[jeu.activePlayer]?.name ?? 'un autre joueur';
    return { ouverte: false, raison: `La main est à ${qui}.` };
  }
  if (hero.downUntilTurn > jeu.turn) {
    return {
      ouverte: false,
      raison: `Ce héros se remet de sa défaite ; il reprend le jour ${hero.downUntilTurn}.`,
    };
  }
  return { ouverte: true };
}

/* ──────────────────────────── Montée de niveau ──────────────────────────── */

/** Une des deux voies offertes par une montée de niveau. */
export interface VoieDeNiveau {
  readonly skill: SkillId;
  readonly rank: SkillRank;
  /** « Logistique (Expert) », écrit par le moteur */
  readonly titre: string;
  /** effets du rang proposé, décrits par le moteur */
  readonly effets: readonly string[];
  /** rang déjà tenu par le héros ; 0 si la compétence est neuve */
  readonly rangActuel: number;
}

export interface ChoixDeNiveau {
  /** « Vaillance » — la caractéristique déjà accordée par le moteur au passage */
  readonly primaire: string;
  /**
   * Les voies distinctes, dans l'ordre du moteur. Une seule quand le tirage
   * n'avait qu'un candidat : `rollSkillOffers` retombe alors **deux fois sur
   * la même offre** (`leveling.ts:228-237`), et afficher deux boutons
   * identiques ferait croire à un choix qui n'existe pas.
   */
  readonly voies: readonly VoieDeNiveau[];
}

/** Les voies ouvertes par la montée en attente, ou `null` s'il n'y en a pas. */
export function choixDeNiveau(hero: HeroInstance): ChoixDeNiveau | null {
  const progres = heroProgress(hero);
  if (!progres.pending || !progres.pendingPrimary) return null;

  const voies: VoieDeNiveau[] = [];
  for (const offre of progres.pending) {
    if (voies.some((v) => v.skill === offre.skill)) continue;
    voies.push({
      skill: offre.skill,
      rank: offre.rank,
      titre: describeOffer(offre),
      effets: describeEffectList(skillEffectsAt(offre.skill, offre.rank)),
      rangActuel: skillRank(hero, offre.skill),
    });
  }
  return { primaire: PRIMARY_LABELS[progres.pendingPrimary], voies };
}

/** La commande qui scelle une voie. */
export function commandeDeNiveau(hero: HeroInstance, skill: SkillId): Command {
  return { type: 'ChooseLevelUp', hero: hero.uid, skill };
}

/* ─────────────────────────────── Artefacts ──────────────────────────────── */

/**
 * Une pièce de la besace, prête à être proposée.
 *
 * `rang` est l'indice dans `hero.backpack` : la besace peut contenir deux
 * exemplaires du même artefact, et deux lignes de même clef se marcheraient
 * dessus au rendu.
 */
export interface PieceDeBesace {
  readonly rang: number;
  readonly id: ArtifactId;
  readonly nom: string;
  readonly rarete: string;
  readonly effets: readonly string[];
  /** emplacements que le moteur accepte, dans son ordre (anneaux : les deux) */
  readonly emplacements: readonly { readonly slot: ArtifactSlot; readonly nom: string }[];
  /** emplacement visé par défaut : le premier libre, sinon le premier admissible */
  readonly cible: ArtifactSlot | null;
  /** refus du moteur, s'il y en a un, écrit par lui */
  readonly refus: string | null;
}

/** La besace du héros, chaque pièce accompagnée du verdict du moteur. */
export function besaceDuHeros(hero: HeroInstance): readonly PieceDeBesace[] {
  return hero.backpack.map((id, rang) => {
    const def = artifactDefOf(id);
    const verdict = canEquip(hero, id);
    const emplacements = def
      ? slotsFor(def).map((slot) => ({ slot, nom: ARTIFACT_SLOT_LABELS[slot] }))
      : [];
    return {
      rang,
      id,
      nom: def?.name ?? id,
      rarete: def ? ARTIFACT_RARITY_LABELS[def.rarity] : 'objet hors codex',
      effets: def ? describeEffectList(def.effects) : [],
      emplacements,
      cible: def ? (freeSlotFor(hero, def) ?? slotsFor(def)[0]) : null,
      refus: verdict.ok ? null : (verdict.reason ?? 'Équipement impossible.'),
    };
  });
}

/**
 * L'artefact qui repartirait en besace si l'on posait une pièce à cet
 * emplacement. Ni perte ni dépense : l'échange se défait d'un clic, il n'y a
 * donc rien à faire confirmer.
 */
export function delogePar(hero: HeroInstance, slot: ArtifactSlot): ArtifactId | null {
  return hero.artifacts[slot] ?? null;
}

export function commandeDequipement(
  hero: HeroInstance,
  artifact: ArtifactId,
  slot: ArtifactSlot,
): Command {
  return { type: 'EquipArtifact', hero: hero.uid, artifact, slot };
}

export function commandeDeRetrait(hero: HeroInstance, slot: ArtifactSlot): Command {
  return { type: 'UnequipArtifact', hero: hero.uid, slot };
}

/* ─────────────────────────────── Armée ──────────────────────────────────── */

/** Une rangée de piles : celle du héros, ou celle de la garnison qui l'héberge. */
export interface RangeeDArmee {
  readonly ref: ArmyHolderRef;
  /** intitulé de la rangée, avec le nom du lieu quand c'en est un */
  readonly titre: string;
  readonly piles: readonly (ArmyStack | null)[];
}

/**
 * Les rangées entre lesquelles le joueur peut déplacer des piles.
 *
 * La garnison n'apparaît que si elle satisfait les deux conditions que le
 * moteur vérifie avant d'accepter un `SwapArmy` (`apply.ts:512-521`) : même
 * bannière, et même case. `hero.inTown` suffit à la seconde — `movement.ts:315`
 * ne la pose qu'en entrant sur la case de la cité — mais on la vérifie tout de
 * même : une fiche ouverte pendant qu'un autre chemin déplace le héros ne doit
 * pas proposer un geste déjà perdu.
 */
export function rangeesDArmee(state: GameState, hero: HeroInstance): readonly RangeeDArmee[] {
  const rangees: RangeeDArmee[] = [
    { ref: { kind: 'hero', uid: hero.uid }, titre: 'Armée du héros', piles: hero.army },
  ];
  const town = hero.inTown ? state.towns[hero.inTown] : null;
  if (
    town &&
    town.owner === hero.owner &&
    town.at.col === hero.at.col &&
    town.at.row === hero.at.row
  ) {
    rangees.push({
      ref: { kind: 'garrison', uid: town.uid },
      titre: `Garnison de ${town.name}`,
      piles: town.garrison,
    });
  }
  return rangees;
}

/** Une pile désignée : la rangée à laquelle elle appartient, et son numéro. */
export interface PileDesignee {
  readonly ref: ArmyHolderRef;
  readonly slot: number;
}

/**
 * Ce qu'un second clic va produire.
 *
 * Trois gestes seulement, et **aucun fractionnement** : `count` reste omis, la
 * pile part entière. C'est ce qui permet de ne jamais rencontrer le seul refus
 * du moteur qu'un joueur ne comprendrait pas — « on ne peut pas fractionner
 * une pile sur un emplacement occupé ».
 */
export type Echange =
  | { readonly quoi: 'annule' }
  | { readonly quoi: 'refus'; readonly raison: string }
  | {
      readonly quoi: 'commande';
      readonly geste: 'deplace' | 'fusionne' | 'echange';
      /** phrase à l'infinitif pour le survol et le lecteur d'écran */
      readonly libelle: string;
      /** vrai si le héros se retrouverait sans une seule troupe */
      readonly videLeHeros: boolean;
      readonly commande: Command;
    };

function pileDe(rangees: readonly RangeeDArmee[], p: PileDesignee): ArmyStack | null | undefined {
  const rangee = rangees.find((r) => r.ref.kind === p.ref.kind && r.ref.uid === p.ref.uid);
  if (!rangee) return undefined;
  return rangee.piles[p.slot];
}

function nomCreature(stack: ArmyStack): string {
  const def = CREATURES[stack.creature];
  return def ? (stack.count > 1 ? def.namePlural : def.name) : stack.creature;
}

/** Décide du geste, sans rien muter. */
export function echangeDePiles(
  rangees: readonly RangeeDArmee[],
  depart: PileDesignee,
  arrivee: PileDesignee,
): Echange {
  if (depart.ref.kind === arrivee.ref.kind && depart.ref.uid === arrivee.ref.uid) {
    if (depart.slot === arrivee.slot) return { quoi: 'annule' };
  }
  const source = pileDe(rangees, depart);
  const cible = pileDe(rangees, arrivee);
  if (source === undefined || cible === undefined) {
    return { quoi: 'refus', raison: 'Cette armée n’est plus à portée.' };
  }
  if (!source) return { quoi: 'refus', raison: 'L’emplacement de départ est vide.' };

  const commande: Command = {
    type: 'SwapArmy',
    a: depart.ref,
    b: arrivee.ref,
    slotA: depart.slot,
    slotB: arrivee.slot,
  };

  /*
   * Le héros ne se vide que si la pile QUITTE sa rangée sans rien recevoir en
   * retour. Le moteur vide `a[slotA]` dans deux cas : arrivée libre, et arrivée
   * de même créature (la fusion emporte la pile entière puisque `count` vaut
   * l'effectif complet). Un échange, lui, rend une pile en retour, et un
   * déplacement d'un emplacement du héros vers un autre ne fait rien sortir.
   */
  const rangeeDepart = rangees.find(
    (r) => r.ref.kind === depart.ref.kind && r.ref.uid === depart.ref.uid,
  );
  const sortDuHeros =
    depart.ref.kind === 'hero' &&
    !(arrivee.ref.kind === 'hero' && arrivee.ref.uid === depart.ref.uid);
  const perdSaPile = !cible || cible.creature === source.creature;
  const videLeHeros =
    sortDuHeros &&
    perdSaPile &&
    (rangeeDepart?.piles.filter((s) => s !== null).length ?? 0) <= 1;

  if (!cible) {
    return {
      quoi: 'commande',
      geste: 'deplace',
      libelle: `Déplacer ${source.count} ${nomCreature(source)}`,
      videLeHeros,
      commande,
    };
  }
  if (cible.creature === source.creature) {
    return {
      quoi: 'commande',
      geste: 'fusionne',
      libelle: `Réunir ${source.count} et ${cible.count} ${nomCreature(cible)}`,
      videLeHeros,
      commande,
    };
  }
  /* `videLeHeros` et non `false` : la valeur est calculée une seule fois pour
     les trois gestes. Un `false` écrit à la main ici serait juste — un échange
     rend toujours une pile — mais il rendrait la garde intestable, et c'est
     exactement ce qu'une défaite tentée a montré : muter `perdSaPile` ne
     faisait rougir aucun test tant que cette branche l'ignorait. */
  return {
    quoi: 'commande',
    geste: 'echange',
    libelle: `Échanger ${nomCreature(source)} et ${nomCreature(cible)}`,
    videLeHeros,
    commande,
  };
}
