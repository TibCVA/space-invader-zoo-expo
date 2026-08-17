/**
 * Magie d'aventure : les sorts que l'on lance sur la carte, hors bataille.
 *
 * Cinq familles, toutes décrites en données par `@auvergne/content` et
 * interprétées ici :
 *
 *  - `vision` / `reveal_map` : la brume se lève sur une portion de carte ;
 *  - `movement`              : la colonne gagne des pas — et, pour l'école des
 *                              Sources, découvre un **gué** praticable ;
 *  - `weather_shift`         : le front bascule d'un cran ;
 *  - `teleport`              : le Cercle des bornes, d'une pierre à l'autre ;
 *  - `summon`                : la futaie prête des combattants pour la route.
 *
 * Le noyau valide le sort, débite le mana puis appelle `castAdventureSpell`.
 * Ce module n'a donc pas à repayer le coût ; en revanche il refuse proprement,
 * en français, tout ce qui n'a pas de sens (cible manquante, gué trop large,
 * borne inconnue) et le noyau enregistre le refus dans le journal.
 */
import {
  type CreatureId,
  type GameEvent,
  type GameState,
  type HeroInstance,
  type MapCoord,
  type SpellDef,
  type SpellId,
  type WorldMap,
} from '../types.js';
import {
  addToArmy,
  applyBp,
  chebyshev,
  clampInt,
  content,
  isExplored,
  isPassable,
  revealFog,
  sameCoord,
  terrainAt,
} from '../core/index.js';
import {
  combineEffectBp,
  hasVisited,
  heroName,
  joinFr,
  notice,
  numberWord,
  objectName,
} from './common.js';
import { activeEffects, heroStats } from './hero-stats.js';
import { borneNetwork } from './objects.js';
import { shiftWeatherNow } from './weather.js';

/* ── Réglages ───────────────────────────────────────────────────────────── */

/**
 * Réglages de la magie d'aventure. Les portées et les quantités dépendent
 * toutes de la Mystique du héros et des ratios de puissance magique, jamais
 * d'un nombre écrit en dur ailleurs.
 */
export const ADVENTURE_SPELL_TUNING = {
  /** Portée de révélation ajoutée par point de Mystique. */
  revealPerMystique: 1,
  /** Portée de révélation maximale, en cases. */
  revealMax: 48,
  /** Points de marche ajoutés par point de Mystique à un sort de marche. */
  movementPerMystique: 12,
  /** Plafond de points de marche cumulés : deux journées, pas davantage. */
  movementCeilingFactor: 2,
  /** Largeur maximale d'un gué ouvert par l'école des Sources, en cases. */
  fordMaxWidth: 4,
  /** École dont les sorts de marche ouvrent un gué. */
  fordSchool: 'sources' as const,
  /** Portée de base d'un déplacement magique hors réseau des bornes. */
  teleportBase: 6,
  /** Portée ajoutée par point de Mystique. */
  teleportPerMystique: 2,
  /** Portée maximale d'un déplacement magique hors réseau. */
  teleportMax: 30,
  /** Créatures invoquées par point de Mystique, avant ratio d'Invocation. */
  summonPerMystique: 1,
  /** Portée révélée automatiquement à l'arrivée d'un déplacement magique. */
  arrivalReveal: 1,
} as const;

/* ── Lecture ────────────────────────────────────────────────────────────── */

/** Définition d'un sort, ou `null`. */
export function spellDefOf(spell: SpellId): SpellDef | null {
  return content().SPELLS[spell] ?? null;
}

/** Vrai si ce sort peut être lancé hors bataille. */
export function isAdventureSpell(spell: SpellId): boolean {
  const def = spellDefOf(spell);
  if (!def) return false;
  return def.scope === 'aventure' || def.scope === 'les_deux';
}

/**
 * Coût réel d'un sort pour ce héros, spécialités comprises.
 * Reproduit la règle appliquée par le noyau, afin que l'interface affiche le
 * même nombre que celui qui sera débité.
 */
