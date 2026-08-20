/**
 * LA BARRE DU TRÉSOR — les sept ressources, toujours sous les yeux.
 *
 * **Pourquoi ce fichier existe.** La première capture d'une VRAIE partie en
 * ligne — la scène `en_ligne` du harnais, ajoutée le même jour — a montré ce
 * qu'aucune scène de démonstration ne pouvait montrer : sur la carte
 * d'aventure, le joueur ne voit **nulle part** ce qu'il possède. Ni écus, ni
 * bois, ni fer. Le trésor n'existait que dans `#/partie/royaume`, à un écran
 * de distance.
 *
 * Dans HMM3 la barre des ressources est en permanence à l'écran, et ce n'est
 * pas de la décoration : chaque décision de la carte — recruter, lever un
 * bâtiment, acheter au marché, contourner une garde plutôt que la briser — se
 * prend contre le trésor. La cacher, c'est demander au joueur de quitter la
 * carte pour savoir s'il a les moyens de son coup, puis d'y revenir.
 *
 * Un choix mérite d'être écrit : **le revenu en écus est net de l'entretien**.
 * `playerIncomeOf` rend le revenu BRUT ; l'écran du royaume l'affiche brut
 * parce qu'il montre l'entretien juste à côté, sur sa propre ligne. La barre
 * n'a pas cette place. Un joueur qui lit « +15 » à côté de son or alors qu'il
 * paie 20 d'entretien lit un mensonge, et se retrouve en dette sans avoir vu
 * venir. On soustrait donc, et la bulle d'aide dit la décomposition.
 */

import { useMemo, type ReactElement } from 'react';
import { playerIncomeOf, upkeepOf } from '@auvergne/engine';
import type { GameState, PlayerId, Resources } from '@auvergne/engine';
import { ResourceBar } from '@auvergne/ui';
import { navigate } from '../router.js';

/**
 * Le revenu tel que la barre l'affiche : celui du moteur, l'entretien des
 * armées déduit de la seule ligne des écus.
 *
 * Fonction pure et exportée exprès — c'est la seule arithmétique de ce
 * fichier, et c'est donc la seule chose qu'un test puisse tenir. Le reste est
 * de la mise en page, qui se juge à la capture.
 */
export function revenuNet(game: GameState, player: PlayerId): Partial<Resources> {
  const brut = playerIncomeOf(game, player);
  const entretien = upkeepOf(game, player);
  if (!entretien) return brut;
  return { ...brut, ecus: (brut.ecus ?? 0) - entretien };
}

export interface BarreTresorProps {
  game: GameState;
  player: PlayerId;
  /** vrai sur `#/demo/*` : le royaume s'y ouvre par sa propre route */
  demo?: boolean;
}

/**
 * Barre des sept ressources, posée à droite du bandeau.
 *
 * Cliquer une ressource ouvre la vue du royaume — le geste de HMM3, où la
 * barre est le raccourci vers l'aperçu du royaume. C'est aussi ce qui donne à
 * chaque case une vraie cible tactile de quarante-quatre pixels sur téléphone,
 * au lieu d'un texte qu'on n'atteint pas.
 */
export function BarreTresor({ game, player, demo = false }: BarreTresorProps): ReactElement | null {
  const revenu = useMemo(() => revenuNet(game, player), [game, player]);
  const banniere = game.players[player];
  if (!banniere) return null;
  return (
    <ResourceBar
      className="jeu-bandeau__tresor"
      size="compact"
      values={banniere.resources as Partial<Resources>}
      income={revenu}
      onSelect={(): void => {
        navigate(demo ? '#/demo/royaume' : { name: 'partie-royaume' });
      }}
    />
  );
}
