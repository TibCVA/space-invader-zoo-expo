/**
 * Les vingt-et-un portraits de héros — VERSION SVG, **qui fait autorité**.
 *
 * ┌──────────────────────────────────────────────────────────────────────┐
 * │  ARBITRAGE DES PORTRAITS EN DOUBLE                                    │
 * │                                                                       │
 * │  Deux jeux de portraits coexistent dans le dépôt :                    │
 * │                                                                       │
 * │   • ce fichier — SVG React, 280 × 340, modelé complet. C'est la       │
 * │     version que le joueur regarde en grand (fiche de héros, royaume,  │
 * │     taverne, codex), et ses fiches sont écrites d'après les           │
 * │     biographies de `packages/content/src/heroes.ts`. **Elle fait      │
 * │     autorité** sur l'identité des vingt-et-un héros : âge, carrure,   │
 * │     teint, chevelure, pilosité, couvre-chef, vêtement et couleurs.    │
 * │                                                                       │
 * │   • `apps/client/src/art/portraits.ts` — textures PixiJS, 168 × 208,  │
 * │     empaquetées dans l'atlas (`icon('portrait_<id>')`) pour le        │
 * │     canevas : jetons de carte, planche de contact. **Elle suit** :    │
 * │     sa table `SPECS` est la transposition de `HERO_PORTRAIT_LIST`     │
 * │     ci-dessous, et la correspondance des champs est documentée en     │
 * │     tête de ce fichier-là.                                            │
 * │                                                                       │
 * │  Modifier un portrait commence donc TOUJOURS ici ; la version Pixi    │
 * │  est mise à jour dans la foulée. Ne jamais diverger en silence.       │
 * └──────────────────────────────────────────────────────────────────────┘
 *
 * Chaque spécification est écrite d'après la biographie de
 * `packages/content/src/heroes.ts` : l'âge, la morphologie, la coiffure, le
 * couvre-chef, le vêtement, l'expression et le détail signature répondent au
 * texte. Aucun portrait ne cherche à ressembler à une personne réelle.
 *
 * Répartition des âges : 24, 27, 29, 29, 31, 34, 36, 37, 38, 41, 43, 44, 45,
 * 46, 48, 50, 52, 54, 57, 58, 61.
 */

import type { ReactNode } from 'react';
import type { HeroPortraitSpec, PaintCtx } from './kit.js';

const CX = 140;

/* ───────────────────────── Détails signature ────────────────────────────── */

/** Gorgerin d'acier, porté par les castellans. */
function gorgerin({ g, spec }: PaintCtx): ReactNode {
  const y = g.chinY + 30;
  return (
    <g>
      <path
        d={`M${CX - 46 * spec.build} ${y + 10} Q${CX} ${y + 34} ${CX + 46 * spec.build} ${y + 10} L${CX + 42 * spec.build} ${y + 22} Q${CX} ${y + 46} ${CX - 42 * spec.build} ${y + 22} Z`}
        fill="#7C8794"
      />
      <path d={`M${CX - 40} ${y + 15} Q${CX} ${y + 36} ${CX + 40} ${y + 15}`} stroke="#FFE9C2" strokeOpacity="0.42" strokeWidth="2.6" fill="none" />
      <path d={`M${CX - 30} ${y + 26} Q${CX} ${y + 44} ${CX + 30} ${y + 26}`} stroke="#3A4657" strokeOpacity="0.4" strokeWidth="3" fill="none" />
    </g>
  );
}

/** Chaîne d'office et médaillon. */
function chaine(ctx: PaintCtx, medaille: string): ReactNode {
  const y = ctx.g.chinY + 52;
  return (
    <g>
      <path d={`M${CX - 44} ${y - 6} Q${CX} ${y + 34} ${CX + 44} ${y - 6}`} stroke="#C9A227" strokeWidth="4.4" fill="none" />
      <path d={`M${CX - 40} ${y - 4} Q${CX} ${y + 30} ${CX + 40} ${y - 4}`} stroke="#FFE9C2" strokeOpacity="0.36" strokeWidth="1.6" fill="none" />
      <path d={`M${CX} ${y + 26} l11 11 -11 12 -11 -12 Z`} fill={medaille} stroke="#C9A227" strokeWidth="2.4" />
      <path d={`M${CX - 4} ${y + 32} l4 4 -4 5 -4 -5 Z`} fill="#FFE9C2" fillOpacity="0.4" />
    </g>
  );
}

/** Fibule ou broche d'épaule. */
function fibule(ctx: PaintCtx, teinte: string): ReactNode {
  const y = ctx.g.chinY + 54;
  return (
    <g>
      <path d={`M${CX - 52} ${y} a9 9 0 1 0 0.1 0 Z`} fill="#C9A227" stroke="#7A6116" strokeWidth="1.6" />
      <path d={`M${CX - 52} ${y + 3} a4 4 0 1 0 0.1 0 Z`} fill={teinte} />
      <path d={`M${CX - 58} ${y - 3} a3.4 3.4 0 1 0 0.1 0 Z`} fill="#FFE9C2" fillOpacity="0.5" />
    </g>
  );
}

