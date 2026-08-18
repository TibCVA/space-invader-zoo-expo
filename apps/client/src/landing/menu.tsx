/**
 * Le menu principal de la page d'accueil.
 *
 * Cinq entrées : Nouvelle partie, Reprendre, Charger, Codex, Options. Chaque
 * bouton est une plaque de parchemin sur âme de granit, tenue par quatre
 * ferrures rivetées et cernée d'un double filet d'or. Hauteur utile ≥ 56 px,
 * bien au-delà du minimum de 48 px imposé par le brief (§10), et cible tactile
 * pleine largeur sur téléphone.
 *
 * Le son passe par `audio-bridge`, qui code contre la signature
 * `AudioEngine` de docs/02-API.md et protège chaque appel : tant que
 * `apps/client/src/audio` n'est pas livré, le menu reste silencieux sans une
 * seule erreur.
 */

import { useCallback, useId, useRef, type ReactElement, type ReactNode } from 'react';
import { Icon } from '@auvergne/ui';
import { jouerEffet } from './audio-bridge.js';

/**
 * **Fleuron de marge.**
 *
 * À droite de chaque entrée se trouvait un chevron d'interface, tourné d'un
 * quart de tour : à cette taille, sur du parchemin, il ne se lisait plus comme
 * une flèche mais comme un glyphe parasite tombé là par accident.
 *
 * Un menu d'enluminure n'a pas de chevrons : il a des **fleurons**. Celui-ci
 * est un losange d'or entre deux filets effilés, l'ornement que l'on trouve en
 * fin de ligne dans un manuscrit. Il est dessiné, jamais typographié, et il
 * garde une fonction : au survol, il s'ouvre et son losange s'allume, ce qui
 * signale l'entrée active sans rien emprunter au vocabulaire des formulaires.
 */
function Fleuron(): ReactElement {
  const id = `${useId()}-fleuron`;
  return (
    <svg
      className="hmm-acc-fleuron"
      viewBox="0 0 26 22"
      width="26"
      height="22"
      aria-hidden="true"
      focusable="false"
    >
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="0.3" y2="1">
          <stop offset="0" stopColor="#F3DEA8" />
          <stop offset="0.45" stopColor="#C9A227" />
          <stop offset="1" stopColor="#7A5D16" />
        </linearGradient>
      </defs>
      {/* Deux filets effilés, l'un vers le haut, l'autre vers le bas. */}
      <path
        className="hmm-acc-fleuron-filet"
        d="M3.2 3.4C7 5.6 9.4 7.9 10.6 10.4M3.2 18.6C7 16.4 9.4 14.1 10.6 11.6"
        fill="none"
        stroke="#8A6A18"
        strokeOpacity="0.72"
        strokeWidth="1.4"
        strokeLinecap="round"
      />
      {/* Le losange, cœur de l'ornement. */}
      <path className="hmm-acc-fleuron-coeur" d="M15.4 11 19.6 5.6 23.8 11 19.6 16.4Z" fill={`url(#${id})`} />
      <path d="M19.6 7.4 21.9 11 19.6 14.4 17.3 11Z" fill="#FFE9C2" fillOpacity="0.34" />
    </svg>
  );
}

/** Ferrures d'angle et rivets : la plaque est vraiment fixée. */
function Ferrures(): ReactElement {
  const fer = `${useId()}-fer`;
  return (
    <svg className="hmm-acc-ferrures" viewBox="0 0 320 64" preserveAspectRatio="none" aria-hidden="true">
      <defs>
        <linearGradient id={fer} x1="0" y1="0" x2="0.4" y2="1">
          <stop offset="0" stopColor="#7C8794" />
          <stop offset="0.42" stopColor="#4A4E52" />
          <stop offset="1" stopColor="#2A2C2F" />
        </linearGradient>
      </defs>
      <g fill={`url(#${fer})`} stroke="#242A33" strokeWidth="0.6">
        <path d="M0 0 H34 L28 6 H6 V26 L0 32 Z" />
        <path d="M320 0 H286 L292 6 H314 V26 L320 32 Z" />
        <path d="M0 64 H34 L28 58 H6 V38 L0 32 Z" />
        <path d="M320 64 H286 L292 58 H314 V38 L320 32 Z" />
      </g>
      <g fill="#C9A227" opacity="0.55">
        <circle cx="9" cy="9" r="1.9" />
        <circle cx="311" cy="9" r="1.9" />
        <circle cx="9" cy="55" r="1.9" />
        <circle cx="311" cy="55" r="1.9" />
      </g>
      <g fill="#FFE9C2" opacity="0.3">
        <circle cx="8.3" cy="8.3" r="0.7" />
        <circle cx="310.3" cy="8.3" r="0.7" />
        <circle cx="8.3" cy="54.3" r="0.7" />
        <circle cx="310.3" cy="54.3" r="0.7" />
      </g>
    </svg>
  );
}

