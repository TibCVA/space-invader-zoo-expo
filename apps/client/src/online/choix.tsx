/**
 * Les choix d'une bannière, tels qu'ils existent déjà pour le solo.
 *
 * Le salon en ligne ne réinvente aucun sélecteur : il reprend **le même
 * vocabulaire visuel** que l'assistant de nouvelle partie — les plaques
 * `hmm-acc-segment`, les blasons `FactionBlazon`, les portraits `HeroAvatar`,
 * les bannières `PlayerBanner`, les listes `hmm-acc-select` — et **les mêmes
 * sources de vérité** : `FACTIONS`, `HEROES`, `heroesOf` de `@auvergne/content`
 * et `START_POSITIONS` de `@auvergne/map`. Rien n'est inventé ici, ni une
 * couleur, ni une donnée de contenu.
 *
 * Le fichier est volontairement sans état : chaque composant reçoit une valeur
 * et un rappel. C'est l'écran de salon qui décide quand appeler le réseau.
 */

import type { ReactElement } from 'react';
import type { FactionId, HeroId } from '@auvergne/engine';
import { FACTIONS, HEROES, heroesOf } from '@auvergne/content';
import { START_KEYS, START_POSITIONS, type StartKey } from '@auvergne/map';
import { FactionBlazon, HeroAvatar } from '@auvergne/ui';
import { jouerEffet } from '../landing/audio-bridge.js';

/* ════════════════════════════ Vocabulaire ═════════════════════════════════ */

export type DureePartie = 'eclair' | 'standard' | 'saga';
export type VictoirePartie = 'couronne' | 'derniere_banniere' | 'maitre_marches' | 'chronique';
export type ProfilIa = 'prudent' | 'equilibre' | 'agressif' | 'expert';

/** Les trois durées, dites comme dans l'assistant de nouvelle partie. */
export const DUREES: readonly { id: DureePartie; name: string; text: string }[] = [
  { id: 'eclair', name: 'Éclair', text: 'Douze semaines. Croissance accélérée, décisions brutales.' },
  { id: 'standard', name: 'Standard', text: 'Vingt-six semaines. Le rythme pour lequel le Forez est équilibré.' },
  { id: 'saga', name: 'Saga', text: 'Cinquante-deux semaines. Grandes armées, longues rancunes.' },
];

/**
 * La seule condition de victoire de la partie. Le type `VictoirePartie` garde
 * ses quatre valeurs pour relire les salons et sauvegardes créés avant le
 * mode unique ; les trois anciennes sont affichées comme la dernière bannière.
 */
export const VICTOIRES: readonly { id: VictoirePartie; name: string; text: string }[] = [
  {
    id: 'derniere_banniere',
    name: 'La dernière bannière',
    text: "Prendre tous les châteaux adverses. Sans cité pendant sept jours, une maison s'éteint — héros ou pas.",
  },
];

/** Les quatre profils d'adversaire, dits comme dans l'assistant. */
export const PROFILS_IA: readonly { id: ProfilIa; name: string; text: string }[] = [
  { id: 'prudent', name: 'Prudent', text: 'Fortifie, économise, n’attaque qu’à coup sûr.' },
  { id: 'equilibre', name: 'Équilibré', text: 'Développe et harcèle en même temps.' },
  { id: 'agressif', name: 'Agressif', text: 'Sort tôt, prend des risques, vise les cités.' },
  { id: 'expert', name: 'Expert', text: 'Optimise ses tours et exploite chaque faiblesse.' },
];

/* ═════════════════════════════ Segments ═══════════════════════════════════ */

export interface SegmentsProps<T extends string> {
  legend: string;
  hint?: string;
  value: T;
  options: readonly { id: T; name: string; text?: string }[];
  onChange(next: T): void;
  columns?: boolean;
  disabled?: boolean;
}

