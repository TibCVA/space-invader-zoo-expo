/**
 * Assistant de nouvelle partie.
 *
 * Il ne simule rien : il **compose un `GameSetup` valide** au sens de
 * `packages/engine/src/types.ts`, à partir des données réelles du dépôt —
 * `FACTIONS`, `HEROES` et `heroesOf` de `@auvergne/content`, `START_POSITIONS`,
 * `START_SETS` et `MAP_VERSION` de `@auvergne/map`. Aucune valeur n'est
 * inventée ici, aucune règle n'y est écrite : c'est `createGame(setup, world)`
 * qui décide de tout le reste.
 *
 * La miniature de carte est peinte depuis `buildTerrain()`, donc depuis le
 * champ d'altitude réel du massif des Bois Noirs, et les cinq positions de
 * départ y sont posées à leurs coordonnées de grille exactes.
 */

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ReactElement,
} from 'react';
import type { FactionId, GameSetup, HeroId, PlayerId } from '@auvergne/engine';
import { CONTENT_VERSION, FACTIONS, HEROES, heroesOf } from '@auvergne/content';
import {
  EXPOSITION_DEPART,
  MAP_VERSION,
  START_KEYS,
  START_POSITIONS,
  START_SETS,
  type StartKey,
} from '@auvergne/map';
import { FactionBlazon, HeroAvatar, Icon, PlayerBanner, banners } from '@auvergne/ui';
import { renderForezMinimap } from './minimap.js';
import { jouerEffet } from './audio-bridge.js';

/* ────────────────────────────── Vocabulaire ─────────────────────────────── */

type Duration = GameSetup['duration'];
type Victory = GameSetup['victory'];
type PlayerKind = GameSetup['players'][number]['kind'];
type AiProfile = NonNullable<GameSetup['players'][number]['aiProfile']>;

const PLAYER_IDS: readonly PlayerId[] = ['P1', 'P2', 'P3', 'P4', 'P5'];

const DURATIONS: readonly { id: Duration; name: string; text: string }[] = [
  { id: 'eclair', name: 'Éclair', text: 'Douze semaines. Croissance accélérée, décisions brutales.' },
  { id: 'standard', name: 'Standard', text: 'Vingt-six semaines. Le rythme pour lequel le Forez est équilibré.' },
  { id: 'saga', name: 'Saga', text: 'Cinquante-deux semaines. Grandes armées, longues rancunes.' },
];

/*
 * Il n'y a plus de mode à choisir : la partie se gagne en prenant tous les
 * châteaux adverses, point. Les anciens modes — Couronne, Maître des Marches,
 * Chronique — permettaient de gagner sans conquérir, et vingt parties
 * mesurées ont montré ce que cela valait : toutes se réglaient au score, et
 * le profil le plus immobile l'emportait quinze fois. La Maison du Trésor et
 * les Sceaux restent dans le jeu comme trésors et titres de prestige.
 */
const VICTOIRE_UNIQUE = {
  name: 'La dernière bannière',
  text: "Prendre tous les châteaux adverses. Une maison qui perd sa dernière cité a sept jours pour en reprendre une — sinon elle s'éteint, héros ou pas.",
} as const;

const AI_PROFILES: readonly { id: AiProfile; name: string; text: string }[] = [
  { id: 'prudent', name: 'Prudent', text: "Fortifie, économise, n'attaque qu'à coup sûr." },
  { id: 'equilibre', name: 'Équilibré', text: 'Développe et harcèle en même temps.' },
  { id: 'agressif', name: 'Agressif', text: 'Sort tôt, prend des risques, vise les cités.' },
  { id: 'expert', name: 'Expert', text: 'Optimise ses tours et exploite chaque faiblesse.' },
];

/**
 * Les deux modes de `docs/04-MULTIJOUEUR.md` §7. Le moteur, les règles et
 * l'interface sont identiques : seule la source de l'état change.
 */
type Mode = 'local' | 'en-ligne';

