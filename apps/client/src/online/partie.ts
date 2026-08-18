/**
 * Entrer dans une partie en ligne.
 *
 * Le serveur est autoritaire : ce qu'il envoie dans `PartyStatePayload.etat`
 * est **l'état du monde tel qu'il fait foi**, déjà expurgé du brouillard des
 * autres bannières. Ce module fait le dernier mètre — vérifier le `setup`,
 * désérialiser l'état, reconstruire la carte, poser le tout dans le magasin du
 * client — pour que les écrans de jeu existants n'aient rien à savoir du
 * réseau : ils lisent le même `AppState` que pour une partie solo.
 *
 * La carte se reconstruit depuis la seule graine (`buildWorld(seed)`) : elle
 * n'est jamais transportée, c'est le principe du dépôt depuis le début.
 */

import type { GameSetup, PlayerId } from '@auvergne/engine';
import { GameSetupSchema, deserializeState } from '@auvergne/protocol';
import type { PartyStatePayload } from '@auvergne/protocol';
import { chargerPartie } from '../state/store.js';

/** Ce que l'écran obtient quand l'entrée échoue : un message, en français. */
export class ErreurEntree extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ErreurEntree';
  }
}

/** Lit le `setup` d'une charge d'état, ou explique pourquoi c'est impossible. */
export function lireSetup(charge: PartyStatePayload): GameSetup {
  const analyse = GameSetupSchema.safeParse(charge.setup);
  if (!analyse.success) {
    throw new ErreurEntree(
      'La configuration de cette partie n’est pas lisible par cette version du jeu. Rechargez la page ; si le message revient, la partie a été créée par une version plus récente.',
    );
  }
  return analyse.data as GameSetup;
}

/**
 * Installe une partie en ligne dans le magasin du client. Ne navigue pas :
 * l'écran appelant décide où aller, et quand.
 */
export async function installerPartieEnLigne(charge: PartyStatePayload): Promise<void> {
  const setup = lireSetup(charge);

  let state;
  try {
    state = deserializeState(charge.etat);
  } catch {
    throw new ErreurEntree(
      'L’état de la partie envoyé par le serveur n’a pas pu être ouvert. Réessayez dans un instant.',
    );
  }

  const { buildWorld } = await import('@auvergne/map');
  const world = buildWorld(setup.seed);

  chargerPartie({
    state,
    world,
    setup,
    ...(charge.monSlot ? { localPlayer: charge.monSlot as PlayerId } : {}),
    /* Aucun emplacement local : la sauvegarde de référence est au serveur. */
    slot: null,
    commands: [],
  });
}
