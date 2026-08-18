/**
 * Fiche de héros — l'écran `#/partie/heros/:uid` et `#/demo/heros`.
 *
 * Elle montre **tout** ce qu'un joueur doit savoir d'un héros : identité,
 * niveau et expérience, les quatre caractéristiques primaires majorées par les
 * artefacts, les valeurs dérivées calculées par le moteur (marche, vision,
 * mana, moral, fortune), les dix emplacements d'équipement plus le sac, les
 * compétences avec leur rang, les sorts rangés par école, et l'armée dans ses
 * sept emplacements.
 *
 * Aucune règle n'est calculée ici (non négociable n°4) : chaque nombre vient de
 * `@auvergne/engine` (`heroStats`, `heroProgress`, `wornArtifacts`,
 * `describeEffectList`, `stackPower`) ou du contenu.
 */

import type { ReactElement } from 'react';
import {
  heroProgress,
  heroStats,
  primaryStats,
  stackPower,
  wornArtifacts,
  describeEffectList,
  ARTIFACT_RARITY_LABELS,
} from '@auvergne/engine';
import type { ArtifactSlot, GameState, HeroInstance, SpellSchool } from '@auvergne/engine';
import { ARTIFACTS, CREATURES, HEROES, SKILLS, SPELLS } from '@auvergne/content';
import {
  Badge,
  Divider,
  HeroPortrait,
  Icon,
  Panel,
  ProgressBar,
  Stat,
  rarityColors,
  schoolColors,
} from '@auvergne/ui';
import { Page } from './shell.js';
import { NOMS_EMPLACEMENTS, ORDRE_EMPLACEMENTS, calendrier, nombre, pluriel } from './format.js';

/* ─────────────────────────────── Outillage ──────────────────────────────── */

const ECOLES: readonly SpellSchool[] = ['braises', 'sources', 'brumes', 'racines'];

const NOMS_ECOLES: Readonly<Record<SpellSchool, string>> = {
  braises: 'Braises',
  sources: 'Sources',
  brumes: 'Brumes',
  racines: 'Racines',
};

/** Libellé de la spécialité, en français, sans logique de règles. */
function specialite(heroId: string): string {
  const def = HEROES[heroId];
  if (!def) return 'Spécialité inconnue';
  const s = def.specialty;
  switch (s.kind) {
    case 'creature':
      return `${CREATURES[s.creature]?.namePlural ?? s.creature} : +${s.perLevelBp / 100} % par niveau`;
    case 'spell':
      return `${SPELLS[s.spell]?.name ?? s.spell} : coût réduit, durée allongée`;
    case 'school':
      return `École des ${NOMS_ECOLES[s.school]} : coût réduit`;
    case 'skill':
      return `${SKILLS[s.skill]?.name ?? s.skill} : effet renforcé`;
    case 'resource':
      return `${s.perDay} de ${s.resource === 'filDor' ? "fil d'or" : s.resource} par jour`;
    case 'movement':
      return `+${s.bonus} points de marche par jour`;
    case 'siege':
      return 'Sièges : dégâts de machine majorés';
    case 'vision':
      return `+${s.bonus} cases de vision`;
    case 'weather':
      return 'Lit le temps deux jours à l’avance';
    case 'diplomacy':
      return 'Parlemente mieux avec les compagnies neutres';
    case 'build_discount':
      return 'Chantiers moins coûteux dans ses cités';
    default:
      return 'Spécialité propre';
  }
}

/* ──────────────────────────── Blocs de la fiche ─────────────────────────── */

