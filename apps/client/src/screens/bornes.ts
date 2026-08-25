/**
 * LE RÉSEAU DES BORNES — le voyage rapide de HMM3, injouable jusqu'ici.
 *
 * `UseBorne` n'était émise nulle part : les bornes armoriées étaient
 * décoratives, alors que le moteur porte tout — découverte, éveil à la
 * semaine, quota hebdomadaire, gratuité du Gardien, coûts (200 écus, 400 pas).
 *
 * Ce module décide de CE QU'ON PROPOSE quand la fiche d'une borne est
 * ouverte : les autres bornes du registre, chacune jugée par `canUseBorne` —
 * le juge même qu'`applyCommand` consulte, dont chaque refus est déjà rédigé
 * en français. Rien n'est recalculé ici.
 */
import { canUseBorne, discoveredBornes, objectName, sameCoord } from '@auvergne/engine';
import type { GameState, HeroInstance, MapObject, ObjectUid } from '@auvergne/engine';

/** Un voyage possible (ou refusé) vers une borne du registre. */
export interface OffreVoyage {
  readonly vers: ObjectUid;
  readonly nom: string;
  readonly possible: boolean;
  /** la phrase du moteur quand ce n'est pas possible */
  readonly refus: string | null;
  readonly coutEcus: number;
  readonly coutMarche: number;
  /** vrai pour le Gardien des Bornes, qui voyage sans bourse délier */
  readonly gratuit: boolean;
}

/** Ce que la fiche d'une borne offre au héros qui se tient dessus. */
export interface ReseauDepuisLaBorne {
  /** le héros regardé se tient sur CETTE borne, sous NOTRE bannière */
  readonly surLaBorne: boolean;
  readonly offres: readonly OffreVoyage[];
}

/**
 * Les voyages offerts depuis la borne inspectée.
 *
 * On ne liste que les bornes DÉCOUVERTES — le réseau ne mène qu'aux pierres
 * déjà vues, et une destination inconnue n'existe pas pour le joueur. Une
 * borne découverte mais refusée (réseau endormi, quota épuisé, bourse vide)
 * reste listée AVEC la phrase du moteur : elle dit quoi attendre ou payer.
 */
export function reseauDepuisLaBorne(
  game: GameState,
  heros: HeroInstance | null,
  borne: MapObject,
): ReseauDepuisLaBorne {
  if (
    !heros ||
    borne.kind !== 'borne' ||
    !sameCoord(heros.at, borne.entrance)
  ) {
    return { surLaBorne: false, offres: [] };
  }
  const offres: OffreVoyage[] = [];
  for (const cible of discoveredBornes(game, heros.owner)) {
    if (cible.uid === borne.uid) continue;
    const verdict = canUseBorne(game, heros, cible);
    offres.push({
      vers: cible.uid,
      nom: objectName(cible, 'Borne armoriée'),
      possible: verdict.ok,
      refus: verdict.ok ? null : (verdict.reason ?? 'Le réseau refuse ce voyage.'),
      coutEcus: verdict.costEcus,
      coutMarche: verdict.costMovement,
      gratuit: verdict.free,
    });
  }
  offres.sort((a, b) => Number(b.possible) - Number(a.possible) || a.nom.localeCompare(b.nom));
  return { surLaBorne: true, offres };
}
