/**
 * Artefacts : emplacements, équipement, besace et ensembles.
 *
 * Le contenu (`@auvergne/content`) décrit *ce que sont* les artefacts —
 * emplacement, rareté, effets, caractéristiques primaires, `setId`. Ce fichier
 * décrit *comment ils se portent* : quels emplacements existent, ce qui peut
 * aller où, ce que rapporte un ensemble partiellement réuni, et comment tout
 * cela se cumule sans jamais produire un flottant.
 *
 * Règle de cumul retenue, valable partout dans le moteur :
 *  - les effets additifs (`movement`, `vision`, `morale`, `fortune`,
 *    `mana_regen`) s'additionnent ;
 *  - les ratios en points de base se composent **additivement autour de
 *    10000** : +8 % puis +12 % font +20 %, jamais +20,96 %.
 * Cette règle rend les info-bulles exactes et la simulation reproductible.
 */
import type {
  ArtifactDef,
  ArtifactId,
  ArtifactSlot,
  GameEvent,
  GameState,
  HeroInstance,
  PrimaryStat,
  SkillEffect,
} from '../types.js';
import { content } from '../core/index.js';
import { heroName, joinFr, notice, numberWord } from './common.js';

/* ── Réglages ───────────────────────────────────────────────────────────── */

/**
 * Réglages des artefacts. Toutes les valeurs de l'équipement vivent ici :
 * aucune constante nue n'est écrite ailleurs dans ce fichier.
 */
export const ARTIFACT_TUNING = {
  /** Nombre maximal d'artefacts transportés dans la besace d'un héros. */
  backpackMax: 24,
  /** Les deux anneaux sont interchangeables : un anneau va dans l'un ou l'autre. */
  interchangeableRings: true,
  /**
   * Nombre de pièces d'un même ensemble à partir duquel les primes
   * s'appliquent. Une seule pièce ne fait pas un ensemble.
   */
  setThreshold: 2,
  /** Prime générique par pièce d'ensemble au-delà du seuil, en points de base. */
  setGenericStepBp: 300,
  /** Plafond de la prime générique d'ensemble, en points de base. */
  setGenericMaxBp: 1500,
  /** Valeur d'échange indicative d'un artefact, par rareté, en écus. */
  tradeValue: {
    commun: 600,
    rare: 1600,
    majeur: 3600,
    relique: 7200,
  } as const,
} as const;

/**
 * Ordre canonique des dix emplacements. Sert à l'affichage, au tri des effets
 * et — surtout — à garantir que deux machines parcourent l'équipement dans le
 * même ordre.
 */
export const ARTIFACT_SLOT_ORDER: readonly ArtifactSlot[] = [
  'tete',
  'cou',
  'torse',
  'mains',
  'ceinture',
  'anneau1',
  'anneau2',
  'pieds',
  'banniere',
  'relique',
];

/** Libellés français des emplacements. */
export const ARTIFACT_SLOT_LABELS: Record<ArtifactSlot, string> = {
  tete: 'Tête',
  cou: 'Cou',
  torse: 'Torse',
  mains: 'Mains',
  anneau1: 'Anneau senestre',
  anneau2: 'Anneau dextre',
  ceinture: 'Ceinture',
  pieds: 'Pieds',
  banniere: 'Bannière',
  relique: 'Relique',
};

/** Libellés français des raretés. */
export const ARTIFACT_RARITY_LABELS: Record<ArtifactDef['rarity'], string> = {
  commun: 'commun',
  rare: 'rare',
  majeur: 'majeur',
  relique: 'relique',
};

/**
 * Primes d'ensemble nommées.
 *
 * Le contenu se contente d'apposer un `setId` sur des artefacts ; c'est ici que
 * l'on décide de ce que vaut la réunion. Chaque entrée liste les paliers par
 * nombre de pièces portées. Un ensemble inconnu du tableau reçoit la prime
 * générique décrite par `setGenericStepBp` (mouvement et mana), afin qu'aucun
 * ensemble ajouté par le contenu ne reste sans effet.
 */
export const ARTIFACT_SET_BONUSES: Readonly<
  Record<string, { name: string; tiers: { pieces: number; text: string; effects: SkillEffect[] }[] }>
