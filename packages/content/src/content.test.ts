/**
 * Validation du contenu : cohérence structurelle, contrat du moteur et
 * qualité rédactionnelle française.
 */
import { describe, expect, it } from 'vitest';
import type { ContentPack } from '@auvergne/engine';
import * as content from './index.js';
import {
  ARTIFACT_LIST,
  ARTIFACT_SETS,
  BUILDING_LIST,
  CHARTERS,
  CONTENT_VERSION,
  CREATURE_LIST,
  HERO_LIST,
  NEUTRAL_GUARDS,
  SKILL_LIST,
  SPELL_LIST,
  VILLAGES,
  WEEK_EVENTS,
  validateContent,
} from './index.js';
import { sentenceCount } from './util.js';

describe('validateContent', () => {
  it('ne relève aucune anomalie', () => {
    const errors = validateContent();
    expect(errors).toEqual([]);
  });
});

describe('effectifs imposés par docs/02-API.md', () => {
  it('28 créatures, 14 par faction', () => {
    expect(CREATURE_LIST).toHaveLength(28);
    expect(CREATURE_LIST.filter((c) => c.faction === 'granit')).toHaveLength(14);
    expect(CREATURE_LIST.filter((c) => c.faction === 'ermitage')).toHaveLength(14);
  });

  it('les identifiants de créature suivent la nomenclature imposée', () => {
    const expected: string[] = [];
    for (const faction of ['granit', 'ermitage']) {
      for (let tier = 1; tier <= 7; tier++) {
        expected.push(`${faction}_t${tier}`, `${faction}_t${tier}_up`);
      }
    }
    expect(Object.keys(content.CREATURES).sort()).toEqual(expected.sort());
  });

  it('21 héros, dont Jules neutre', () => {
    expect(HERO_LIST).toHaveLength(21);
    expect(HERO_LIST.filter((h) => h.faction === 'granit')).toHaveLength(10);
    expect(HERO_LIST.filter((h) => h.faction === 'ermitage')).toHaveLength(10);
    expect(content.HEROES.jules.faction).toBe('neutre');
  });

  it('les identifiants de héros sont exactement ceux du contrat', () => {
    expect(Object.keys(content.HEROES).sort()).toEqual(
      [
        'alice',
        'agathe',
        'anastasia',
        'auguste',
        'caroline',
        'clotilde',
        'come',
        'georges',
        'gustave',
        'ines',
        'jean',
        'josephine',
        'jules',
        'lise',
        'loic',
        'mathilde',
        'matthieu',
        'paul',
        'roxane',
        'thibaut',
        'thomas',
      ].sort(),
    );
  });

  it('32 sorts, 8 par école', () => {
    expect(SPELL_LIST).toHaveLength(32);
    for (const school of content.SPELL_SCHOOLS) {
      expect(content.spellsOfSchool(school)).toHaveLength(8);
    }
  });

  it('20 compétences, exactement celles du contrat', () => {
    expect(SKILL_LIST).toHaveLength(20);
    expect(Object.keys(content.SKILLS).sort()).toEqual(
      [
        'balistique',
        'cartographie',
        'commandement',
        'commerce',
        'diplomatie',
        'embuscade',
        'erudition',
        'fortune',
        'forges',
        'guerison',
        'intendance',
        'invocation',
        'logistique',
        'occultisme',
        'pelerinage',
        'reconnaissance',
        'resistance',
        'seigneurie',
        'sylviculture',
        'tactique',
      ].sort(),
    );
  });

  it('au moins 48 artefacts et trois ensembles complets', () => {
    expect(ARTIFACT_LIST.length).toBeGreaterThanOrEqual(48);
    expect(ARTIFACT_SETS.length).toBeGreaterThanOrEqual(3);
    for (const set of ARTIFACT_SETS) {
      expect(content.artifactsOfSet(set.id).map((a) => a.id).sort()).toEqual(
        [...set.pieces].sort(),
      );
    }
    for (const rarity of ['commun', 'rare', 'majeur', 'relique'] as const) {
      expect(content.artifactsOfRarity(rarity).length).toBeGreaterThan(0);
    }
  });

  it('au moins 16 événements de semaine, tous pondérés', () => {
    expect(WEEK_EVENTS.length).toBeGreaterThanOrEqual(16);
    expect(content.WEEK_EVENT_WEIGHT_TOTAL).toBeGreaterThan(0);
    for (const event of WEEK_EVENTS) expect(event.weight).toBeGreaterThan(0);
  });

  it('les quatre anneaux de gardes neutres sont couverts', () => {
    for (const ring of [1, 2, 3, 4] as const) {
      expect(content.guardsOfRing(ring).length).toBeGreaterThan(0);
    }
    expect(NEUTRAL_GUARDS.length).toBeGreaterThanOrEqual(8);
  });

  it('les trois chartes et les localités du document maître sont décrites', () => {
    expect(CHARTERS.map((c) => c.id).sort()).toEqual(['marchande', 'militaire', 'spirituelle']);
    const keys = VILLAGES.map((v) => v.key);
    for (const key of [
      'arconsat',
      'chabreloche',
      'le_lac',
      'cervieres',
      'viscomtat',
      'noiretable',
      'vollore_montagne',
      'renaudie',
      'hermitage',
    ]) {
      expect(keys).toContain(key);
    }
  });
});

