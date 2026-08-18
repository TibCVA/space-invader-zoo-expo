/**
 * La coquille : tout ce qui entoure un écran.
 *
 * Bandeau supérieur, écran de chargement, écran de panne, garde-fou React,
 * avis d'action refusée, indicateur de sauvegarde et **barre de pouce**.
 * Aucun de ces composants ne lit le moteur : ils reçoivent ce qu'ils affichent.
 *
 * Le vocabulaire visuel vient entièrement de `apps/client/src/styles.css`
 * (classes `jeu-*`) et de `packages/ui` : rien n'est peint ici.
 */

import { Component, useEffect, useRef, type ErrorInfo, type ReactElement, type ReactNode } from 'react';
import { Button, Icon, IconButton } from '@auvergne/ui';
import { ErreurAmorcage, type Progression } from '../boot.js';
import { goBack, navigate, type Route } from '../router.js';
import type { SaveIndicator } from '../state/types.js';

/* ════════════════════════════ Bandeau supérieur ═══════════════════════════ */

export interface BandeauProps {
  titre: string;
  /** afficher la flèche de retour */
  retour?: boolean;
  /** libellé secondaire aligné à droite du titre */
  note?: ReactNode;
  /** contenu libre poussé à droite */
  children?: ReactNode;
}

/** Bandeau collant : retour, titre en Cinzel, informations à droite. */
export function Bandeau({ titre, retour = true, note, children }: BandeauProps): ReactElement {
  return (
    <header className="jeu-bandeau">
      {retour ? (
        <IconButton
          label="Revenir à l'écran précédent"
          variant="ferrure"
          onClick={(): void => goBack()}
        >
          <Icon name="chevron" size={20} style={{ transform: 'rotate(180deg)' }} />
        </IconButton>
      ) : null}
      <h1 className="jeu-bandeau__titre">{titre}</h1>
      {note ? <span className="jeu-bandeau__note">{note}</span> : null}
      <span className="jeu-bandeau__espace" />
      {children}
    </header>
  );
}

/* ═══════════════════════════ Écran de chargement ══════════════════════════ */

/** Les vers du chargement, tirés du même pays que le jeu. Aucun hasard. */
const CITATIONS: readonly { readonly texte: string; readonly source: string }[] = [
  { texte: 'La pierre tient, la parole tient.', source: 'Devise de la Châtellenie' },
  { texte: 'La forêt se souvient.', source: 'Devise de l’Ermitage' },
  { texte: 'Qui tient le col des Sagnes tient les deux versants.', source: 'Dicton des muletiers' },
  { texte: 'On ne compte pas le sel devant le gabelou.', source: 'Proverbe de la grande chaussée' },
  { texte: 'Trois sceaux ouvrent la Maison, trois semaines la gardent.', source: 'Chronique du Forez' },
];

export interface EcranChargementProps {
  progression: Progression;
  /** titre de la scène en préparation */
  titre?: string;
  /** indice de citation, pour rester déterministe d'une capture à l'autre */
  citation?: number;
}

/** Parchemin centré, jauge d'or, libellé d'étape. Jamais un écran noir. */
export function EcranChargement({
  progression,
  titre = 'Heroes of Might and Magic',
  citation = 0,
}: EcranChargementProps): ReactElement {
  const mot = CITATIONS[Math.abs(citation) % CITATIONS.length] ?? CITATIONS[0];
  const pourcent = Math.round(Math.min(1, Math.max(0, progression.valeur)) * 100);
  return (
    <div className="jeu-chargement" role="status" aria-live="polite">
      <div className="jeu-chargement__voile" />
      <div className="jeu-chargement__carte">
        <p className="jeu-chargement__enseigne">{titre}</p>
        <p className="jeu-chargement__sous">Auvergne Edition</p>
        <div
          className="jeu-chargement__jauge"
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={pourcent}
          aria-label="Progression de l’amorçage"
        >
          <div className="jeu-chargement__jauge-remplie" style={{ width: `${pourcent}%` }} />
        </div>
        <p className="jeu-chargement__etat">{progression.libelle}</p>
        <p className="jeu-chargement__citation">
          «&#8239;{mot.texte}&#8239;»
          <span className="jeu-chargement__source">{mot.source}</span>
        </p>
        <div className="jeu-chargement__filet" />
      </div>
    </div>
  );
}

/* ═════════════════════════════ Écran de panne ═════════════════════════════ */

