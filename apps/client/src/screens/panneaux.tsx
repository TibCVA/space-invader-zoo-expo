/**
 * Les panneaux qui remontent du bas.
 *
 * Sur téléphone, la barre de pouce ouvre l'un de ces panneaux : ils montent
 * depuis le bas, respectent `env(safe-area-inset-bottom)` par la feuille du
 * design system, et se ferment au voile ou à la touche d'échappement
 * (`Sheet` de `@auvergne/ui`). Un seul est ouvert à la fois — c'est le magasin
 * qui le décide (`AppState.panel`).
 *
 * Aucun de ces panneaux ne calcule une règle : ils lisent l'état et naviguent.
 */

import { useState, type ReactElement } from 'react';
import { stackPower } from '@auvergne/engine';
import { CREATURES, HEROES } from '@auvergne/content';
import { Badge, Button, ConfirmBar, Divider, HeroAvatar, Icon, Sheet } from '@auvergne/ui';
import type { AppState, PanelKind } from '../state/types.js';
import { dispatch, ouvrirPanneau, quitterPartie } from '../state/store.js';
import { navigate } from '../router.js';
import { nombre, pluriel } from './format.js';

const TITRES: Readonly<Record<PanelKind, string>> = {
  heros: 'Vos héros',
  cite: 'Vos cités',
  armee: 'Armée du héros',
  sorts: 'Grimoire',
  objectifs: 'Objectifs',
  journal: 'Journal',
  menu: 'Menu',
};

export interface PanneauProps {
  state: AppState;
  /** vrai sur une route de démonstration : les liens y restent */
  demo: boolean;
}

/** Le panneau courant, ou rien. */
export function PanneauMobile({ state, demo }: PanneauProps): ReactElement | null {
  const panel = state.panel;
  if (!panel) return null;
  const fermer = (): void => ouvrirPanneau(null);
  return (
    <Sheet open onClose={fermer} title={TITRES[panel]} height={0.72}>
      <Corps panel={panel} state={state} demo={demo} onFermer={fermer} />
    </Sheet>
  );
}