describe('contrat ContentPack', () => {
  it('le baril fournit toutes les clefs attendues', () => {
    const pack = content as unknown as ContentPack;
    for (const key of [
      'CONTENT_VERSION',
      'CREATURES',
      'HEROES',
      'SPELLS',
      'SKILLS',
      'ARTIFACTS',
      'BUILDINGS',
      'FACTIONS',
      'WEEK_EVENTS',
      'NEUTRAL_GUARDS',
    ] as const) {
      expect(pack[key]).toBeDefined();
    }
    for (const key of [
      'creature',
      'hero',
      'spell',
      'skill',
      'artifact',
      'building',
      'creaturesOf',
      'buildingsOf',
    ] as const) {
      expect(typeof pack[key]).toBe('function');
    }
    expect(typeof CONTENT_VERSION).toBe('string');
    expect(CONTENT_VERSION.length).toBeGreaterThan(0);
  });

  it('les accesseurs lèvent une erreur française sur un identifiant inconnu', () => {
    expect(() => content.creature('inconnu')).toThrow(/Créature inconnue/);
    expect(() => content.hero('inconnu')).toThrow(/Héros inconnu/);
    expect(() => content.spell('inconnu')).toThrow(/Sort inconnu/);
    expect(() => content.skill('inconnu')).toThrow(/Compétence inconnue/);
    expect(() => content.artifact('inconnu')).toThrow(/Artefact inconnu/);
    expect(() => content.building('inconnu')).toThrow(/Bâtiment inconnu/);
  });

  it('creaturesOf et buildingsOf filtrent correctement', () => {
    expect(content.creaturesOf('granit')).toHaveLength(14);
    expect(content.creaturesOf('granit', 7)).toHaveLength(2);
    expect(content.creaturesOf('ermitage', 1).every((c) => c.tier === 1)).toBe(true);

    const granitBuildings = content.buildingsOf('granit');
    expect(granitBuildings.some((b) => b.id === 'granit_demeure_1')).toBe(true);
    expect(granitBuildings.some((b) => b.id === 'taverne')).toBe(true);
    expect(granitBuildings.some((b) => b.id === 'ermitage_demeure_1')).toBe(false);
  });

  it('les bâtiments de départ du noyau existent et sont clos sur eux-mêmes', () => {
    for (const faction of ['granit', 'ermitage'] as const) {
      const starting = content.startingBuildingsOf(faction);
      expect(starting).toEqual([`${faction}_demeure_1`, `${faction}_demeure_2`, 'taverne']);
      for (const id of starting) {
        const def = content.BUILDINGS[id];
        expect(def, `bâtiment de départ ${id}`).toBeDefined();
        for (const req of def.requires) expect(starting).toContain(req);
      }
    }
  });
});

/* ── Qualité rédactionnelle ──────────────────────────────────────────────── */

const ACCENTS = /[àâäçéèêëîïôöùûüœÀÂÄÇÉÈÊËÎÏÔÖÙÛÜŒ]/u;

/** Mots anglais dont la présence trahirait un texte non traduit. */
const ENGLISH = /\b(the|and|with|attack|defense|health|damage|speed|level|guild|castle)\b/i;