const MODES: readonly { id: Mode; name: string; text: string }[] = [
  {
    id: 'local',
    name: 'Sur cet appareil',
    text: "Tout le monde joue sur le même écran, ou seul contre l'IA. Sauvegardes locales et serveur.",
  },
  {
    id: 'en-ligne',
    name: 'En ligne, chacun chez soi',
    text: "Un lien à partager, aucun compte. Chaque cousin choisit sa bannière et joue quand il peut, sur plusieurs semaines.",
  },
];

const DEFAULT_NAMES: readonly string[] = [
  'Maison de Granit',
  'Maison des Bois Noirs',
  'Bannière de Cervières',
  'Bannière de Noirétable',
  'Bannière de La Renaudie',
];

interface PlayerDraft {
  name: string;
  faction: FactionId;
  kind: PlayerKind;
  aiProfile: AiProfile;
  start: StartKey;
  hero: HeroId;
}

/* ─────────────────────────────── Utilitaires ────────────────────────────── */

/** Graine aléatoire côté interface : jamais dans la simulation. */
function randomSeed(): number {
  const crypto = globalThis.crypto;
  if (crypto && typeof crypto.getRandomValues === 'function') {
    const buffer = new Uint32Array(1);
    crypto.getRandomValues(buffer);
    return buffer[0] % 1_000_000_000;
  }
  return (Date.now() * 2654435761) % 1_000_000_000;
}

/** Premier héros disponible d'une faction, en évitant ceux déjà pris. */
function pickHero(faction: FactionId, taken: readonly HeroId[]): HeroId {
  const pool = heroesOf(faction);
  const free = pool.find((h) => !taken.includes(h.id));
  return (free ?? pool[0]).id;
}

function makeDrafts(count: number, previous: readonly PlayerDraft[]): PlayerDraft[] {
  const layout = START_SETS[count as 2 | 3 | 4 | 5][0];
  const out: PlayerDraft[] = [];
  for (let i = 0; i < count; i++) {
    const old = previous[i];
    const faction: FactionId = old?.faction ?? (i % 2 === 0 ? 'granit' : 'ermitage');
    const taken = out.map((p) => p.hero);
    out.push({
      name: old?.name ?? DEFAULT_NAMES[i],
      faction,
      kind: old?.kind ?? (i === 0 ? 'humain' : 'ia'),
      aiProfile: old?.aiProfile ?? 'equilibre',
      start: layout[i],
      hero: old && !taken.includes(old.hero) && HEROES[old.hero]?.faction !== otherOf(faction)
        ? old.hero
        : pickHero(faction, taken),
    });
  }
  return out;
}

function otherOf(faction: FactionId): FactionId {
  return faction === 'granit' ? 'ermitage' : 'granit';
}

/* ─────────────────────────── Miniature de la carte ──────────────────────── */

interface MiniProps {
  drafts: readonly PlayerDraft[];
}