function Corps({
  panel,
  state,
  demo,
  onFermer,
}: {
  panel: PanelKind;
  state: AppState;
  demo: boolean;
  onFermer: () => void;
}): ReactElement {
  /* L'abandon de partie attend sa confirmation — l'état vit ici parce que les
     crochets se déclarent avant tout embranchement. */
  const [reddition, setReddition] = useState(false);
  const game = state.game;
  const moi = state.localPlayer;

  if (!game || !moi) {
    return <p className="ecran__note">Aucune partie n’est chargée.</p>;
  }

  switch (panel) {
    case 'heros':
    case 'armee': {
      const heros = game.players[moi].heroes
        .map((uid) => game.heroes[uid])
        .filter((h): h is NonNullable<typeof h> => Boolean(h));
      if (heros.length === 0) return <p className="ecran__note">Aucun héros sous cette bannière.</p>;
      return (
        <ul className="jeu-liste-nue">
          {heros.map((h) => {
            const def = HEROES[h.def];
            const tete = h.army.find(Boolean);
            return (
              <li key={h.uid}>
                <button
                  type="button"
                  className="royaume__vignette ecran__vignette-bouton"
                  onClick={(): void => {
                    onFermer();
                    navigate(demo ? '#/demo/heros' : { name: 'partie-heros', uid: h.uid });
                  }}
                >
                  <HeroAvatar heroId={h.def} size={48} />
                  <span className="royaume__vignette-corps">
                    <span className="fiche__ligne-titre">
                      {def?.name ?? h.def} — niveau {h.level}
                    </span>
                    <span className="fiche__ligne-detail">
                      Puissance {nombre(stackPower(h.army))}
                      {tete ? ` · ${CREATURES[tete.creature]?.namePlural ?? tete.creature}` : ''}
                    </span>
                  </span>
                  <Icon name="chevron" size={20} />
                </button>
              </li>
            );
          })}
        </ul>
      );
    }

    case 'cite': {
      const cites = game.players[moi].towns
        .map((uid) => game.towns[uid])
        .filter((t): t is NonNullable<typeof t> => Boolean(t));
      if (cites.length === 0) return <p className="ecran__note">Aucune place tenue.</p>;
      return (
        <ul className="jeu-liste-nue">
          {cites.map((t) => (
            <li key={t.uid}>
              <button
                type="button"
                className="royaume__vignette ecran__vignette-bouton"
                onClick={(): void => {
                  onFermer();
                  navigate(
                    demo
                      ? `#/demo/cite/${t.faction === 'ermitage' ? 'ermitage' : 'granit'}`
                      : { name: 'partie-cite', uid: t.uid },
                  );
                }}
              >
                <span className="fiche__icone">
                  <Icon name={t.isCapital ? 'tour' : 'cite'} size={32} />
                </span>
                <span className="royaume__vignette-corps">
                  <span className="fiche__ligne-titre">{t.name}</span>
                  <span className="fiche__ligne-detail">{pluriel(t.built.length, 'bâtiment')}</span>
                </span>
                {t.isCapital ? <Badge tone="or">Capitale</Badge> : null}
              </button>
            </li>
          ))}
        </ul>
      );
    }

    case 'objectifs':
      return (
        <>
          <p className="ecran__note">
            L’écran du royaume rassemble sceaux, revenus, cités et héros.
          </p>
          <Button
            variant="principal"
            block
            onClick={(): void => {
              onFermer();
              navigate(demo ? '#/demo/royaume' : { name: 'partie-royaume' });
            }}
          >
            Ouvrir la vue du royaume
          </Button>
        </>
      );

    case 'journal':
      return (
        <ul className="jeu-liste-nue">
          {game.journal.slice(0, 12).map((e, i) => (
            <li className="fiche__ligne" key={`${e.turn}-${i}`}>
              <span className="ecran__pile-numero">{e.turn}</span>
              <span className="fiche__ligne-corps">
                <span className="fiche__ligne-detail">{e.text}</span>
              </span>
            </li>
          ))}
        </ul>
      );

    case 'sorts':
    case 'menu':
    default:
      return (
        <>
          <Button
            variant="principal"
            block
            onClick={(): void => {
              onFermer();
              navigate(demo ? '#/demo/royaume' : { name: 'partie-royaume' });
            }}
          >
            Vue du royaume
          </Button>
          <Divider />
          <Button variant="secondaire" block onClick={(): void => { onFermer(); navigate({ name: 'options' }); }}>
            Options
          </Button>
          <Button variant="secondaire" block onClick={(): void => { onFermer(); navigate({ name: 'codex' }); }}>
            Codex
          </Button>
          <Button variant="secondaire" block onClick={(): void => { onFermer(); navigate({ name: 'charger' }); }}>
            Emplacements de sauvegarde
          </Button>
          <Divider />
          <Button
            variant="danger"
            block
            onClick={(): void => {
              onFermer();
              if (!demo) quitterPartie();
              navigate({ name: 'accueil' });
            }}
          >
            Quitter la partie
          </Button>
          {/*
            RENDRE LES ARMES — `Surrender`, la dernière commande orpheline.
            Distincte de « Quitter » : quitter garde la partie et on y
            reviendra ; se rendre ABAISSE LA BANNIÈRE — cités rendues au pays,
            héros dispersés, les autres continuent sans vous (`apply.ts:809`).
            C'est la courtoisie du jeu par correspondance : on ne bloque plus
            l'ordre du tour des cousins. La décision la plus lourde du jeu
            porte donc la confirmation la plus grave.

            ET SEULEMENT PENDANT SON TOUR : le moteur attribue la commande à
            `activePlayer` — offerte hors tour, elle abaisserait la bannière
            d'un autre. L'écran la tait, la garde du magasin la refuse.
          */}
          {!demo && game.activePlayer === moi ? (
            reddition ? (
              <ConfirmBar
                stage="confirmation"
                grave
                selection="Rendre les armes"
                preview="Vos cités deviennent neutres, vos héros se dispersent. La partie continue sans vous."
                question="Abaisser votre bannière ? Il n’y a pas de retour."
                confirmLabel="Abaisser la bannière"
                cancelLabel="Tenir encore"
                onConfirm={(): void => {
                  setReddition(false);
                  dispatch({ type: 'Surrender' });
                  onFermer();
                }}
                onCancel={(): void => setReddition(false)}
              />
            ) : (
              <Button variant="fantome" block onClick={(): void => setReddition(true)}>
                Rendre les armes…
              </Button>
            )
          ) : null}
        </>
      );
  }
}