/* ─────────────────────── Châtellenie de Granit ──────────────────────────── */

const GRANIT: HeroPortraitSpec[] = [
  {
    id: 'paul',
    name: 'Paul',
    faction: 'granit',
    age: 29,
    shape: 'anguleux',
    build: 1.08,
    skin: 'hale',
    hair: 'chatain',
    hairStyle: 'militaire',
    facial: 'rase',
    head: 'aucun',
    garment: 'brigandine',
    iris: 'gris',
    cloth: '#414A52',
    trim: '#6E1F2A',
    brow: 1,
    mouth: -0.3,
    extra: (p) => (
      <>
        {gorgerin(p)}
        <g>
          <path d={`M${CX - 74} ${p.g.chinY + 62} Q${CX - 40} ${p.g.chinY + 82} ${CX - 6} ${p.g.chinY + 70}`} stroke="#C9A227" strokeWidth="3.4" fill="none" />
          <path d={`M${CX - 74} ${p.g.chinY + 62} a7 7 0 1 0 0.1 0 Z`} fill="#C9A227" stroke="#7A6116" strokeWidth="1.4" />
        </g>
      </>
    ),
  },
  {
    id: 'thibaut',
    name: 'Thibaut',
    faction: 'granit',
    age: 41,
    shape: 'long',
    build: 0.98,
    skin: 'clair',
    hair: 'chatainClair',
    hairStyle: 'miLong',
    facial: 'bouc',
    head: 'chaperon',
    garment: 'houppelande',
    iris: 'noisette',
    cloth: '#5A4128',
    trim: '#C9A227',
    brow: 0,
    mouth: 0.2,
    extra: (p) => (
      <g>
        {/* le carnet relié de peau, glissé sous le bras */}
        <path d={`M${CX + 52} ${p.g.chinY + 74} l30 -10 l10 30 l-30 10 Z`} fill="#5A4128" stroke="#2E2010" strokeWidth="2" />
        <path d={`M${CX + 56} ${p.g.chinY + 76} l26 -9`} stroke="#EDE3CE" strokeWidth="4" opacity="0.8" />
        <path d={`M${CX + 60} ${p.g.chinY + 86} l24 -8`} stroke="#C9A227" strokeWidth="2.2" opacity="0.75" />
        {fibule(p, '#6E1F2A')}
      </g>
    ),
  },
  {
    id: 'loic',
    name: 'Loïc',
    faction: 'granit',
    age: 44,
    shape: 'carre',
    build: 1.04,
    skin: 'hale',
    hair: 'poivreSel',
    hairStyle: 'court',
    facial: 'favoris',
    head: 'cale',
    garment: 'surcot',
    iris: 'brun',
    cloth: '#414A52',
    trim: '#EDE3CE',
    brow: -0.2,
    mouth: 0.1,
    extra: (p) => (
      <g>
        {/* la mesure à sel, pendue au col */}
        <path d={`M${CX + 2} ${p.g.chinY + 46} l0 22`} stroke="#C9A227" strokeWidth="2.6" />
        <path d={`M${CX - 10} ${p.g.chinY + 68} h24 l-4 18 h-16 Z`} fill="#8E8A83" stroke="#4A4E52" strokeWidth="1.8" />
        <path d={`M${CX - 8} ${p.g.chinY + 71} h20`} stroke="#F6F0DE" strokeWidth="3" opacity="0.85" />
        <path d={`M${CX - 6} ${p.g.chinY + 78} h16`} stroke="#3A4657" strokeOpacity="0.35" strokeWidth="2" />
      </g>
    ),
  },
  {
    id: 'matthieu',
    name: 'Matthieu',
    faction: 'granit',
    age: 38,
    shape: 'carre',
    build: 1.16,
    skin: 'burine',
    hair: 'noir',
    hairStyle: 'court',
    facial: 'barbe',
    head: 'aucun',
    garment: 'gambison',
    iris: 'brun',
    cloth: '#5A4128',
    trim: '#414A52',
    brow: 1,
    mouth: -0.1,
    extra: (p) => (
      <g>
        {/* le manche du merlin, passé en travers du dos */}
        <path d={`M${CX - 96} ${p.g.chinY + 104} L${CX + 88} ${p.g.chinY + 26}`} stroke="#6B5433" strokeWidth="9" strokeLinecap="round" />
        <path d={`M${CX - 92} ${p.g.chinY + 100} L${CX + 82} ${p.g.chinY + 28}`} stroke="#AC8759" strokeOpacity="0.4" strokeWidth="2.4" />
        <path d={`M${CX + 78} ${p.g.chinY + 12} l26 -10 l10 26 l-26 10 Z`} fill="#5A6169" stroke="#31363B" strokeWidth="2.2" />
        <path d={`M${CX + 82} ${p.g.chinY + 12} l22 -8`} stroke="#FFE9C2" strokeOpacity="0.45" strokeWidth="3" />
        <path d={`M${CX - 22} ${p.g.chinY + 60} q22 12 44 0`} stroke="#3A4657" strokeOpacity="0.3" strokeWidth="4" fill="none" />
      </g>
    ),
  },
  {
    id: 'clotilde',
    name: 'Clotilde',
    faction: 'granit',
    age: 34,
    shape: 'ovale',
    build: 0.94,
    skin: 'rose',
    hair: 'chatain',
    hairStyle: 'chignon',
    facial: 'aucune',
    head: 'coiffe',
    garment: 'robeBrodee',
    iris: 'vert',
    cloth: '#6E1F2A',
    trim: '#8C2230',
    brow: 0,
    mouth: 0.4,
    extra: (p) => (
      <g>
        {/* grenades brodées au fil d'or et aiguille piquée au col */}
        {[-46, -18, 12, 40].map((dx) => (
          <g key={dx}>
            <path
              d={`M${CX + dx} ${p.g.chinY + 74} q9 0 9 10 q0 11 -9 11 q-9 0 -9 -11 q0 -10 9 -10 Z`}
              fill="#C9A227"
              opacity="0.9"
            />
            <path d={`M${CX + dx} ${p.g.chinY + 70} l3 5 -3 4 -3 -4 Z`} fill="#C9A227" />
            <path d={`M${CX + dx - 4} ${p.g.chinY + 82} q4 4 8 0`} stroke="#6E1F2A" strokeWidth="1.6" fill="none" />
          </g>
        ))}
        <path d={`M${CX + 56} ${p.g.chinY + 48} l16 22`} stroke="#CBD4DD" strokeWidth="2.4" strokeLinecap="round" />
        <path d={`M${CX + 56} ${p.g.chinY + 48} q-14 6 -22 -2`} stroke="#C9A227" strokeWidth="2" fill="none" />
      </g>
    ),
  },
  {
    id: 'caroline',
    name: 'Caroline',
    faction: 'granit',
    age: 37,
    shape: 'coeur',
    build: 0.96,
    skin: 'clair',
    hair: 'blondCendre',
    hairStyle: 'tresse',
    facial: 'aucune',
    head: 'voile',
    garment: 'houppelande',
    iris: 'bleu',
    cloth: '#414A52',
    trim: '#EDE3CE',
    brow: 0.4,
    mouth: 0.1,
    extra: (p) => (
      <g>
        {/* tablette de cire et stylet de la chambre des comptes */}
        <path d={`M${CX - 92} ${p.g.chinY + 72} l34 -8 l10 40 l-34 8 Z`} fill="#6B5433" stroke="#3A2C1A" strokeWidth="2" />
        <path d={`M${CX - 86} ${p.g.chinY + 74} l24 -6 l7 30 l-24 6 Z`} fill="#4A4238" />
        {[0, 1, 2, 3].map((i) => (
          <path
            key={i}
            d={`M${CX - 84 + i * 1.4} ${p.g.chinY + 80 + i * 7} l20 -5`}
            stroke="#CFC6B4"
            strokeOpacity="0.55"
            strokeWidth="1.6"
          />
        ))}
        <path d={`M${CX - 54} ${p.g.chinY + 60} l-8 26`} stroke="#CBD4DD" strokeWidth="2.6" strokeLinecap="round" />
      </g>
    ),
  },
  {
    id: 'thomas',
    name: 'Thomas',
    faction: 'granit',
    age: 46,
    shape: 'long',
    build: 1.0,
    skin: 'burine',
    hair: 'gris',
    hairStyle: 'court',
    facial: 'moustache',
    head: 'bandeau',
    garment: 'gambison',
    iris: 'gris',
    cloth: '#5A4128',
    trim: '#C9A227',
    brow: 0.6,
    mouth: -0.2,
    extra: (p) => (
      <g>
        {/* carquois de carreaux à l'épaule et brassard de tir */}
        <path d={`M${CX + 62} ${p.g.chinY + 40} l24 -6 l14 60 l-24 6 Z`} fill="#5A4128" stroke="#2E2010" strokeWidth="2" />
        {[0, 1, 2].map((i) => (
          <g key={i}>
            <path d={`M${CX + 68 + i * 8} ${p.g.chinY + 38} l-4 -22`} stroke="#8B6236" strokeWidth="3" />
            <path d={`M${CX + 64 + i * 8} ${p.g.chinY + 16} l7 3 -6 5 Z`} fill="#CFC6B4" />
          </g>
        ))}
        <path d={`M${CX - 84} ${p.g.chinY + 76} l26 -8 l7 24 l-26 8 Z`} fill="#8E6C43" stroke="#2E2010" strokeWidth="1.8" />
        <path d={`M${CX - 80} ${p.g.chinY + 80} l20 -6 M${CX - 78} ${p.g.chinY + 88} l20 -6`} stroke="#C9A227" strokeOpacity="0.6" strokeWidth="1.6" />
      </g>
    ),
  },
  {
    id: 'georges',
    name: 'Georges',
    faction: 'granit',
    age: 58,
    shape: 'carre',
    build: 1.18,
    skin: 'burine',
    hair: 'gris',
    hairStyle: 'degarni',
    facial: 'barbeLongue',
    head: 'camail',
    garment: 'mailles',
    iris: 'brun',
    cloth: '#414A52',
    trim: '#6E1F2A',
    brow: 1,
    mouth: -0.6,
    extra: (p) => (
      <g>
        {/* la cicatrice du grand hiver, du sourcil à la pommette */}
        <path
          d={`M${CX + p.g.eyeGap - 4} ${p.g.eyeY - 24} Q${CX + p.g.eyeGap + 8} ${p.g.eyeY - 6} ${CX + p.g.eyeGap + 2} ${p.g.eyeY + 16}`}
          stroke={p.skin.deep}
          strokeOpacity="0.55"
          strokeWidth="2.6"
          fill="none"
          strokeLinecap="round"
        />
        <path
          d={`M${CX + p.g.eyeGap - 3} ${p.g.eyeY - 22} Q${CX + p.g.eyeGap + 6} ${p.g.eyeY - 6} ${CX + p.g.eyeGap + 1} ${p.g.eyeY + 14}`}
          stroke={p.skin.light}
          strokeOpacity="0.45"
          strokeWidth="1.2"
          fill="none"
        />
        {gorgerin(p)}
      </g>
    ),
  },
  {
    id: 'auguste',
    name: 'Auguste',
    faction: 'granit',
    age: 61,
    shape: 'long',
    build: 1.02,
    skin: 'pale',
    hair: 'blanc',
    hairStyle: 'long',
    facial: 'barbe',
    head: 'chaperon',
    garment: 'houppelande',
    iris: 'bleu',
    cloth: '#6E1F2A',
    trim: '#C9A227',
    brow: -0.4,
    mouth: 0,
    extra: (p) => chaine(p, '#6E1F2A'),
  },
  {
    id: 'josephine',
    name: 'Joséphine',
    faction: 'granit',
    age: 48,
    shape: 'rond',
    build: 1.02,
    skin: 'hale',
    hair: 'poivreSel',
    hairStyle: 'nattes',
    facial: 'aucune',
    head: 'coiffe',
    garment: 'tunique',
    iris: 'noisette',
    cloth: '#5A4128',
    trim: '#EDE3CE',
    brow: -0.2,
    mouth: 0.5,
    extra: (p) => (
      <g>
        {/* rouleau de chartes et clef de four banal */}
        <path d={`M${CX + 54} ${p.g.chinY + 66} l30 -8 q6 16 -2 34 l-30 8 q8 -18 2 -34 Z`} fill="#E8DCC0" stroke="#B6A682" strokeWidth="2" />
        <path d={`M${CX + 60} ${p.g.chinY + 72} l20 -5 M${CX + 63} ${p.g.chinY + 80} l20 -5 M${CX + 64} ${p.g.chinY + 88} l16 -4`} stroke="#B6A682" strokeWidth="1.6" />
        <path d={`M${CX + 52} ${p.g.chinY + 96} a6 6 0 1 0 0.1 0 Z`} fill="#8C2230" stroke="#3A0E15" strokeWidth="1.4" />
        <path d={`M${CX - 66} ${p.g.chinY + 62} l0 26 l8 0 l0 6 l-8 0 l0 6`} stroke="#C9A227" strokeWidth="3" fill="none" />
        <path d={`M${CX - 66} ${p.g.chinY + 56} a6 6 0 1 0 0.1 0 Z`} fill="none" stroke="#C9A227" strokeWidth="3" />
      </g>
    ),
  },
];

