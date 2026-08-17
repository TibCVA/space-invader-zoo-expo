/**
 * Le Codex — l'encyclopédie du Forez, en double page de manuscrit.
 *
 * Il lit `@auvergne/content` **en entier** : les deux maisons, les 28
 * créatures, les 21 héros, les 32 sorts, les 20 compétences, les 53 artefacts
 * et leurs ensembles, les 54 bâtiments, les chartes et les localités, plus les
 * douze régions de `@auvergne/map`. Rien n'est recopié : toutes les valeurs
 * affichées viennent des données, ce qui garantit qu'un équilibrage change le
 * codex sans qu'on y touche.
 *
 * Mise en page : page de gauche = index cherchable et filtrable, page de
 * droite = notice développée. Sur téléphone, l'index passe en pleine largeur
 * et la notice le remplace, avec un retour explicite.
 *
 * La recherche ignore la casse **et les accents** : « epee » trouve « épée ».
 */

import { useCallback, useEffect, useMemo, useRef, useState, type ReactElement, type ReactNode } from 'react';
import type {
  ArtifactDef,
  BuildingDef,
  CreatureDef,
  FactionDef,
  HeroDef,
  SkillDef,
  SpellDef,
} from '@auvergne/engine';
import {
  ARTIFACT_LIST,
  ARTIFACT_SETS,
  BUILDING_LIST,
  CHARTERS,
  CREATURE_LIST,
  FACTIONS,
  HERO_LIST,
  SKILL_LIST,
  SPELL_LIST,
  SPELL_SCHOOLS,
  SPELL_SCHOOL_LABELS,
  VILLAGES,
} from '@auvergne/content';
import { REGION_LABELS } from '@auvergne/map';
import { FactionBlazon, HeroPortrait, Icon, RESOURCE_LABELS } from '@auvergne/ui';
import { jouerEffet } from './audio-bridge.js';

/* ─────────────────────────────── Outillage ──────────────────────────────── */