export interface EcranPanneProps {
  erreur: unknown;
  /** action de reprise ; à défaut, retour à l'accueil */
  onReprendre?: () => void;
  reprendreLibelle?: string;
}

function messageDe(erreur: unknown): { titre: string; texte: string; conseil: string; technique: string } {
  if (erreur instanceof ErreurAmorcage) {
    return {
      titre: 'Le jeu n’a pas pu s’ouvrir',
      texte: erreur.message,
      conseil: erreur.conseil,
      technique: erreur.cause instanceof Error ? erreur.cause.message : String(erreur.cause ?? erreur.name),
    };
  }
  if (erreur instanceof Error) {
    return {
      titre: 'Quelque chose s’est brisé',
      texte:
        'Un écran du jeu a rencontré une difficulté qu’il n’a pas su franchir. Votre partie, elle, est enregistrée sur cet appareil : rien n’est perdu.',
      conseil:
        'Revenez à l’accueil, puis reprenez la partie. Si la panne se répète au même endroit, signalez-la avec le message technique ci-dessous.',
      technique: `${erreur.name} : ${erreur.message}`,
    };
  }
  return {
    titre: 'Quelque chose s’est brisé',
    texte: 'Un écran du jeu s’est interrompu sans laisser de message clair.',
    conseil: 'Revenez à l’accueil, puis reprenez la partie.',
    technique: String(erreur),
  };
}

/** Carte de parchemin bordée de grenat, message français, message technique. */
export function EcranPanne({ erreur, onReprendre, reprendreLibelle }: EcranPanneProps): ReactElement {
  const { titre, texte, conseil, technique } = messageDe(erreur);
  return (
    <div className="jeu-panne" role="alert">
      <div className="jeu-panne__carte">
        <h2 className="jeu-panne__titre">{titre}</h2>
        <p className="jeu-panne__texte">{texte}</p>
        <p className="jeu-panne__conseil">{conseil}</p>
        <div className="jeu-colonnes">
          <Button
            variant="principal"
            onClick={(): void => {
              if (onReprendre) onReprendre();
              else navigate({ name: 'accueil' }, true);
            }}
          >
            {reprendreLibelle ?? 'Revenir à l’accueil'}
          </Button>
          <Button variant="secondaire" onClick={(): void => location.reload()}>
            Recharger la page
          </Button>
        </div>
        {technique ? <p className="jeu-panne__technique">{technique}</p> : null}
      </div>
    </div>
  );
}

/* ═══════════════════════════ Garde-fou React ══════════════════════════════ */

interface LimiteProps {
  /** change de valeur pour réarmer la limite après une navigation */
  cle?: string;
  children: ReactNode;
}

interface LimiteEtat {
  erreur: unknown | null;
}

/**
 * Garde-fou : **aucune page blanche**. Toute exception levée pendant le rendu
 * d'un écran est rattrapée et remplacée par la carte de panne, en français.
 * La limite se réarme dès que la route change (`cle`).
 */
export class LimiteErreur extends Component<LimiteProps, LimiteEtat> {
  constructor(props: LimiteProps) {
    super(props);
    this.state = { erreur: null };
  }

  static getDerivedStateFromError(erreur: unknown): LimiteEtat {
    return { erreur };
  }

  override componentDidUpdate(precedent: LimiteProps): void {
    if (precedent.cle !== this.props.cle && this.state.erreur) {
      this.setState({ erreur: null });
    }
  }

  override componentDidCatch(erreur: unknown, info: ErrorInfo): void {
    /* Le journal du navigateur garde la trace complète ; l'écran, lui, reste
       lisible et français. */
    console.error('[coquille] écran interrompu', erreur, info.componentStack);
  }

  override render(): ReactNode {
    if (this.state.erreur !== null) {
      return (
        <EcranPanne
          erreur={this.state.erreur}
          onReprendre={(): void => {
            this.setState({ erreur: null });
            navigate({ name: 'accueil' }, true);
          }}
        />
      );
    }
    return this.props.children;
  }
}

/* ═════════════════════════════ Avis d'action ══════════════════════════════ */

export interface AvisProps {
  texte: string;
  onFermer: () => void;
  /** disparition automatique, en millisecondes */
  delai?: number;
}

/** Bandeau d'avis : un refus du moteur, dit en français, effacé tout seul. */
export function Avis({ texte, onFermer, delai = 4200 }: AvisProps): ReactElement {
  const fermer = useRef(onFermer);
  fermer.current = onFermer;
  useEffect(() => {
    const id = setTimeout(() => fermer.current(), delai);
    return () => clearTimeout(id);
  }, [texte, delai]);
  return (
    <div className="jeu-avis" role="status" aria-live="polite">
      {texte}
    </div>
  );
}