export function adventureSpellCost(hero: HeroInstance, spell: SpellId): number {
  const def = spellDefOf(spell);
  if (!def) return 0;
  const hdef = content().HEROES[hero.def];
  let cost = def.cost;
  if (hdef) {
    if (hdef.specialty.kind === 'spell' && hdef.specialty.spell === spell) {
      cost = Math.max(1, applyBp(cost, hdef.specialty.costBp));
    } else if (hdef.specialty.kind === 'school' && hdef.specialty.school === def.school) {
      cost = Math.max(1, applyBp(cost, hdef.specialty.costBp));
    }
  }
  return Math.max(1, cost);
}

/** Sorts d'aventure connus du héros, triés par école puis par degré. */
export function listAdventureSpells(
  hero: HeroInstance,
): { spell: SpellId; def: SpellDef; cost: number; affordable: boolean }[] {
  const out: { spell: SpellId; def: SpellDef; cost: number; affordable: boolean }[] = [];
  for (const id of hero.spells.slice().sort()) {
    const def = spellDefOf(id);
    if (!def || !isAdventureSpell(id)) continue;
    const cost = adventureSpellCost(hero, id);
    out.push({ spell: id, def, cost, affordable: hero.mana >= cost });
  }
  return out.sort((a, b) =>
    a.def.school === b.def.school
      ? a.def.level - b.def.level
      : a.def.school < b.def.school
        ? -1
        : 1,
  );
}

/** Vrai si ce sort exige une case de destination. */
export function needsTarget(spell: SpellId): boolean {
  const def = spellDefOf(spell);
  if (!def) return false;
  for (const e of def.effects) {
    if (e.kind === 'teleport') return true;
  }
  return false;
}

/* ── Portées ────────────────────────────────────────────────────────────── */

/** Portée d'un déplacement magique hors réseau des bornes, pour ce héros. */
export function teleportRange(state: GameState, hero: HeroInstance): number {
  const mystique = heroStats(state, hero).mystique;
  return clampInt(
    ADVENTURE_SPELL_TUNING.teleportBase +
      mystique * ADVENTURE_SPELL_TUNING.teleportPerMystique,
    ADVENTURE_SPELL_TUNING.teleportBase,
    ADVENTURE_SPELL_TUNING.teleportMax,
  );
}

/** Rayon réellement révélé par un sort de vision. */
export function revealRadius(state: GameState, hero: HeroInstance, base: number): number {
  const mystique = heroStats(state, hero).mystique;
  return clampInt(
    base + mystique * ADVENTURE_SPELL_TUNING.revealPerMystique,
    1,
    ADVENTURE_SPELL_TUNING.revealMax,
  );
}

/* ── Gué ────────────────────────────────────────────────────────────────── */

export interface FordCheck {
  ok: boolean;
  reason?: string;
  /** Cases d'eau franchies. */
  width: number;
  landing?: MapCoord;
}

/**
 * Le héros peut-il franchir l'eau jusqu'à cette case ?
 *
 * L'école des Sources « retire l'eau d'un pas sur chaque rive et découvre les
 * dalles du gué ». Concrètement : la ligne droite entre le héros et la cible
 * ne doit traverser que de l'eau, sur une largeur bornée, et la rive d'arrivée
 * doit être praticable.
 */
export function checkFord(
  world: WorldMap,
  hero: HeroInstance,
  target: MapCoord,
): FordCheck {
  if (sameCoord(hero.at, target)) return { ok: false, reason: 'Le héros y est déjà.', width: 0 };
  const steps = chebyshev(hero.at, target);
  if (steps > ADVENTURE_SPELL_TUNING.fordMaxWidth + 1) {
    return { ok: false, reason: 'La rive d’en face est trop loin pour un gué.', width: steps };
  }
  if (!isPassable(world, target.col, target.row)) {
    return { ok: false, reason: 'On ne prend pied nulle part de ce côté-là.', width: steps };
  }

  let water = 0;
  for (let i = 1; i < steps; i++) {
    const col = hero.at.col + Math.trunc(((target.col - hero.at.col) * i) / steps);
    const row = hero.at.row + Math.trunc(((target.row - hero.at.row) * i) / steps);
    if (terrainAt(world, col, row) !== 'eau') {
      return { ok: false, reason: 'Ce passage ne traverse aucune eau : le gué n’a rien à découvrir.', width: water };
    }
    water++;
  }
  if (water === 0) {
    return { ok: false, reason: 'Ce passage ne traverse aucune eau : le gué n’a rien à découvrir.', width: 0 };
  }
  if (water > ADVENTURE_SPELL_TUNING.fordMaxWidth) {
    return { ok: false, reason: 'Le lit est trop large : l’eau ne se retirera pas jusque-là.', width: water };
  }
  return { ok: true, width: water, landing: { col: target.col, row: target.row } };
}

