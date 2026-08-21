/**
 * `App` — la coquille du client.
 *
 * Elle fait quatre choses, et rien d'autre :
 *
 *  1. **Elle écoute le routeur** (`subscribeRoute`) et monte l'écran de la
 *     route courante. Toutes les routes de `docs/03-ROUTES.md` y sont, routes
 *     de démonstration comprises.
 *  2. **Elle gère l'amorçage** : `amorcer()` a déjà branché le moteur ;
 *     `obtenirRendu()` et `obtenirAtlas()` ne sont réclamés que par les écrans
 *     accélérés, derrière un écran de chargement soigné. Une `ErreurAmorcage`
 *     devient une carte de panne française, jamais un écran noir.
 *  3. **Elle ne montre jamais une page blanche** : un `ErrorBoundary`
 *     (`LimiteErreur`) rattrape toute exception de rendu et la remplace par la
 *     même carte de panne, réarmée au changement de route.
 *  4. **Elle tient la barre de pouce** et les panneaux qui remontent du bas.
 *
 * Aucune règle de jeu ici : les commandes passent par `state/store.ts`, qui
 * seul appelle `applyCommand`.
 */

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactElement,
} from 'react';
import type { SaveSlot } from '@auvergne/protocol';
import { LandingBackdrop, motionDisabled, useSettings } from './landing/index.js';
import {
  isDemoRoute,
  needsGame,
  route as routeCourante,
  routeTitle,
  navigate,
  subscribeRoute,
  type Route,
} from './router.js';
import {
  chargerPartie,
  effacerNotice,
  ouvrirPanneau,
  quitterPartie,
  useAppState,
} from './state/store.js';
import { EcranDiagnostic } from './screens/diagnostic.js';
import { FinDeTour } from './screens/fin-de-tour.js';
import { combatDemo, etatDemo, emplacementsDemo, HEROS_DEMO, partieDemo } from './state/demo.js';
import { listerEmplacements, lireLocal, reprendreLocal, effacerLocal } from './state/persistence.js';
import {
  Avis,
  BarrePouce,
  EcranCarte,
  EcranChargement,
  EcranCite,
  EcranCombat,
  EcranGalerie,
  EcranIntrouvable,
  EcranMenus,
  EcranPanne,
  EcranPlancheArt,
  EcranSauvegardes,
  FicheHeros,
  IndicateurSauvegarde,
  LimiteErreur,
  PanneauMobile,
  VueRoyaume,
  commandeDe,
  type CommandePouce,
  type EcranMenu,
} from './screens/index.js';
import {
  EcranEnLigne,
  EcranSalon,
  abonnerRappels,
  dernierePartie,
  installerPartieEnLigne,
  lireEtat,
  partiesEnAttente,
  titreDocument,
} from './online/index.js';
import type { Progression } from './boot.js';

/* ═════════════════════════════ Petits crochets ════════════════════════════ */

/** La route courante, en abonnement externe : aucun rendu superflu. */
function useRoute(): Route {
  return useSyncExternalStore(subscribeRoute, routeCourante, routeCourante);
}

/** Quelle partie de démonstration la route réclame, s'il en faut une. */
type BesoinDemo = 'aucun' | 'carte' | 'combat';

function besoinDemo(route: Route): BesoinDemo {
  switch (route.name) {
    case 'demo-carte':
    case 'demo-cite':
      return 'carte';
    case 'demo-combat':
      return 'combat';
    default:
      return 'aucun';
  }
}

const PREPARATION: Progression = {
  etape: 'moteur',
  valeur: 0.35,
  libelle: 'On déplie la carte du Forez…',
};

const REPRISE: Progression = {
  etape: 'moteur',
  valeur: 0.5,
  libelle: 'On rouvre la partie enregistrée…',
};

/* ══════════════════════════════ La coquille ═══════════════════════════════ */

export interface AppProps {
  /** version affichée sur la page d'accueil */
  version?: string;
}