> = {
  attirail_gabelou: {
    name: 'Attirail du Gabelou',
    tiers: [
      {
        pieces: 2,
        text: 'Chapeau et sifflet suffisent déjà à faire arrêter une charrette.',
        effects: [{ kind: 'income_bp', bp: 10400 }],
      },
      {
        pieces: 3,
        text: 'Les registres du sel se lisent enfin sans lanterne.',
        effects: [
          { kind: 'income_bp', bp: 10700 },
          { kind: 'trade_bp', bp: 10500 },
        ],
      },
      {
        pieces: 4,
        text: 'Attirail complet : +10 % de revenu et +10 % au change du marché.',
        effects: [
          { kind: 'income_bp', bp: 11000 },
          { kind: 'trade_bp', bp: 11000 },
        ],
      },
    ],
  },
  parure_grenadieres: {
    name: 'Parure des Grenadières',
    tiers: [
      {
        pieces: 2,
        text: 'Le même fil, le même métier : la parure commence à se reconnaître.',
        effects: [{ kind: 'defense_bp', bp: 10200 }],
      },
      {
        pieces: 3,
        text: 'Parure complète : +1 au moral et +5 % en défense pour toute l’armée.',
        effects: [
          { kind: 'morale', value: 1 },
          { kind: 'defense_bp', bp: 10500 },
        ],
      },
    ],
  },
  regalia_forez: {
    name: 'Regalia des Comtes du Forez',
    tiers: [
      {
        pieces: 2,
        text: 'On se découvre au passage de la bannière.',
        effects: [{ kind: 'morale', value: 1 }],
      },
      {
        pieces: 3,
        text: 'Les serments anciens se réveillent sous le sceptre.',
        effects: [
          { kind: 'morale', value: 1 },
          { kind: 'income_bp', bp: 11000 },
        ],
      },
      {
        pieces: 4,
        text: 'Regalia complètes : +2 au moral, +1 à la fortune et +15 % de revenu sur tout le domaine.',
        effects: [
          { kind: 'morale', value: 2 },
          { kind: 'fortune', value: 1 },
          { kind: 'income_bp', bp: 11500 },
        ],
      },
    ],
  },
};

/* ── Lecture de l'équipement ────────────────────────────────────────────── */

export interface WornArtifact {
  slot: ArtifactSlot;
  id: ArtifactId;
  def: ArtifactDef | null;
}

/** Artefacts portés, dans l'ordre canonique des emplacements. */
export function wornArtifacts(hero: HeroInstance): WornArtifact[] {
  const table = content().ARTIFACTS;
  const out: WornArtifact[] = [];
  for (const slot of ARTIFACT_SLOT_ORDER) {
    const id = hero.artifacts[slot];
    if (!id) continue;
    out.push({ slot, id, def: table[id] ?? null });
  }
  return out;
}

/** Définition d'un artefact, ou `null` si le contenu ne la connaît pas. */
export function artifactDefOf(id: ArtifactId): ArtifactDef | null {
  return content().ARTIFACTS[id] ?? null;
}

/** Vrai si l'artefact est porté (et non simplement en besace). */
export function isWorn(hero: HeroInstance, id: ArtifactId): boolean {
  for (const slot of ARTIFACT_SLOT_ORDER) {
    if (hero.artifacts[slot] === id) return true;
  }
  return false;
}

/* ── Ensembles ──────────────────────────────────────────────────────────── */

export interface SetProgress {
  setId: string;
  name: string;
  pieces: number;
  /** Palier atteint, ou `null` si le seuil n'est pas franchi. */
  text: string | null;
  effects: SkillEffect[];
}

/**
 * Avancement de chaque ensemble porté, trié par identifiant d'ensemble.
 * Les pièces en besace ne comptent pas : il faut les porter.
 */