/* ══════════════════════════ Indicateur de sauvegarde ══════════════════════ */

const LIBELLE_SAUVEGARDE: Readonly<Record<SaveIndicator['status'], string>> = {
  repos: 'Rien à enregistrer',
  differe: 'Enregistré sur cet appareil',
  envoi: 'Envoi au serveur…',
  enregistre: 'Partie enregistrée',
  erreur: 'Serveur injoignable',
};

/** Pastille discrète : où en est la sauvegarde. */
export function IndicateurSauvegarde({ save }: { save: SaveIndicator }): ReactElement | null {
  if (save.status === 'repos') return null;
  const classe = `jeu-enregistre jeu-enregistre--${save.status}`;
  return (
    <span className={classe} title={save.message ?? LIBELLE_SAUVEGARDE[save.status]}>
      <span className="jeu-enregistre__pastille" />
      {LIBELLE_SAUVEGARDE[save.status]}
    </span>
  );
}

/* ═══════════════════════════ Barre de pouce ═══════════════════════════════ */

export type CommandePouce = 'carte' | 'heros' | 'cite' | 'royaume' | 'menu';

export interface BarrePouceProps {
  /** commande mise en avant */
  active: CommandePouce | null;
  onCommande: (commande: CommandePouce) => void;
  /** commandes indisponibles hors partie */
  desactivees?: readonly CommandePouce[];
}

const COMMANDES: readonly { readonly clef: CommandePouce; readonly libelle: string; readonly icone: string }[] = [
  { clef: 'carte', libelle: 'Carte', icone: 'carte' },
  { clef: 'heros', libelle: 'Héros', icone: 'epee' },
  { clef: 'cite', libelle: 'Cité', icone: 'cite' },
  { clef: 'royaume', libelle: 'Royaume', icone: 'banniere' },
  { clef: 'menu', libelle: 'Menu', icone: 'menu' },
];

/**
 * Cinq commandes à portée de pouce, en bas de l'écran, chacune d'au moins
 * 48 px et posée au-dessus de `env(safe-area-inset-bottom)` — non négociable
 * n°10. Aucune ne dépend du survol : l'état actif est porté par
 * `aria-current`, pas par `:hover`.
 */
export function BarrePouce({ active, onCommande, desactivees = [] }: BarrePouceProps): ReactElement {
  return (
    <nav className="jeu-pouce" aria-label="Commandes principales">
      {COMMANDES.map((c) => {
        const inactive = desactivees.includes(c.clef);
        return (
          <button
            key={c.clef}
            type="button"
            className="jeu-pouce__bouton"
            aria-current={active === c.clef ? 'page' : undefined}
            aria-disabled={inactive || undefined}
            disabled={inactive}
            onClick={(): void => onCommande(c.clef)}
          >
            <span className="jeu-pouce__icone">
              <Icon name={c.icone} size={24} />
            </span>
            {c.libelle}
          </button>
        );
      })}
    </nav>
  );
}

/* ═══════════════════════════ Page de données ══════════════════════════════ */

export interface PageProps {
  titre: string;
  note?: ReactNode;
  retour?: boolean;
  /** contenu libre du bandeau, à droite */
  outils?: ReactNode;
  children: ReactNode;
}

/**
 * Écran de données : bandeau collant + colonne de lecture défilante. C'est le
 * gabarit de la fiche de héros, du royaume et des emplacements.
 */
export function Page({ titre, note, retour = true, outils, children }: PageProps): ReactElement {
  return (
    <>
      <Bandeau titre={titre} note={note} retour={retour}>
        {outils}
      </Bandeau>
      <div className="jeu-ecran jeu-ecran--defile">
        <div className="jeu-page">{children}</div>
      </div>
    </>
  );
}

/** Route courante rendue en commande de pouce, pour l'état actif. */
export function commandeDe(route: Route): CommandePouce | null {
  switch (route.name) {
    case 'partie':
    case 'demo-carte':
      return 'carte';
    case 'partie-heros':
    case 'demo-heros':
      return 'heros';
    case 'partie-cite':
    case 'demo-cite':
      return 'cite';
    case 'partie-royaume':
    case 'demo-royaume':
      return 'royaume';
    default:
      return null;
  }
}