/** Le groupe de plaques de l'assistant, à l'identique. */
export function Segments<T extends string>({
  legend,
  hint,
  value,
  options,
  onChange,
  columns,
  disabled = false,
}: SegmentsProps<T>): ReactElement {
  return (
    <fieldset className={`hmm-acc-champ${columns ? ' hmm-acc-champ--colonnes' : ''}`}>
      <legend className="hmm-acc-legende">{legend}</legend>
      {hint ? <p className="hmm-acc-aide">{hint}</p> : null}
      <div className="hmm-acc-segments" role="radiogroup" aria-label={legend}>
        {options.map((option) => (
          <button
            key={option.id}
            type="button"
            role="radio"
            aria-checked={option.id === value}
            disabled={disabled}
            className={`hmm-acc-segment${option.id === value ? ' est-actif' : ''}`}
            onClick={(): void => {
              jouerEffet('clic');
              onChange(option.id);
            }}
          >
            <span className="hmm-acc-segment-nom">{option.name}</span>
            {option.text ? <span className="hmm-acc-segment-texte">{option.text}</span> : null}
          </button>
        ))}
      </div>
    </fieldset>
  );
}

/* ═══════════════════════ Nombre de bannières ══════════════════════════════ */

export interface CompteurBannieresProps {
  value: number;
  onChange(next: number): void;
  /** valeurs proposées ; par défaut deux à cinq */
  choix?: readonly number[];
  disabled?: boolean;
}

/** Le compteur de bannières de l'assistant, à l'identique. */
export function CompteurBannieres({
  value,
  onChange,
  choix = [2, 3, 4, 5],
  disabled = false,
}: CompteurBannieresProps): ReactElement {
  return (
    <fieldset className="hmm-acc-champ">
      <legend className="hmm-acc-legende">Nombre de bannières</legend>
      <div className="hmm-acc-compteur" role="radiogroup" aria-label="Nombre de bannières">
        {choix.map((n) => (
          <button
            key={n}
            type="button"
            role="radio"
            aria-checked={n === value}
            disabled={disabled}
            className={`hmm-acc-compteur-case${n === value ? ' est-actif' : ''}`}
            onClick={(): void => {
              jouerEffet('clic');
              onChange(n);
            }}
          >
            <span className="hmm-acc-compteur-chiffre">{n}</span>
            <span className="hmm-acc-compteur-mot">{n === 2 ? 'duel' : 'cousins'}</span>
          </button>
        ))}
      </div>
    </fieldset>
  );
}

/* ═══════════════════════ Les choix d'une bannière ═════════════════════════ */

/** Ce qu'un cousin choisit pour sa bannière. */
export interface ChoixBanniere {
  nom: string;
  faction: FactionId;
  heros: HeroId;
  depart: StartKey;
}

export interface FormulaireBanniereProps {
  valeur: ChoixBanniere;
  onChange(patch: Partial<ChoixBanniere>): void;
  /** héros déjà pris par d'autres bannières */
  herosPris?: readonly string[];
  /** positions déjà prises par d'autres bannières */
  departsPris?: readonly string[];
  /** numéro de la bannière, pour les libellés accessibles */
  rang: number;
  disabled?: boolean;
}

/**
 * Nom, maison, héros — donc l'avatar — et position de départ. Exactement les
 * quatre choix du solo, dans le même ordre et avec la même matière.
 */