function allPlayerTexts(): { where: string; text: string }[] {
  const out: { where: string; text: string }[] = [];
  for (const c of CREATURE_LIST) {
    out.push({ where: `créature ${c.id} nom`, text: c.name });
    out.push({ where: `créature ${c.id} pluriel`, text: c.namePlural });
    out.push({ where: `créature ${c.id} lore`, text: c.lore });
  }
  for (const h of HERO_LIST) {
    out.push({ where: `héros ${h.id} nom`, text: h.name });
    out.push({ where: `héros ${h.id} classe`, text: h.class });
    out.push({ where: `héros ${h.id} titre`, text: h.title });
    out.push({ where: `héros ${h.id} bio`, text: h.bio });
  }
  for (const s of SPELL_LIST) {
    out.push({ where: `sort ${s.id} nom`, text: s.name });
    out.push({ where: `sort ${s.id} description`, text: s.description });
  }
  for (const s of SKILL_LIST) {
    out.push({ where: `compétence ${s.id} nom`, text: s.name });
    out.push({ where: `compétence ${s.id} description`, text: s.description });
  }
  for (const a of ARTIFACT_LIST) {
    out.push({ where: `artefact ${a.id} nom`, text: a.name });
    out.push({ where: `artefact ${a.id} lore`, text: a.lore });
  }
  for (const b of BUILDING_LIST) {
    out.push({ where: `bâtiment ${b.id} nom`, text: b.name });
    out.push({ where: `bâtiment ${b.id} description`, text: b.description });
  }
  for (const e of WEEK_EVENTS) {
    out.push({ where: `événement ${e.key} nom`, text: e.name });
    out.push({ where: `événement ${e.key} texte`, text: e.text });
  }
  for (const v of VILLAGES) {
    out.push({ where: `localité ${v.key} identité`, text: v.identity });
    out.push({ where: `localité ${v.key} description`, text: v.description });
  }
  for (const c of CHARTERS) {
    out.push({ where: `charte ${c.id} description`, text: c.description });
  }
  return out;
}

describe('textes français', () => {
  it('aucun texte visible n’est vide', () => {
    for (const { where, text } of allPlayerTexts()) {
      expect(text.trim().length, where).toBeGreaterThan(0);
    }
  });

  it('aucun texte visible ne contient de mot anglais courant', () => {
    const faulty = allPlayerTexts().filter((t) => ENGLISH.test(t.text));
    expect(faulty.map((f) => `${f.where} : ${f.text}`)).toEqual([]);
  });

  it('les textes longs portent des accents corrects', () => {
    const longTexts = allPlayerTexts().filter((t) => t.text.length > 120);
    expect(longTexts.length).toBeGreaterThan(100);
    const flat = longTexts.filter((t) => !ACCENTS.test(t.text));
    expect(flat.map((f) => f.where)).toEqual([]);
  });

  it('chaque créature porte un lore de deux à cinq phrases', () => {
    for (const c of CREATURE_LIST) {
      const count = sentenceCount(c.lore);
      expect(count, `lore de ${c.id}`).toBeGreaterThanOrEqual(2);
      expect(count, `lore de ${c.id}`).toBeLessThanOrEqual(5);
    }
  });

  it('chaque héros porte une biographie de trois à six phrases', () => {
    for (const h of HERO_LIST) {
      const count = sentenceCount(h.bio);
      expect(count, `biographie de ${h.id}`).toBeGreaterThanOrEqual(3);
      expect(count, `biographie de ${h.id}`).toBeLessThanOrEqual(6);
    }
  });

  it('chaque artefact porte un lore d’au moins une phrase construite', () => {
    for (const a of ARTIFACT_LIST) {
      expect(sentenceCount(a.lore), `lore de ${a.id}`).toBeGreaterThanOrEqual(1);
      expect(a.lore.length, `lore de ${a.id}`).toBeGreaterThan(60);
    }
  });

  it('aucune référence à une licence existante', () => {
    const forbidden = /(heroes of might|might and magic|\bhomm\b|\berathia\b|\benroth\b)/i;
    for (const { where, text } of allPlayerTexts()) {
      expect(forbidden.test(text), where).toBe(false);
    }
  });
});

/* ── Déterminisme des données ────────────────────────────────────────────── */

describe('déterminisme', () => {
  it('les listes sont stables d’un appel à l’autre', () => {
    expect(content.creaturesOf('granit').map((c) => c.id)).toEqual(
      content.creaturesOf('granit').map((c) => c.id),
    );
    expect(content.buildingsOf('ermitage').map((b) => b.id)).toEqual(
      content.buildingsOf('ermitage').map((b) => b.id),
    );
  });

  it('aucune valeur simulée n’est un flottant', () => {
    for (const c of CREATURE_LIST) {
      for (const value of [
        c.hp,
        c.attack,
        c.defense,
        c.dmgMin,
        c.dmgMax,
        c.speed,
        c.initiative,
        c.growth,
        c.power,
        c.size,
      ]) {
        expect(Number.isInteger(value), `${c.id}`).toBe(true);
      }
      for (const value of Object.values(c.cost)) {
        expect(Number.isInteger(value), `coût de ${c.id}`).toBe(true);
      }
    }
    for (const b of BUILDING_LIST) {
      for (const value of Object.values(b.cost)) {
        expect(Number.isInteger(value), `coût de ${b.id}`).toBe(true);
      }
    }
    for (const s of SPELL_LIST) {
      expect(Number.isInteger(s.cost), `coût de ${s.id}`).toBe(true);
    }
  });
});
