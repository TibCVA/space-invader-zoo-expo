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

import { useCallback, useEffect, useMemo, useRef, useState, type ReactElement } from 'react';
import { dayOf, weekOf, type GameState, type HeroUid, type PlayerId, type TownState } from '@auvergne/engine';
import type { AppState, PathPreview } from '../state/types.js';
import { annulerChemin, confirmerChemin, selectionner } from '../state/store.js';
import { dispatch, viewStore } from '../state/store.js';
import { createMapView } from '../render/index.js';
import { pavoisDemonstration } from '../render/pavois.js';
import { createTownView } from '../town/index.js';
import { createBattleView } from '../battle/index.js';
import { navigate, type DemoTownKey } from '../router.js';
import { ScenePixi, type FabriqueScene } from './scene.js';
import { calendrierLong, nombre, pluriel } from './format.js';
import { FicheInspection } from './inspection.js';
import { BarreTresor } from './tresor.js';
import { PanneauCite } from './cite-commandes.js';
import { estUneDemeure } from './cite-offres.js';
import type { Cible } from './cible.js';
import { Button, ConfirmBar } from '@auvergne/ui';

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

/**
 * Où la démonstration cadre la caméra : la Maison du Trésor, au centre du
 * pays. La case est nommée une seule fois, et la légende la lit — elle
 * annonçait « colonne 145, ligne 113 » longtemps après que la carte eut été
 * ramenée à 113 colonnes, c'est-à-dire un lieu qui n'existait plus.
 */
export const CADRAGE_DEMO = { col: 64, row: 50 } as const;

/**
 * OÙ LA CAMÉRA S'OUVRE — et pourquoi ce n'est pas au même endroit dans une
 * vraie partie que dans la démonstration.
 *
 * **Le défaut, signalé par le propriétaire et reproduit deux fois.** « La
 * dernière version n'affiche rien à l'écran sur la carte. » Reproduit dans une
 * vraie partie à deux bannières, servie par le vrai binaire, sur bureau et sur
 * iPhone : la carte s'ouvrait cadrée sur la Maison du Trésor, colonne 64 ligne
 * 50 — c'est-à-dire à quarante cases du départ d'Arconsat, en plein territoire
 * JAMAIS EXPLORÉ. Le brouillard de guerre y est complet, donc l'écran est un
 * aplat bleu nuit. Rien n'était cassé : on regardait un endroit que le joueur
 * n'a pas le droit de voir.
 *
 * La cause tenait au nom de la constante : `CADRAGE_DEMO` était passée en
 * `focus` sans condition, à la démonstration comme à la partie. La légende
 * elle-même annonçait « caméra cadrée sur la Maison du Trésor » dans une vraie
 * partie, et personne ne l'avait lue comme un aveu.
 *
 * Dans une vraie partie, on s'ouvre donc sur SON héros — comme HMM3, qui centre
 * la vue sur le héros actif au début de chaque tour — et à défaut sur sa
 * capitale. Le repli sur la Maison du Trésor ne sert plus qu'à une partie sans
 * héros ni cité, cas qui ne devrait pas exister mais dont on ne veut pas qu'il
 * rende un écran noir.
 */
export function cadrageInitial(
  game: GameState | null,
  localPlayer: PlayerId | null,
  demo: boolean,
): { col: number; row: number } {
  if (demo || !game || !localPlayer) return CADRAGE_DEMO;
  const joueur = game.players[localPlayer];
  if (!joueur) return CADRAGE_DEMO;
  for (const uid of joueur.heroes) {
    const heros = game.heroes[uid];
    if (heros) return heros.at;
  }
  for (const uid of joueur.towns) {
    const cite = game.towns[uid];
    if (cite) return cite.at;
  }
  return CADRAGE_DEMO;
}

export interface EcranPartieProps {
  state: AppState;
  reducedMotion: boolean;
}

