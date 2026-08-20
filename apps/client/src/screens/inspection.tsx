/**
 * `screens/inspection.tsx` — la fiche qui s'ouvre quand on clique un lieu.
 *
 * ## Pourquoi ce fichier existe
 *
 * « Il faut qu'en cliquant sur un château ou un ennemi ou un héros concurrent on
 * ait une indication de sa force et du type d'unités et de la difficulté comme
 * dans HMM3. » Le client ne branchait même pas le rappel `onPickObject` du
 * contrat des vues : un clic sur une garde neutre ne produisait rien du tout.
 *
 * La fiche est un carton posé sur la carte, en haut à gauche — le seul coin que
 * l'habillage laisse libre (la rose des vents tient le haut-droit, la minicarte
 * le bas-droit, la légende le bas-gauche et la barre de confirmation le bas au
 * centre). Elle se ferme d'un bouton, de la touche d'échappement, et laisse
 * passer les clics de la carte partout ailleurs.
 *
 * Aucune règle n'est calculée ici : tout vient de `screens/estimation.ts`, qui
 * lui-même n'habille que des nombres du moteur.
 */

import { useEffect, type ReactElement } from 'react';
import type { GameState, HeroInstance, MapObject, PlayerId, WorldMap } from '@auvergne/engine';
import { Badge, Icon, IconButton, Panel, PlayerBanner, Stat } from '@auvergne/ui';
import type { Cible } from './cible.js';
import {
  LIBELLES_DIFFICULTE,
  TONS_DIFFICULTE,
  ficheDeLaCite,
  ficheDuHeros,
  ficheDuLieu,
  forceEnMots,
  sousTitreDe,
} from './estimation.js';
import type { Fiche, Regard } from './estimation.js';

export interface FicheInspectionProps {
  readonly game: GameState;
  readonly world: WorldMap;
  readonly localPlayer: PlayerId;
  /** ce que le joueur vient de cliquer */
  readonly cible: Cible;
  /** héros dont l'armée sert de mesure ; `null` si aucun n'est sélectionné */
  readonly heros: HeroInstance | null;
  /** pavois d'affichage des routes de démonstration (voir `render/pavois.ts`) */
  readonly pavoisDemo?: ReadonlyMap<string, PlayerId>;
  readonly onFermer: () => void;
}

/** Construit la fiche demandée, ou `null` si la cible n'existe plus. */
export function ficheDe(
  game: GameState,
  world: WorldMap,
  cible: Cible,
  regard: Regard,
): Fiche | null {
  switch (cible.kind) {
    case 'objet': {
      const gabarit: MapObject | undefined =
        game.objects?.[cible.uid] ?? world.objects.find((o) => o.uid === cible.uid);
      return gabarit ? ficheDuLieu(game, gabarit, regard) : null;
    }
    case 'cite': {
      const cite = game.towns[cible.uid];
      return cite ? ficheDeLaCite(game, cite, regard) : null;
    }
    case 'heros': {
      const h = game.heroes[cible.uid];
      return h ? ficheDuHeros(game, h, regard) : null;
    }
    default:
      return null;
  }
}

/** Le carton d'inspection posé sur la carte. */
export function FicheInspection(props: FicheInspectionProps): ReactElement | null {
  const { game, world, localPlayer, cible, heros, pavoisDemo, onFermer } = props;

  /* Échappement : une fiche qu'on ne peut pas fermer au clavier n'est pas une
     fiche, c'est un obstacle. Le voile d'un `Sheet` ferait la même chose, mais
     il masquerait la carte — précisément ce qu'on veut continuer à voir. */
  useEffect(() => {
    const surTouche = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onFermer();
    };
    window.addEventListener('keydown', surTouche);
    return () => window.removeEventListener('keydown', surTouche);
  }, [onFermer]);

  const joueur = game.players[localPlayer];
  const regard: Regard = {
    moi: localPlayer,
    fog: joueur?.fog ?? null,
    cols: world.cols,
    heros,
    pavoisDemo,
  };
  const fiche = ficheDe(game, world, cible, regard);
  if (!fiche) return null;

  return (
    <div className="carte-fiche">
      <Panel
        matter="parchemin"
        padding="serre"
        raised
        title={fiche.titre}
        subtitle={sousTitreDe(fiche) ?? undefined}
        actions={
          <IconButton label="Fermer la fiche" variant="fantome" size="compact" onClick={onFermer}>
            <Icon name="fermer" size={18} />
          </IconButton>
        }
      >
        <div className="carte-fiche__banniere">
          {fiche.proprietaire ? (
            <>
              <PlayerBanner player={fiche.proprietaire.rang} size={34} />
              <span className="carte-fiche__tenu">
                Sous la bannière de <strong>{fiche.proprietaire.nom}</strong>
              </span>
            </>
          ) : (
            <span className="carte-fiche__tenu carte-fiche__tenu--neutre">
              Lieu neutre — aucune bannière n’y flotte
            </span>
          )}
        </div>

        <div className="carte-fiche__mesures">
          <Stat
            label="Force estimée"
            value={forceEnMots(fiche.force)}
            hint={fiche.force && !fiche.force.exacte ? 'estimation' : 'compté'}
            size="compact"
          />
          {/* Pas de pastille sur sa propre armée : on ne se jauge pas soi-même,
              et annoncer « aucun héros pour juger » sur la fiche du héros qui
              juge est un contresens — vu en capture. */}
          {fiche.difficulte ? (
            <Badge tone={TONS_DIFFICULTE[fiche.difficulte]}>
              {LIBELLES_DIFFICULTE[fiche.difficulte]}
            </Badge>
          ) : null}
        </div>

        {fiche.piles.length > 0 ? (
          <ul className="carte-fiche__piles">
            {fiche.piles.map((pile, i) => (
              <li key={`${pile.creature}-${String(i)}`} className="carte-fiche__pile">
                <span className="carte-fiche__quantite">{pile.quantite}</span>
                <span className="carte-fiche__creature">{pile.nom}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="carte-fiche__vide">Personne en armes sur les lieux.</p>
        )}

        {fiche.juge ? <p className="carte-fiche__juge">{fiche.juge}</p> : null}

        {fiche.notes.length > 0 ? (
          <ul className="carte-fiche__notes">
            {fiche.notes.map((n, i) => (
              <li key={`note-${String(i)}`}>{n}</li>
            ))}
          </ul>
        ) : null}
      </Panel>
    </div>
  );
}