function Identite({ hero }: { hero: HeroInstance }): ReactElement {
  const def = HEROES[hero.def];
  return (
    <Panel matter="parchemin" padding="normal" raised>
      <div className="fiche__identite">
        <HeroPortrait heroId={hero.def} size={196} frame="enluminure" showName={false} />
        <div>
          <h2 className="ecran__titre-carte">{def?.name ?? hero.def}</h2>
          <p className="fiche__classe">
            {def?.class ?? 'Héros'} · {def?.title ?? 'sans titre'}
          </p>
        </div>
        <div className="jeu-colonnes" style={{ justifyContent: 'center' }}>
          <Badge tone="or">Niveau {hero.level}</Badge>
          <Badge tone={hero.owner === 'P1' ? 'grenat' : 'sinople'}>Bannière {hero.owner}</Badge>
          {hero.inTown ? <Badge tone="neutre">En cité</Badge> : <Badge tone="neutre">En campagne</Badge>}
        </div>
        <p className="fiche__bio">{def?.bio ?? 'Sa chronique reste à écrire.'}</p>
        <p className="fiche__bio ecran__accent">
          <strong>Spécialité —</strong> {specialite(hero.def)}
        </p>
      </div>
    </Panel>
  );
}

function Progression({ hero }: { hero: HeroInstance }): ReactElement {
  const p = heroProgress(hero);
  const dansNiveau = Math.max(0, p.xp - p.xpForLevel);
  const palier = Math.max(1, p.xpForNext - p.xpForLevel);
  return (
    <Panel title="Expérience" matter="parchemin" padding="normal">
      <ProgressBar
        label={`Progression vers le niveau ${p.level + 1}`}
        value={dansNiveau}
        max={palier}
        tone="or"
        caption={
          p.toNext > 0
            ? `${nombre(p.xp)} points · encore ${nombre(p.toNext)} avant le niveau ${p.level + 1}`
            : `${nombre(p.xp)} points · niveau maximal atteint`
        }
      />
      {p.pending ? (
        <p className="ecran__note ecran__accent">
          Une montée de niveau attend son choix de compétence.
        </p>
      ) : null}
    </Panel>
  );
}

function Caracteristiques({ state, hero }: { state: GameState; hero: HeroInstance }): ReactElement {
  const stats = heroStats(state, hero);
  const brutes = primaryStats(hero);
  return (
    <Panel title="Caractéristiques" matter="parchemin" padding="normal">
      <div className="fiche__stats">
        <Stat label="Vaillance" value={brutes.vaillance} icon={<Icon name="epee" size={22} />} tone="faveur" />
        <Stat label="Garde" value={brutes.garde} icon={<Icon name="bouclier" size={22} />} tone="faveur" />
        <Stat label="Mystique" value={brutes.mystique} icon={<Icon name="etoile" size={22} />} tone="neutre" />
        <Stat label="Savoir" value={brutes.savoir} icon={<Icon name="livre" size={22} />} tone="neutre" />
      </div>
      <Divider label="Valeurs dérivées" />
      <div className="fiche__stats">
        <Stat
          label="Marche du jour"
          value={`${nombre(hero.movement)} / ${nombre(stats.movementMax)}`}
          icon={<Icon name="pas" size={22} />}
        />
        <Stat
          label="Mana"
          value={`${nombre(hero.mana)} / ${nombre(stats.manaMax)}`}
          icon={<Icon name="goutte" size={22} />}
        />
        <Stat label="Vision" value={pluriel(stats.vision, 'case')} icon={<Icon name="oeil" size={22} />} />
        <Stat
          label="Moral"
          value={stats.morale >= 0 ? `+${stats.morale}` : `${stats.morale}`}
          icon={<Icon name="moral" size={22} />}
          tone={stats.morale >= 0 ? 'faveur' : 'defaveur'}
        />
        <Stat
          label="Fortune"
          value={stats.fortune >= 0 ? `+${stats.fortune}` : `${stats.fortune}`}
          icon={<Icon name="fortune" size={22} />}
          tone={stats.fortune >= 0 ? 'faveur' : 'defaveur'}
        />
        <Stat
          label="Puissance d’armée"
          value={nombre(stackPower(hero.army))}
          icon={<Icon name="combat" size={22} />}
          tone="or"
        />
      </div>
    </Panel>
  );
}