/* ───────────────────── Ermitage des Bois Noirs ──────────────────────────── */

const ERMITAGE: HeroPortraitSpec[] = [
  {
    id: 'anastasia',
    name: 'Anastasia',
    faction: 'ermitage',
    age: 45,
    shape: 'long',
    build: 0.92,
    skin: 'pale',
    hair: 'noir',
    hairStyle: 'long',
    facial: 'aucune',
    head: 'voile',
    garment: 'bure',
    iris: 'gris',
    cloth: '#1B3A2B',
    trim: '#9FB4C2',
    brow: 0.2,
    mouth: -0.3,
    extra: (p) => (
      <g>
        {/* la brume du col des Sagnes, qui ne la quitte pas */}
        <path
          d={`M${CX - 108} ${p.g.chinY + 74} Q${CX - 40} ${p.g.chinY + 58} ${CX + 30} ${p.g.chinY + 76} Q${CX + 92} ${p.g.chinY + 92} ${CX + 118} ${p.g.chinY + 70}`}
          stroke="#9FB4C2"
          strokeOpacity="0.42"
          strokeWidth="12"
          fill="none"
          strokeLinecap="round"
        />
        <path
          d={`M${CX - 112} ${p.g.chinY + 100} Q${CX - 30} ${p.g.chinY + 84} ${CX + 40} ${p.g.chinY + 102} Q${CX + 96} ${p.g.chinY + 116} ${CX + 122} ${p.g.chinY + 96}`}
          stroke="#9FB4C2"
          strokeOpacity="0.32"
          strokeWidth="14"
          fill="none"
          strokeLinecap="round"
        />
        <path d={`M${CX} ${p.g.chinY + 44} l0 20`} stroke="#4E8977" strokeWidth="2.4" />
        <path d={`M${CX} ${p.g.chinY + 64} a8 8 0 1 0 0.1 0 Z`} fill="#9FB4C2" stroke="#4E8977" strokeWidth="2" />
      </g>
    ),
  },
  {
    id: 'mathilde',
    name: 'Mathilde',
    faction: 'ermitage',
    age: 52,
    shape: 'ovale',
    build: 1.0,
    skin: 'clair',
    hair: 'gris',
    hairStyle: 'chignon',
    facial: 'aucune',
    head: 'coiffe',
    garment: 'bure',
    iris: 'vert',
    cloth: '#CFC6B4',
    trim: '#4E8977',
    brow: -0.2,
    mouth: 0.3,
    extra: (p) => (
      <g>
        {/* la burette de source et le brin de sauge */}
        <path d={`M${CX + 56} ${p.g.chinY + 62} h20 v8 q12 10 12 24 q0 16 -22 16 q-22 0 -22 -16 q0 -14 12 -24 Z`} fill="#4E8977" stroke="#22463E" strokeWidth="2" />
        <path d={`M${CX + 58} ${p.g.chinY + 92} q18 -6 34 0`} stroke="#ABD5D0" strokeWidth="3" fill="none" opacity="0.7" />
        <path d={`M${CX - 62} ${p.g.chinY + 94} q-8 -22 6 -34 q10 14 2 34 Z`} fill="#7C8F6B" stroke="#3E4B36" strokeWidth="1.6" />
        <path d={`M${CX - 58} ${p.g.chinY + 62} l-2 32`} stroke="#3E4B36" strokeWidth="1.6" />
      </g>
    ),
  },
  {
    id: 'agathe',
    name: 'Agathe',
    faction: 'ermitage',
    age: 27,
    shape: 'coeur',
    build: 0.94,
    skin: 'hale',
    hair: 'roux',
    hairStyle: 'tresse',
    facial: 'aucune',
    head: 'aucun',
    garment: 'peaux',
    iris: 'ambre',
    cloth: '#2F3B2E',
    trim: '#6B5433',
    brow: 0.3,
    mouth: 0.2,
    extra: (p) => (
      <g>
        {/* la hulotte au poing : silhouette posée sur l'épaule gauche */}
        <path
          d={`M${CX - 78} ${p.g.chinY + 46} q16 -4 20 14 q4 20 -12 26 q-16 4 -20 -14 q-3 -20 12 -26 Z`}
          fill="#D8CAAB"
          stroke="#7A6E56"
          strokeWidth="2"
        />
        <path d={`M${CX - 84} ${p.g.chinY + 44} l5 -10 l6 8 Z M${CX - 66} ${p.g.chinY + 46} l7 -9 l2 10 Z`} fill="#D8CAAB" stroke="#7A6E56" strokeWidth="1.4" />
        <path d={`M${CX - 80} ${p.g.chinY + 56} a4.2 4.2 0 1 0 0.1 0 Z M${CX - 67} ${p.g.chinY + 58} a4.2 4.2 0 1 0 0.1 0 Z`} fill="#C9A227" stroke="#7A6116" strokeWidth="1.2" />
        <path d={`M${CX - 80} ${p.g.chinY + 57} a1.7 1.7 0 1 0 0.1 0 Z M${CX - 67} ${p.g.chinY + 59} a1.7 1.7 0 1 0 0.1 0 Z`} fill="#1D1712" />
        <path d={`M${CX - 74} ${p.g.chinY + 62} l4 5 -4 4 -4 -4 Z`} fill="#9C6438" />
        <path d={`M${CX - 82} ${p.g.chinY + 72} q8 4 16 0 M${CX - 80} ${p.g.chinY + 78} q7 4 13 0`} stroke="#7A6E56" strokeOpacity="0.6" strokeWidth="1.6" fill="none" />
        {/* plume de hulotte piquée dans la tresse */}
        <path d={`M${CX + p.g.w - 4} ${p.g.crownY + 16} q22 -18 30 -34 q-4 26 -22 44 Z`} fill="#B9AC85" stroke="#7A6E56" strokeWidth="1.4" />
      </g>
    ),
  },
  {
    id: 'roxane',
    name: 'Roxane',
    faction: 'ermitage',
    age: 31,
    shape: 'anguleux',
    build: 0.98,
    skin: 'hale',
    hair: 'noir',
    hairStyle: 'court',
    facial: 'aucune',
    head: 'capuche',
    garment: 'gambison',
    iris: 'vert',
    cloth: '#3F4E38',
    trim: '#6B5433',
    brow: 0.8,
    mouth: -0.2,
    extra: (p) => (
      <g>
        {/* l'ombre de la capuche mange le haut du visage */}
        <path
          d={`M${CX - p.g.w} ${p.g.crownY + 34} Q${CX} ${p.g.crownY + 54} ${CX + p.g.w} ${p.g.crownY + 34} L${CX + p.g.w} ${p.g.crownY + 6} L${CX - p.g.w} ${p.g.crownY + 6} Z`}
          fill="#2A3242"
          opacity="0.34"
        />
        {/* baudrier et manche de couteau */}
        <path d={`M${CX - 84} ${p.g.chinY + 108} L${CX + 40} ${p.g.chinY + 44}`} stroke="#5A4128" strokeWidth="10" strokeLinecap="round" />
        <path d={`M${CX - 80} ${p.g.chinY + 104} L${CX + 36} ${p.g.chinY + 46}`} stroke="#8E6C43" strokeOpacity="0.4" strokeWidth="2.4" />
        <path d={`M${CX + 44} ${p.g.chinY + 40} l16 -8 l6 12 l-16 8 Z`} fill="#31363B" stroke="#1E2124" strokeWidth="1.8" />
      </g>
    ),
  },
  {
    id: 'jean',
    name: 'Jean',
    faction: 'ermitage',
    age: 43,
    shape: 'carre',
    build: 1.12,
    skin: 'burine',
    hair: 'chatain',
    hairStyle: 'miLong',
    facial: 'barbe',
    head: 'aucun',
    garment: 'peaux',
    iris: 'ambre',
    cloth: '#2F3B2E',
    trim: '#6B5433',
    brow: 0.4,
    mouth: -0.1,
    extra: (p) => (
      <g>
        {/* l'oreille gauche entamée par la meute */}
        <path
          d={`M${CX - p.g.w - 2} ${p.g.eyeY + 6} q6 -3 6 4 q0 5 -6 4 Z`}
          fill={p.skin.deep}
          opacity="0.8"
        />
        {/* collier de crocs */}
        <path d={`M${CX - 44} ${p.g.chinY + 46} Q${CX} ${p.g.chinY + 74} ${CX + 44} ${p.g.chinY + 46}`} stroke="#5A4128" strokeWidth="3" fill="none" />
        {[-30, -16, 0, 16, 30].map((dx, i) => (
          <path
            key={dx}
            d={`M${CX + dx} ${p.g.chinY + 62 + (2 - Math.abs(i - 2)) * 4} l4 0 l-2 ${11 + (2 - Math.abs(i - 2)) * 3} Z`}
            fill="#F2E7D0"
            stroke="#A2947A"
            strokeWidth="1.2"
          />
        ))}
      </g>
    ),
  },
  {
    id: 'adele',
    name: 'Adèle',
    faction: 'ermitage',
    age: 24,
    shape: 'rond',
    build: 0.9,
    skin: 'pale',
    hair: 'blondCendre',
    hairStyle: 'boucle',
    facial: 'aucune',
    head: 'couronneFeuilles',
    garment: 'bure',
    iris: 'vert',
    cloth: '#4A6138',
    trim: '#7C8F6B',
    brow: -0.3,
    mouth: 0.3,
    extra: (p) => (
      <g>
        {/* les ronces qui la suivent depuis la souche creuse */}
        <path
          d={`M${CX - 96} ${p.g.chinY + 116} Q${CX - 60} ${p.g.chinY + 70} ${CX - 26} ${p.g.chinY + 56}`}
          stroke="#4A6138"
          strokeWidth="4"
          fill="none"
          strokeLinecap="round"
        />
        <path
          d={`M${CX + 96} ${p.g.chinY + 116} Q${CX + 62} ${p.g.chinY + 72} ${CX + 28} ${p.g.chinY + 58}`}
          stroke="#4A6138"
          strokeWidth="4"
          fill="none"
          strokeLinecap="round"
        />
        {[
          [-78, 96],
          [-58, 78],
          [-38, 64],
          [78, 96],
          [58, 80],
          [38, 66],
        ].map(([dx, dy], i) => (
          <path
            key={i}
            d={`M${CX + dx} ${p.g.chinY + dy} l-5 -7 l7 3 Z`}
            fill="#D8CAAB"
          />
        ))}
        {[
          [-66, 84],
          [66, 86],
          [-44, 70],
        ].map(([dx, dy], i) => (
          <path key={`f${i}`} d={`M${CX + dx} ${p.g.chinY + dy} q10 -8 14 2 q-8 8 -14 -2 Z`} fill="#5C7645" />
        ))}
      </g>
    ),
  },
  {
    id: 'ines',
    name: 'Inès',
    faction: 'ermitage',
    age: 36,
    shape: 'ovale',
    build: 0.96,
    skin: 'clair',
    hair: 'chatain',
    hairStyle: 'tresse',
    facial: 'aucune',
    head: 'voile',
    garment: 'bure',
    iris: 'brun',
    cloth: '#CFC6B4',
    trim: '#C9A227',
    brow: -0.1,
    mouth: 0.2,
    extra: (p) => (
      <g>
        {/* bourdon de pèlerin et coquille cousue */}
        <path d={`M${CX + 78} ${p.g.chinY - 30} L${CX + 66} ${p.g.chinY + 120}`} stroke="#6B5433" strokeWidth="7" strokeLinecap="round" />
        <path d={`M${CX + 77} ${p.g.chinY - 26} L${CX + 67} ${p.g.chinY + 110}`} stroke="#AC8759" strokeOpacity="0.4" strokeWidth="2" />
        <path d={`M${CX + 78} ${p.g.chinY - 34} a9 9 0 1 0 0.1 0 Z`} fill="#C9A227" stroke="#7A6116" strokeWidth="2" />
        <path
          d={`M${CX - 52} ${p.g.chinY + 62} q22 -4 30 14 l-30 10 q-6 -14 0 -24 Z`}
          fill="#F2E7D0"
          stroke="#A2947A"
          strokeWidth="1.8"
        />
        {[0, 1, 2, 3].map((i) => (
          <path key={i} d={`M${CX - 50 + i * 3} ${p.g.chinY + 64 + i} q6 10 4 18`} stroke="#A2947A" strokeOpacity="0.7" strokeWidth="1.4" fill="none" />
        ))}
      </g>
    ),
  },
  {
    id: 'gustave',
    name: 'Gustave',
    faction: 'ermitage',
    age: 50,
    shape: 'carre',
    build: 1.18,
    skin: 'burine',
    hair: 'gris',
    hairStyle: 'chauve',
    facial: 'barbe',
    head: 'aucun',
    garment: 'peaux',
    iris: 'gris',
    cloth: '#4A4E52',
    trim: '#6B5433',
    brow: 0.6,
    mouth: -0.4,
    extra: (p) => (
      <g>
        {/* la poussière de carrière, restée sur l'épaule et la barbe */}
        <path
          d={`M${CX + 30} ${p.g.chinY + 48} Q${CX + 74} ${p.g.chinY + 40} ${CX + 110} ${p.g.chinY + 62}`}
          stroke="#CFC6B4"
          strokeOpacity="0.34"
          strokeWidth="12"
          fill="none"
          strokeLinecap="round"
        />
        {[
          [-14, 24],
          [6, 34],
          [22, 20],
        ].map(([dx, dy], i) => (
          <circle key={i} cx={CX + dx} cy={p.g.chinY + dy} r="2.4" fill="#CFC6B4" opacity="0.4" />
        ))}
        {/* éclat de granit pendu au cou */}
        <path d={`M${CX - 4} ${p.g.chinY + 44} l2 24`} stroke="#5A4128" strokeWidth="2.4" />
        <path d={`M${CX - 10} ${p.g.chinY + 68} l16 -4 l6 18 l-14 6 Z`} fill="#4A4E52" stroke="#25272A" strokeWidth="1.8" />
        <path d={`M${CX - 7} ${p.g.chinY + 70} l11 -3`} stroke="#FFE9C2" strokeOpacity="0.4" strokeWidth="2.4" />
      </g>
    ),
  },
  {
    id: 'come',
    name: 'Côme',
    faction: 'ermitage',
    age: 57,
    shape: 'long',
    build: 0.96,
    skin: 'pale',
    hair: 'blanc',
    hairStyle: 'tonsure',
    facial: 'barbeLongue',
    head: 'aucun',
    garment: 'bure',
    iris: 'bleu',
    cloth: '#1B3A2B',
    trim: '#9FB4C2',
    brow: -0.5,
    mouth: 0.1,
    extra: (p) => (
      <g>
        {/* disque des vents et calame, trente et un ans de journal du ciel */}
        <path d={`M${CX + 74} ${p.g.chinY + 78} a26 26 0 1 0 0.1 0 Z`} fill="#4E8977" stroke="#22463E" strokeWidth="2.4" />
        <path d={`M${CX + 74} ${p.g.chinY + 78} a17 17 0 1 0 0.1 0 Z`} fill="none" stroke="#ABD5D0" strokeOpacity="0.6" strokeWidth="1.6" />
        <path
          d={`M${CX + 74} ${p.g.chinY + 58} L${CX + 79} ${p.g.chinY + 74} L${CX + 94} ${p.g.chinY + 78} L${CX + 79} ${p.g.chinY + 82} L${CX + 74} ${p.g.chinY + 98} L${CX + 69} ${p.g.chinY + 82} L${CX + 54} ${p.g.chinY + 78} L${CX + 69} ${p.g.chinY + 74} Z`}
          fill="#C9A227"
        />
        <path d={`M${CX - 88} ${p.g.chinY + 56} q-6 32 8 54`} stroke="#F0EBDE" strokeWidth="4" fill="none" strokeLinecap="round" />
        <path d={`M${CX - 88} ${p.g.chinY + 56} q-14 -12 -8 -26 q12 10 8 26 Z`} fill="#F0EBDE" stroke="#A29B8C" strokeWidth="1.4" />
      </g>
    ),
  },
  {
    id: 'lise',
    name: 'Lise',
    faction: 'ermitage',
    age: 29,
    shape: 'ovale',
    build: 0.94,
    skin: 'pale',
    hair: 'noir',
    hairStyle: 'long',
    facial: 'aucune',
    head: 'aucun',
    garment: 'robeBrodee',
    iris: 'bleu',
    cloth: '#2B3A4A',
    trim: '#4E8977',
    brow: 0.1,
    mouth: -0.2,
    extra: (p) => (
      <g>
        {/* écailles de vouivre au col, et la pierre de rivière */}
        {[0, 1, 2, 3, 4, 5, 6].map((i) => (
          <path
            key={i}
            d={`M${CX - 48 + i * 16} ${p.g.chinY + 50 + Math.abs(3 - i) * 3} q8 0 8 9 q0 9 -8 9 q-8 0 -8 -9 q0 -9 8 -9 Z`}
            fill="#4E8977"
            stroke="#22463E"
            strokeWidth="1.4"
            opacity={0.9}
          />
        ))}
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <path
            key={`b${i}`}
            d={`M${CX - 40 + i * 16} ${p.g.chinY + 66 + Math.abs(2.5 - i) * 3} q7 0 7 8 q0 8 -7 8 q-7 0 -7 -8 q0 -8 7 -8 Z`}
            fill="#22463E"
            stroke="#132F29"
            strokeWidth="1.2"
            opacity={0.85}
          />
        ))}
        <path d={`M${CX} ${p.g.chinY + 84} a9 9 0 1 0 0.1 0 Z`} fill="#8FA6B8" stroke="#4B5E6D" strokeWidth="2" />
        <path d={`M${CX - 3} ${p.g.chinY + 82} a3 3 0 1 0 0.1 0 Z`} fill="#FFE9C2" fillOpacity="0.55" />
      </g>
    ),
  },
];