/** Carte du Forez en miniature, avec les vraies positions de départ. */
function CarteDepart({ drafts }: MiniProps): ReactElement {
  const [pret, setPret] = useState(false);
  const [dims, setDims] = useState({ cols: 256, rows: 416 });
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    /* Le relief coûte une dizaine de millisecondes : on le calcule après la
       première peinture pour que l'assistant s'affiche immédiatement. */
    let vivant = true;
    const id = window.setTimeout(() => {
      if (!vivant) return;
      const rendu = renderForezMinimap();
      setDims({ cols: rendu.cols, rows: rendu.rows });
      const cible = canvasRef.current;
      if (cible) {
        cible.width = rendu.cols;
        cible.height = rendu.rows;
        const ctx = cible.getContext('2d');
        if (ctx) ctx.drawImage(rendu.canvas, 0, 0);
      }
      setPret(true);
    }, 32);
    return () => {
      vivant = false;
      window.clearTimeout(id);
    };
  }, []);

  const marqueurs = drafts.map((draft, index) => {
    const position = START_POSITIONS[draft.start];
    const banner = banners[index];
    return {
      key: draft.start,
      left: `${((position.at.col + 0.5) / dims.cols) * 100}%`,
      top: `${((position.at.row + 0.5) / dims.rows) * 100}%`,
      color: banner.color,
      label: position.label,
      index: index + 1,
    };
  });

  /* La Maison du Trésor : l'objectif de la victoire par la Couronne. */
  const tresor = { left: `${((145 + 0.5) / dims.cols) * 100}%`, top: `${((113 + 0.5) / dims.rows) * 100}%` };

  return (
    <div className="hmm-acc-carte">
      <div className="hmm-acc-carte-cadre">
        <canvas
          ref={canvasRef}
          className="hmm-acc-carte-toile"
          width={dims.cols}
          height={dims.rows}
          role="img"
          aria-label="Carte du Forez, relief réel, avec les positions de départ"
        />
        {!pret ? <p className="hmm-acc-carte-attente">Levé du relief en cours…</p> : null}
        {pret ? (
          <>
            <span className="hmm-acc-carte-tresor" style={tresor} aria-hidden="true">
              <Icon name="coffre" size={16} />
            </span>
            {marqueurs.map((m) => (
              <span
                key={m.key}
                className="hmm-acc-carte-marque"
                style={{ left: m.left, top: m.top, '--marque': m.color } as CSSProperties}
                title={`${m.label} — bannière ${String(m.index)}`}
              >
                <span className="hmm-acc-carte-marque-pastille" />
                <span className="hmm-acc-carte-marque-nom">{m.label}</span>
              </span>
            ))}
          </>
        ) : null}
      </div>
      <p className="hmm-acc-carte-legende">
        Massif des Bois Noirs — 256 × 416 cases, environ 48 mètres par case. Le coffre marque la Maison du
        Trésor.
      </p>
    </div>
  );
}

/* ─────────────────────────── Petits composants ──────────────────────────── */

interface SegmentProps<T extends string> {
  legend: string;
  hint?: string;
  value: T;
  options: readonly { id: T; name: string; text?: string }[];
  onChange(next: T): void;
  columns?: boolean;
}

