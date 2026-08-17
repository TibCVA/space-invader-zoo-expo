/**
 * Le titre de la page d'accueil.
 *
 * « HEROES OF MIGHT AND MAGIC » est le titre du jeu : c'est le seul texte
 * anglais autorisé par le brief. Tout le reste — surtitre, sous-titre, mention
 * de version — est en français avec ses accents.
 *
 * Composition : un filet d'or supérieur à ornement feuillagé, le titre en
 * Cinzel gravé (dorure en dégradé, relief, halo), le cartouche
 * « AUVERGNE EDITION », puis la ligne de récit en EB Garamond. L'entrée dure
 * exactement 1,6 s, lettre à lettre ; la dorure garde ensuite un scintillement
 * de sept secondes, amplitude nulle en géométrie — c'est la lumière qui bouge,
 * pas le texte.
 *
 * `prefers-reduced-motion` (ou le réglage du joueur) supprime entrée et
 * scintillement : le titre est alors simplement là.
 */

import { useId, type CSSProperties, type ReactElement } from 'react';

/** Ornement de filet : une tige feuillagée dessinée, jamais un caractère. */
function FiletOr({ flip = false }: { flip?: boolean }): ReactElement {
  const or = `${useId()}-or`;
  return (
    <svg
      className="hmm-acc-filet"
      viewBox="0 0 240 16"
      preserveAspectRatio="none"
      aria-hidden="true"
      focusable="false"
      style={flip ? { transform: 'scaleY(-1)' } : undefined}
    >
      <defs>
        <linearGradient id={or} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#8A6A18" />
          <stop offset="0.34" stopColor="#C9A227" />
          <stop offset="0.52" stopColor="#FFE9C2" />
          <stop offset="0.7" stopColor="#C9A227" />
          <stop offset="1" stopColor="#7A5D16" />
        </linearGradient>
      </defs>
      <g fill="none" stroke={`url(#${or})`} strokeLinecap="round">
        <path d="M2 8 H84" strokeWidth="1.4" />
        <path d="M156 8 H238" strokeWidth="1.4" />
        <path d="M6 10.6 H80" strokeWidth="0.6" opacity="0.55" />
        <path d="M160 10.6 H234" strokeWidth="0.6" opacity="0.55" />
        <path d="M92 8 C100 2, 110 2, 120 8 C130 14, 140 14, 148 8" strokeWidth="1.3" />
        <path d="M92 8 C100 14, 110 14, 120 8 C130 2, 140 2, 148 8" strokeWidth="1.3" />
      </g>
      <g fill={`url(#${or})`}>
        <path d="M120 3.4 L124.4 8 L120 12.6 L115.6 8 Z" />
        <ellipse cx="86.5" cy="8" rx="2.1" ry="2.1" />
        <ellipse cx="153.5" cy="8" rx="2.1" ry="2.1" />
      </g>
    </svg>
  );
}

/** Découpe un mot en lettres animables ; l'espace reste insécable au mot. */
function Mot({ texte, depart }: { texte: string; depart: number }): ReactElement {
  return (
    <span className="hmm-acc-mot">
      {Array.from(texte).map((lettre, i) => (
        <span
          key={`${lettre}-${String(i)}`}
          className="hmm-acc-lettre"
          /* `--d` sert de retard à l'entrée **et** de décalage au scintillement :
             la vague de dorure suit ensuite le même sens de lecture. */
          style={{ '--d': `${(depart + i * 0.032).toFixed(3)}s` } as CSSProperties}
        >
          {lettre}
        </span>
      ))}
    </span>
  );
}

export interface LandingTitleProps {
  /** Version affichée dans le cartouche du bas, si l'hôte veut la montrer. */
  version?: string;
  className?: string;
}

const MOTS = ['HEROES', 'OF', 'MIGHT', 'AND', 'MAGIC'] as const;

/** Le bloc de titre complet de la page d'accueil. */
export function LandingTitle({ version, className }: LandingTitleProps): ReactElement {
  let curseur = 0.1;
  const mots = MOTS.map((mot) => {
    const depart = curseur;
    curseur += mot.length * 0.032 + 0.055;
    return { mot, depart };
  });

  return (
    <header className={className ? `hmm-acc-titre ${className}` : 'hmm-acc-titre'}>
      <p className="hmm-acc-surtitre">Chronique du massif des Bois Noirs</p>
      <FiletOr />
      <h1 className="hmm-acc-h1" aria-label="Heroes of Might and Magic — Auvergne Edition">
        <span className="hmm-acc-h1-ligne" aria-hidden="true">
          {mots.map(({ mot, depart }) => (
            <Mot key={mot} texte={mot} depart={depart} />
          ))}
        </span>
        <span className="hmm-acc-edition" aria-hidden="true">
          <span className="hmm-acc-edition-filet" />
          <span className="hmm-acc-edition-texte">Auvergne Edition</span>
          <span className="hmm-acc-edition-filet" />
        </span>
      </h1>
      <FiletOr flip />
      <p className="hmm-acc-sous-titre">Les Comtes du Forez — La Maison du Trésor</p>
      {version ? <p className="hmm-acc-version">Version {version}</p> : null}
    </header>
  );
}
