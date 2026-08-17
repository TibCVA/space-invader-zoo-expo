/**
 * @auvergne/content — TOUT le contenu du jeu, en données pures.
 *
 * Ce paquet ne contient aucune règle : il décrit ce qui existe dans le Forez
 * (créatures, héros, sorts, compétences, artefacts, bâtiments, factions,
 * événements, gardes, villages) et laisse au moteur le soin de s'en servir.
 *
 * Le baril satisfait exactement l'interface `ContentPack` de
 * `packages/engine/src/core/registry.ts`. Il est branché par injection depuis
 * `@auvergne/game` :
 *
 * ```ts
 * import { bootstrapEngine } from '@auvergne/game';
 * bootstrapEngine();
 * ```
 *
 * Aucun `Math.random` ici, aucun flottant dans une valeur simulée, aucun texte
 * visible en anglais.
 */
import type {
  ArtifactDef,
  ArtifactId,
  BuildingDef,
  BuildingId,
  ContentPack,
  CreatureDef,
  CreatureId,
  FactionDef,
  FactionId,
  GuardTemplate,
  HeroDef,
  HeroId,
  SkillDef,
  SkillId,
  SpellDef,
  SpellId,
  WeekEventDef,
} from '@auvergne/engine';

import { FACTIONS, FACTION_IDS, GRANIT, ERMITAGE } from './factions.js';
import { CREATURES, CREATURE_LIST, creatureIdOf, computePower, abilityBonusBp } from './creatures.js';
import { HEROES, HERO_LIST, HERO_IDS, heroesOf } from './heroes.js';
import { SPELLS, SPELL_LIST, SPELL_SCHOOLS, SPELL_SCHOOL_LABELS, spellsOfSchool } from './spells.js';
import { SKILLS, SKILL_LIST, SKILL_IDS } from './skills.js';
import {
  ARTIFACTS,
  ARTIFACT_LIST,
  ARTIFACT_SETS,
  artifactsOfRarity,
  artifactsOfSet,
} from './artifacts.js';
import {
  BUILDINGS,
  BUILDING_LIST,
  buildingsOf as buildingsOfFaction,
  startingBuildingsOf,
} from './buildings.js';
import { WEEK_EVENTS, WEEK_EVENT_WEIGHT_TOTAL } from './week-events.js';
import { NEUTRAL_GUARDS, GUARD_NOTES, guardsOfRing } from './guards.js';
import {
  CHARTERS,
  CHARTERS_BY_ID,
  VILLAGES,
  VILLAGES_BY_KEY,
  neutralLocalities,
} from './villages.js';
import { isFilled } from './util.js';

/* ── Version ─────────────────────────────────────────────────────────────── */

/**
 * Version du contenu, enregistrée dans chaque partie et chaque sauvegarde.
 * Toute modification qui change une valeur simulée doit l'incrémenter.
 */
export const CONTENT_VERSION = '1.0.0-forez';

/* ── Tables ──────────────────────────────────────────────────────────────── */

export {
  FACTIONS,
  CREATURES,
  HEROES,
  SPELLS,
  SKILLS,
  ARTIFACTS,
  BUILDINGS,
  WEEK_EVENTS,
  NEUTRAL_GUARDS,
};

/* ── Listes ordonnées et tables annexes (hors contrat, utiles au codex) ──── */

export {
  FACTION_IDS,
  GRANIT,
  ERMITAGE,
  CREATURE_LIST,
  HERO_LIST,
  HERO_IDS,
  SPELL_LIST,
  SPELL_SCHOOLS,
  SPELL_SCHOOL_LABELS,
  SKILL_LIST,
  SKILL_IDS,
  ARTIFACT_LIST,
  ARTIFACT_SETS,
  BUILDING_LIST,
  WEEK_EVENT_WEIGHT_TOTAL,
  GUARD_NOTES,
  CHARTERS,
  CHARTERS_BY_ID,
  VILLAGES,
  VILLAGES_BY_KEY,
};