/** Retire les accents pour que la recherche reste tolérante. */
function plat(texte: string): string {
  return texte
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

/** Liste de ressources « 12 écus · 4 bois », en chiffres tabulaires. */
function Cout({ cost }: { cost: Partial<Record<string, number>> }): ReactElement {
  const parts = Object.entries(cost).filter(([, v]) => typeof v === 'number' && v > 0);
  if (parts.length === 0) return <span className="hmm-cdx-vide">gratuit</span>;
  return (
    <span className="hmm-cdx-cout">
      {parts.map(([key, value]) => (
        <span key={key} className="hmm-cdx-cout-part">
          <Icon name={`ressource_${key}`} size={15} />
          <span className="hmm-acc-tabulaire">{value}</span>
          <span className="hmm-cdx-cout-nom">{RESOURCE_LABELS[key] ?? key}</span>
        </span>
      ))}
    </span>
  );
}

function Stats({ rows }: { rows: readonly { label: string; value: ReactNode }[] }): ReactElement {
  return (
    <dl className="hmm-cdx-stats">
      {rows.map((row) => (
        <div key={row.label}>
          <dt>{row.label}</dt>
          <dd className="hmm-acc-tabulaire">{row.value}</dd>
        </div>
      ))}
    </dl>
  );
}

/** Un effet de compétence, de sort ou d'artefact, rendu en français lisible. */
function effetTexte(effect: { kind: string; [k: string]: unknown }): string {
  const bp = (v: unknown): string => `${(Number(v) / 100).toFixed(0)} %`;
  const n = (v: unknown): string => String(v);
  switch (effect.kind) {
    case 'movement':
      return `Marche : +${n(effect.value)} points`;
    case 'movement_bp':
      return `Marche : ×${bp(effect.bp)}`;
    case 'vision':
      return `Vision : +${n(effect.value ?? effect.radius)} cases`;
    case 'morale':
      return `Moral : +${n(effect.value)}`;
    case 'fortune':
      return `Fortune : +${n(effect.value)}`;
    case 'mana_max_bp':
      return `Réserve de mana : ×${bp(effect.bp)}`;
    case 'mana_regen':
      return `Mana regagné : +${n(effect.value)} par jour`;
    case 'spell_power_bp':
      return `Puissance des sorts : ×${bp(effect.bp)}`;
    case 'trade_bp':
      return `Change au marché : ×${bp(effect.bp)}`;
    case 'income_bp':
      return `Revenus : ×${bp(effect.bp)}`;
    case 'build_cost_bp':
      return `Coût des constructions : ×${bp(effect.bp)}`;
    case 'tactics_rows':
      return `Déploiement : +${n(effect.value)} rangée`;
    case 'first_strike_bp':
      return `Premier assaut : ×${bp(effect.bp)}`;
    case 'defense_bp':
      return `Défense : ×${bp(effect.bp)}`;
    case 'siege_damage_bp':
      return `Dégâts de siège : ×${bp(effect.bp)}`;
    case 'heal_bp':
      return `Soins : ×${bp(effect.bp)}`;
    case 'terrain_cost_bp':
      return `Coût du terrain « ${n(effect.terrain)} » : ×${bp(effect.bp)}`;
    case 'flank_bp':
      return `Prise à revers : ×${bp(effect.bp)}`;
    case 'resist_bp':
      return `Résistance à la magie : ×${bp(effect.bp)}`;
    case 'summon_bp':
      return `Invocations : ×${bp(effect.bp)}`;
    case 'xp_bp':
      return `Expérience gagnée : ×${bp(effect.bp)}`;
    case 'damage':
      return `Dégâts : ${n(effect.base)} + ${n(effect.perMystique)} par point de Mystique`;
    case 'heal':
      return `Soins : ${n(effect.base)} + ${n(effect.perMystique)} par point de Mystique${
        effect.resurrect === true ? ', ressuscite' : ''
      }`;
    case 'buff':
      return `Bonus de ${n(effect.stat)} : +${n(effect.value)} pendant ${n(effect.turns)} tours`;
    case 'debuff':
      return `Malus de ${n(effect.stat)} : ${n(effect.value)} pendant ${n(effect.turns)} tours`;
    case 'shield':
      return `Bouclier : ×${bp(effect.bp)} pendant ${n(effect.turns)} tours`;
    case 'root':
      return `Entrave pendant ${n(effect.turns)} tours`;
    case 'blind':
      return `Aveuglement pendant ${n(effect.turns)} tours`;
    case 'summon':
      return `Invoque ${n(effect.base)} créatures, +${n(effect.perMystique)} par Mystique`;
    case 'teleport':
      return 'Téléportation';
    case 'swap':
      return 'Échange de positions';
    case 'wall':
      return `Muraille de ${n(effect.hexes)} hexagones, ${n(effect.turns)} tours`;
    case 'dispel':
      return 'Dissipation des enchantements';
    case 'weather_shift':
      return 'Infléchit la météo';
    case 'reveal_map':
      return `Révèle la carte sur ${n(effect.radius)} cases`;
    case 'militia':
      return `Milice : ${n(effect.count)} hommes`;
    case 'growth_bp':
      return `Croissance : +${bp(effect.bp)}`;
    default:
      return effect.kind;
  }
}

function Effets({ effects }: { effects: readonly unknown[] }): ReactElement | null {
  if (effects.length === 0) return null;
  return (
    <ul className="hmm-cdx-effets">
      {effects.map((effect, i) => (
        <li key={i}>{effetTexte(effect as { kind: string })}</li>
      ))}
    </ul>
  );
}

/* ─────────────────────────── Notices par famille ────────────────────────── */

function NoticeFaction({ def }: { def: FactionDef }): ReactElement {
  const creatures = CREATURE_LIST.filter((c) => c.faction === def.id && !c.upgraded);
  return (
    <>
      <div className="hmm-cdx-entete">
        <FactionBlazon faction={def.id} size={92} />
        <div>
          <h3 className="hmm-cdx-nom">{def.name}</h3>
          <p className="hmm-cdx-devise">« {def.motto} »</p>
        </div>
      </div>
      <p className="hmm-cdx-recit">{def.description}</p>
      <h4 className="hmm-cdx-sous-titre">{def.mechanic.name}</h4>
      <p className="hmm-cdx-recit">{def.mechanic.description}</p>
      <h4 className="hmm-cdx-sous-titre">Réserves de départ</h4>
      <Cout cost={def.startingResources} />
      <h4 className="hmm-cdx-sous-titre">Les sept rangs</h4>
      <ol className="hmm-cdx-rangs">
        {creatures.map((c) => (
          <li key={c.id}>
            <span className="hmm-cdx-rang">{c.tier}</span>
            <span>{c.namePlural}</span>
          </li>
        ))}
      </ol>
    </>
  );
}

function NoticeCreature({ def }: { def: CreatureDef }): ReactElement {
  const amelioration = def.upgradeOf ? CREATURE_LIST.find((c) => c.id === def.upgradeOf) : undefined;
  return (
    <>
      <div className="hmm-cdx-entete">
        <div>
          <h3 className="hmm-cdx-nom">{def.name}</h3>
          <p className="hmm-cdx-devise">
            Rang {def.tier} · {FACTIONS[def.faction].name}
            {def.upgraded ? ' · forme améliorée' : ''}
          </p>
        </div>
      </div>
      <Stats
        rows={[
          { label: 'Points de vie', value: def.hp },
          { label: 'Attaque', value: def.attack },
          { label: 'Défense', value: def.defense },
          { label: 'Dégâts', value: `${def.dmgMin} – ${def.dmgMax}` },
          { label: 'Vitesse', value: def.speed },
          { label: 'Initiative', value: def.initiative },
          { label: 'Croissance', value: `${def.growth} par semaine` },
          { label: 'Puissance', value: def.power },
        ]}
      />
      <h4 className="hmm-cdx-sous-titre">Recrutement</h4>
      <Cout cost={def.cost} />
      <h4 className="hmm-cdx-sous-titre">Traits</h4>
      <ul className="hmm-cdx-puces">
        <li>{def.size === 2 ? 'Grande créature, deux hexagones' : 'Créature d’un hexagone'}</li>
        {def.flying ? <li>Vol : franchit les obstacles du champ de bataille</li> : null}
        {def.shooter ? <li>Tir : {def.shots ?? 0} munitions</li> : null}
        {def.abilities.map((a, i) => (
          <li key={i}>{capaciteTexte(a)}</li>
        ))}
      </ul>
      {amelioration ? (
        <p className="hmm-cdx-note">Forme de base : {amelioration.name}.</p>
      ) : null}
      <p className="hmm-cdx-recit">{def.lore}</p>
    </>
  );
}

function capaciteTexte(a: { kind: string; [k: string]: unknown }): string {
  const bp = (v: unknown): string => `${(Number(v) / 100).toFixed(0)} %`;
  switch (a.kind) {
    case 'no_retaliation':
      return 'Frappe sans subir de riposte';
    case 'no_retaliation_flank':
      return 'Aucune riposte quand elle prend de flanc';
    case 'retaliations':
      return `Riposte ${String(a.count)} fois par tour`;
    case 'charge_bonus':
      return `Charge : +${bp(a.perHex)} par hexagone parcouru, jusqu'à +${bp(a.max)}`;
    case 'knockback':
      return `Repousse la cible d'au moins ${String(a.minHexes)} hexagone`;
    case 'slow_on_hit':
      return `Ralentit la cible touchée de ${bp(a.bp)}`;
    case 'zone_of_control':
      return 'Zone de contrôle : bloque le passage adverse';
    case 'pierce_defense':
      return `Ignore ${bp(a.bp)} de la défense adverse`;
    case 'morale_aura':
      return `Aura de moral : +${String(a.value)} aux alliés proches`;
    case 'heal_aura':
      return `Aura de soins : ${String(a.amount)} points par tour`;
    case 'cleanse':
      return 'Purge les altérations alliées';
    case 'resurrect_after_win':
      return `Relève ${bp(a.bp)} de ses pertes après la victoire`;
    case 'reveal_fortune':
      return 'Annonce la Fortune avant le jet';
    case 'boulder':
      return `Jet de rocher : ${String(a.uses)} usages, ${String(a.damage)} dégâts`;
    case 'breath_line':
      return `Souffle en ligne sur ${String(a.length)} hexagones`;
    case 'poison':
      return `Poison : ${bp(a.bp)} pendant ${String(a.turns)} tours`;
    case 'stealth':
      return 'Discrétion : se dérobe au tir lointain';
    case 'range_penalty_immune':
      return 'Aucune pénalité de portée';
    case 'siege_bonus':
      return `Siège : +${bp(a.bp)} contre les murs`;
    case 'terrain_bonus':
      return `Sur « ${String(a.terrain)} » : attaque +${bp(a.attackBp)}, défense +${bp(a.defenseBp)}`;
    default:
      return a.kind;
  }
}

function NoticeHero({ def }: { def: HeroDef }): ReactElement {
  const maison = def.faction === 'neutre' ? 'Sans allégeance' : FACTIONS[def.faction].name;
  return (
    <>
      <div className="hmm-cdx-entete hmm-cdx-entete--portrait">
        <HeroPortrait heroId={def.id} size={168} frame="enluminure" showName={false} />
        <div>
          <h3 className="hmm-cdx-nom">{def.name}</h3>
          <p className="hmm-cdx-devise">
            {def.class} · {maison}
          </p>
          <p className="hmm-cdx-note">{def.title}</p>
        </div>
      </div>
      <p className="hmm-cdx-recit">{def.bio}</p>
      <h4 className="hmm-cdx-sous-titre">Caractéristiques de départ</h4>
      <Stats
        rows={[
          { label: 'Vaillance', value: def.start.vaillance },
          { label: 'Garde', value: def.start.garde },
          { label: 'Mystique', value: def.start.mystique },
          { label: 'Savoir', value: def.start.savoir },
        ]}
      />
      <h4 className="hmm-cdx-sous-titre">Compétences</h4>
      <ul className="hmm-cdx-puces">
        {def.start.skills.map((s) => {
          const skill = SKILL_LIST.find((k) => k.id === s.skill);
          return (
            <li key={s.skill}>
              <Icon name={`competence_${s.skill}`} size={16} /> {skill?.name ?? s.skill} —{' '}
              {skill?.ranks[s.rank - 1] ?? `rang ${s.rank}`}
            </li>
          );
        })}
      </ul>
      <h4 className="hmm-cdx-sous-titre">Troupe initiale</h4>
      <ul className="hmm-cdx-puces">
        {def.start.army.map((stack) => {
          const creature = CREATURE_LIST.find((c) => c.id === stack.creature);
          return (
            <li key={stack.creature}>
              <span className="hmm-acc-tabulaire">{stack.count}</span>{' '}
              {creature ? (stack.count > 1 ? creature.namePlural : creature.name) : stack.creature}
            </li>
          );
        })}
      </ul>
      {def.start.spells.length > 0 ? (
        <>
          <h4 className="hmm-cdx-sous-titre">Sorts connus</h4>
          <ul className="hmm-cdx-puces">
            {def.start.spells.map((id) => {
              const spell = SPELL_LIST.find((s) => s.id === id);
              return (
                <li key={id}>
                  <Icon name={`sort_${id}`} size={16} /> {spell?.name ?? id}
                </li>
              );
            })}
          </ul>
        </>
      ) : null}
      <h4 className="hmm-cdx-sous-titre">Spécialité</h4>
      <p className="hmm-cdx-recit">{specialiteTexte(def)}</p>
    </>
  );
}

function specialiteTexte(def: HeroDef): string {
  const s = def.specialty;
  switch (s.kind) {
    case 'creature': {
      const c = CREATURE_LIST.find((x) => x.id === s.creature);
      return `${c?.namePlural ?? s.creature} : +${(s.perLevelBp / 100).toFixed(2)} % de puissance par niveau du héros.`;
    }
    case 'spell': {
      const sp = SPELL_LIST.find((x) => x.id === s.spell);
      return `${sp?.name ?? s.spell} : coût ramené à ${(s.costBp / 100).toFixed(0)} %, durée allongée de ${s.durationBonus} tours.`;
    }
    case 'school':
      return `École des ${SPELL_SCHOOL_LABELS[s.school] ?? s.school} : coût ramené à ${(s.costBp / 100).toFixed(0)} %.`;
    case 'skill': {
      const sk = SKILL_LIST.find((x) => x.id === s.skill);
      return `${sk?.name ?? s.skill} : effets majorés de ${(s.bonusBp / 100).toFixed(0)} %.`;
    }
    case 'resource':
      return `${RESOURCE_LABELS[s.resource] ?? s.resource} : +${s.perDay} par jour.`;
    case 'movement':
      return `Marche : +${s.bonus} points de déplacement par jour.`;
    case 'siege':
      return `Siège : dégâts contre les murs majorés de ${(s.bp / 100).toFixed(0)} %.`;
    case 'vision':
      return `Vision : +${s.bonus} cases.`;
    case 'weather':
      return 'Lit le ciel : la météo défavorable ne la surprend jamais.';
    case 'diplomacy':
      return `Diplomatie : ${(s.bp / 100).toFixed(0)} % de chances supplémentaires de rallier une troupe neutre.`;
    case 'build_discount':
      return `Constructions : coût ramené à ${(s.bp / 100).toFixed(0)} %.`;
    default:
      return 'Spécialité propre.';
  }
}

function NoticeSpell({ def }: { def: SpellDef }): ReactElement {
  const portees: Record<string, string> = {
    ally_stack: 'une pile alliée',
    enemy_stack: 'une pile ennemie',
    any_stack: 'une pile quelconque',
    hex: 'un hexagone',
    line: 'une ligne',
    all_allies: 'toutes les piles alliées',
    all_enemies: 'toutes les piles ennemies',
    battlefield: 'le champ de bataille entier',
    adventure: "la carte d'aventure",
  };
  const portees2: Record<string, string> = {
    combat: 'Combat',
    aventure: 'Aventure',
    les_deux: 'Combat et aventure',
  };
  return (
    <>
      <div className="hmm-cdx-entete">
        <span className="hmm-cdx-icone-grande">
          <Icon name={def.icon} size={64} />
        </span>
        <div>
          <h3 className="hmm-cdx-nom">{def.name}</h3>
          <p className="hmm-cdx-devise">
            {SPELL_SCHOOL_LABELS[def.school] ?? def.school} · degré {def.level}
          </p>
        </div>
      </div>
      <Stats
        rows={[
          { label: 'Coût en mana', value: def.cost },
          { label: 'Cible', value: portees[def.target] ?? def.target },
          { label: 'Usage', value: portees2[def.scope] ?? def.scope },
        ]}
      />
      <p className="hmm-cdx-recit">{def.description}</p>
      <h4 className="hmm-cdx-sous-titre">Effets</h4>
      <Effets effects={def.effects} />
    </>
  );
}

function NoticeSkill({ def }: { def: SkillDef }): ReactElement {
  return (
    <>
      <div className="hmm-cdx-entete">
        <span className="hmm-cdx-icone-grande">
          <Icon name={def.icon} size={64} />
        </span>
        <div>
          <h3 className="hmm-cdx-nom">{def.name}</h3>
          <p className="hmm-cdx-devise">Compétence</p>
        </div>
      </div>
      <p className="hmm-cdx-recit">{def.description}</p>
      {def.ranks.map((rank, i) => (
        <section key={rank} className="hmm-cdx-rang-bloc">
          <h4 className="hmm-cdx-sous-titre">
            {rank} <span className="hmm-cdx-rang-num">rang {i + 1}</span>
          </h4>
          <Effets effects={def.effects[i]} />
        </section>
      ))}
    </>
  );
}

function NoticeArtifact({ def }: { def: ArtifactDef }): ReactElement {
  const slots: Record<string, string> = {
    tete: 'Tête',
    cou: 'Cou',
    torse: 'Torse',
    mains: 'Mains',
    anneau1: 'Anneau',
    anneau2: 'Anneau',
    ceinture: 'Ceinture',
    pieds: 'Pieds',
    banniere: 'Bannière',
    relique: 'Relique',
  };
  const ensemble = def.setId ? ARTIFACT_SETS.find((s) => s.id === def.setId) : undefined;
  return (
    <>
      <div className="hmm-cdx-entete">
        <span className="hmm-cdx-icone-grande">
          <Icon name={def.icon} size={64} />
        </span>
        <div>
          <h3 className="hmm-cdx-nom">{def.name}</h3>
          <p className="hmm-cdx-devise">
            {slots[def.slot] ?? def.slot} · {def.rarity}
          </p>
        </div>
      </div>
      {def.primary ? (
        <Stats
          rows={Object.entries(def.primary).map(([key, value]) => ({
            label: key.charAt(0).toUpperCase() + key.slice(1),
            value: `+${String(value)}`,
          }))}
        />
      ) : null}
      <Effets effects={def.effects} />
      <p className="hmm-cdx-recit">{def.lore}</p>
      {ensemble ? (
        <section className="hmm-cdx-rang-bloc">
          <h4 className="hmm-cdx-sous-titre">Ensemble : {ensemble.name}</h4>
          <p className="hmm-cdx-recit">{ensemble.lore}</p>
          <p className="hmm-cdx-note">{ensemble.bonusText}</p>
          <ul className="hmm-cdx-puces">
            {ensemble.pieces.map((id) => {
              const piece = ARTIFACT_LIST.find((a) => a.id === id);
              return <li key={id}>{piece?.name ?? id}</li>;
            })}
          </ul>
        </section>
      ) : null}
    </>
  );
}

function NoticeBuilding({ def }: { def: BuildingDef }): ReactElement {
  const architecture =
    def.faction === 'commun' ? 'Architecture commune' : FACTIONS[def.faction].name;
  return (
    <>
      <div className="hmm-cdx-entete">
        <span className="hmm-cdx-icone-grande">
          <Icon name="cite" size={64} />
        </span>
        <div>
          <h3 className="hmm-cdx-nom">{def.name}</h3>
          <p className="hmm-cdx-devise">{architecture}</p>
        </div>
      </div>
      <p className="hmm-cdx-recit">{def.description}</p>
      <h4 className="hmm-cdx-sous-titre">Coût</h4>
      <Cout cost={def.cost} />
      {def.requires.length > 0 ? (
        <>
          <h4 className="hmm-cdx-sous-titre">Prérequis</h4>
          <ul className="hmm-cdx-puces">
            {def.requires.map((id) => {
              const req = BUILDING_LIST.find((b) => b.id === id);
              return <li key={id}>{req?.name ?? id}</li>;
            })}
          </ul>
        </>
      ) : null}
      <h4 className="hmm-cdx-sous-titre">Ce qu'il apporte</h4>
      <ul className="hmm-cdx-puces">
        {def.grants.map((grant, i) => (
          <li key={i}>{octroiTexte(grant)}</li>
        ))}
      </ul>
    </>
  );
}

function octroiTexte(g: { kind: string; [k: string]: unknown }): string {
  switch (g.kind) {
    case 'dwelling': {
      const c = CREATURE_LIST.find((x) => x.id === g.creature);
      return `Demeure : ${c?.namePlural ?? String(g.creature)}, ${String(g.growth)} par semaine`;
    }
    case 'upgrade': {
      const from = CREATURE_LIST.find((x) => x.id === g.from);
      const to = CREATURE_LIST.find((x) => x.id === g.to);
      return `Amélioration : ${from?.namePlural ?? String(g.from)} → ${to?.namePlural ?? String(g.to)}`;
    }
    case 'income':
      return `Revenu : +${String(g.amount)} ${RESOURCE_LABELS[String(g.resource)] ?? String(g.resource)} par jour`;
    case 'mage_guild':
      return `Guilde des Arts, cercle ${String(g.level)}`;
    case 'defense':
      return `Défense : murs ${String(g.walls)}, tours ${String(g.towers)}${g.gate === true ? ', herse' : ''}`;
    case 'tavern':
      return 'Taverne : recrutement de héros et rumeurs';
    case 'market':
      return 'Marché : change des ressources';
    case 'blacksmith':
      return 'Forge : équipement et machines';
    case 'stables':
      return `Écuries : +${String(g.movement)} points de marche`;
    case 'mana':
      return `Mana : +${String(g.amount)} à la réserve`;
    case 'growth_bp':
      return `Croissance des demeures : +${(Number(g.bp) / 100).toFixed(0)} %`;
    case 'morale':
      return `Moral : +${String(g.value)}`;
    case 'special':
      return `Effet propre : ${String(g.key)}`;
    default:
      return g.kind;
  }
}

/* ────────────────────────────── Les régions ─────────────────────────────── */

interface RegionEntry {
  id: string;
  label: string;
}

function NoticeRegion({ region }: { region: RegionEntry }): ReactElement {
  const localites = VILLAGES.filter((v) => v.region === region.id);
  return (
    <>
      <div className="hmm-cdx-entete">
        <span className="hmm-cdx-icone-grande">
          <Icon name="carte" size={64} />
        </span>
        <div>
          <h3 className="hmm-cdx-nom">{region.label}</h3>
          <p className="hmm-cdx-devise">Région du Forez</p>
        </div>
      </div>
      {localites.length === 0 ? (
        <p className="hmm-cdx-recit">
          Aucune localité recensée : cette région est faite de bois, de crêtes et de chemins.
        </p>
      ) : (
        localites.map((v) => (
          <section key={v.key} className="hmm-cdx-rang-bloc">
            <h4 className="hmm-cdx-sous-titre">
              {v.name} <span className="hmm-cdx-rang-num">{v.kind}</span>
            </h4>
            <p className="hmm-cdx-note">{v.identity}</p>
            <p className="hmm-cdx-recit">{v.description}</p>
            <Cout cost={v.production} />
          </section>
        ))
      )}
    </>
  );
}

/* ─────────────────────────────── Les règles ─────────────────────────────── */

interface RegleEntry {
  id: string;
  label: string;
  contenu: ReactElement;
}

const REGLES: readonly RegleEntry[] = [
  {
    id: 'calendrier',
    label: 'Le calendrier',
    contenu: (
      <>
        <p className="hmm-cdx-recit">
          Le tour est un jour. Sept jours font une semaine, quatre semaines une ronde. Les créatures grandissent
          au premier jour de chaque semaine, dans toutes les demeures à la fois.
        </p>
        <ul className="hmm-cdx-puces">
          <li>Une seule construction par cité et par jour.</li>
          <li>Quatre héros au maximum par maison.</li>
          <li>La météo est annoncée deux jours à l'avance.</li>
        </ul>
      </>
    ),
  },
  {
    id: 'marche',
    label: 'Marcher dans le Forez',
    contenu: (
      <>
        <p className="hmm-cdx-recit">
          Chaque case coûte des points de marche. Un héros en dispose de mille huit cents à deux mille deux cents
          par jour, selon sa Logistique et ses écuries. Une diagonale coûte quarante et un pour cent de plus.
        </p>
        <Stats
          rows={[
            { label: 'Grande chaussée', value: 70 },
            { label: 'Chemin', value: 85 },
            { label: 'Prairie', value: 100 },
            { label: 'Forêt', value: 125 },
            { label: 'Pente', value: 145 },
            { label: 'Sagne humide', value: 160 },
            { label: 'Rocher', value: 200 },
            { label: 'Eau', value: 'infranchissable' },
          ]}
        />
      </>
    ),
  },
  {
    id: 'degats',
    label: 'La formule des dégâts',
    contenu: (
      <>
        <p className="hmm-cdx-recit">
          Tout est entier : aucune décimale ne circule dans la simulation. Les ratios s'expriment en points de
          base, dix mille valant le neutre.
        </p>
        <pre className="hmm-cdx-formule">
{`base  = nombre × tirage(dégâts min, dégâts max)
mult  = borné(10000 + 450 × (attaque − défense), 3500, 30000)
final = plancher(base × mult × capacités × terrain / 10000 / 10000)`}
        </pre>
        <p className="hmm-cdx-note">
          La Fortune est bornée à ±3000 points de base : aucun coup critique ne peut effacer une armée comparable
          d'un seul jet.
        </p>
      </>
    ),
  },
  {
    id: 'victoire',
    label: 'La Couronne du Forez',
    contenu: (
      <>
        <p className="hmm-cdx-recit">
          Cinq Sceaux des Marches dorment dans le massif : les Hautes Futaies, les Farges, Pamole, l'Hermitage et
          les Brumes. Trois sceaux suffisent à ouvrir la Maison du Trésor ; il reste à vaincre sa garde, puis à
          lancer la proclamation et à tenir le site trois semaines pleines.
        </p>
        <p className="hmm-cdx-note">
          Le compte à rebours est public : la couronne ne se vole pas discrètement.
        </p>
        <p className="hmm-cdx-recit">
          Trois modes alternatifs existent : la dernière bannière debout, la maîtrise simultanée des cinq
          Marches, ou la chronique — au terme du calendrier, la maison la mieux pourvue l'emporte.
        </p>
      </>
    ),
  },
  {
    id: 'chartes',
    label: 'Les chartes de village',
    contenu: (
      <>
        <p className="hmm-cdx-recit">
          Une localité tenue reçoit une charte, et une seule. Chacune donne beaucoup dans un domaine et rien
          ailleurs : c'est un choix, jamais un cumul.
        </p>
        {CHARTERS.map((charter) => (
          <section key={charter.id} className="hmm-cdx-rang-bloc">
            <h4 className="hmm-cdx-sous-titre">{charter.name}</h4>
            <p className="hmm-cdx-note">{charter.summary}</p>
            <p className="hmm-cdx-recit">{charter.description}</p>
            <p className="hmm-cdx-note">Contrepartie : {charter.tradeoff}</p>
          </section>
        ))}
      </>
    ),
  },
  {
    id: 'combat',
    label: 'Le champ de bataille',
    contenu: (
      <>
        <p className="hmm-cdx-recit">
          Quinze colonnes sur onze rangées d'hexagones, sept piles par camp. L'ordre de jeu suit l'initiative ;
          le moral peut offrir un tour supplémentaire ou en faire perdre un ; la fortune module les dégâts.
        </p>
        <ul className="hmm-cdx-puces">
          <li>Un tireur perd la moitié de ses dégâts au corps à corps.</li>
          <li>Prendre à revers ou de flanc majore les dégâts et réduit la riposte.</li>
          <li>Un siège ajoute murs, tours et herse : la balistique devient décisive.</li>
        </ul>
      </>
    ),
  },
];

/* ──────────────────────────── Assemblage du codex ───────────────────────── */

interface Entry {
  id: string;
  label: string;
  hint: string;
  facets: readonly string[];
  search: string;
  icon?: string;
  render(): ReactElement;
}

interface Section {
  id: string;
  label: string;
  filters: readonly { id: string; label: string }[];
  entries: readonly Entry[];
}

function buildSections(): Section[] {
  const factions: Section = {
    id: 'factions',
    label: 'Maisons',
    filters: [],
    entries: Object.values(FACTIONS).map((def) => ({
      id: def.id,
      label: def.name,
      hint: def.motto,
      facets: [],
      search: plat(`${def.name} ${def.motto} ${def.description}`),
      render: () => <NoticeFaction def={def} />,
    })),
  };

  const creatures: Section = {
    id: 'creatures',
    label: 'Créatures',
    filters: [
      { id: 'granit', label: 'Granit' },
      { id: 'ermitage', label: 'Ermitage' },
      { id: 'base', label: 'Formes de base' },
      { id: 'amelioree', label: 'Améliorées' },
      ...[1, 2, 3, 4, 5, 6, 7].map((t) => ({ id: `rang${t}`, label: `Rang ${t}` })),
    ],
    entries: CREATURE_LIST.map((def) => ({
      id: def.id,
      label: def.name,
      hint: `Rang ${def.tier} · ${def.upgraded ? 'améliorée' : 'base'}`,
      facets: [def.faction, def.upgraded ? 'amelioree' : 'base', `rang${def.tier}`],
      search: plat(`${def.name} ${def.namePlural} ${def.lore}`),
      render: () => <NoticeCreature def={def} />,
    })),
  };

  const heroes: Section = {
    id: 'heros',
    label: 'Héros',
    filters: [
      { id: 'granit', label: 'Granit' },
      { id: 'ermitage', label: 'Ermitage' },
      { id: 'neutre', label: 'Neutre' },
    ],
    entries: HERO_LIST.map((def) => ({
      id: def.id,
      label: def.name,
      hint: `${def.class} · ${def.title}`,
      facets: [def.faction],
      search: plat(`${def.name} ${def.class} ${def.title} ${def.bio}`),
      render: () => <NoticeHero def={def} />,
    })),
  };

  const spells: Section = {
    id: 'sorts',
    label: 'Sorts',
    filters: SPELL_SCHOOLS.map((s) => ({ id: s, label: SPELL_SCHOOL_LABELS[s] ?? s })),
    entries: SPELL_LIST.map((def) => ({
      id: def.id,
      label: def.name,
      hint: `${SPELL_SCHOOL_LABELS[def.school] ?? def.school} · degré ${def.level}`,
      facets: [def.school],
      icon: def.icon,
      search: plat(`${def.name} ${def.description}`),
      render: () => <NoticeSpell def={def} />,
    })),
  };

  const skills: Section = {
    id: 'competences',
    label: 'Compétences',
    filters: [],
    entries: SKILL_LIST.map((def) => ({
      id: def.id,
      label: def.name,
      hint: def.ranks.join(' · '),
      facets: [],
      icon: def.icon,
      search: plat(`${def.name} ${def.description} ${def.ranks.join(' ')}`),
      render: () => <NoticeSkill def={def} />,
    })),
  };

  const artifacts: Section = {
    id: 'artefacts',
    label: 'Artefacts',
    filters: [
      { id: 'commun', label: 'Communs' },
      { id: 'rare', label: 'Rares' },
      { id: 'majeur', label: 'Majeurs' },
      { id: 'relique', label: 'Reliques' },
      { id: 'ensemble', label: "Pièces d'ensemble" },
    ],
    entries: ARTIFACT_LIST.map((def) => ({
      id: def.id,
      label: def.name,
      hint: def.rarity,
      facets: def.setId ? [def.rarity, 'ensemble'] : [def.rarity],
      icon: def.icon,
      search: plat(`${def.name} ${def.lore}`),
      render: () => <NoticeArtifact def={def} />,
    })),
  };

  const buildings: Section = {
    id: 'batiments',
    label: 'Bâtiments',
    filters: [
      { id: 'granit', label: 'Granit' },
      { id: 'ermitage', label: 'Ermitage' },
      { id: 'commun', label: 'Communs' },
    ],
    entries: BUILDING_LIST.map((def) => ({
      id: def.id,
      label: def.name,
      hint: def.faction === 'commun' ? 'Commun' : FACTIONS[def.faction].name,
      facets: [def.faction],
      search: plat(`${def.name} ${def.description}`),
      render: () => <NoticeBuilding def={def} />,
    })),
  };

  const regions: Section = {
    id: 'regions',
    label: 'Régions',
    filters: [],
    entries: Object.entries(REGION_LABELS).map(([id, label]) => ({
      id,
      label,
      hint: `${VILLAGES.filter((v) => v.region === id).length} localité(s)`,
      facets: [],
      search: plat(`${label} ${VILLAGES.filter((v) => v.region === id).map((v) => `${v.name} ${v.description}`).join(' ')}`),
      render: () => <NoticeRegion region={{ id, label }} />,
    })),
  };

  const regles: Section = {
    id: 'regles',
    label: 'Règles',
    filters: [],
    entries: REGLES.map((r) => ({
      id: r.id,
      label: r.label,
      hint: 'Règle du jeu',
      facets: [],
      search: plat(r.label),
      render: () => r.contenu,
    })),
  };

  return [factions, creatures, heroes, spells, skills, artifacts, buildings, regions, regles];
}

export interface CodexPageProps {
  /** Retour à la page d'accueil. */
  onBack(): void;
  /** Section ouverte au chargement. */
  section?: string;
}

/** L'encyclopédie feuilletable. */
export function CodexPage({ onBack, section }: CodexPageProps): ReactElement {
  const sections = useMemo(buildSections, []);
  const [sectionId, setSectionId] = useState(section ?? sections[0].id);
  const [query, setQuery] = useState('');
  const [facet, setFacet] = useState<string | null>(null);
  const [entryId, setEntryId] = useState<string | null>(null);
  const [surNotice, setSurNotice] = useState(false);
  const noticeRef = useRef<HTMLDivElement | null>(null);

  const active = sections.find((s) => s.id === sectionId) ?? sections[0];

  const visibles = useMemo((): Entry[] => {
    const needle = plat(query.trim());
    return active.entries.filter((entry) => {
      if (facet && !entry.facets.includes(facet)) return false;
      if (needle.length === 0) return true;
      return entry.search.includes(needle) || plat(entry.label).includes(needle);
    });
  }, [active, facet, query]);

  const courante = visibles.find((e) => e.id === entryId) ?? visibles[0] ?? null;

  const choisirSection = useCallback((id: string): void => {
    jouerEffet('page');
    setSectionId(id);
    setFacet(null);
    setEntryId(null);
    setSurNotice(false);
  }, []);

  const choisirEntree = useCallback((id: string): void => {
    jouerEffet('page');
    setEntryId(id);
    setSurNotice(true);
  }, []);

  useEffect(() => {
    if (noticeRef.current) noticeRef.current.scrollTop = 0;
  }, [courante?.id]);

  return (
    <div className="hmm-acc-ecran hmm-cdx">
      <header className="hmm-acc-ecran-tete">
        <button type="button" className="hmm-acc-retour" onClick={onBack}>
          <Icon name="chevron" size={18} />
          <span>Retour à l'accueil</span>
        </button>
        <h2 className="hmm-acc-ecran-titre">Codex du Forez</h2>
        <p className="hmm-acc-ecran-sous-titre">
          Deux maisons, {CREATURE_LIST.length} créatures, {HERO_LIST.length} héros, {SPELL_LIST.length} sorts,{' '}
          {SKILL_LIST.length} compétences, {ARTIFACT_LIST.length} artefacts, {BUILDING_LIST.length} bâtiments.
        </p>
      </header>

      <nav className="hmm-cdx-onglets" aria-label="Familles du codex">
        {sections.map((s) => (
          <button
            key={s.id}
            type="button"
            className={`hmm-cdx-onglet${s.id === sectionId ? ' est-actif' : ''}`}
            aria-current={s.id === sectionId ? 'page' : undefined}
            onClick={(): void => choisirSection(s.id)}
          >
            {s.label}
          </button>
        ))}
      </nav>

      <div className={`hmm-cdx-livre${surNotice ? ' montre-notice' : ''}`}>
        <div className="hmm-cdx-page hmm-cdx-page--index">
          <div className="hmm-cdx-recherche">
            <span className="hmm-cdx-recherche-icone" aria-hidden="true">
              <Icon name="loupe" size={18} />
            </span>
            <input
              type="search"
              value={query}
              placeholder="Chercher dans le codex"
              aria-label="Chercher dans le codex"
              onChange={(event): void => {
                setQuery(event.target.value);
                setEntryId(null);
              }}
            />
          </div>

          {active.filters.length > 0 ? (
            <div className="hmm-cdx-filtres" role="group" aria-label="Filtres">
              <button
                type="button"
                className={`hmm-cdx-filtre${facet === null ? ' est-actif' : ''}`}
                onClick={(): void => setFacet(null)}
              >
                Tout
              </button>
              {active.filters.map((f) => (
                <button
                  key={f.id}
                  type="button"
                  className={`hmm-cdx-filtre${facet === f.id ? ' est-actif' : ''}`}
                  onClick={(): void => setFacet(facet === f.id ? null : f.id)}
                >
                  {f.label}
                </button>
              ))}
            </div>
          ) : null}

          <p className="hmm-cdx-compte">
            {visibles.length} {visibles.length > 1 ? 'entrées' : 'entrée'}
          </p>

          <ul className="hmm-cdx-index">
            {visibles.map((entry) => (
              <li key={entry.id}>
                <button
                  type="button"
                  className={`hmm-cdx-index-item${courante?.id === entry.id ? ' est-actif' : ''}`}
                  onClick={(): void => choisirEntree(entry.id)}
                >
                  {entry.icon ? (
                    <span className="hmm-cdx-index-icone" aria-hidden="true">
                      <Icon name={entry.icon} size={22} />
                    </span>
                  ) : null}
                  <span className="hmm-cdx-index-textes">
                    <span className="hmm-cdx-index-nom">{entry.label}</span>
                    <span className="hmm-cdx-index-hint">{entry.hint}</span>
                  </span>
                </button>
              </li>
            ))}
            {visibles.length === 0 ? (
              <li className="hmm-cdx-rien">Aucune entrée ne correspond à cette recherche.</li>
            ) : null}
          </ul>
        </div>

        <div className="hmm-cdx-reliure" aria-hidden="true" />

        <div className="hmm-cdx-page hmm-cdx-page--notice" ref={noticeRef}>
          <button
            type="button"
            className="hmm-cdx-retour-index"
            onClick={(): void => {
              jouerEffet('page');
              setSurNotice(false);
            }}
          >
            <Icon name="chevron" size={16} />
            <span>Revenir à l'index</span>
          </button>
          {courante ? courante.render() : <p className="hmm-cdx-rien">Choisissez une entrée dans l'index.</p>}
        </div>
      </div>
    </div>
  );
}