/** Carte d'aventure — `#/partie` et `#/demo/carte`. */
export function EcranCarte({ state, reducedMotion }: EcranPartieProps): ReactElement {
  const { game, world, localPlayer, demo } = state;

  /**
   * Ce qu'on regarde, distinct de ce avec quoi on agit.
   *
   * `AppState.selection` désigne le héros qu'on met en route ; la cible
   * d'inspection désigne le lieu dont on jauge la force. Les confondre faisait
   * perdre le héros sélectionné au moment même où l'on cliquait une garde neutre
   * pour la comparer à son armée — soit perdre la mesure de la difficulté qu'on
   * venait demander. Dans HMM3 les deux cohabitent ; ici aussi.
   */
  const [cible, setCible] = useState<Cible | null>(null);

  /*
   * Le héros de référence est tenu dans une **référence** et non dans un état :
   * la fabrique de la scène PixiJS est mémorisée sur ses dépendances, et un
   * état supplémentaire dans cette liste ferait remonter toute la carte — vingt
   * secondes de reconstruction d'atlas — à chaque clic sur un héros.
   */
  const herosRef = useRef<HeroUid | null>(null);

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
        focus: cadrageInitial(game, localPlayer, demo === true),
        /*
         * LES `onPick*` CHOISISSENT ; SEUL `onInspect` OUVRE LA FICHE.
         *
         * Ils ouvraient tous la fiche, et c'est ce qui rendait la carte
         * injouable au doigt : marcher demande trois appuis — choisir son
         * héros, viser, confirmer — et le premier posait un carton sur les
         * deux suivants. Mesuré sur iPhone : 45 % de la carte recouverte,
         * juste au-dessus du héros.
         */
        onPickCell: (at): void => {
          selectionner({ kind: 'case', at });
        },
        onPickHero: (uid): void => {
          herosRef.current = uid;
          selectionner({ kind: 'heros', uid });
        },
        onPickTown: (uid): void => {
          selectionner({ kind: 'cite', uid });
        },
        onPickObject: (): void => {
          /* Rien : c'est `onInspect` qui montre. Le rappel reste branché parce
             que le contrat le prévoit et qu'une vue peut vouloir le sonoriser. */
        },
        /* Appui long au doigt, clic droit à la souris — et l'appui court qui
           n'avait rien à faire. C'est le seul chemin vers la fiche. */
        onInspect: (c): void => {
          if (c.kind === 'heros') setCible({ kind: 'heros', uid: c.uid });
          else if (c.kind === 'cite') setCible({ kind: 'cite', uid: c.uid });
          else if (c.kind === 'objet') setCible({ kind: 'objet', uid: c.object.uid });
          else setCible(null);
        },
      });
    },
    [game, world, localPlayer, demo, reducedMotion],
  );

  /**
   * Le pavois de démonstration, construit par la même fonction que la carte.
   *
   * La carte ne peut pas le transmettre : sa fabrique est régie par
   * `view-contract.ts`, qu'on ne modifie pas. Les deux le déduisent donc du même
   * état par la même fonction déterministe, et disent la même chose.
   */
  const pavoisDemo = useMemo(
    () => (demo && game && world ? pavoisDemonstration(world, game) : undefined),
    [demo, game, world],
  );

  /**
   * `#/demo/carte` doit **montrer** la fiche, pas seulement la rendre
   * atteignable : le harnais de capture ne clique pas. On ouvre donc celle de la
   * Maison du Trésor, le lieu que la légende de la route annonce déjà cadrer, et
   * le mieux gardé de la carte — soixante créatures de rang 5 à 7, ce qui donne
   * à voir les paquets flous, la fourchette de force et l'appréciation de
   * difficulté d'un seul coup d'œil.
   */
  useEffect(() => {
    if (!demo || !world || cible) return;
    const tresor = world.objects.find((o) => o.kind === 'maison_tresor');
    if (tresor) setCible({ kind: 'objet', uid: tresor.uid });
  }, [demo, world, cible]);

  const banniere = game && localPlayer ? game.players[localPlayer] : null;
  const herosMesure = herosDeMesure(state, herosRef.current);

  return (
    <ScenePixi
      titre="Carte d’aventure"
      note={game ? calendrierLong(game.turn) : undefined}
      outils={
        game && localPlayer ? <BarreTresor game={game} player={localPlayer} demo={demo} /> : null
      }
      cle={`carte-${game?.id ?? 'vide'}-${demo ? 'demo' : 'partie'}`}
      fabrique={fabrique}
      reducedMotion={reducedMotion}
      legende={
        game && banniere ? (
          <>
            <strong>{banniere.name}</strong> — semaine {weekOf(game.turn)}, jour {dayOf(game.turn)}
            {demo ? (
              <>
                {' '}
                · caméra cadrée sur la Maison du Trésor (colonne {CADRAGE_DEMO.col}, ligne{' '}
                {CADRAGE_DEMO.row}).
              </>
            ) : (
              '.'
            )}
          </>
        ) : null
      }
    >
      {game && world && localPlayer && cible ? (
        <FicheInspection
          game={game}
          world={world}
          localPlayer={localPlayer}
          cible={cible}
          heros={herosMesure}
          pavoisDemo={pavoisDemo}
          onFermer={(): void => setCible(null)}
        />
      ) : null}
      {state.pathPreview ? <BarreDeChemin preview={state.pathPreview} /> : null}
    </ScenePixi>
  );
}

/**
 * L'armée qui sert de mesure à la difficulté affichée.
 *
 * Le dernier héros cliqué d'abord, puis le héros sélectionné, puis — à défaut —
 * **le plus fort** de la bannière locale. Ce dernier repli n'est pas un détail :
 * sans lui, la toute première fiche d'une partie annoncerait « aucun héros pour
 * juger » alors que le joueur en a un sous les yeux, et la moitié de la demande
 * (« la difficulté ») resterait lettre morte tant qu'on n'aurait pas pensé à
 * cliquer son propre jeton.
 */