export interface MenuEntry {
  id: string;
  label: string;
  hint: string;
  icon: string;
  onSelect(): void;
  disabled?: boolean;
  /** entrée mise en avant : lettres plus larges, filet plus vif */
  primary?: boolean;
  /** raison affichée quand l'entrée est indisponible */
  disabledHint?: string;
}

export interface LandingMenuProps {
  hasSave: boolean;
  onNewGame(): void;
  onContinue(): void;
  onLoad(): void;
  onCodex(): void;
  onOptions(): void;
  /** entrées supplémentaires, ajoutées après Options */
  extra?: MenuEntry[];
}

interface BoutonProps {
  entry: MenuEntry;
  index: number;
  onHover(): void;
}

function BoutonMenu({ entry, index, onHover }: BoutonProps): ReactElement {
  const disabled = entry.disabled === true;
  return (
    <li className="hmm-acc-menu-item" style={{ animationDelay: `${(0.9 + index * 0.075).toFixed(3)}s` }}>
      <button
        type="button"
        className={`hmm-acc-bouton${entry.primary ? ' hmm-acc-bouton--majeur' : ''}`}
        disabled={disabled}
        aria-describedby={disabled && entry.disabledHint ? `${entry.id}-indispo` : undefined}
        onPointerEnter={(event): void => {
          if (event.pointerType === 'touch' || disabled) return;
          onHover();
        }}
        onFocus={(): void => {
          if (!disabled) onHover();
        }}
        onClick={(): void => {
          if (disabled) return;
          jouerEffet(entry.primary ? 'clic_lourd' : 'clic');
          entry.onSelect();
        }}
      >
        <Ferrures />
        <span className="hmm-acc-bouton-corps">
          <span className="hmm-acc-bouton-icone" aria-hidden="true">
            <Icon name={entry.icon} size={26} />
          </span>
          <span className="hmm-acc-bouton-textes">
            <span className="hmm-acc-bouton-label">{entry.label}</span>
            <span className="hmm-acc-bouton-hint">
              {disabled && entry.disabledHint ? entry.disabledHint : entry.hint}
            </span>
          </span>
          <span className="hmm-acc-bouton-fleuron" aria-hidden="true">
            <Fleuron />
          </span>
        </span>
      </button>
      {disabled && entry.disabledHint ? (
        <span id={`${entry.id}-indispo`} className="hmm-acc-sr">
          {entry.disabledHint}
        </span>
      ) : null}
    </li>
  );
}

/** Le menu principal. */
export function LandingMenu(props: LandingMenuProps): ReactElement {
  const { hasSave, onNewGame, onContinue, onLoad, onCodex, onOptions, extra } = props;
  const dernierSurvol = useRef(0);

  /* Le son de survol est bridé : sans cela, un balayage de souris crépite. */
  const survol = useCallback((): void => {
    const now = performance.now();
    if (now - dernierSurvol.current < 110) return;
    dernierSurvol.current = now;
    jouerEffet('clic');
  }, []);

  const entries: MenuEntry[] = [
    {
      id: 'nouvelle-partie',
      label: 'Nouvelle partie',
      hint: 'Choisir les bannières, la carte et la durée',
      icon: 'epee',
      onSelect: onNewGame,
      primary: true,
    },
    {
      id: 'reprendre',
      label: 'Reprendre',
      hint: 'Retourner à la partie en cours',
      icon: 'sablier',
      onSelect: onContinue,
      disabled: !hasSave,
      disabledHint: 'Aucune partie en cours',
    },
    {
      id: 'charger',
      label: 'Charger',
      hint: 'Emplacements de sauvegarde et sauvegardes automatiques',
      icon: 'coffre',
      onSelect: onLoad,
    },
    {
      id: 'codex',
      label: 'Codex',
      hint: 'Créatures, héros, sorts, artefacts, régions et règles',
      icon: 'livre',
      onSelect: onCodex,
    },
    {
      id: 'options',
      label: 'Options',
      hint: 'Sons, qualité, lisibilité et accessibilité',
      icon: 'engrenage',
      onSelect: onOptions,
    },
    ...(extra ?? []),
  ];

  return (
    <nav className="hmm-acc-menu" aria-label="Menu principal">
      <ul className="hmm-acc-menu-liste">
        {entries.map((entry, index) => (
          <BoutonMenu key={entry.id} entry={entry} index={index} onHover={survol} />
        ))}
      </ul>
    </nav>
  );
}

/** Bandeau de pied : mentions courtes, toutes en français. */
export function LandingFooter({ children }: { children?: ReactNode }): ReactElement {
  return (
    <footer className="hmm-acc-pied">
      <span>Massif des Bois Noirs — Puy-de-Dôme et Loire</span>
      <span className="hmm-acc-pied-sep" aria-hidden="true" />
      <span>Contenu original, entièrement dessiné</span>
      {children}
    </footer>
  );
}