export function setProgress(hero: HeroInstance): SetProgress[] {
  const counts = new Map<string, number>();
  for (const worn of wornArtifacts(hero)) {
    const setId = worn.def?.setId;
    if (!setId) continue;
    counts.set(setId, (counts.get(setId) ?? 0) + 1);
  }
  const out: SetProgress[] = [];
  for (const setId of [...counts.keys()].sort()) {
    const pieces = counts.get(setId) ?? 0;
    const known = ARTIFACT_SET_BONUSES[setId];
    if (pieces < ARTIFACT_TUNING.setThreshold) {
      out.push({
        setId,
        name: known ? known.name : setId,
        pieces,
        text: null,
        effects: [],
      });
      continue;
    }
    if (known) {
      // Le meilleur palier dont le nombre de pièces est atteint.
      let best: { pieces: number; text: string; effects: SkillEffect[] } | null = null;
      for (const tier of known.tiers) {
        if (pieces >= tier.pieces && (!best || tier.pieces > best.pieces)) best = tier;
      }
      out.push({
        setId,
        name: known.name,
        pieces,
        text: best ? best.text : null,
        effects: best ? best.effects.map((e) => ({ ...e })) : [],
      });
      continue;
    }
    // Ensemble inconnu du tableau : prime générique, bornée.
    const extra = pieces - ARTIFACT_TUNING.setThreshold + 1;
    const bp = Math.min(
      ARTIFACT_TUNING.setGenericMaxBp,
      ARTIFACT_TUNING.setGenericStepBp * extra,
    );
    out.push({
      setId,
      name: setId,
      pieces,
      text: `Les pièces réunies se répondent (+${Math.trunc(bp / 100)} %).`,
      effects: [
        { kind: 'movement_bp', bp: 10000 + bp },
        { kind: 'mana_max_bp', bp: 10000 + bp },
      ],
    });
  }
  return out;
}

/* ── Cumul des effets ───────────────────────────────────────────────────── */

/**
 * Effets apportés par l'équipement : effets propres de chaque pièce portée,
 * puis primes d'ensemble. L'ordre est déterministe (emplacements canoniques
 * puis identifiants d'ensemble triés).
 */
export function artifactEffects(hero: HeroInstance): SkillEffect[] {
  const out: SkillEffect[] = [];
  for (const worn of wornArtifacts(hero)) {
    if (!worn.def) continue;
    for (const e of worn.def.effects) out.push({ ...e });
  }
  for (const set of setProgress(hero)) {
    for (const e of set.effects) out.push({ ...e });
  }
  return out;
}

/** Caractéristiques primaires apportées par l'équipement porté. */
export function artifactPrimary(hero: HeroInstance): Record<PrimaryStat, number> {
  const out: Record<PrimaryStat, number> = { vaillance: 0, garde: 0, mystique: 0, savoir: 0 };
  for (const worn of wornArtifacts(hero)) {
    const primary = worn.def?.primary;
    if (!primary) continue;
    out.vaillance += primary.vaillance ?? 0;
    out.garde += primary.garde ?? 0;
    out.mystique += primary.mystique ?? 0;
    out.savoir += primary.savoir ?? 0;
  }
  return out;
}

/* ── Équipement ─────────────────────────────────────────────────────────── */

/** Emplacements acceptables pour un artefact donné (anneaux interchangeables). */
export function slotsFor(def: ArtifactDef): ArtifactSlot[] {
  if (
    ARTIFACT_TUNING.interchangeableRings &&
    (def.slot === 'anneau1' || def.slot === 'anneau2')
  ) {
    return ['anneau1', 'anneau2'];
  }
  return [def.slot];
}

/** Premier emplacement libre acceptable, ou `null` si tout est occupé. */
export function freeSlotFor(hero: HeroInstance, def: ArtifactDef): ArtifactSlot | null {
  for (const slot of slotsFor(def)) {
    if (!hero.artifacts[slot]) return slot;
  }
  return null;
}

export interface EquipVerdict {
  ok: boolean;
  reason?: string;
  slot?: ArtifactSlot;
}

/**
 * Peut-on porter cet artefact à cet emplacement ? Chaque refus est expliqué
 * en français, à afficher tel quel.
 */
export function canEquip(
  hero: HeroInstance,
  artifact: ArtifactId,
  slot?: ArtifactSlot,
): EquipVerdict {
  const def = artifactDefOf(artifact);
  if (!def) return { ok: false, reason: `Artefact inconnu : « ${artifact} ».` };
  if (!hero.backpack.includes(artifact)) {
    return { ok: false, reason: `${def.name} n’est pas dans la besace de ${heroName(hero)}.` };
  }
  const allowed = slotsFor(def);
  const target = slot ?? freeSlotFor(hero, def) ?? allowed[0];
  if (!allowed.includes(target)) {
    return {
      ok: false,
      reason: `${def.name} se porte ${
        allowed.length > 1 ? 'aux anneaux' : `à l’emplacement « ${ARTIFACT_SLOT_LABELS[allowed[0]]} »`
      }, pas ailleurs.`,
    };
  }
  return { ok: true, slot: target };
}