function herosDeMesure(state: AppState, dernier: HeroUid | null) {
  const game = state.game;
  const moi = state.localPlayer;
  if (!game || !moi) return null;
  const aMoi = (uid: HeroUid | null): boolean =>
    !!uid && game.heroes[uid]?.owner === moi;
  if (aMoi(dernier)) return game.heroes[dernier as HeroUid];
  if (state.selection?.kind === 'heros' && aMoi(state.selection.uid)) {
    return game.heroes[state.selection.uid];
  }
  const miens = game.players[moi as PlayerId]?.heroes ?? [];
  let meilleur = null as (typeof game.heroes)[string] | null;
  for (const uid of miens) {
    const h = game.heroes[uid];
    if (!h) continue;
    if (!meilleur || h.level > meilleur.level) meilleur = h;
  }
  return meilleur;
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
    /* `#/demo/cite/:town` doit montrer le **siège** de la faction, pas la
       première cité venue qui en porte la couleur : une seigneurie neutre
       partage la faction sans rien avoir bâti, et la revue tombait dessus.
       On classe donc par bannière tenue, capitale, nombre de bâtiments, puis
       identifiant — ce dernier pour que deux revues rendent la même image. */
    const faction = demoTown === 'ermitage' ? 'ermitage' : 'granit';
    const rang = (t: TownState): number => (t.owner ? 2 : 0) + (t.isCapital ? 1 : 0);
    const trouvee = Object.values(game.towns)
      .filter((t) => t.faction === faction)
      .sort(
        (a, b) =>
          rang(b) - rang(a) || b.built.length - a.built.length || a.uid.localeCompare(b.uid),
      )[0];
    return trouvee ?? Object.values(game.towns)[0] ?? null;
  }, [game, uid, demoTown]);

  /*
   * Le panneau des commandes de la cité — bâtir et recruter.
   *
   * Il s'ouvre par ses deux onglets, et AUSSI en touchant un emplacement ou un
   * bâtiment de la maquette. Les deux chemins mènent au même panneau : viser un
   * emplacement de trente pixels dans un tableau en perspective marche à la
   * souris et pas au doigt, mais c'est le geste que cherche un joueur de HMM3.
   */
  const [commandes, setCommandes] = useState(false);
  /* Ce que le joueur vient de désigner sur la maquette décide de l'onglet. */
  const [ongletCite, setOngletCite] = useState<'batir' | 'recruter'>('batir');

  const fabrique = useCallback<FabriqueScene>(
    async ({ app, atlas, width, height }) => {
      if (!game || !world || !localPlayer || !cible) throw new Error("Aucune cité à montrer.");
      return createTownView({
        /*
         * LE PANNEAU RÉPOND À CE QU'ON A TOUCHÉ.
         *
         * Un emplacement vide ouvre « Bâtir » ; une DEMEURE ouvre « Recruter »,
         * puisque c'est la seule chose qu'on vient y faire. Sans cela, toucher
         * la Corvée du bourg ouvrait la liste des chantiers et il fallait
         * changer d'onglet à la main.
         */
        onPickPlot: (): void => {
          setOngletCite('batir');
          setCommandes(true);
        },
        onPickBuilding: (b): void => {
          setOngletCite(estUneDemeure(b) ? 'recruter' : 'batir');
          setCommandes(true);
        },
        /* La porte de la cité ramène à la carte. Le rappel existait au contrat
           et n'était branché nulle part : toucher la porte ne faisait rien, et
           la seule sortie était la barre de commandes. */
        onLeave: (): void => navigate({ name: 'partie' }),
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
      /* La cité est l'autre écran où l'on dépense — bâtiments et recrues. Dans
         HMM3 la barre y est aussi permanente, et pour la même raison. */
      outils={
        game && localPlayer ? <BarreTresor game={game} player={localPlayer} demo={demo} /> : null
      }
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
    >
      {game && cible && cible.owner === localPlayer ? (
        commandes ? (
          <PanneauCite
            game={game}
            town={cible}
            ongletInitial={ongletCite}
            onFermer={(): void => setCommandes(false)}
          />
        ) : (
          /* Une cité qu'on ne peut pas commander n'affiche rien : sur une cité
             neutre ou ennemie, un bouton « Bâtir » qui refuse tout serait pire
             que son absence. */
          <div className="cite-cmd__ouvrir">
            {/* La sortie est écrite, à côté de l'entrée. La porte peinte sur la
                maquette porte bien « QUITTER LA CITÉ », mais sur un écran large
                elle tombe à moitié hors du cadre — mesuré sur capture en
                1536 × 864 : l'arche est coupée par le bas. Un bouton ne dépend
                pas du cadrage. */}
            <Button variant="secondaire" onClick={(): void => navigate({ name: 'partie' })}>
              Quitter la cité
            </Button>
            <Button variant="principal" onClick={(): void => setCommandes(true)}>
              Bâtir et recruter
            </Button>
          </div>
        )
      ) : null}
    </ScenePixi>
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