function Segments<T extends string>({
  legend,
  hint,
  value,
  options,
  onChange,
  columns,
}: SegmentProps<T>): ReactElement {
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

/* ───────────────────────────── L'assistant ──────────────────────────────── */

export interface NewGamePageProps {
  /** Reçoit un `GameSetup` valide, prêt pour `createGame`. */
  onStart(setup: GameSetup): void;
  /** Retour à la page d'accueil. */
  onBack(): void;
  /**
   * Navigation par fragment, pour le mode « en ligne » : une fois la partie
   * créée, l'hôte est emmené dans son salon (`#/en-ligne/CODE`). Facultatif :
   * en son absence, `location.hash` est écrit directement.
   */
  onNaviguer?(fragment: string): void;
}

/** Assistant de nouvelle partie. */
export function NewGamePage({ onStart, onBack, onNaviguer }: NewGamePageProps): ReactElement {
  const [mode, setMode] = useState<Mode>('local');
  const [count, setCount] = useState(2);
  const [drafts, setDrafts] = useState<PlayerDraft[]>(() => makeDrafts(2, []));
  const [duration, setDuration] = useState<Duration>('standard');
  const victory: Victory = 'derniere_banniere';
  const [seedMode, setSeedMode] = useState<'aleatoire' | 'saisie'>('aleatoire');
  const [seed, setSeed] = useState<number>(() => randomSeed());
  const [dispositionIndex, setDisposition] = useState(0);

  const dispositions = START_SETS[count as 2 | 3 | 4 | 5];

  const changerNombre = useCallback((next: number): void => {
    setCount(next);
    setDisposition(0);
    setDrafts((previous) => makeDrafts(next, previous));
  }, []);

  const appliquerDisposition = useCallback(
    (index: number): void => {
      setDisposition(index);
      const layout = START_SETS[count as 2 | 3 | 4 | 5][index];
      setDrafts((previous) => previous.map((p, i) => ({ ...p, start: layout[i] })));
    },
    [count],
  );

  const majJoueur = useCallback((index: number, patch: Partial<PlayerDraft>): void => {
    setDrafts((previous) =>
      previous.map((draft, i) => {
        if (i !== index) return draft;
        const next = { ...draft, ...patch };
        /* Changer de faction peut rendre le héros impossible : on le remplace. */
        if (patch.faction && HEROES[next.hero] && HEROES[next.hero].faction === otherOf(patch.faction)) {
          const taken = previous.filter((_, k) => k !== index).map((p) => p.hero);
          next.hero = pickHero(patch.faction, taken);
        }
        return next;
      }),
    );
  }, []);

  /* Une position de départ ne peut pas être partagée : on échange les deux. */
  const changerDepart = useCallback((index: number, start: StartKey): void => {
    setDrafts((previous) => {
      const occupant = previous.findIndex((p) => p.start === start);
      return previous.map((draft, i) => {
        if (i === index) return { ...draft, start };
        if (i === occupant) return { ...draft, start: previous[index].start };
        return draft;
      });
    });
  }, []);

  const anomalies = useMemo((): string[] => {
    const out: string[] = [];
    const starts = new Set(drafts.map((d) => d.start));
    if (starts.size !== drafts.length) out.push('Deux bannières partagent la même position de départ.');
    const heroes = new Set(drafts.map((d) => d.hero));
    if (heroes.size !== drafts.length) out.push('Deux bannières ont choisi le même héros.');
    if (drafts.some((d) => d.name.trim().length === 0)) out.push('Chaque bannière doit porter un nom.');
    if (!drafts.some((d) => d.kind === 'humain')) out.push('Au moins une bannière doit être tenue par un humain.');
    if (!Number.isInteger(seed) || seed < 0) out.push('La graine doit être un entier positif.');
    return out;
  }, [drafts, seed]);

  const setup = useMemo((): GameSetup => {
    return {
      seed,
      mapVersion: MAP_VERSION,
      contentVersion: CONTENT_VERSION,
      duration,
      victory,
      players: drafts.map((draft, index) => ({
        id: PLAYER_IDS[index],
        name: draft.name.trim(),
        faction: draft.faction,
        kind: draft.kind,
        ...(draft.kind === 'ia' ? { aiProfile: draft.aiProfile } : {}),
        start: draft.start,
        hero: draft.hero,
      })),
    };
  }, [drafts, duration, victory, seed]);

  /** Navigation du mode en ligne, avec repli sur `location.hash`. */
  const naviguer = useCallback(
    (fragment: string): void => {
      if (onNaviguer !== undefined) onNaviguer(fragment);
      else if (typeof location !== 'undefined') location.hash = fragment;
    },
    [onNaviguer],
  );

  const lancer = useCallback((): void => {
    if (anomalies.length > 0) return;
    jouerEffet('clic_lourd');
    onStart(setup);
  }, [anomalies, onStart, setup]);

  return (
    <div className="hmm-acc-ecran hmm-acc-ecran--assistant">
      <header className="hmm-acc-ecran-tete">
        <button type="button" className="hmm-acc-retour" onClick={onBack}>
          <Icon name="chevron" size={18} />
          <span>Retour à l'accueil</span>
        </button>
        <h2 className="hmm-acc-ecran-titre">Nouvelle partie</h2>
        <p className="hmm-acc-ecran-sous-titre">
          Cinq capitales, deux maisons, une seule Couronne. Composez les bannières, puis la campagne.
        </p>
      </header>

      <div className="hmm-acc-assistant">
        <div className="hmm-acc-assistant-colonne">
          <section className="hmm-acc-bloc" aria-labelledby="bloc-mode">
            <h3 className="hmm-acc-bloc-titre" id="bloc-mode">
              Comment jouez-vous ?
            </h3>
            <Segments<Mode>
              legend="Mode de partie"
              hint="Le moteur, les règles et l'interface sont les mêmes dans les deux cas : seule la source de l'état change."
              value={mode}
              options={MODES}
              onChange={(next): void => setMode(next)}
              columns
            />
          </section>

          <section className="hmm-acc-bloc" aria-labelledby="bloc-bannieres">
            <h3 className="hmm-acc-bloc-titre" id="bloc-bannieres">
              Les bannières
            </h3>
            {mode === 'en-ligne' ? (
              <p className="hmm-acc-aide">
                En ligne, chaque cousin choisit lui-même son nom, son château, son héros et sa
                position de départ dans le salon. Vous ne fixez ici que le nombre de bannières —
                les places non réclamées pourront être confiées à l&apos;IA.
              </p>
            ) : null}
            <fieldset className="hmm-acc-champ">
              <legend className="hmm-acc-legende">Nombre de bannières</legend>
              <div className="hmm-acc-compteur" role="radiogroup" aria-label="Nombre de bannières">
                {[2, 3, 4, 5].map((n) => (
                  <button
                    key={n}
                    type="button"
                    role="radio"
                    aria-checked={n === count}
                    className={`hmm-acc-compteur-case${n === count ? ' est-actif' : ''}`}
                    onClick={(): void => {
                      jouerEffet('clic');
                      changerNombre(n);
                    }}
                  >
                    <span className="hmm-acc-compteur-chiffre">{n}</span>
                    <span className="hmm-acc-compteur-mot">{n === 2 ? 'duel' : 'maisons'}</span>
                  </button>
                ))}
              </div>
            </fieldset>

            <fieldset className="hmm-acc-champ" hidden={mode === 'en-ligne'}>
              <legend className="hmm-acc-legende">Disposition équilibrée</legend>
              <p className="hmm-acc-aide">
                Combinaisons validées par la carte : distances au centre et directions d'expansion comparables.
              </p>
              <div className="hmm-acc-segments" role="radiogroup" aria-label="Disposition équilibrée">
                {dispositions.map((layout, index) => (
                  <button
                    key={layout.join('-')}
                    type="button"
                    role="radio"
                    aria-checked={index === dispositionIndex}
                    className={`hmm-acc-segment${index === dispositionIndex ? ' est-actif' : ''}`}
                    onClick={(): void => {
                      jouerEffet('clic');
                      appliquerDisposition(index);
                    }}
                  >
                    <span className="hmm-acc-segment-nom">Disposition {index + 1}</span>
                    <span className="hmm-acc-segment-texte">
                      {layout.map((key) => START_POSITIONS[key].label).join(' · ')}
                    </span>
                  </button>
                ))}
              </div>
            </fieldset>

            <ul className="hmm-acc-joueurs" hidden={mode === 'en-ligne'}>
              {drafts.map((draft, index) => {
                const faction = FACTIONS[draft.faction];
                const pool = heroesOf(draft.faction);
                const heroDef = HEROES[draft.hero];
                return (
                  <li className="hmm-acc-joueur" key={PLAYER_IDS[index]}>
                    <div className="hmm-acc-joueur-tete">
                      <PlayerBanner player={(index + 1) as 1 | 2 | 3 | 4 | 5} size={44} />
                      <label className="hmm-acc-joueur-nom">
                        <span className="hmm-acc-sr">Nom de la bannière {index + 1}</span>
                        <input
                          type="text"
                          value={draft.name}
                          maxLength={28}
                          onChange={(event): void => majJoueur(index, { name: event.target.value })}
                        />
                      </label>
                      <span className="hmm-acc-joueur-couleur">{banners[index].label}</span>
                    </div>

                    <div className="hmm-acc-joueur-grille">
                      <div className="hmm-acc-factions" role="radiogroup" aria-label={`Maison de la bannière ${index + 1}`}>
                        {(['granit', 'ermitage'] as const).map((id) => (
                          <button
                            key={id}
                            type="button"
                            role="radio"
                            aria-checked={draft.faction === id}
                            className={`hmm-acc-faction${draft.faction === id ? ' est-actif' : ''}`}
                            onClick={(): void => {
                              jouerEffet('clic');
                              majJoueur(index, { faction: id });
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

                      <label className="hmm-acc-select">
                        <span>Position de départ</span>
                        <select
                          value={draft.start}
                          onChange={(event): void => changerDepart(index, event.target.value as StartKey)}
                        >
                          {START_KEYS.map((key) => (
                            <option key={key} value={key}>
                              {START_POSITIONS[key].label}
                            </option>
                          ))}
                        </select>
                      </label>
                      {/*
                        Ce que vaut le siège choisi, en une phrase. Les cinq
                        capitales sont des lieux réels du Forez et la géographie
                        est fixe : Cervières est voisine de Noirétable dans la
                        vraie vie comme sur la carte, et ce voisinage se paie —
                        mesuré, la plus isolée des cinq gagne quarante-quatre
                        parties sur cent contre huit à la plus exposée. Plutôt
                        que de feindre une symétrie que la géographie n'a pas, on
                        la dit : c'est ainsi qu'on joue à HMM3, où l'on regarde
                        la carte avant de prendre sa place.
                      */}
                      <p className="hmm-acc-exposition">{EXPOSITION_DEPART[draft.start]}</p>

                      <div className="hmm-acc-controle" role="radiogroup" aria-label={`Contrôle de la bannière ${index + 1}`}>
                        {(['humain', 'ia'] as const).map((kind) => (
                          <button
                            key={kind}
                            type="button"
                            role="radio"
                            aria-checked={draft.kind === kind}
                            className={`hmm-acc-puce${draft.kind === kind ? ' est-actif' : ''}`}
                            onClick={(): void => {
                              jouerEffet('clic');
                              majJoueur(index, { kind });
                            }}
                          >
                            {kind === 'humain' ? 'Humain' : 'Adversaire'}
                          </button>
                        ))}
                      </div>

                      {draft.kind === 'ia' ? (
                        <label className="hmm-acc-select">
                          <span>Profil de l'adversaire</span>
                          <select
                            value={draft.aiProfile}
                            onChange={(event): void =>
                              majJoueur(index, { aiProfile: event.target.value as AiProfile })
                            }
                          >
                            {AI_PROFILES.map((profile) => (
                              <option key={profile.id} value={profile.id}>
                                {profile.name} — {profile.text}
                              </option>
                            ))}
                          </select>
                        </label>
                      ) : (
                        <p className="hmm-acc-note">Bannière tenue par un joueur humain.</p>
                      )}

                      <label className="hmm-acc-select hmm-acc-select--heros">
                        <span>Héros de départ</span>
                        <select
                          value={draft.hero}
                          onChange={(event): void => majJoueur(index, { hero: event.target.value })}
                        >
                          {pool.map((h) => (
                            <option key={h.id} value={h.id}>
                              {h.name} — {h.class}
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

                      <p className="hmm-acc-mecanique">
                        <strong>{faction.mechanic.name}</strong> — {faction.mechanic.description}
                      </p>
                    </div>
                  </li>
                );
              })}
            </ul>
          </section>

          <section className="hmm-acc-bloc" aria-labelledby="bloc-campagne">
            <h3 className="hmm-acc-bloc-titre" id="bloc-campagne">
              La campagne
            </h3>
            <Segments<Duration>
              legend="Durée"
              value={duration}
              options={DURATIONS}
              onChange={(next): void => setDuration(next)}
              columns
            />
            <fieldset className="hmm-acc-champ">
              <legend className="hmm-acc-legende">Victoire</legend>
              <p className="hmm-acc-aide">
                <strong>{VICTOIRE_UNIQUE.name}.</strong> {VICTOIRE_UNIQUE.text}
              </p>
            </fieldset>

            <fieldset className="hmm-acc-champ">
              <legend className="hmm-acc-legende">Graine</legend>
              <p className="hmm-acc-aide">
                La graine décide du contenu tiré au sort : gardes, artefacts, gisements, quêtes. Le relief, lui,
                ne change jamais. Deux parties de même graine se déroulent à l'identique.
              </p>
              <div className="hmm-acc-graine">
                <div className="hmm-acc-segments" role="radiogroup" aria-label="Origine de la graine">
                  {(['aleatoire', 'saisie'] as const).map((mode) => (
                    <button
                      key={mode}
                      type="button"
                      role="radio"
                      aria-checked={seedMode === mode}
                      className={`hmm-acc-segment${seedMode === mode ? ' est-actif' : ''}`}
                      onClick={(): void => {
                        jouerEffet('clic');
                        setSeedMode(mode);
                        if (mode === 'aleatoire') setSeed(randomSeed());
                      }}
                    >
                      <span className="hmm-acc-segment-nom">{mode === 'aleatoire' ? 'Aléatoire' : 'Saisie'}</span>
                    </button>
                  ))}
                </div>
                <div className="hmm-acc-graine-valeur">
                  <label>
                    <span className="hmm-acc-sr">Valeur de la graine</span>
                    <input
                      type="text"
                      inputMode="numeric"
                      value={String(seed)}
                      readOnly={seedMode === 'aleatoire'}
                      onChange={(event): void => {
                        const digits = event.target.value.replace(/[^0-9]/g, '').slice(0, 10);
                        setSeed(digits.length === 0 ? 0 : Number(digits));
                      }}
                    />
                  </label>
                  <button
                    type="button"
                    className="hmm-acc-relancer"
                    onClick={(): void => {
                      jouerEffet('clic');
                      setSeed(randomSeed());
                    }}
                  >
                    <Icon name="fortune" size={18} />
                    <span>Retirer une graine</span>
                  </button>
                </div>
              </div>
            </fieldset>
          </section>
        </div>

        <aside className="hmm-acc-assistant-aside" aria-label="Récapitulatif de la campagne">
          <div className="hmm-acc-parchemin">
            <h3 className="hmm-acc-bloc-titre">Le Forez</h3>
            <CarteDepart drafts={drafts} />
            <dl className="hmm-acc-recap">
              <div>
                <dt>Bannières</dt>
                <dd>{count}</dd>
              </div>
              <div>
                <dt>Durée</dt>
                <dd>{DURATIONS.find((d) => d.id === duration)?.name}</dd>
              </div>
              <div>
                <dt>Victoire</dt>
                <dd>{VICTOIRE_UNIQUE.name}</dd>
              </div>
              <div>
                <dt>Graine</dt>
                <dd className="hmm-acc-tabulaire">{seed}</dd>
              </div>
              <div>
                <dt>Carte</dt>
                <dd className="hmm-acc-tabulaire">{MAP_VERSION}</dd>
              </div>
              <div>
                <dt>Contenu</dt>
                <dd className="hmm-acc-tabulaire">{CONTENT_VERSION}</dd>
              </div>
            </dl>
            {mode === 'local' && anomalies.length > 0 ? (
              <ul className="hmm-acc-anomalies">
                {anomalies.map((a) => (
                  <li key={a}>
                    <Icon name="alerte" size={16} />
                    <span>{a}</span>
                  </li>
                ))}
              </ul>
            ) : null}
            {mode === 'en-ligne' ? (
              /* En ligne, la composition des bannières appartient aux cousins :
                 l'assistant passe la main à `#/en-ligne`, qui crée la partie et
                 rend le lien à partager. */
              <button
                type="button"
                className="hmm-acc-lancer"
                onClick={(): void => {
                  jouerEffet('clic_lourd');
                  naviguer('#/en-ligne');
                }}
              >
                <Icon name="banniere" size={22} />
                <span>Ouvrir le salon en ligne</span>
              </button>
            ) : (
              <button
                type="button"
                className="hmm-acc-lancer"
                disabled={anomalies.length > 0}
                onClick={lancer}
              >
                <Icon name="banniere" size={22} />
                <span>Lever les bannières</span>
              </button>
            )}
          </div>
        </aside>
      </div>
    </div>
  );
}