export {
  creatureIdOf,
  computePower,
  abilityBonusBp,
  heroesOf,
  spellsOfSchool,
  artifactsOfSet,
  artifactsOfRarity,
  guardsOfRing,
  neutralLocalities,
  startingBuildingsOf,
};

export type { ArtifactSetDef } from './artifacts.js';
export type { CharterDef, VillageDef, LocalityKind } from './villages.js';
export type { GuardNote } from './guards.js';

/* ── Accesseurs ──────────────────────────────────────────────────────────── */

/** Lève une erreur en français si l'identifiant est inconnu du contenu. */
function need<T>(table: Readonly<Record<string, T>>, id: string, what: string): T {
  const value = table[id];
  if (!value) throw new Error(`${what} : « ${id} ».`);
  return value;
}

export function creature(id: CreatureId): CreatureDef {
  return need(CREATURES, id, 'Créature inconnue');
}

export function hero(id: HeroId): HeroDef {
  return need(HEROES, id, 'Héros inconnu');
}

export function spell(id: SpellId): SpellDef {
  return need(SPELLS, id, 'Sort inconnu');
}

export function skill(id: SkillId): SkillDef {
  return need(SKILLS, id, 'Compétence inconnue');
}

export function artifact(id: ArtifactId): ArtifactDef {
  return need(ARTIFACTS, id, 'Artefact inconnu');
}

export function building(id: BuildingId): BuildingDef {
  return need(BUILDINGS, id, 'Bâtiment inconnu');
}

export function faction(id: FactionId): FactionDef {
  return need(FACTIONS, id, 'Faction inconnue');
}

/** Créatures d'une faction, éventuellement d'un seul rang. Ordre déterministe. */
export function creaturesOf(faction: FactionId, tier?: number): CreatureDef[] {
  return CREATURE_LIST.filter((c) => c.faction === faction && (tier === undefined || c.tier === tier));
}

/** Bâtiments constructibles par une faction : les siens et les communs. */
export function buildingsOf(faction: FactionId): BuildingDef[] {
  return buildingsOfFaction(faction);
}

/* ── Validation ──────────────────────────────────────────────────────────── */

const SPELL_SCHOOL_SET = new Set<string>(SPELL_SCHOOLS);
const ARTIFACT_SLOTS = new Set([
  'tete',
  'cou',
  'torse',
  'mains',
  'anneau1',
  'anneau2',
  'ceinture',
  'pieds',
  'banniere',
  'relique',
]);

/** Identifiants de héros imposés par docs/02-API.md, dans l'ordre du document. */
const REQUIRED_HERO_IDS: readonly string[] = [
  'paul',
  'thibaut',
  'loic',
  'matthieu',
  'clotilde',
  'caroline',
  'thomas',
  'georges',
  'auguste',
  'josephine',
  'anastasia',
  'mathilde',
  'agathe',
  'roxane',
  'jean',
  'adele',
  'ines',
  'gustave',
  'come',
  'lise',
  'jules',
];

/** Compétences imposées par docs/02-API.md. */
const REQUIRED_SKILL_IDS: readonly string[] = [
  'logistique',
  'tactique',
  'seigneurie',
  'intendance',
  'diplomatie',
  'reconnaissance',
  'sylviculture',
  'pelerinage',
  'forges',
  'balistique',
  'guerison',
  'erudition',
  'occultisme',
  'commandement',
  'fortune',
  'embuscade',
  'commerce',
  'cartographie',
  'resistance',
  'invocation',
];

/**
 * Contrôle intégral du contenu.
 * Retourne la liste des anomalies en français ; vide si tout est cohérent.
 * Un test échoue si cette liste n'est pas vide.
 */