/* ── Lancement ──────────────────────────────────────────────────────────── */

/**
 * Applique les effets d'un sort d'aventure.
 * Signature imposée par `docs/02-API.md`.
 */
export function castAdventureSpell(
  state: GameState,
  world: WorldMap,
  hero: HeroInstance,
  spell: SpellId,
  target?: MapCoord,
): GameEvent[] {
  const def = spellDefOf(spell);
  if (!def) return [notice(hero.owner, `Sort inconnu : « ${spell} ».`, 'warn')];
  if (!isAdventureSpell(spell)) {
    return [notice(hero.owner, `${def.name} ne se lance qu’en bataille.`, 'warn')];
  }

  const events: GameEvent[] = [];
  const effects = activeEffects(state, hero);
  const powerBp = combineEffectBp(effects, 'spell_power_bp');
  let applied = 0;

  for (const effect of def.effects) {
    switch (effect.kind) {
      case 'movement': {
        applied++;
        events.push(...applyMovement(state, world, hero, def, effect.value, powerBp, target));
        break;
      }
      case 'vision':
      case 'reveal_map': {
        applied++;
        const at = target ?? hero.at;
        const radius = revealRadius(state, hero, effect.radius);
        const cells = revealFog(state, world, hero.owner, at, radius);
        if (cells.length > 0) events.push({ type: 'FogRevealed', player: hero.owner, cells });
        events.push(
          notice(
            hero.owner,
            `${def.name} — la brume se retire sur ${numberWord(radius)} cases autour de ` +
              `(${at.col}, ${at.row}) : ${numberWord(cells.length)} nouvelles cases entrent au registre.`,
            'info',
          ),
        );
        break;
      }
      case 'weather_shift': {
        applied++;
        events.push(...shiftWeatherNow(state));
        break;
      }
      case 'teleport': {
        applied++;
        events.push(...applyTeleport(state, world, hero, def, target));
        break;
      }
      case 'summon': {
        applied++;
        events.push(
          ...applySummon(state, hero, def, effect.creature, effect.base, effect.perMystique),
        );
        break;
      }
      default:
        // Effets de bataille inclus dans un sort mixte : sans objet ici.
        break;
    }
  }

  if (applied === 0) {
    events.push(
      notice(hero.owner, `${def.name} n’a aucun effet hors du champ de bataille.`, 'warn'),
    );
  }
  return events;
}

/* — Marche et gué — */

function applyMovement(
  state: GameState,
  world: WorldMap,
  hero: HeroInstance,
  def: SpellDef,
  value: number,
  powerBp: number,
  target?: MapCoord,
): GameEvent[] {
  const events: GameEvent[] = [];
  const mystique = heroStats(state, hero).mystique;
  const bonus = mystique * ADVENTURE_SPELL_TUNING.movementPerMystique;
  const gain = Math.max(1, applyBp(value + bonus, powerBp));
  const ceiling = hero.movementMax * ADVENTURE_SPELL_TUNING.movementCeilingFactor;
  const before = hero.movement;
  hero.movement = Math.min(ceiling, hero.movement + gain);
  const real = hero.movement - before;

  // Gué : les sorts de marche de l'école des Sources ouvrent un passage.
  if (target && def.school === ADVENTURE_SPELL_TUNING.fordSchool) {
    const ford = checkFord(world, hero, target);
    if (ford.ok && ford.landing) {
      hero.at = { col: ford.landing.col, row: ford.landing.row };
      hero.path = null;
      hero.inTown = null;
      const cells = revealFog(
        state,
        world,
        hero.owner,
        hero.at,
        heroStats(state, hero).vision + ADVENTURE_SPELL_TUNING.arrivalReveal,
      );
      if (cells.length > 0) events.push({ type: 'FogRevealed', player: hero.owner, cells });
      events.push({
        type: 'HeroMoved',
        hero: hero.uid,
        path: [{ col: hero.at.col, row: hero.at.row }],
        costSpent: 0,
      });
      events.push(
        notice(
          hero.owner,
          `${def.name} — l’eau se retire d’un pas sur chaque rive et découvre les dalles. ` +
            `${heroName(hero)} traverse ${numberWord(ford.width, true)} cases de rivière sans se mouiller les jarrets, ` +
            `et gagne ${real} points de marche.`,
          'info',
        ),
      );
      return events;
    }
    if (!ford.ok && ford.reason && ford.width > 0) {
      events.push(notice(hero.owner, `${def.name} — ${ford.reason}`, 'warn'));
    }
  }

  events.push(
    notice(
      hero.owner,
      `${def.name} — la colonne allonge le pas : ${real} points de marche de plus aujourd’hui.`,
      'info',
    ),
  );
  return events;
}