/**
 * Équipe un artefact. L'éventuelle pièce déjà portée retourne en besace.
 * Ne recalcule pas les caractéristiques dérivées : `heroStats` s'en charge et
 * le noyau les réapplique après chaque commande.
 */
export function equipArtifact(
  state: GameState,
  hero: HeroInstance,
  artifact: ArtifactId,
  slot?: ArtifactSlot,
): GameEvent[] {
  void state;
  const verdict = canEquip(hero, artifact, slot);
  if (!verdict.ok || !verdict.slot) {
    return [notice(hero.owner, verdict.reason ?? 'Équipement impossible.', 'warn')];
  }
  const def = artifactDefOf(artifact);
  const target = verdict.slot;
  const previous = hero.artifacts[target];
  const index = hero.backpack.indexOf(artifact);
  if (index >= 0) hero.backpack.splice(index, 1);
  if (previous) hero.backpack.push(previous);
  hero.artifacts[target] = artifact;

  const events: GameEvent[] = [
    notice(
      hero.owner,
      `${heroName(hero)} revêt ${def ? def.name : artifact} (${ARTIFACT_SLOT_LABELS[target]}).`,
      'info',
    ),
  ];
  for (const set of setProgress(hero)) {
    if (set.text && set.pieces >= ARTIFACT_TUNING.setThreshold) {
      events.push(
        notice(
          hero.owner,
          `${set.name} — ${numberWord(set.pieces, true)} pièces réunies. ${set.text}`,
          'info',
        ),
      );
    }
  }
  return events;
}

/** Retire l'artefact d'un emplacement et le renvoie en besace. */
export function unequipArtifact(
  state: GameState,
  hero: HeroInstance,
  slot: ArtifactSlot,
): GameEvent[] {
  void state;
  const current = hero.artifacts[slot];
  if (!current) {
    return [notice(hero.owner, `Rien n’est porté à l’emplacement « ${ARTIFACT_SLOT_LABELS[slot]} ».`, 'warn')];
  }
  if (hero.backpack.length >= ARTIFACT_TUNING.backpackMax) {
    return [notice(hero.owner, 'La besace est pleine : impossible d’y ranger une pièce de plus.', 'warn')];
  }
  delete hero.artifacts[slot];
  hero.backpack.push(current);
  const def = artifactDefOf(current);
  return [notice(hero.owner, `${def ? def.name : current} rejoint la besace.`, 'info')];
}

/**
 * Ramasse un artefact trouvé sur la carte : besace, puis port automatique si
 * l'emplacement est libre. C'est la porte d'entrée utilisée par `visitObject`.
 */
export function acquireArtifact(
  state: GameState,
  hero: HeroInstance,
  artifact: ArtifactId,
  autoEquip = true,
): GameEvent[] {
  const def = artifactDefOf(artifact);
  if (hero.backpack.length >= ARTIFACT_TUNING.backpackMax) {
    return [
      notice(
        hero.owner,
        `La besace de ${heroName(hero)} déborde : ${def ? def.name : artifact} reste sur place.`,
        'warn',
      ),
    ];
  }
  hero.backpack.push(artifact);
  if (!def) {
    return [notice(hero.owner, `Un objet inconnu rejoint la besace.`, 'info')];
  }
  const events: GameEvent[] = [
    notice(
      hero.owner,
      `${def.name} — ${ARTIFACT_RARITY_LABELS[def.rarity]}. ${def.lore}`,
      def.rarity === 'relique' ? 'warn' : 'info',
    ),
  ];
  if (autoEquip && freeSlotFor(hero, def)) {
    events.push(...equipArtifact(state, hero, artifact));
  }
  return events;
}

/** Retire du héros vaincu ses pièces non liées. Les reliques restent. */
export function stripArtifacts(hero: HeroInstance, keepReliques = true): ArtifactId[] {
  const lost: ArtifactId[] = [];
  for (const slot of ARTIFACT_SLOT_ORDER) {
    const id = hero.artifacts[slot];
    if (!id) continue;
    const def = artifactDefOf(id);
    if (keepReliques && def && def.rarity === 'relique') continue;
    delete hero.artifacts[slot];
    lost.push(id);
  }
  const kept: ArtifactId[] = [];
  for (const id of hero.backpack) {
    const def = artifactDefOf(id);
    if (keepReliques && def && def.rarity === 'relique') kept.push(id);
    else lost.push(id);
  }
  hero.backpack = kept;
  return lost.sort();
}

