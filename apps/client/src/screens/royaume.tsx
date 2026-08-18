/**
 * Vue du royaume — `#/partie/royaume` et `#/demo/royaume`.
 *
 * L'écran de commandement : trésor et revenu du jour, cités avec leur
 * production, héros en campagne, avancement des objectifs, les cinq Sceaux des
 * Marches, la gabelle, le temps, et le journal des derniers jours.
 *
 * Tous les nombres sont demandés au moteur (`playerIncomeOf`, `townIncome`,
 * `victoryProgress`, `objectiveSentence`, `gabelleReport`, `upkeepOf`) : cet
 * écran ne calcule rien lui-même.
 */

import type { ReactElement } from 'react';
import {
  RESOURCE_KEYS,
  dayOf,
  gabelleReport,
  objectiveSentence,
  playerIncomeOf,
  stackPower,
  townIncome,
  upkeepOf,
  victoryProgress,
  weekOf,
} from '@auvergne/engine';
import type { GameState, PlayerId, Resources, SealId, TownState } from '@auvergne/engine';
import { CREATURES, HEROES } from '@auvergne/content';
import {
  Badge,
  Divider,
  HeroAvatar,
  Icon,
  Panel,
  ProgressBar,
  ResourceBar,
  Stat,
} from '@auvergne/ui';
import { Page } from './shell.js';
import {
  NOMS_GABELLE,
  NOMS_METEO,
  NOMS_SCEAUX,
  NOMS_VICTOIRE,
  calendrierLong,
  nombre,
  pluriel,
  signe,
} from './format.js';
import { navigate } from '../router.js';

const SCEAUX: readonly SealId[] = ['hautes_futaies', 'farges', 'pamole', 'hermitage', 'brumes'];

/* ─────────────────────────────── Le trésor ──────────────────────────────── */

function Tresor({ state, player }: { state: GameState; player: PlayerId }): ReactElement {
  const p = state.players[player];
  const revenu = playerIncomeOf(state, player);
  const entretien = upkeepOf(state, player);
  const solde = (revenu.ecus ?? 0) - entretien;
  return (
    <Panel
      title="Trésor et revenus"
      subtitle="Ce que la bannière encaisse chaque jour"
      matter="parchemin"
      padding="normal"
    >
      <ResourceBar values={p.resources as Partial<Resources>} income={revenu} />
      <Divider label="Bilan du jour" />
      <div className="fiche__stats">
        <Stat
          label="Revenu brut"
          value={`${nombre(revenu.ecus ?? 0)} écus`}
          icon={<Icon name="ressource_ecus" size={22} />}
          tone="or"
        />
        <Stat
          label="Entretien des armées"
          value={`${nombre(entretien)} écus`}
          icon={<Icon name="epee" size={22} />}
          tone={entretien > 0 ? 'defaveur' : 'neutre'}
        />
        <Stat
          label="Solde net"
          value={`${signe(solde)} écus`}
          icon={<Icon name="coffre" size={22} />}
          tone={solde >= 0 ? 'faveur' : 'defaveur'}
        />
        <Stat
          label="Réputation"
          value={signe(p.reputation)}
          icon={<Icon name="banniere" size={22} />}
          tone={p.reputation >= 0 ? 'faveur' : 'defaveur'}
        />
      </div>
      <Divider label="Matières premières produites par jour" />
      <ul className="jeu-liste-nue royaume__matieres">
        {RESOURCE_KEYS.filter((k) => k !== 'ecus').map((k) => (
          <li className="royaume__vignette" key={k}>
            <span className="fiche__icone">
              <Icon name={`ressource_${k}`} size={32} />
            </span>
            <span className="royaume__vignette-corps">
              <span className="fiche__ligne-titre jeu-tabulaire">{nombre(p.resources[k])}</span>
              <span className="fiche__ligne-detail">
                {signe(revenu[k] ?? 0)} par jour
              </span>
            </span>
          </li>
        ))}
      </ul>
    </Panel>
  );
}

/* ──────────────────────────────── Les cités ─────────────────────────────── */

function VignetteCite({ state, town }: { state: GameState; town: TownState }): ReactElement {
  const revenu = townIncome(state, town);
  const garnison = stackPower(town.garrison);
  return (
    <li className="royaume__vignette">
      <span className="fiche__icone">
        <Icon name={town.isCapital ? 'tour' : 'cite'} size={32} />
      </span>
      <span className="royaume__vignette-corps">
        <span className="fiche__ligne-titre">{town.name}</span>
        <span className="fiche__ligne-detail">
          {pluriel(town.built.length, 'bâtiment')} · {nombre(revenu.ecus ?? 0)} écus/jour ·
          garnison {nombre(garnison)}
        </span>
        <span className="fiche__ligne-detail">
          Agitation {town.unrest}&#8239;% · charte {town.charter ?? 'non signée'}
        </span>
      </span>
      {town.isCapital ? <Badge tone="or">Capitale</Badge> : null}
    </li>
  );
}