export function validateContent(): string[] {
  const errors: string[] = [];
  const push = (message: string): void => {
    errors.push(message);
  };

  /* — Unicité des identifiants — */
  const checkUnique = (list: readonly { id: string }[], what: string): void => {
    const seen = new Set<string>();
    for (const row of list) {
      if (!isFilled(row.id)) {
        push(`${what} : un identifiant est vide.`);
        continue;
      }
      if (seen.has(row.id)) push(`${what} : identifiant en double « ${row.id} ».`);
      seen.add(row.id);
    }
  };
  checkUnique(CREATURE_LIST, 'Créatures');
  checkUnique(HERO_LIST, 'Héros');
  checkUnique(SPELL_LIST, 'Sorts');
  checkUnique(SKILL_LIST, 'Compétences');
  checkUnique(ARTIFACT_LIST, 'Artefacts');
  checkUnique(BUILDING_LIST, 'Bâtiments');

  const eventKeys = new Set<string>();
  for (const event of WEEK_EVENTS) {
    if (eventKeys.has(event.key)) push(`Événements : clef en double « ${event.key} ».`);
    eventKeys.add(event.key);
  }
  const villageKeys = new Set<string>();
  for (const village of VILLAGES) {
    if (villageKeys.has(village.key)) push(`Localités : clef en double « ${village.key} ».`);
    villageKeys.add(village.key);
  }

  /* — Effectifs attendus — */
  if (CREATURE_LIST.length !== 28) {
    push(`Il faut exactement 28 créatures, ${CREATURE_LIST.length} déclarées.`);
  }
  if (HERO_LIST.length !== 21) {
    push(`Il faut exactement 21 héros, ${HERO_LIST.length} déclarés.`);
  }
  if (SPELL_LIST.length !== 32) {
    push(`Il faut exactement 32 sorts, ${SPELL_LIST.length} déclarés.`);
  }
  if (SKILL_LIST.length !== 20) {
    push(`Il faut exactement 20 compétences, ${SKILL_LIST.length} déclarées.`);
  }
  if (ARTIFACT_LIST.length < 48) {
    push(`Il faut au moins 48 artefacts, ${ARTIFACT_LIST.length} déclarés.`);
  }
  if (WEEK_EVENTS.length < 16) {
    push(`Il faut au moins 16 événements de semaine, ${WEEK_EVENTS.length} déclarés.`);
  }

  /* — Créatures : identifiants imposés, rangs, améliorations — */
  for (const factionId of FACTION_IDS) {
    for (let tier = 1; tier <= 7; tier++) {
      const baseId = creatureIdOf(factionId, tier);
      const upId = creatureIdOf(factionId, tier, true);
      const base = CREATURES[baseId];
      const up = CREATURES[upId];
      if (!base) push(`Créature manquante : « ${baseId} ».`);
      if (!up) push(`Créature manquante : « ${upId} ».`);
      if (!base || !up) continue;
      if (base.upgraded) push(`${baseId} ne devrait pas être marquée comme améliorée.`);
      if (!up.upgraded) push(`${upId} devrait être marquée comme améliorée.`);
      if (up.upgradeOf !== baseId) {
        push(`${upId} : « upgradeOf » vaut « ${String(up.upgradeOf)} », attendu « ${baseId} ».`);
      }
      if (up.tier !== base.tier) push(`${upId} : rang différent de sa forme de base.`);
      if (up.size !== base.size) push(`${upId} : taille différente de sa forme de base.`);
      if (up.growth !== base.growth) push(`${upId} : croissance différente de sa forme de base.`);
      if (up.hp <= base.hp) push(`${upId} : les points de vie devraient progresser.`);
      if (up.abilities.length < base.abilities.length) {
        push(`${upId} : l'amélioration devrait ajouter une capacité, pas en retirer.`);
      }
    }
  }

  for (const def of CREATURE_LIST) {
    const label = `Créature « ${def.id} »`;
    if (!isFilled(def.name) || !isFilled(def.namePlural)) push(`${label} : nom vide.`);
    if (!isFilled(def.lore)) push(`${label} : lore vide.`);
    if (def.upgradeOf !== undefined && !CREATURES[def.upgradeOf]) {
      push(`${label} : « upgradeOf » pointe sur une créature inconnue « ${def.upgradeOf} ».`);
    }
    if (def.dmgMin > def.dmgMax) push(`${label} : dégâts minimum supérieurs au maximum.`);
    if (def.power <= 0) push(`${label} : puissance nulle ou négative.`);
    if (def.growth <= 0) push(`${label} : croissance nulle.`);
    if (Object.keys(def.cost).length === 0) push(`${label} : coût de recrutement vide.`);
    for (const [key, value] of Object.entries(def.cost)) {
      if (!Number.isInteger(value)) push(`${label} : coût non entier pour « ${key} ».`);
    }
    for (const value of [def.hp, def.attack, def.defense, def.speed, def.initiative, def.power]) {
      if (!Number.isInteger(value)) push(`${label} : une statistique n'est pas entière.`);
    }
    if (def.shooter && (def.shots ?? 0) <= 0) push(`${label} : tireur sans munitions.`);
  }

  /* — Compétences — */
  for (const id of REQUIRED_SKILL_IDS) {
    if (!SKILLS[id]) push(`Compétence manquante : « ${id} ».`);
  }
  for (const def of SKILL_LIST) {
    const label = `Compétence « ${def.id} »`;
    if (!isFilled(def.name)) push(`${label} : nom vide.`);
    if (!isFilled(def.description)) push(`${label} : description vide.`);
    if (def.ranks.length !== 3 || def.ranks.some((r) => !isFilled(r))) {
      push(`${label} : les trois rangs doivent être nommés.`);
    }
    if (def.effects.length !== 3) push(`${label} : il faut trois jeux d'effets.`);
    for (let rank = 0; rank < def.effects.length; rank++) {
      if (def.effects[rank].length === 0) {
        push(`${label} : le rang ${rank + 1} n'apporte aucun effet.`);
      }
    }
  }

  /* — Sorts — */
  for (const school of SPELL_SCHOOLS) {
    for (let level = 1; level <= 8; level++) {
      const id = `${school}_${level}`;
      const def = SPELLS[id];
      if (!def) {
        push(`Sort manquant : « ${id} ».`);
        continue;
      }
      if (def.school !== school) push(`Sort « ${id} » : école incohérente.`);
      if (def.level !== level) push(`Sort « ${id} » : degré incohérent.`);
    }
  }
  for (const def of SPELL_LIST) {
    const label = `Sort « ${def.id} »`;
    if (!isFilled(def.name)) push(`${label} : nom vide.`);
    if (!isFilled(def.description)) push(`${label} : description vide.`);
    if (!SPELL_SCHOOL_SET.has(def.school)) push(`${label} : école inconnue.`);
    if (!Number.isInteger(def.cost) || def.cost <= 0) push(`${label} : coût de mana invalide.`);
    if (def.effects.length === 0) push(`${label} : aucun effet.`);
    if (def.scope === 'aventure' && def.target !== 'adventure') {
      push(`${label} : un sort d'aventure doit cibler « adventure ».`);
    }
    for (const effect of def.effects) {
      if (effect.kind === 'summon' && !CREATURES[effect.creature]) {
        push(`${label} : invoque une créature inconnue « ${effect.creature} ».`);
      }
    }
  }

  /* — Héros — */
  for (const id of REQUIRED_HERO_IDS) {
    if (!HEROES[id]) push(`Héros manquant : « ${id} ».`);
  }
  let neutralHeroes = 0;
  for (const def of HERO_LIST) {
    const label = `Héros « ${def.id} »`;
    if (!isFilled(def.name)) push(`${label} : nom vide.`);
    if (!isFilled(def.class)) push(`${label} : classe vide.`);
    if (!isFilled(def.title)) push(`${label} : titre vide.`);
    if (!isFilled(def.bio)) push(`${label} : biographie vide.`);
    if (!isFilled(def.portrait)) push(`${label} : clef de portrait vide.`);
    if (def.faction === 'neutre') neutralHeroes += 1;

    const stats = [def.start.vaillance, def.start.garde, def.start.mystique, def.start.savoir];
    for (const value of stats) {
      if (!Number.isInteger(value) || value < 0) {
        push(`${label} : caractéristique de départ invalide.`);
      }
    }
    if (stats.reduce((a, b) => a + b, 0) < 5) {
      push(`${label} : total de caractéristiques de départ trop faible.`);
    }

    for (const entry of def.start.skills) {
      if (!SKILLS[entry.skill]) push(`${label} : compétence de départ inconnue « ${entry.skill} ».`);
      if (entry.rank < 1 || entry.rank > 3) push(`${label} : rang de compétence hors bornes.`);
    }
    if (def.start.skills.length === 0) push(`${label} : aucune compétence de départ.`);
    if (def.start.army.length === 0) push(`${label} : armée de départ vide.`);
    for (const stack of def.start.army) {
      if (!CREATURES[stack.creature]) {
        push(`${label} : armée de départ avec une créature inconnue « ${stack.creature} ».`);
      }
      if (!Number.isInteger(stack.count) || stack.count <= 0) {
        push(`${label} : effectif de départ invalide.`);
      }
    }
    for (const spellId of def.start.spells) {
      if (!SPELLS[spellId]) push(`${label} : sort de départ inconnu « ${spellId} ».`);
    }
    for (const [skillId, weight] of Object.entries(def.skillWeights)) {
      if (!SKILLS[skillId]) push(`${label} : poids sur une compétence inconnue « ${skillId} ».`);
      if (typeof weight !== 'number' || weight < 0 || weight > 100) {
        push(`${label} : poids hors bornes pour « ${skillId} ».`);
      }
    }
    if (Object.keys(def.skillWeights).length !== SKILL_LIST.length) {
      push(`${label} : les poids de compétence doivent couvrir les vingt compétences.`);
    }

    const specialty = def.specialty;
    switch (specialty.kind) {
      case 'creature':
        if (!CREATURES[specialty.creature]) {
          push(`${label} : spécialité sur une créature inconnue « ${specialty.creature} ».`);
        }
        break;
      case 'spell':
        if (!SPELLS[specialty.spell]) {
          push(`${label} : spécialité sur un sort inconnu « ${specialty.spell} ».`);
        }
        break;
      case 'skill':
        if (!SKILLS[specialty.skill]) {
          push(`${label} : spécialité sur une compétence inconnue « ${specialty.skill} ».`);
        }
        break;
      case 'school':
        if (!SPELL_SCHOOL_SET.has(specialty.school)) {
          push(`${label} : spécialité sur une école inconnue « ${specialty.school} ».`);
        }
        break;
      default:
        break;
    }
  }
  if (neutralHeroes !== 1) {
    push(`Il doit exister exactement un héros neutre (Jules), ${neutralHeroes} trouvé(s).`);
  }
  if (HEROES.jules && HEROES.jules.faction !== 'neutre') {
    push('Jules doit être neutre.');
  }

  /* — Artefacts — */
  for (const def of ARTIFACT_LIST) {
    const label = `Artefact « ${def.id} »`;
    if (!isFilled(def.name)) push(`${label} : nom vide.`);
    if (!isFilled(def.lore)) push(`${label} : lore vide.`);
    if (!isFilled(def.icon)) push(`${label} : icône vide.`);
    if (!ARTIFACT_SLOTS.has(def.slot)) push(`${label} : emplacement inconnu « ${def.slot} ».`);
    if (def.effects.length === 0 && !def.primary) push(`${label} : aucun effet.`);
    if (def.setId && !ARTIFACT_SETS.some((s) => s.id === def.setId)) {
      push(`${label} : appartient à un ensemble inconnu « ${def.setId} ».`);
    }
  }
  for (const set of ARTIFACT_SETS) {
    if (!isFilled(set.name) || !isFilled(set.lore) || !isFilled(set.bonusText)) {
      push(`Ensemble « ${set.id} » : texte manquant.`);
    }
    if (set.pieces.length < 3) push(`Ensemble « ${set.id} » : moins de trois pièces.`);
    const slots = new Set<string>();
    for (const pieceId of set.pieces) {
      const piece = ARTIFACTS[pieceId];
      if (!piece) {
        push(`Ensemble « ${set.id} » : pièce inconnue « ${pieceId} ».`);
        continue;
      }
      if (piece.setId !== set.id) {
        push(`Ensemble « ${set.id} » : la pièce « ${pieceId} » ne s'y rattache pas.`);
      }
      if (slots.has(piece.slot)) {
        push(`Ensemble « ${set.id} » : deux pièces se disputent l'emplacement « ${piece.slot} ».`);
      }
      slots.add(piece.slot);
    }
    const declared = ARTIFACT_LIST.filter((a) => a.setId === set.id).length;
    if (declared !== set.pieces.length) {
      push(`Ensemble « ${set.id} » : ${declared} pièces marquées pour ${set.pieces.length} listées.`);
    }
  }
  if (ARTIFACT_SETS.length < 3) push('Il faut au moins trois ensembles complets.');

  /* — Bâtiments — */
  for (const def of BUILDING_LIST) {
    const label = `Bâtiment « ${def.id} »`;
    if (!isFilled(def.name)) push(`${label} : nom vide.`);
    if (!isFilled(def.description)) push(`${label} : description vide.`);
    if (Object.keys(def.cost).length === 0) push(`${label} : coût vide.`);
    for (const [key, value] of Object.entries(def.cost)) {
      if (!Number.isInteger(value) || value <= 0) push(`${label} : coût invalide pour « ${key} ».`);
    }
    for (const req of def.requires) {
      const reqDef = BUILDINGS[req];
      if (!reqDef) {
        push(`${label} : prérequis inconnu « ${req} ».`);
        continue;
      }
      if (reqDef.faction !== 'commun' && reqDef.faction !== def.faction) {
        push(`${label} : prérequis « ${req} » appartient à une autre architecture.`);
      }
      if (req === def.id) push(`${label} : se requiert lui-même.`);
    }
    const { x, y, z, scale } = def.scene;
    if (x < 0 || x > 100 || y < 0 || y > 100) push(`${label} : position de scène hors du tableau.`);
    if (!Number.isInteger(z) || z < 0 || z > 5) push(`${label} : plan de parallaxe hors bornes.`);
    if (scale <= 0) push(`${label} : échelle de scène invalide.`);

    if (def.grants.length === 0) push(`${label} : n'octroie rien.`);
    for (const grant of def.grants) {
      if (grant.kind === 'dwelling') {
        const creatureDef = CREATURES[grant.creature];
        if (!creatureDef) {
          push(`${label} : demeure d'une créature inconnue « ${grant.creature} ».`);
        } else {
          if (def.faction !== 'commun' && creatureDef.faction !== def.faction) {
            push(`${label} : demeure une créature d'une autre faction.`);
          }
          if (grant.growth !== creatureDef.growth) {
            push(`${label} : croissance ${grant.growth} au lieu de ${creatureDef.growth}.`);
          }
        }
      } else if (grant.kind === 'upgrade') {
        const from = CREATURES[grant.from];
        const to = CREATURES[grant.to];
        if (!from) push(`${label} : améliore une créature inconnue « ${grant.from} ».`);
        if (!to) push(`${label} : améliore vers une créature inconnue « ${grant.to} ».`);
        if (from && to) {
          if (to.upgradeOf !== from.id) {
            push(`${label} : « ${to.id} » n'est pas l'amélioration de « ${from.id} ».`);
          }
          if (from.upgraded) push(`${label} : la source de l'amélioration est déjà améliorée.`);
        }
      }
    }
  }

  // Chaînes séquentielles : le niveau n doit exiger le niveau n-1.
  // Les ateliers d'amélioration forment un groupe d'affichage, pas une chaîne :
  // chacun dépend de sa propre demeure et d'aucun autre atelier.
  const SEQUENTIAL_CHAINS = new Set(['hotel_ville', 'guilde', 'defense', 'demeures']);
  const chains = new Map<string, BuildingDef[]>();
  for (const def of BUILDING_LIST) {
    if (!def.chain) continue;
    const key = `${def.faction}:${def.chain}`;
    const list = chains.get(key) ?? [];
    list.push(def);
    chains.set(key, list);
  }
  for (const [key, list] of chains) {
    const sorted = [...list].sort((a, b) => (a.chainLevel ?? 0) - (b.chainLevel ?? 0));
    const levels = new Set<number>();
    for (const def of sorted) {
      const level = def.chainLevel;
      if (level === undefined) {
        push(`Chaîne « ${key} » : « ${def.id} » n'a pas de niveau.`);
        continue;
      }
      if (levels.has(level)) push(`Chaîne « ${key} » : deux bâtiments au niveau ${level}.`);
      levels.add(level);
    }
    const chainName = key.split(':')[1] ?? '';
    if (!SEQUENTIAL_CHAINS.has(chainName)) continue;
    for (let i = 1; i < sorted.length; i++) {
      const previous = sorted[i - 1];
      const current = sorted[i];
      if (!current.requires.includes(previous.id)) {
        push(`Chaîne « ${key} » : « ${current.id} » ne requiert pas « ${previous.id} ».`);
      }
    }
  }

  // Chaque faction doit pouvoir bâtir ses sept demeures et ses sept ateliers.
  for (const factionId of FACTION_IDS) {
    for (let tier = 1; tier <= 7; tier++) {
      const dwelling = BUILDINGS[`${factionId}_demeure_${tier}`];
      const upgrade = BUILDINGS[`${factionId}_amelioration_${tier}`];
      if (!dwelling) push(`Bâtiment manquant : « ${factionId}_demeure_${tier} ».`);
      if (!upgrade) push(`Bâtiment manquant : « ${factionId}_amelioration_${tier} ».`);
    }
    // Le noyau bâtit ces trois édifices sans vérifier les prérequis :
    // ils doivent donc être clos sur eux-mêmes.
    const starting = startingBuildingsOf(factionId);
    for (const id of starting) {
      const def = BUILDINGS[id];
      if (!def) {
        push(`Bâtiment de départ manquant : « ${id} ».`);
        continue;
      }
      for (const req of def.requires) {
        if (!starting.includes(req)) {
          push(`Bâtiment de départ « ${id} » : le prérequis « ${req} » n'est pas fourni au départ.`);
        }
      }
      if (def.faction !== 'commun' && def.faction !== factionId) {
        push(`Bâtiment de départ « ${id} » : mauvaise architecture.`);
      }
    }
  }

  // Les capacités structurantes doivent exister au moins une fois.
  const grantKinds = new Set<string>();
  for (const def of BUILDING_LIST) for (const grant of def.grants) grantKinds.add(grant.kind);
  for (const required of [
    'dwelling',
    'upgrade',
    'income',
    'mage_guild',
    'defense',
    'tavern',
    'market',
    'blacksmith',
    'stables',
    'mana',
    'growth_bp',
  ]) {
    if (!grantKinds.has(required)) push(`Aucun bâtiment n'octroie « ${required} ».`);
  }
  const guildLevels = new Set<number>();
  for (const def of BUILDING_LIST) {
    for (const grant of def.grants) {
      if (grant.kind === 'mage_guild') guildLevels.add(grant.level);
    }
  }
  for (let level = 1; level <= 5; level++) {
    if (!guildLevels.has(level)) push(`Guilde des Arts : le cercle ${level} manque.`);
  }

  /* — Factions — */
  for (const factionId of FACTION_IDS) {
    const def = FACTIONS[factionId];
    if (!def) {
      push(`Faction manquante : « ${factionId} ».`);
      continue;
    }
    const label = `Faction « ${factionId} »`;
    if (def.id !== factionId) push(`${label} : identifiant incohérent.`);
    for (const [field, value] of Object.entries({
      name: def.name,
      motto: def.motto,
      description: def.description,
      capitalName: def.capitalName,
      mechanicName: def.mechanic.name,
      mechanicDescription: def.mechanic.description,
    })) {
      if (!isFilled(value)) push(`${label} : ${field} vide.`);
    }
    for (const [key, value] of Object.entries(def.colors)) {
      if (!/^#[0-9A-Fa-f]{6}$/.test(value)) push(`${label} : couleur « ${key} » invalide.`);
    }
    for (const [key, value] of Object.entries(def.startingResources)) {
      if (!Number.isInteger(value) || value < 0) {
        push(`${label} : ressource de départ « ${key} » invalide.`);
      }
    }
    if (def.startingResources.ecus <= 0) push(`${label} : aucune réserve d'écus au départ.`);
  }

  /* — Événements de semaine — */
  for (const event of WEEK_EVENTS) {
    const label = `Événement « ${event.key} »`;
    if (!isFilled(event.key)) push('Un événement de semaine a une clef vide.');
    if (!isFilled(event.name)) push(`${label} : nom vide.`);
    if (!isFilled(event.text)) push(`${label} : texte vide.`);
    if (!Number.isInteger(event.weight) || event.weight <= 0) push(`${label} : poids invalide.`);
    for (const effect of event.effects as { kind?: unknown }[]) {
      if (typeof effect.kind !== 'string' || effect.kind.length === 0) {
        push(`${label} : un effet est mal formé.`);
      }
    }
  }

  /* — Gardes neutres — */
  const rings = new Set<number>();
  for (const guard of NEUTRAL_GUARDS) {
    rings.add(guard.ring);
    const label = `Garde d'anneau ${guard.ring}`;
    if (guard.tiers.length === 0) push(`${label} : aucun rang de créature.`);
    for (const tier of guard.tiers) {
      if (!Number.isInteger(tier) || tier < 1 || tier > 7) push(`${label} : rang « ${tier} » invalide.`);
    }
    if (guard.powerMin <= 0 || guard.powerMax <= guard.powerMin) {
      push(`${label} : fourchette de puissance incohérente.`);
    }
  }
  for (const ring of [1, 2, 3, 4]) {
    if (!rings.has(ring)) push(`Aucun gabarit de garde pour l'anneau ${ring}.`);
  }

  /* — Chartes et localités — */
  for (const charter of CHARTERS) {
    const label = `Charte « ${charter.id} »`;
    if (!isFilled(charter.name)) push(`${label} : nom vide.`);
    if (!isFilled(charter.summary)) push(`${label} : résumé vide.`);
    if (!isFilled(charter.description)) push(`${label} : description vide.`);
    if (!isFilled(charter.tradeoff)) push(`${label} : contrepartie non explicitée.`);
    if (charter.effects.length === 0) push(`${label} : aucun effet.`);
  }
  for (const id of ['marchande', 'militaire', 'spirituelle'] as const) {
    if (!CHARTERS.some((c) => c.id === id)) push(`Charte manquante : « ${id} ».`);
  }
  for (const village of VILLAGES) {
    const label = `Localité « ${village.key} »`;
    if (!isFilled(village.name)) push(`${label} : nom vide.`);
    if (!isFilled(village.identity)) push(`${label} : identité vide.`);
    if (!isFilled(village.description)) push(`${label} : description vide.`);
    if (!CHARTERS.some((c) => c.id === village.suggestedCharter)) {
      push(`${label} : charte conseillée inconnue.`);
    }
    for (const [key, value] of Object.entries(village.production)) {
      if (!Number.isInteger(value) || value <= 0) push(`${label} : production « ${key} » invalide.`);
    }
  }

  return errors;
}

/* ── Contrôle de conformité au contrat du moteur ─────────────────────────── */

/**
 * Vérifie à la compilation que ce baril satisfait `ContentPack`.
 * Toute divergence avec `packages/engine/src/core/registry.ts` casse le
 * typecheck de ce paquet, et non celui d'un autre.
 */
const _pack: ContentPack = {
  CONTENT_VERSION,
  CREATURES,
  HEROES,
  SPELLS,
  SKILLS,
  ARTIFACTS,
  BUILDINGS,
  FACTIONS,
  WEEK_EVENTS,
  NEUTRAL_GUARDS,
  creature,
  hero,
  spell,
  skill,
  artifact,
  building,
  creaturesOf,
  buildingsOf,
};
void _pack;

export type {
  ArtifactDef,
  ArtifactId,
  BuildingDef,
  BuildingId,
  CreatureDef,
  CreatureId,
  FactionDef,
  FactionId,
  GuardTemplate,
  HeroDef,
  HeroId,
  SkillDef,
  SkillId,
  SpellDef,
  SpellId,
  WeekEventDef,
};