/* ── Description ────────────────────────────────────────────────────────── */

/** Valeur d'échange indicative d'un artefact, en écus. */
export function artifactValue(id: ArtifactId): number {
  const def = artifactDefOf(id);
  if (!def) return 0;
  return ARTIFACT_TUNING.tradeValue[def.rarity] ?? 0;
}

/** Texte d'info-bulle complet, en français. */
export function describeArtifact(id: ArtifactId): string {
  const def = artifactDefOf(id);
  if (!def) return `Objet inconnu : « ${id} ».`;
  const parts: string[] = [
    `${def.name} — ${ARTIFACT_RARITY_LABELS[def.rarity]}, ${ARTIFACT_SLOT_LABELS[def.slot]}.`,
  ];
  const effects = describeEffectList(def.effects);
  if (effects.length > 0) parts.push(joinFr(effects) + '.');
  if (def.primary) {
    const prim: string[] = [];
    if (def.primary.vaillance) prim.push(`Vaillance +${def.primary.vaillance}`);
    if (def.primary.garde) prim.push(`Garde +${def.primary.garde}`);
    if (def.primary.mystique) prim.push(`Mystique +${def.primary.mystique}`);
    if (def.primary.savoir) prim.push(`Savoir +${def.primary.savoir}`);
    if (prim.length > 0) parts.push(joinFr(prim) + '.');
  }
  if (def.setId) {
    const set = ARTIFACT_SET_BONUSES[def.setId];
    parts.push(`Ensemble : ${set ? set.name : def.setId}.`);
  }
  parts.push(def.lore);
  return parts.join(' ');
}

/** Libellés français d'une liste d'effets. Réutilisé par les info-bulles. */
export function describeEffectList(effects: readonly SkillEffect[]): string[] {
  const out: string[] = [];
  for (const e of effects) out.push(describeEffect(e));
  return out;
}

/** Libellé français d'un effet unitaire. */
export function describeEffect(e: SkillEffect): string {
  const pct = (bp: number): string => {
    const delta = bp - 10000;
    const sign = delta >= 0 ? '+' : '−';
    return `${sign}${Math.abs(Math.trunc(delta / 100))} %`;
  };
  switch (e.kind) {
    case 'movement':
      return `${e.value >= 0 ? '+' : '−'}${Math.abs(e.value)} points de marche`;
    case 'movement_bp':
      return `marche ${pct(e.bp)}`;
    case 'vision':
      return `${e.value >= 0 ? '+' : '−'}${Math.abs(e.value)} de portée de vue`;
    case 'morale':
      return `moral ${e.value >= 0 ? '+' : '−'}${Math.abs(e.value)}`;
    case 'fortune':
      return `fortune ${e.value >= 0 ? '+' : '−'}${Math.abs(e.value)}`;
    case 'mana_max_bp':
      return `réserve de mana ${pct(e.bp)}`;
    case 'mana_regen':
      return `${e.value >= 0 ? '+' : '−'}${Math.abs(e.value)} mana par jour`;
    case 'spell_power_bp':
      return `puissance des sorts ${pct(e.bp)}`;
    case 'trade_bp':
      return `change au marché ${pct(e.bp)}`;
    case 'income_bp':
      return `revenus ${pct(e.bp)}`;
    case 'build_cost_bp':
      return `coût des constructions ${pct(e.bp)}`;
    case 'tactics_rows':
      return `${e.value} rangée(s) de déploiement`;
    case 'first_strike_bp':
      return `premier choc ${pct(e.bp)}`;
    case 'defense_bp':
      return `défense ${pct(e.bp)}`;
    case 'siege_damage_bp':
      return `dégâts de siège ${pct(e.bp)}`;
    case 'heal_bp':
      return `soins ${pct(e.bp)}`;
    case 'terrain_cost_bp':
      return `coût en ${e.terrain} ${pct(e.bp)}`;
    case 'flank_bp':
      return `attaques de flanc ${pct(e.bp)}`;
    case 'resist_bp':
      return `résistance à la magie +${Math.trunc(e.bp / 100)} %`;
    case 'summon_bp':
      return `invocations ${pct(e.bp)}`;
    case 'xp_bp':
      return `expérience ${pct(e.bp)}`;
    default:
      return 'effet inconnu';
  }
}
