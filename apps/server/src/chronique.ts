/**
 * LA CHRONIQUE SERVIE À UNE BANNIÈRE — le filtre d'équité du journal.
 *
 * Mesuré avant le correctif : `etatPublic` remettait le brouillard des autres
 * à zéro mais servait le journal ENTIER — chaque joueur lisait les
 * constructions, recrutements et sorts de l'adversaire dans des cités qu'il
 * n'a jamais vues. Restent désormais : les lignes de la bannière servie, les
 * faits du monde (bannière nulle : météo, semaine), et les faits marqués
 * PUBLICS par le moteur (capture de cité, reddition, gabelle).
 */
import type { GameState, PlayerId } from '@auvergne/engine';

type LigneJournal = GameState['journal'][number];

export function journalServi(
  journal: readonly LigneJournal[],
  moi: PlayerId,
): LigneJournal[] {
  return journal.filter((e) => e.player === moi || e.player === null || e.portee === 'publique');
}