/* — Déplacement magique — */

function applyTeleport(
  state: GameState,
  world: WorldMap,
  hero: HeroInstance,
  def: SpellDef,
  target?: MapCoord,
): GameEvent[] {
  if (!target) {
    return [notice(hero.owner, `${def.name} exige une destination.`, 'warn')];
  }
  if (sameCoord(hero.at, target)) {
    return [notice(hero.owner, `${def.name} — le héros est déjà sur cette case.`, 'warn')];
  }
  if (
    target.col < 0 ||
    target.row < 0 ||
    target.col >= world.cols ||
    target.row >= world.rows
  ) {
    return [notice(hero.owner, `${def.name} — cette destination n’existe pas.`, 'warn')];
  }
  if (!isPassable(world, target.col, target.row)) {
    return [notice(hero.owner, `${def.name} — on ne peut pas prendre pied sur cette case.`, 'warn')];
  }

  // Cercle des bornes : d'une pierre découverte à une autre, sans limite de portée.
  const bornes = borneNetwork(state);
  const here = bornes.find((o) => sameCoord(o.entrance, hero.at)) ?? null;
  const there = bornes.find((o) => sameCoord(o.entrance, target)) ?? null;
  const throughStones = here !== null && there !== null;

  if (throughStones && there && !hasVisited(there, hero.owner)) {
    return [
      notice(
        hero.owner,
        `${def.name} — les bornes ne répondent qu’aux pierres déjà vues. ` +
          `${objectName(there, 'Celle-ci')} vous est inconnue.`,
        'warn',
      ),
    ];
  }

  if (!throughStones) {
    if (!isExplored(state, hero.owner, world, target)) {
      return [
        notice(
          hero.owner,
          `${def.name} — on ne se transporte pas là où l’on n’a jamais mis les yeux.`,
          'warn',
        ),
      ];
    }
    const range = teleportRange(state, hero);
    const distance = chebyshev(hero.at, target);
    if (distance > range) {
      return [
        notice(
          hero.owner,
          `${def.name} — hors de portée : ${distance} cases pour une portée de ${range}.`,
          'warn',
        ),
      ];
    }
  }

  hero.at = { col: target.col, row: target.row };
  hero.path = null;
  hero.inTown = null;

  const events: GameEvent[] = [];
  const cells = revealFog(
    state,
    world,
    hero.owner,
    hero.at,
    heroStats(state, hero).vision + ADVENTURE_SPELL_TUNING.arrivalReveal,
  );
  if (cells.length > 0) events.push({ type: 'FogRevealed', player: hero.owner, cells });
  events.push({
    type: 'HeroMoved',
    hero: hero.uid,
    path: [{ col: hero.at.col, row: hero.at.row }],
    costSpent: 0,
  });
  events.push(
    notice(
      hero.owner,
      throughStones && here && there
        ? `${def.name} — la formule est prononcée à ${objectName(here, 'la borne')} ; ` +
            `la colonne se retrouve d’un pas au pied de ${objectName(there, 'la borne suivante')}.`
        : `${def.name} — ${heroName(hero)} disparaît dans un pli de brume et reparaît en ` +
            `(${target.col}, ${target.row}).`,
      'info',
    ),
  );
  return events;
}

/* — Invocation — */