export function App(_props: AppProps = {}): ReactElement {
  const route = useRoute();
  const etat = useAppState();
  const [settings, setSettings] = useSettings();
  const reducedMotion = motionDisabled(settings);

  /* ── Titre du document ─────────────────────────────────────────────────── */
  /* Un seul endroit écrit `document.title`, sans quoi les écrans se le
     disputeraient. Dès qu'une partie en ligne attend mon coup, le titre passe
     à `TITRE_MON_TOUR` (docs/04-MULTIJOUEUR.md §6) : c'est le rappel qui suit
     le joueur d'un onglet à l'autre. */
  const attentes = useSyncExternalStore(abonnerRappels, partiesEnAttente, partiesEnAttente);

  useEffect(() => {
    document.title = titreDocument(
      `${routeTitle(route)} · Heroes of Might and Magic — Auvergne Edition`,
      attentes,
    );
  }, [route, attentes]);

  /* ── Chargement des parties de démonstration ───────────────────────────── */
  const besoin = besoinDemo(route);
  const [demoErreur, setDemoErreur] = useState<unknown>(null);
  const demoCharge = useRef<BesoinDemo | null>(null);

  useEffect(() => {
    if (besoin === 'aucun') return;
    if (demoCharge.current === besoin) return;
    let vivant = true;
    setDemoErreur(null);
    void (async (): Promise<void> => {
      try {
        const partie = besoin === 'combat' ? await combatDemo() : await partieDemo();
        if (!vivant) return;
        demoCharge.current = besoin;
        chargerPartie({ ...partie, localPlayer: 'P1', demo: true });
      } catch (cause) {
        if (vivant) setDemoErreur(cause);
      }
    })();
    return () => {
      vivant = false;
    };
  }, [besoin]);

  /* ── Reprise d'une vraie partie sur une route `#/partie/*` ─────────────── */
  const doitReprendre = needsGame(route) && (!etat.game || etat.demo);
  const [repriseErreur, setRepriseErreur] = useState<unknown>(null);
  const repriseTentee = useRef(false);

  useEffect(() => {
    if (!doitReprendre) {
      repriseTentee.current = false;
      return;
    }
    if (repriseTentee.current) return;
    repriseTentee.current = true;
    let vivant = true;
    void (async (): Promise<void> => {
      try {
        const repris = reprendreLocal();
        if (repris) {
          const { buildWorld } = await import('@auvergne/map');
          if (!vivant) return;
          demoCharge.current = null;
          chargerPartie({
            state: repris.state,
            world: buildWorld(repris.setup.seed),
            setup: repris.setup,
            slot: repris.slot,
            commands: repris.commands,
          });
          return;
        }

        /*
         * AUCUNE SAUVEGARDE LOCALE — MAIS PEUT-ÊTRE UNE PARTIE EN LIGNE.
         *
         * C'est le défaut que le propriétaire a signalé en ouvrant `#/partie`
         * sur le site : « n'affiche rien à l'écran sur la carte ». Reproduit
         * deux fois, sur bureau et sur iPhone, dans une vraie partie à deux
         * bannières servie par le vrai binaire : on entre dans la partie, la
         * carte s'affiche, on RECHARGE la page — et l'on retombe sur l'accueil
         * avec « Aucune partie en cours », alors que la partie court toujours
         * au serveur et que le navigateur en tient le jeton.
         *
         * La cause tenait en une ligne : cette reprise n'essayait QUE la
         * sauvegarde locale (`reprendreLocal`), c'est-à-dire le mode solo.
         * Une partie en ligne n'a pas de sauvegarde locale — sa sauvegarde de
         * référence est au serveur, c'est écrit dans `installerPartieEnLigne` —
         * donc `reprendreLocal()` rendait `null` et l'on renvoyait le joueur à
         * l'accueil.
         *
         * Or `docs/04-MULTIJOUEUR.md` §1.8 promet exactement le contraire :
         * « Fermer l'onglet, changer de téléphone, revenir trois jours plus
         * tard : rien n'est perdu. » C'est la promesse qui fait tout l'intérêt
         * du jeu asynchrone, et c'est celle qui était rompue.
         */
        const code = dernierePartie();
        if (code) {
          /*
           * Un jeton peut survivre à sa partie — abandonnée, purgée, terminée.
           * Un serveur injoignable, aussi, arrive. Dans ces cas-là on ne montre
           * PAS l'écran de panne : on ramène simplement le joueur à l'accueil,
           * qui lui proposera ses parties. L'écran de panne est réservé à ce
           * qui est vraiment cassé, pas à un jeton périmé.
           */
          const charge = await lireEtat(code).catch(() => null);
          if (!vivant) return;
          if (charge) {
            demoCharge.current = null;
            await installerPartieEnLigne(charge);
            return;
          }
        }
        navigate({ name: 'accueil' }, true);
      } catch (cause) {
        if (vivant) setRepriseErreur(cause);
      }
    })();
    return () => {
      vivant = false;
    };
  }, [doitReprendre]);

  /* ── Emplacements de sauvegarde (`#/charger`) ──────────────────────────── */
  const [emplacements, setEmplacements] = useState<readonly SaveSlot[] | null>(null);
  const [avisSauvegardes, setAvisSauvegardes] = useState<string | null>(null);

  const relireEmplacements = useCallback((): (() => void) => {
    const controleur = new AbortController();
    void (async (): Promise<void> => {
      const distants = await listerEmplacements(controleur.signal);
      if (controleur.signal.aborted) return;
      const local = lireLocal();
      if (distants === null) {
        setAvisSauvegardes(
          local
            ? 'Le serveur de sauvegardes est injoignable : seule la partie enregistrée sur cet appareil est proposée.'
            : 'Le serveur de sauvegardes est injoignable et cet appareil ne garde aucune partie.',
        );
        setEmplacements(local ? [local.slot] : []);
        return;
      }
      setAvisSauvegardes(null);
      const connus = new Set(distants.map((s) => s.id));
      setEmplacements(local && !connus.has(local.slot.id) ? [...distants, local.slot] : distants);
    })();
    return () => controleur.abort();
  }, []);

  useEffect(() => {
    if (route.name !== 'charger') return;
    return relireEmplacements();
  }, [route.name, relireEmplacements]);

  /* ── Barre de pouce ────────────────────────────────────────────────────── */
  const demo = isDemoRoute(route);
  const enPartie = needsGame(route) || (demo && besoin !== 'aucun');
  const avecPouce = enPartie || route.name === 'demo-heros' || route.name === 'demo-royaume';

  /*
   * La commande de fin de tour n'apparaît que sur les écrans qui sont un
   * PLATEAU — la carte et la cité, deux scènes accélérées. Elle y flotte
   * au-dessus d'une toile et ne cache rien.
   *
   * Elle est écartée des écrans de DONNÉES (royaume, fiche de héros), et c'est
   * une mesure qui l'a décidé : sur la vue du royaume, capturée en 390 × 844,
   * le bouton recouvrait une tuile de ressource entière — « 7 … par jour »
   * illisible derrière lui. Un bouton flottant au-dessus d'un texte qui défile
   * masquera toujours quelque chose. HMM3 fait d'ailleurs de même : la fin de
   * tour vit dans la barre latérale de la carte, pas dans les registres. La
   * barre de commandes ramène à la carte d'un seul appui.
   */
  const surUnPlateau =
    !demo && (route.name === 'partie' || route.name === 'partie-cite') && etat.game !== null;

  const surCommande = useCallback(
    (commande: CommandePouce): void => {
      switch (commande) {
        case 'carte':
          navigate(demo ? '#/demo/carte' : { name: 'partie' });
          break;
        case 'royaume':
          navigate(demo ? '#/demo/royaume' : { name: 'partie-royaume' });
          break;
        case 'heros':
          ouvrirPanneau('heros');
          break;
        case 'cite':
          ouvrirPanneau('cite');
          break;
        case 'menu':
        default:
          ouvrirPanneau('menu');
          break;
      }
    },
    [demo],
  );

  /**
   * Ce qui reste gris. « Carte » et « Royaume » sont des navigations : sur une
   * route de démonstration elles mènent à `#/demo/*`, qui monte son propre
   * état, donc elles restent vives même sans partie chargée. « Héros » et
   * « Cité » ouvrent un panneau qui lit la partie : sans partie, rien à lire.
   */
  const desactivees = useMemo<readonly CommandePouce[]>(() => {
    if (etat.game) return [];
    return demo ? (['heros', 'cite'] as const) : (['carte', 'heros', 'cite', 'royaume'] as const);
  }, [etat.game, demo]);

  /* ── L'écran de la route ───────────────────────────────────────────────── */

  const contenu = ((): ReactElement => {
    if (demoErreur !== null) {
      return (
        <EcranPanne
          erreur={demoErreur}
          onReprendre={(): void => {
            setDemoErreur(null);
            demoCharge.current = null;
            navigate({ name: 'accueil' }, true);
          }}
        />
      );
    }
    if (repriseErreur !== null) {
      return (
        <EcranPanne
          erreur={repriseErreur}
          onReprendre={(): void => {
            setRepriseErreur(null);
            effacerLocal();
            quitterPartie();
            navigate({ name: 'accueil' }, true);
          }}
          reprendreLibelle="Écarter cette sauvegarde"
        />
      );
    }

    switch (route.name) {
      /* — Menus — */
      case 'accueil':
      case 'nouvelle-partie':
      case 'codex':
      case 'options':
        return (
          <EcranMenus
            ecran={route.name as EcranMenu}
            section={route.name === 'codex' ? route.section : undefined}
            settings={settings}
            onSettings={setSettings}
          />
        );

      /* — Relevé de la machine, quand plus rien ne s'affiche — */
      case 'diagnostic':
        return <EcranDiagnostic />;

      /* — Parties en ligne asynchrones (docs/04-MULTIJOUEUR.md) — */
      case 'en-ligne':
        return (
          <div className="hmm-acc">
            <LandingBackdrop settings={settings} />
            <EcranEnLigne />
          </div>
        );
      case 'en-ligne-partie':
        return (
          <div className="hmm-acc">
            <LandingBackdrop settings={settings} />
            <EcranSalon code={route.code} />
          </div>
        );

      /* — Emplacements de sauvegarde — */
      case 'charger':
        return (
          <EcranSauvegardes
            emplacements={emplacements ?? []}
            chargement={emplacements === null}
            avis={avisSauvegardes}
            actions={{
              onReprendre: (): void => navigate({ name: 'partie' }),
            }}
          />
        );

      /* — Partie en cours — */
      case 'partie':
        if (!etat.game) return <EcranChargement progression={REPRISE} titre="Reprise de la partie" citation={1} />;
        return <EcranCarte state={etat} reducedMotion={reducedMotion} />;
      case 'partie-cite':
        if (!etat.game) return <EcranChargement progression={REPRISE} titre="Reprise de la partie" citation={1} />;
        return <EcranCite state={etat} reducedMotion={reducedMotion} uid={route.uid} />;
      case 'partie-combat':
        if (!etat.game) return <EcranChargement progression={REPRISE} titre="Reprise de la partie" citation={1} />;
        return <EcranCombat state={etat} reducedMotion={reducedMotion} />;
      case 'partie-heros':
        if (!etat.game) return <EcranChargement progression={REPRISE} titre="Reprise de la partie" citation={1} />;
        return <FicheHeros state={etat.game} uid={route.uid} />;
      case 'partie-royaume':
        if (!etat.game || !etat.localPlayer)
          return <EcranChargement progression={REPRISE} titre="Reprise de la partie" citation={1} />;
        return <VueRoyaume state={etat.game} player={etat.localPlayer} />;

      /* — Revue visuelle — */
      case 'demo-carte':
        if (!etat.game || !etat.demo)
          return <EcranChargement progression={PREPARATION} titre="Carte d’aventure" citation={2} />;
        return <EcranCarte state={etat} reducedMotion={reducedMotion} />;
      case 'demo-cite':
        if (!etat.game || !etat.demo)
          return <EcranChargement progression={PREPARATION} titre="Tableau de cité" citation={3} />;
        return <EcranCite state={etat} reducedMotion={reducedMotion} demoTown={route.town} />;
      case 'demo-combat':
        if (!etat.game || !etat.demo || !etat.game.combat)
          return <EcranChargement progression={PREPARATION} titre="Combat tactique" citation={4} />;
        return <EcranCombat state={etat} reducedMotion={reducedMotion} />;
      case 'demo-heros':
        return <FicheHeros state={etatDemo()} uid={HEROS_DEMO} />;
      case 'demo-royaume':
        return <VueRoyaume state={etatDemo()} player="P1" demo />;
      case 'demo-sauvegardes':
        return (
          <EcranSauvegardes
            emplacements={emplacementsDemo()}
            lectureSeule
            avis="Écran de démonstration : les emplacements sont factices et aucune écriture n’a lieu."
          />
        );
      case 'demo-galerie':
        return <EcranGalerie />;
      case 'demo-planche-art':
        return <EcranPlancheArt reducedMotion={reducedMotion} />;

      /* — Repli — */
      case 'introuvable':
      default:
        return <EcranIntrouvable fragment={route.name === 'introuvable' ? route.fragment : ''} />;
    }
  })();

  return (
    <div className={avecPouce ? 'jeu-racine jeu-racine--avec-pouce' : 'jeu-racine'}>
      <LimiteErreur cle={`${route.name}-${'uid' in route ? route.uid : ''}`}>{contenu}</LimiteErreur>

      {etat.notice ? <Avis texte={etat.notice} onFermer={effacerNotice} /> : null}
      {/*
        LA FIN DU TOUR EST POSÉE ICI, ET NON DANS LA CARTE.
        Elle ne vivait que sur `#/partie` : dans sa cité, sa fiche de héros ou
        sa vue du royaume, le joueur n'avait aucun moyen de rendre la main sans
        d'abord retrouver la carte. Le propriétaire, sur iPhone : « je ne
        comprends pas comment terminer un tour ». Posée à la racine, elle est au
        même endroit sur tous les écrans de jeu — et `etatFinDeTour` l'efface
        d'elle-même pendant un combat.
      */}
      {surUnPlateau ? <FinDeTour game={etat.game} joueur={etat.localPlayer} /> : null}
      {avecPouce ? <PanneauMobile state={etat} demo={demo} /> : null}
      {avecPouce ? (
        <BarrePouce active={commandeDe(route)} onCommande={surCommande} desactivees={desactivees} />
      ) : null}
      {etat.save.status !== 'repos' && !etat.demo ? (
        <div className="jeu-etat-sauvegarde">
          <IndicateurSauvegarde save={etat.save} />
        </div>
      ) : null}
    </div>
  );
}

export default App;
