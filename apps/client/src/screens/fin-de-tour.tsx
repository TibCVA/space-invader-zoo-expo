/**
 * LA FIN DU TOUR — la commande qui manquait tout entière.
 *
 * **Ce que la mesure a trouvé.** La commande `EndTurn` existe dans le moteur
 * (`types.ts`), dans le protocole (`schemas.ts`), et dans les tests. Elle
 * n'était émise par **aucun** chemin de l'interface : le client ne produisait
 * que `MoveHero`, `CombatAction` et `AutoResolveCombat`. Aucun bouton, aucun
 * raccourci, rien dans la barre de pouce — cinq commandes qui sont toutes de
 * la navigation (Carte, Héros, Cité, Royaume, Menu).
 *
 * Autrement dit : dans une vraie partie, un joueur ne pouvait pas rendre la
 * main. Sur un jeu asynchrone dont c'est toute la boucle — chacun joue son
 * tour et passe le relais au cousin suivant — la partie ne dépassait pas le
 * tour du premier.
 *
 * **Pourquoi personne ne l'avait vu.** `tools/e2e-en-ligne.mjs` prouve la
 * boucle en postant `{ type: 'EndTurn' }` directement à l'API. Le parcours
 * serveur était donc vert de bout en bout, et il l'était honnêtement : c'est
 * le serveur qu'il vérifiait. Le geste du joueur, lui, n'était vérifié nulle
 * part. Même angle mort que le cadrage de la Maison du Trésor : ce que le
 * harnais ne visite pas n'existe pas.
 *
 * **Le geste de HMM3.** Rendre la main est irréversible et, dans une partie
 * jouée à plusieurs jours d'intervalle, elle peut l'être pour longtemps. HMM3
 * demande confirmation quand un héros a encore des points de marche ; on fait
 * de même, avec le compte exact, et on ne demande rien quand tout le monde a
 * fini — un jeu qui fait confirmer ce qui ne prête pas à conséquence apprend
 * au joueur à confirmer sans lire.
 */

import { useState, type ReactElement } from 'react';
import type { GameState, PlayerId } from '@auvergne/engine';
import { Button, ConfirmBar } from '@auvergne/ui';
import { dispatch } from '../state/store.js';
import { pluriel } from './format.js';

/** Ce que la commande de fin de tour doit montrer, et pourquoi. */
export type EtatFinDeTour =
  /** aucune partie chargée : rien à afficher */
  | { readonly quoi: 'cache' }
  /** un combat est engagé : on ne rend pas la main au milieu d'une bataille */
  | { readonly quoi: 'combat' }
  /** la main est à un autre cousin */
  | { readonly quoi: 'attente'; readonly qui: string }
  /** on peut rendre la main ; `herosEnAttente` déclenche la confirmation */
  | { readonly quoi: 'prete'; readonly herosEnAttente: number };

/**
 * Décide de l'état du bouton. Fonction pure, exportée pour être tenue par des
 * tests : c'est ici que vivent toutes les décisions, le composant ne fait plus
 * que les rendre.
 *
 * Un héros « en attente » est un héros qui a encore des points de marche ET
 * qui n'est pas endormi dans une cité. Compter les points de marche seuls
 * ferait avertir à chaque tour pour une garnison qui ne bougera pas.
 */
export function etatFinDeTour(
  game: GameState | null,
  joueur: PlayerId | null,
): EtatFinDeTour {
  if (!game || !joueur || !game.players[joueur]) return { quoi: 'cache' };
  if (game.combat) return { quoi: 'combat' };
  if (game.activePlayer !== joueur) {
    return { quoi: 'attente', qui: game.players[game.activePlayer]?.name ?? 'un autre joueur' };
  }
  let herosEnAttente = 0;
  for (const uid of game.players[joueur].heroes) {
    const heros = game.heroes[uid];
    if (!heros) continue;
    if (heros.inTown !== null) continue;
    if (heros.movement > 0) herosEnAttente += 1;
  }
  return { quoi: 'prete', herosEnAttente };
}

export interface FinDeTourProps {
  game: GameState | null;
  joueur: PlayerId | null;
}

/**
 * Le bouton, posé en surimpression de la carte au-dessus de la légende.
 *
 * Il n'est pas dans le bandeau : sur un iPhone le bandeau porte déjà le titre
 * et les sept ressources, et il n'y restait pas seize points. Il n'est pas non
 * plus dans la barre de pouce, qui ne contient que de la navigation — y glisser
 * la seule action irréversible du jeu, entre « Cité » et « Menu », est le genre
 * de voisinage qui se paie en tours rendus par erreur.
 */
export function FinDeTour({ game, joueur }: FinDeTourProps): ReactElement | null {
  const [demande, setDemande] = useState(false);
  const etat = etatFinDeTour(game, joueur);

  if (etat.quoi === 'cache' || etat.quoi === 'combat') return null;

  if (etat.quoi === 'attente') {
    return (
      <div className="jeu-fin-tour jeu-fin-tour--attente">
        <span className="jeu-fin-tour__attente">La main est à {etat.qui}.</span>
      </div>
    );
  }

  if (demande) {
    return (
      <div className="jeu-confirmation">
        <ConfirmBar
          stage="confirmation"
          grave
          selection="Fin du tour"
          preview={
            <>
              {pluriel(etat.herosEnAttente, 'héros')} {etat.herosEnAttente > 1 ? 'ont' : 'a'} encore
              de la marche.
            </>
          }
          question="Rendre la main malgré tout ?"
          confirmLabel="Rendre la main"
          cancelLabel="Continuer à jouer"
          onConfirm={(): void => {
            setDemande(false);
            dispatch({ type: 'EndTurn' });
          }}
          onCancel={(): void => setDemande(false)}
        />
      </div>
    );
  }

  return (
    <div className="jeu-fin-tour">
      <Button
        variant="principal"
        onClick={(): void => {
          if (etat.herosEnAttente > 0) setDemande(true);
          else dispatch({ type: 'EndTurn' });
        }}
      >
        Fin du tour
      </Button>
    </div>
  );
}