/* ──────────────────────────── Héros neutre ──────────────────────────────── */

const JULES: HeroPortraitSpec = {
  id: 'jules',
  name: 'Jules',
  faction: 'neutre',
  age: 54,
  shape: 'anguleux',
  build: 1.04,
  skin: 'hale',
  hair: 'poivreSel',
  hairStyle: 'miLong',
  facial: 'bouc',
  head: 'chapeauLarge',
  garment: 'tunique',
  iris: 'noisette',
  cloth: '#5A4128',
  trim: '#C9A227',
  brow: 0,
  mouth: 0.2,
  extra: (p) => (
    <g>
      {/* le ciseau à graver et l'écusson d'une borne */}
      <path d={`M${CX + 66} ${p.g.chinY + 52} l14 -6 l30 56 l-14 6 Z`} fill="#4A4E52" stroke="#25272A" strokeWidth="2" />
      <path d={`M${CX + 70} ${p.g.chinY + 54} l12 -5`} stroke="#FFE9C2" strokeOpacity="0.45" strokeWidth="3" />
      <path
        d={`M${CX - 92} ${p.g.chinY + 66} q22 -8 44 0 l-4 42 q-18 8 -36 0 Z`}
        fill="#4A4E52"
        stroke="#25272A"
        strokeWidth="2.2"
      />
      <path d={`M${CX - 88} ${p.g.chinY + 70} l-3 36`} stroke="#FFE9C2" strokeOpacity="0.28" strokeWidth="3" />
      <path
        d={`M${CX - 70} ${p.g.chinY + 76} l14 6 v10 q0 9 -14 14 q-14 -5 -14 -14 v-10 Z`}
        fill="#C9A227"
        stroke="#7A6116"
        strokeWidth="1.6"
      />
      <path d={`M${CX - 70} ${p.g.chinY + 84} l5 6 -5 6 -5 -6 Z`} fill="#6E1F2A" />
    </g>
  ),
};

/* ───────────────────────────── Assemblage ───────────────────────────────── */

export const HERO_PORTRAIT_LIST: readonly HeroPortraitSpec[] = [...GRANIT, ...ERMITAGE, JULES];

/** Les vingt-et-une spécifications, indexées par identifiant de héros. */
export const HERO_PORTRAITS: Readonly<Record<string, HeroPortraitSpec>> = Object.fromEntries(
  HERO_PORTRAIT_LIST.map((h) => [h.id, h]),
);

/** Clefs d'atlas imposées par le contenu : `portrait_<heros>`. */
export const HERO_PORTRAIT_KEYS: readonly string[] = HERO_PORTRAIT_LIST.map((h) => `portrait_${h.id}`);