export function FormulaireBanniere({
  valeur,
  onChange,
  herosPris = [],
  departsPris = [],
  rang,
  disabled = false,
}: FormulaireBanniereProps): ReactElement {
  const pool = heroesOf(valeur.faction);
  const heroDef = HEROES[valeur.heros];

  return (
    <div className="hmm-acc-joueur-grille">
      <label className="hmm-acc-joueur-nom hmm-enl-nom">
        <span className="hmm-acc-sr">Nom de la bannière {rang}</span>
        <input
          type="text"
          value={valeur.nom}
          maxLength={28}
          disabled={disabled}
          placeholder="Votre nom de maison"
          onChange={(event): void => onChange({ nom: event.target.value })}
        />
      </label>

      <div className="hmm-acc-factions" role="radiogroup" aria-label={`Maison de la bannière ${String(rang)}`}>
        {(['granit', 'ermitage'] as const).map((id) => (
          <button
            key={id}
            type="button"
            role="radio"
            aria-checked={valeur.faction === id}
            disabled={disabled}
            className={`hmm-acc-faction${valeur.faction === id ? ' est-actif' : ''}`}
            onClick={(): void => {
              jouerEffet('clic');
              if (valeur.faction === id) return;
              const suivant = heroesOf(id).find((h) => !herosPris.includes(h.id)) ?? heroesOf(id)[0];
              onChange({ faction: id, heros: suivant.id });
            }}
          >
            <FactionBlazon faction={id} size={38} />
            <span className="hmm-acc-faction-textes">
              <span className="hmm-acc-faction-nom">{FACTIONS[id].name}</span>
              <span className="hmm-acc-faction-devise">{FACTIONS[id].motto}</span>
            </span>
          </button>
        ))}
      </div>

      <label className="hmm-acc-select hmm-acc-select--heros">
        <span>Héros de départ — c’est lui votre portrait</span>
        <select
          value={valeur.heros}
          disabled={disabled}
          onChange={(event): void => onChange({ heros: event.target.value })}
        >
          {pool.map((h) => (
            <option key={h.id} value={h.id} disabled={h.id !== valeur.heros && herosPris.includes(h.id)}>
              {h.name} — {h.class}
              {h.id !== valeur.heros && herosPris.includes(h.id) ? ' (pris)' : ''}
            </option>
          ))}
        </select>
      </label>

      {heroDef ? (
        <div className="hmm-acc-heros-apercu">
          <HeroAvatar heroId={heroDef.id} size={54} />
          <div>
            <p className="hmm-acc-heros-nom">
              {heroDef.name} <span>· {heroDef.title}</span>
            </p>
            <p className="hmm-acc-heros-bio">{heroDef.bio}</p>
          </div>
        </div>
      ) : null}

      <label className="hmm-acc-select">
        <span>Position de départ</span>
        <select
          value={valeur.depart}
          disabled={disabled}
          onChange={(event): void => onChange({ depart: event.target.value as StartKey })}
        >
          {START_KEYS.map((key) => (
            <option key={key} value={key} disabled={key !== valeur.depart && departsPris.includes(key)}>
              {START_POSITIONS[key].label}
              {key !== valeur.depart && departsPris.includes(key) ? ' (prise)' : ''}
            </option>
          ))}
        </select>
      </label>

      <p className="hmm-acc-mecanique">
        <strong>{FACTIONS[valeur.faction].mechanic.name}</strong> —{' '}
        {FACTIONS[valeur.faction].mechanic.description}
      </p>
    </div>
  );
}

/* ═════════════════════════════ Utilitaires ════════════════════════════════ */

/** Premier héros libre d'une maison, en évitant ceux déjà pris. */
export function premierHerosLibre(faction: FactionId, pris: readonly string[]): HeroId {
  const pool = heroesOf(faction);
  return (pool.find((h) => !pris.includes(h.id)) ?? pool[0]).id;
}

/** Première position de départ libre. */
export function premierDepartLibre(pris: readonly string[]): StartKey {
  return START_KEYS.find((k) => !pris.includes(k)) ?? START_KEYS[0];
}

/** Libellé français d'une position de départ. */
export function libelleDepart(depart: string | null): string {
  if (!depart) return 'position à choisir';
  const connue = START_POSITIONS[depart as StartKey];
  return connue ? connue.label : depart;
}

/** Nom français d'une maison. */
export function libelleFaction(faction: string | null): string {
  if (faction === 'granit' || faction === 'ermitage') return FACTIONS[faction].name;
  return 'maison à choisir';
}

/** Nom français d'un profil d'adversaire. */
export function libelleProfil(profil: string | null): string {
  return PROFILS_IA.find((p) => p.id === profil)?.name ?? 'Équilibré';
}