function Cites({ state, player }: { state: GameState; player: PlayerId }): ReactElement {
  const cites = state.players[player].towns
    .map((uid) => state.towns[uid])
    .filter((t): t is TownState => Boolean(t));
  return (
    <Panel
      title="Cités"
      subtitle={pluriel(cites.length, 'place tenue', 'places tenues')}
      matter="parchemin"
      padding="normal"
    >
      {cites.length === 0 ? (
        <p className="ecran__note">La bannière ne tient plus aucune place.</p>
      ) : (
        <ul className="jeu-liste-nue royaume__cartes">
          {cites.map((t) => (
            <VignetteCite key={t.uid} state={state} town={t} />
          ))}
        </ul>
      )}
    </Panel>
  );
}

/* ──────────────────────────────── Les héros ─────────────────────────────── */

function Heros({ state, player, demo }: { state: GameState; player: PlayerId; demo: boolean }): ReactElement {
  const heros = state.players[player].heroes
    .map((uid) => state.heroes[uid])
    .filter((h): h is NonNullable<typeof h> => Boolean(h));
  return (
    <Panel
      title="Héros"
      subtitle={`${heros.length} sur quatre`}
      matter="parchemin"
      padding="normal"
    >
      {heros.length === 0 ? (
        <p className="ecran__note">Aucun héros ne porte les couleurs de la bannière.</p>
      ) : (
        <ul className="jeu-liste-nue royaume__cartes">
          {heros.map((h) => {
            const def = HEROES[h.def];
            const troupes = h.army.filter(Boolean).length;
            const tete = h.army.find(Boolean);
            return (
              <li key={h.uid}>
                <button
                  type="button"
                  className="royaume__vignette ecran__vignette-bouton"
                  onClick={(): void =>
                    navigate(demo ? '#/demo/heros' : { name: 'partie-heros', uid: h.uid })
                  }
                >
                  <HeroAvatar heroId={h.def} size={52} />
                  <span className="royaume__vignette-corps">
                    <span className="fiche__ligne-titre">
                      {def?.name ?? h.def} — niveau {h.level}
                    </span>
                    <span className="fiche__ligne-detail">
                      {pluriel(troupes, 'pile')} · puissance {nombre(stackPower(h.army))}
                      {tete ? ` · ${CREATURES[tete.creature]?.namePlural ?? tete.creature}` : ''}
                    </span>
                    <span className="fiche__ligne-detail">
                      Marche {nombre(h.movement)} / {nombre(h.movementMax)} · mana {h.mana} / {h.manaMax}
                    </span>
                  </span>
                  <Icon name="chevron" size={20} />
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </Panel>
  );
}

/* ────────────────────────────── Les objectifs ───────────────────────────── */

function Objectifs({ state, player }: { state: GameState; player: PlayerId }): ReactElement {
  const progres = victoryProgress(state);
  const mien = progres.perPlayer.find((l) => l.player === player);
  const sceauxTenus = state.players[player].seals.length;
  return (
    <Panel
      title="Objectifs"
      subtitle={NOMS_VICTOIRE[progres.mode] ?? progres.mode}
      matter="parchemin"
      padding="normal"
    >
      <p className="fiche__bio">{objectiveSentence(state)}</p>
      <ProgressBar
        label="Sceaux des Marches réunis"
        value={sceauxTenus}
        max={progres.sealsRequired}
        tone="or"
        caption={`${sceauxTenus} sur ${progres.sealsRequired} requis pour ouvrir la Maison du Trésor`}
        marks={[1, 2, 3, 4]}
      />
      {progres.claim ? (
        <p className="ecran__note ecran__accent">
          Proclamation en cours par {state.players[progres.claim.by]?.name ?? progres.claim.by} —{' '}
          {pluriel(progres.claim.remaining, 'jour restant', 'jours restants')}.
        </p>
      ) : (
        <p className="ecran__note">Aucune proclamation n’est en cours sur la Maison du Trésor.</p>
      )}

      <Divider label="Les cinq Sceaux des Marches" />
      <ul className="jeu-liste-nue">
        {SCEAUX.map((id) => {
          const sceau = state.seals[id];
          const detenteur = sceau?.owner ? state.players[sceau.owner] : null;
          const amoi = sceau?.owner === player;
          return (
            <li className="royaume__objectif" key={id}>
              <span className={amoi ? 'royaume__sceau royaume__sceau--pris' : 'royaume__sceau'}>
                {NOMS_SCEAUX[id].slice(0, 1)}
              </span>
              <span className="royaume__vignette-corps">
                <span className="fiche__ligne-titre">{NOMS_SCEAUX[id]}</span>
                <span className="fiche__ligne-detail">
                  {detenteur ? `Tenu par ${detenteur.name}` : 'Encore libre'} · colonne{' '}
                  {sceau?.at.col ?? '?'}, ligne {sceau?.at.row ?? '?'}
                </span>
              </span>
              {amoi ? <Badge tone="or">À nous</Badge> : detenteur ? <Badge tone="grenat">Adverse</Badge> : null}
            </li>
          );
        })}
      </ul>

      <Divider label="Tableau des bannières" />
      <ul className="jeu-liste-nue">
        {progres.perPlayer.map((ligne) => {
          const j = state.players[ligne.player];
          return (
            <li className="royaume__objectif" key={ligne.player}>
              <span
                className="emplacement__pastille"
                style={{ backgroundColor: j?.color ?? '#8A8478', width: 18, height: 18 }}
              />
              <span className="royaume__vignette-corps">
                <span className="fiche__ligne-titre">{j?.name ?? ligne.player}</span>
                <span className="fiche__ligne-detail">
                  {pluriel(ligne.seals, 'sceau', 'sceaux')} · {pluriel(ligne.centers, 'centre')} · score{' '}
                  {nombre(ligne.score)}
                </span>
              </span>
              {ligne.alive ? null : <Badge tone="neutre">Abattue</Badge>}
              {mien && ligne.player === player ? <Badge tone="or">Vous</Badge> : null}
            </li>
          );
        })}
      </ul>
    </Panel>
  );
}

/* ──────────────────────── Le pays : temps, gabelle, journal ─────────────── */

function Pays({ state }: { state: GameState }): ReactElement {
  const gabelle = gabelleReport(state);
  return (
    <Panel title="Le pays" matter="parchemin" padding="normal">
      <div className="fiche__stats">
        <Stat
          label="Temps du jour"
          value={NOMS_METEO[state.weather.current]}
          icon={<Icon name="soleil" size={22} />}
        />
        <Stat
          label="Gabelle"
          value={NOMS_GABELLE[state.gabelle]}
          icon={<Icon name="ressource_sel" size={22} />}
        />
        <Stat
          label="Calendrier"
          value={`Jour ${dayOf(state.turn)}`}
          icon={<Icon name="sablier" size={22} />}
          hint={`sem. ${weekOf(state.turn)}`}
        />
      </div>
      <p className="ecran__note">
        Prévisions&#8239;: demain {NOMS_METEO[state.weather.forecast[0]].toLocaleLowerCase('fr-FR')},
        après-demain {NOMS_METEO[state.weather.forecast[1]].toLocaleLowerCase('fr-FR')}. La gabelle
        rapporte {nombre(gabelle.ecus)} écus et {nombre(gabelle.sel)} de sel par jour, pour{' '}
        {signe(gabelle.unrest)} d’agitation dans les cités.
      </p>
      <Divider label="Journal des derniers jours" />
      {state.journal.length === 0 ? (
        <p className="ecran__note">Le chroniqueur n’a encore rien consigné.</p>
      ) : (
        <ul className="jeu-liste-nue">
          {state.journal.slice(0, 8).map((entree, i) => (
            <li className="fiche__ligne" key={`${entree.turn}-${i}`}>
              <span className="ecran__pile-numero">{entree.turn}</span>
              <span className="fiche__ligne-corps">
                <span className="fiche__ligne-detail">{entree.text}</span>
              </span>
              <Badge tone="neutre" size="compact">
                {entree.kind}
              </Badge>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}

/* ─────────────────────────────── L'écran ────────────────────────────────── */

export interface VueRoyaumeProps {
  state: GameState;
  player: PlayerId;
  /** vrai sur `#/demo/royaume` : les liens restent dans la démonstration */
  demo?: boolean;
}

/** Vue d'ensemble du royaume. */
export function VueRoyaume({ state, player, demo = false }: VueRoyaumeProps): ReactElement {
  const p = state.players[player];
  if (!p) {
    return (
      <Page titre="Royaume">
        <Panel title="Bannière introuvable" matter="parchemin" padding="normal">
          <p className="ecran__note">Cette partie ne compte aucune bannière «&#8239;{player}&#8239;».</p>
        </Panel>
      </Page>
    );
  }
  return (
    <Page titre={p.name} note={calendrierLong(state.turn)}>
      {/* Trois bandes : le trésor sur toute la largeur, puis deux paires. Une
          grille unique laisserait des colonnes vides à droite dès que le
          nombre de panneaux ne tombe pas juste. */}
      <div className="royaume__pile">
        <Tresor state={state} player={player} />
        <div className="royaume__duo">
          <Cites state={state} player={player} />
          <Heros state={state} player={player} demo={demo} />
        </div>
        <div className="royaume__duo">
          <Objectifs state={state} player={player} />
          <Pays state={state} />
        </div>
      </div>
    </Page>
  );
}
