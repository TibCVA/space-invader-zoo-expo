/**
 * Les trois écrans qui passent par PixiJS : carte d'aventure, cité, combat.
 *
 * Chacun se contente de **brancher** la vue impérative correspondante sur
 * l'hôte de scène : il fabrique les `ViewDeps` exigées par
 * `apps/client/src/view-contract.ts`, superpose l'interface React (barre de
 * confirmation, panneaux remontant du bas) et rien de plus. Aucune règle n'est
 * calculée ici : les commandes partent par `dispatch`, les nombres arrivent du
 * moteur.
 */

import { useCallback, useMemo, type ReactElement } from 'react';
import { dayOf, weekOf } from '@auvergne/engine';
import type { AppState, PathPreview } from '../state/types.js';
import { annulerChemin, confirmerChemin, selectionner } from '../state/store.js';
import { dispatch, viewStore } from '../state/store.js';
import { createMapView } from '../render/index.js';
import { createTownView } from '../town/index.js';
import { createBattleView } from '../battle/index.js';
import type { DemoTownKey } from '../router.js';
import { ScenePixi, type FabriqueScene } from './scene.js';
import { calendrierLong, nombre, pluriel } from './format.js';
import { ConfirmBar } from '@auvergne/ui';

/* ─────────────────────── Rythme de confirmation ──────────────────────────── */

function BarreDeChemin({ preview }: { preview: PathPreview }): ReactElement {
  const total = preview.path.length;
  const aujourdhui = preview.reachableToday;
  const jours = Math.max(1, preview.days.length);
  return (
    <div className="jeu-confirmation">
      <ConfirmBar
        stage={preview.confirmed ? 'confirmation' : 'previsualisation'}
        selection={`Héros ${preview.hero}`}
        preview={
          <>
            {pluriel(total, 'case')} jusqu’à la colonne {preview.to.col}, ligne {preview.to.row} ·{' '}
            {aujourdhui >= total
              ? 'atteignable aujourd’hui'
              : `${nombre(aujourdhui)} case${aujourdhui > 1 ? 's' : ''} aujourd’hui, ${pluriel(jours, 'journée')} en tout`}
          </>
        }
        question="Mettre le héros en route ?"
        confirmLabel="En route"
        cancelLabel="Annuler le tracé"
        onConfirm={(): void => {
          confirmerChemin();
        }}
        onCancel={(): void => annulerChemin()}
      />
    </div>
  );
}

/* ────────────────────────── Carte d'aventure ─────────────────────────────── */

export interface EcranPartieProps {
  state: AppState;
  reducedMotion: boolean;
}

/** Carte d'aventure — `#/partie` et `#/demo/carte`. */
export function EcranCarte({ state, reducedMotion }: EcranPartieProps): ReactElement {
  const { game, world, localPlayer, demo } = state;

  const fabrique = useCallback<FabriqueScene>(
    async ({ app, atlas, width, height }) => {
      if (!game || !world || !localPlayer) throw new Error("Aucune partie n'est chargée.");
      return createMapView({
        app,
        atlas,
        store: viewStore,
        dispatch,
        world,
        localPlayer,
        width,
        height,
        reducedMotion,
        quality: 'haute',
        demo,
        focus: { col: 145, row: 113 },
        onPickCell: (at): void => selectionner({ kind: 'case', at }),
        onPickHero: (uid): void => selectionner({ kind: 'heros', uid }),
        onPickTown: (uid): void => selectionner({ kind: 'cite', uid }),
      });
    },
    [game, world, localPlayer, demo, reducedMotion],
  );

  const banniere = game && localPlayer ? game.players[localPlayer] : null;

  return (
    <ScenePixi
      titre="Carte d’aventure"
      note={game ? calendrierLong(game.turn) : undefined}
      cle={`carte-${game?.id ?? 'vide'}-${demo ? 'demo' : 'partie'}`}
      fabrique={fabrique}
      reducedMotion={reducedMotion}
      legende={
        game && banniere ? (
          <>
            <strong>{banniere.name}</strong> — semaine {weekOf(game.turn)}, jour {dayOf(game.turn)} ·
            caméra cadrée sur la Maison du Trésor (colonne 145, ligne 113).
          </>
        ) : null
      }
    >
      {state.pathPreview ? <BarreDeChemin preview={state.pathPreview} /> : null}
    </ScenePixi>
  );
}