function applySummon(
  state: GameState,
  hero: HeroInstance,
  def: SpellDef,
  creature: CreatureId,
  base: number,
  perMystique: number,
): GameEvent[] {
  const stats = heroStats(state, hero);
  const summonBp = combineEffectBp(activeEffects(state, hero), 'summon_bp');
  const raw = base + stats.mystique * perMystique * ADVENTURE_SPELL_TUNING.summonPerMystique;
  const count = Math.max(1, applyBp(raw, summonBp));

  if (!addToArmy(hero.army, creature, count)) {
    return [
      notice(
        hero.owner,
        `${def.name} — les sept emplacements d’armée sont pris : ce que la forêt prête, ` +
          `elle le reprend aussitôt.`,
        'warn',
      ),
    ];
  }
  const cdef = content().CREATURES[creature];
  return [
    notice(
      hero.owner,
      `${def.name} — ${numberWord(count)} ${
        cdef ? (count > 1 ? cdef.namePlural : cdef.name) : creature
      } sortent du couvert et se rangent derrière la bannière.`,
      'info',
    ),
  ];
}

/* ── Aperçu ─────────────────────────────────────────────────────────────── */

export interface AdventureCastCheck {
  ok: boolean;
  reason?: string;
  cost: number;
  needsTarget: boolean;
}

/**
 * Aperçu du lancement, sans rien modifier : coût, cible requise, refus
 * éventuel. Utilisé par l'interface avant confirmation.
 */
export function checkAdventureCast(
  state: GameState,
  world: WorldMap,
  hero: HeroInstance,
  spell: SpellId,
  target?: MapCoord,
): AdventureCastCheck {
  const def = spellDefOf(spell);
  if (!def) return { ok: false, reason: `Sort inconnu : « ${spell} ».`, cost: 0, needsTarget: false };
  const cost = adventureSpellCost(hero, spell);
  const requires = needsTarget(spell);

  if (!hero.spells.includes(spell)) {
    return { ok: false, reason: `${heroName(hero)} ne connaît pas ${def.name}.`, cost, needsTarget: requires };
  }
  if (!isAdventureSpell(spell)) {
    return { ok: false, reason: `${def.name} ne se lance qu’en bataille.`, cost, needsTarget: requires };
  }
  if (hero.mana < cost) {
    return {
      ok: false,
      reason: `Mana insuffisant : ${def.name} coûte ${cost} points, il en reste ${hero.mana}.`,
      cost,
      needsTarget: requires,
    };
  }
  if (requires && !target) {
    return { ok: false, reason: `${def.name} exige une destination.`, cost, needsTarget: requires };
  }
  if (requires && target && !isPassable(world, target.col, target.row)) {
    return {
      ok: false,
      reason: `${def.name} — on ne peut pas prendre pied sur cette case.`,
      cost,
      needsTarget: requires,
    };
  }
  return { ok: true, cost, needsTarget: requires };
}

/** Phrase d'aperçu pour l'info-bulle d'un sort d'aventure. */
export function adventureSpellSentence(
  state: GameState,
  hero: HeroInstance,
  spell: SpellId,
): string {
  const def = spellDefOf(spell);
  if (!def) return `Sort inconnu : « ${spell} ».`;
  const parts: string[] = [`${def.name} — ${adventureSpellCost(hero, spell)} points de mana.`];
  for (const effect of def.effects) {
    switch (effect.kind) {
      case 'vision':
      case 'reveal_map':
        parts.push(`Révèle ${revealRadius(state, hero, effect.radius)} cases à la ronde.`);
        break;
      case 'movement':
        parts.push(
          `Rend environ ${
            effect.value + heroStats(state, hero).mystique * ADVENTURE_SPELL_TUNING.movementPerMystique
          } points de marche.`,
        );
        break;
      case 'teleport':
        parts.push(
          `Transporte le héros : portée ${teleportRange(state, hero)} cases, sans limite entre deux bornes connues.`,
        );
        break;
      case 'weather_shift':
        parts.push('Fait basculer le front d’un jour.');
        break;
      case 'summon':
        parts.push('Appelle des combattants sur la route.');
        break;
      default:
        break;
    }
  }
  parts.push(def.description);
  return parts.join(' ');
}