function Equipement({ hero }: { hero: HeroInstance }): ReactElement {
  const portes = new Map(wornArtifacts(hero).map((w) => [w.slot, w]));
  return (
    <Panel
      title="Artefacts"
      subtitle={
        portes.size === 10
          ? 'Les dix emplacements sont garnis'
          : `${portes.size} emplacement${portes.size > 1 ? 's' : ''} garni${portes.size > 1 ? 's' : ''} sur dix`
      }
      matter="parchemin"
      padding="normal"
    >
      <div className="fiche__artefacts">
        {ORDRE_EMPLACEMENTS.map((slot: ArtifactSlot) => {
          const porte = portes.get(slot);
          const def = porte?.def ?? null;
          const teinte = def ? rarityColors[def.rarity] : undefined;
          return (
            <div
              key={slot}
              className={porte ? 'fiche__artefact' : 'fiche__artefact fiche__artefact--vide'}
              style={teinte ? ({ ['--teinte']: teinte } as Record<string, string>) : undefined}
              title={def ? describeEffectList(def.effects).join(' · ') : 'Emplacement libre'}
            >
              <span className="fiche__icone">
                <Icon name={def ? `artefact_${def.id}` : 'coffre'} size={32} />
              </span>
              <span className="fiche__artefact-corps">
                <span className="fiche__emplacement">{NOMS_EMPLACEMENTS[slot]}</span>
                <span className="fiche__nom-artefact">
                  {def ? def.name : porte ? porte.id : 'Libre'}
                </span>
              </span>
            </div>
          );
        })}
      </div>

      <Divider label={`Sac — ${hero.backpack.length} objet${hero.backpack.length > 1 ? 's' : ''}`} />
      {hero.backpack.length === 0 ? (
        <p className="ecran__note">Le sac est vide.</p>
      ) : (
        <ul className="jeu-liste-nue">
          {hero.backpack.map((id) => {
            const def = ARTIFACTS[id];
            return (
              <li className="fiche__ligne" key={id}>
                <span className="fiche__icone">
                  <Icon name={`artefact_${id}`} size={32} />
                </span>
                <span className="fiche__ligne-corps">
                  <span className="fiche__ligne-titre">{def?.name ?? id}</span>
                  <span className="fiche__ligne-detail">
                    {def
                      ? `${ARTIFACT_RARITY_LABELS[def.rarity]} · ${describeEffectList(def.effects).join(' · ') || 'aucun effet permanent'}`
                      : 'Objet inconnu du codex.'}
                  </span>
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </Panel>
  );
}

function Competences({ hero }: { hero: HeroInstance }): ReactElement {
  const p = heroProgress(hero);
  return (
    <Panel
      title="Compétences"
      subtitle={`${p.skills.length} apprise${p.skills.length > 1 ? 's' : ''} sur huit possibles`}
      matter="parchemin"
      padding="normal"
    >
      <ul className="jeu-liste-nue">
        {p.skills.map((s) => {
          const def = SKILLS[s.skill];
          const effets = def ? describeEffectList(def.effects[s.rank - 1] ?? []) : [];
          return (
            <li className="fiche__ligne" key={s.skill}>
              <span className="fiche__icone">
                <Icon name={`competence_${s.skill}`} size={32} />
              </span>
              <span className="fiche__ligne-corps">
                <span className="fiche__ligne-titre">{s.name}</span>
                <span className="fiche__ligne-detail">
                  {effets.length > 0 ? effets.join(' · ') : (def?.description ?? '')}
                </span>
              </span>
              <Badge tone={s.rank === 3 ? 'or' : s.rank === 2 ? 'sinople' : 'neutre'}>{s.rankName}</Badge>
            </li>
          );
        })}
      </ul>
    </Panel>
  );
}

function Grimoire({ hero }: { hero: HeroInstance }): ReactElement {
  const parEcole = new Map<SpellSchool, string[]>();
  for (const id of hero.spells) {
    const def = SPELLS[id];
    if (!def) continue;
    const liste = parEcole.get(def.school) ?? [];
    liste.push(id);
    parEcole.set(def.school, liste);
  }
  return (
    <Panel
      title="Grimoire"
      subtitle={`${hero.spells.length} sort${hero.spells.length > 1 ? 's' : ''} appris`}
      matter="parchemin"
      padding="normal"
    >
      {hero.spells.length === 0 ? (
        <p className="ecran__note">Ce héros n’a encore appris aucun sort.</p>
      ) : (
        ECOLES.filter((e) => (parEcole.get(e)?.length ?? 0) > 0).map((ecole) => (
          <div key={ecole}>
            <Divider label={`École des ${NOMS_ECOLES[ecole]}`} />
            <div className="fiche__grille">
              {(parEcole.get(ecole) ?? [])
                .slice()
                .sort()
                .map((id) => {
                  const def = SPELLS[id];
                  return (
                    <div
                      className="fiche__ligne ecran__carte-sort"
                      key={id}
                      style={{ ['--teinte']: schoolColors[ecole] } as Record<string, string>}
                    >
                      <span className="fiche__icone">
                        <Icon name={`sort_${id}`} size={32} />
                      </span>
                      <span className="fiche__ligne-corps">
                        <span className="fiche__ligne-titre">{def?.name ?? id}</span>
                        <span className="fiche__ligne-detail">
                          Niveau {def?.level ?? '?'} · {def?.cost ?? '?'} de mana
                        </span>
                      </span>
                    </div>
                  );
                })}
            </div>
          </div>
        ))
      )}
    </Panel>
  );
}

function Armee({ hero }: { hero: HeroInstance }): ReactElement {
  return (
    <Panel
      title="Armée"
      subtitle="Sept emplacements"
      matter="parchemin"
      padding="normal"
    >
      <div className="fiche__grille">
        {hero.army.map((pile, index) => {
          const def = pile ? CREATURES[pile.creature] : null;
          return (
            <div
              className={pile ? 'fiche__ligne ecran__pile' : 'fiche__ligne ecran__pile ecran__pile--vide'}
              key={`emplacement-${index}`}
            >
              <span className="ecran__pile-numero">{index + 1}</span>
              <span className="fiche__ligne-corps">
                <span className="fiche__ligne-titre">
                  {def ? def.namePlural : 'Emplacement libre'}
                </span>
                <span className="fiche__ligne-detail">
                  {def && pile
                    ? `${nombre(pile.count)} · rang ${def.tier}${def.upgraded ? ' amélioré' : ''} · ${def.attack}/${def.defense} · ${def.hp} PV`
                    : 'Aucune troupe rangée ici.'}
                </span>
              </span>
              {pile ? <Badge tone="or">{nombre(pile.count)}</Badge> : null}
            </div>
          );
        })}
      </div>
    </Panel>
  );
}

/* ─────────────────────────────── L'écran ────────────────────────────────── */

export interface FicheHerosProps {
  state: GameState;
  uid: string;
}

/** La fiche complète d'un héros. */
export function FicheHeros({ state, uid }: FicheHerosProps): ReactElement {
  const hero = state.heroes[uid];
  if (!hero) {
    return (
      <Page titre="Fiche de héros">
        <Panel title="Héros introuvable" matter="parchemin" padding="normal">
          <p className="ecran__note">
            Aucun héros ne porte l’identifiant «&#8239;{uid}&#8239;» dans cette partie.
          </p>
        </Panel>
      </Page>
    );
  }
  const def = HEROES[hero.def];
  return (
    <Page
      titre={def ? `${def.name}, ${def.title}` : 'Fiche de héros'}
      note={calendrier(state.turn)}
    >
      <div className="fiche">
        <div className="fiche__colonne">
          <Identite hero={hero} />
          <Progression hero={hero} />
          <Armee hero={hero} />
        </div>
        <div className="fiche__colonne">
          <Caracteristiques state={state} hero={hero} />
          <Equipement hero={hero} />
          <Competences hero={hero} />
          <Grimoire hero={hero} />
        </div>
      </div>
    </Page>
  );
}