/* ──────────────────────────────── Cité ───────────────────────────────────── */

export interface EcranCiteProps extends EcranPartieProps {
  /** cité affichée ; sur `#/demo/cite/:town`, la faction impose le tableau */
  uid?: string;
  demoTown?: DemoTownKey;
}

/** Écran de cité — `#/partie/cite/:uid` et `#/demo/cite/:town`. */
export function EcranCite({ state, reducedMotion, uid, demoTown }: EcranCiteProps): ReactElement {
  const { game, world, localPlayer, demo } = state;

  const cible = useMemo(() => {
    if (!game) return null;
    if (uid && game.towns[uid]) return game.towns[uid];
    const faction = demoTown === 'ermitage' ? 'ermitage' : 'granit';
    const trouvee = Object.values(game.towns)
      .filter((t) => t.faction === faction)
      .sort((a, b) => b.built.length - a.built.length)[0];
    return trouvee ?? Object.values(game.towns)[0] ?? null;
  }, [game, uid, demoTown]);

  const fabrique = useCallback<FabriqueScene>(
    async ({ app, atlas, width, height }) => {
      if (!game || !world || !localPlayer || !cible) throw new Error("Aucune cité à montrer.");
      return createTownView({
        app,
        atlas,
        store: viewStore,
        dispatch,
        world,
        localPlayer,
        width,
        height,
        reducedMotion,
        quality: 'haute',
        demo,
        town: cible.uid,
        faction: cible.faction,
        hour: cible.faction === 'ermitage' ? 'crepuscule' : 'midi',
      });
    },
    [game, world, localPlayer, cible, demo, reducedMotion],
  );

  return (
    <ScenePixi
      titre={cible ? cible.name : 'Cité'}
      note={game ? calendrierLong(game.turn) : undefined}
      cle={`cite-${cible?.uid ?? 'vide'}`}
      fabrique={fabrique}
      reducedMotion={reducedMotion}
      legende={
        cible ? (
          <>
            <strong>{cible.name}</strong> — {pluriel(cible.built.length, 'bâtiment')} levé
            {cible.built.length > 1 ? 's' : ''} · agitation {cible.unrest}&#8239;% ·{' '}
            {cible.faction === 'ermitage' ? 'crépuscule' : 'midi'}.
          </>
        ) : null
      }
    />
  );
}

/* ─────────────────────────────── Combat ──────────────────────────────────── */

/** Combat tactique — `#/partie/combat` et `#/demo/combat`. */
export function EcranCombat({ state, reducedMotion }: EcranPartieProps): ReactElement {
  const { game, world, localPlayer, demo } = state;
  const combat = game?.combat ?? null;

  const fabrique = useCallback<FabriqueScene>(
    async ({ app, atlas, width, height }) => {
      if (!game || !world || !localPlayer || !combat) throw new Error("Aucun combat n'est engagé.");
      return createBattleView({
        app,
        atlas,
        store: viewStore,
        dispatch,
        world,
        localPlayer,
        width,
        height,
        reducedMotion,
        quality: 'haute',
        demo,
        combat,
      });
    },
    [game, world, localPlayer, combat, demo, reducedMotion],
  );

  const vivants = combat ? combat.units.filter((u) => u.alive).length : 0;

  return (
    <ScenePixi
      titre="Combat tactique"
      note={combat ? `Round ${combat.round}` : undefined}
      cle={`combat-${combat?.id ?? 'vide'}`}
      fabrique={fabrique}
      reducedMotion={reducedMotion}
      legende={
        combat ? (
          <>
            <strong>Round {combat.round}</strong> — {pluriel(vivants, 'pile')} encore debout sur la
            grille de 15 × 11, temps : {combat.weather}.
          </>
        ) : null
      }
    />
  );
}
