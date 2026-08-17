/**
 * Contrôles d'équilibrage.
 *
 * Ces tests ne prouvent pas qu'un équilibrage est bon — seules des milliers de
 * simulations le feraient (document maître §20.3). Ils garantissent en revanche
 * qu'aucune valeur n'est aberrante ni incohérente avec le document maître :
 * les statistiques de prototype sont exactes, la progression des rangs est
 * monotone, les deux factions restent comparables rang par rang, et la formule
 * de puissance est bien celle documentée dans `creatures.ts`.
 */
import { describe, expect, it } from 'vitest';
import {
  ARTIFACT_LIST,
  BUILDING_LIST,
  CREATURES,
  CREATURE_LIST,
  FACTIONS,
  HERO_LIST,
  NEUTRAL_GUARDS,
  SKILL_LIST,
  SPELL_LIST,
  computePower,
  creatureIdOf,
} from './index.js';
import { costWeight } from './util.js';

/** Statistiques de prototype du document maître §5.1 et §5.2, à la lettre. */
const PROTOTYPE: Record<
  string,
  { hp: number; attack: number; defense: number; dmgMin: number; dmgMax: number; speed: number; growth: number }
> = {
  granit_t1: { hp: 4, attack: 2, defense: 2, dmgMin: 1, dmgMax: 2, speed: 4, growth: 18 },
  granit_t2: { hp: 12, attack: 5, defense: 6, dmgMin: 2, dmgMax: 4, speed: 5, growth: 12 },
  granit_t3: { hp: 20, attack: 8, defense: 6, dmgMin: 4, dmgMax: 7, speed: 5, growth: 8 },
  granit_t4: { hp: 34, attack: 10, defense: 12, dmgMin: 6, dmgMax: 10, speed: 6, growth: 6 },
  granit_t5: { hp: 65, attack: 15, defense: 14, dmgMin: 11, dmgMax: 17, speed: 8, growth: 4 },
  granit_t6: { hp: 115, attack: 20, defense: 19, dmgMin: 20, dmgMax: 30, speed: 9, growth: 2 },
  granit_t7: { hp: 235, attack: 27, defense: 25, dmgMin: 38, dmgMax: 55, speed: 11, growth: 1 },
  ermitage_t1: { hp: 5, attack: 2, defense: 3, dmgMin: 1, dmgMax: 2, speed: 4, growth: 18 },
  ermitage_t2: { hp: 11, attack: 6, defense: 4, dmgMin: 2, dmgMax: 4, speed: 8, growth: 12 },
  ermitage_t3: { hp: 22, attack: 9, defense: 7, dmgMin: 4, dmgMax: 7, speed: 8, growth: 8 },
  ermitage_t4: { hp: 36, attack: 11, defense: 10, dmgMin: 7, dmgMax: 11, speed: 7, growth: 6 },
  ermitage_t5: { hp: 70, attack: 14, defense: 16, dmgMin: 11, dmgMax: 18, speed: 8, growth: 4 },
  ermitage_t6: { hp: 130, attack: 18, defense: 23, dmgMin: 20, dmgMax: 29, speed: 6, growth: 2 },
  ermitage_t7: { hp: 245, attack: 28, defense: 23, dmgMin: 40, dmgMax: 58, speed: 12, growth: 1 },
};

describe('statistiques de prototype', () => {
  it('les quatorze créatures de base reprennent exactement le document maître', () => {
    for (const [id, expected] of Object.entries(PROTOTYPE)) {
      const def = CREATURES[id];
      expect(def, id).toBeDefined();
      expect({
        hp: def.hp,
        attack: def.attack,
        defense: def.defense,
        dmgMin: def.dmgMin,
        dmgMax: def.dmgMax,
        speed: def.speed,
        growth: def.growth,
      }).toEqual(expected);
    }
  });

  it('les rôles du document maître sont respectés', () => {
    // Tireurs : l'Arbalétrier des Farges et le Veneur Sylvestre, et eux seuls.
    const shooters = CREATURE_LIST.filter((c) => c.shooter).map((c) => c.id).sort();
    expect(shooters).toEqual(
      ['granit_t3', 'granit_t3_up', 'ermitage_t4', 'ermitage_t4_up'].sort(),
    );
    // Volants : Griffon, Chouette, Vouivre.
    const flyers = CREATURE_LIST.filter((c) => c.flying).map((c) => c.id).sort();
    expect(flyers).toEqual(
      [
        'granit_t7',
        'granit_t7_up',
        'ermitage_t2',
        'ermitage_t2_up',
        'ermitage_t7',
        'ermitage_t7_up',
      ].sort(),
    );
    // Les rangs 5 et plus occupent deux hexagones.
    for (const def of CREATURE_LIST) {
      expect(def.size, def.id).toBe(def.tier >= 5 ? 2 : 1);
    }
  });
});

describe('progression des rangs', () => {
  it('la puissance croît strictement de rang en rang', () => {
    for (const faction of ['granit', 'ermitage'] as const) {
      let previous = 0;
      for (let tier = 1; tier <= 7; tier++) {
        const def = CREATURES[creatureIdOf(faction, tier)];
        expect(def.power, `${def.id}`).toBeGreaterThan(previous);
        previous = def.power;
      }
    }
  });

  it('la croissance hebdomadaire décroît de rang en rang', () => {
    for (const faction of ['granit', 'ermitage'] as const) {
      let previous = Number.MAX_SAFE_INTEGER;
      for (let tier = 1; tier <= 7; tier++) {
        const def = CREATURES[creatureIdOf(faction, tier)];
        expect(def.growth, `${def.id}`).toBeLessThanOrEqual(previous);
        previous = def.growth;
      }
    }
  });

  it('le coût de recrutement croît de rang en rang', () => {
    for (const faction of ['granit', 'ermitage'] as const) {
      let previous = 0;
      for (let tier = 1; tier <= 7; tier++) {
        const def = CREATURES[creatureIdOf(faction, tier)];
        const ecus = def.cost.ecus ?? 0;
        expect(ecus, `${def.id}`).toBeGreaterThan(previous);
        previous = ecus;
      }
    }
  });

  it('chaque amélioration gagne de douze à cinquante pour cent sur les statistiques clefs', () => {
    for (const faction of ['granit', 'ermitage'] as const) {
      for (let tier = 1; tier <= 7; tier++) {
        const base = CREATURES[creatureIdOf(faction, tier)];
        const up = CREATURES[creatureIdOf(faction, tier, true)];
        const label = `${base.id} → ${up.id}`;

        expect(up.hp, `${label} pv`).toBeGreaterThan(base.hp);
        expect(up.attack, `${label} attaque`).toBeGreaterThan(base.attack);
        expect(up.defense, `${label} défense`).toBeGreaterThan(base.defense);
        expect(up.dmgMax, `${label} dégâts`).toBeGreaterThan(base.dmgMax);

        // Progression visée : +12 à +25 %. Les petits nombres arrondissent
        // grossièrement : on tolère deux points d'écart absolu.
        for (const [what, a, b] of [
          ['pv', base.hp, up.hp],
          ['dégâts max', base.dmgMax, up.dmgMax],
        ] as const) {
          expect(b, `${label} ${what} (plancher)`).toBeGreaterThanOrEqual(Math.ceil((a * 112) / 100));
          expect(b, `${label} ${what} (plafond)`).toBeLessThanOrEqual(
            Math.max(a + 2, Math.ceil((a * 125) / 100)),
          );
        }

        // Une amélioration apporte au moins une capacité de plus.
        expect(up.abilities.length, `${label} capacités`).toBeGreaterThan(base.abilities.length);

        // Elle se paie : le coût monte d'environ trente pour cent.
        expect(costWeight(up.cost), `${label} coût`).toBeGreaterThan(costWeight(base.cost));

        const powerRatio = (up.power * 10000) / base.power;
        expect(powerRatio, `${label} puissance`).toBeGreaterThan(11000);
        expect(powerRatio, `${label} puissance`).toBeLessThan(19000);
      }
    }
  });
});

describe('symétrie des deux factions', () => {
  it('rang par rang, les puissances restent dans un écart de trente pour cent', () => {
    for (let tier = 1; tier <= 7; tier++) {
      const granit = CREATURES[creatureIdOf('granit', tier)].power;
      const ermitage = CREATURES[creatureIdOf('ermitage', tier)].power;
      const ratio = Math.max(granit, ermitage) / Math.min(granit, ermitage);
      expect(ratio, `rang ${tier} : ${granit} contre ${ermitage}`).toBeLessThan(1.3);
    }
  });

  it('les deux factions ont le même nombre de demeures et d’ateliers', () => {
    for (const faction of ['granit', 'ermitage'] as const) {
      const dwellings = BUILDING_LIST.filter(
        (b) => b.faction === faction && b.chain === 'demeures',
      );
      const upgrades = BUILDING_LIST.filter(
        (b) => b.faction === faction && b.chain === 'ameliorations',
      );
      expect(dwellings, `${faction} demeures`).toHaveLength(7);
      expect(upgrades, `${faction} ateliers`).toHaveLength(7);
    }
  });

  it('les réserves de départ des deux factions sont de valeur voisine', () => {
    // Valeur de référence des ressources, cf. `core/constants.ts`.
    const VALUE = { ecus: 1, bois: 6, granit: 6, fer: 9, sel: 9, essence: 14, filDor: 14 };
    const worth = (id: 'granit' | 'ermitage'): number => {
      const res = FACTIONS[id].startingResources;
      let total = 0;
      for (const [key, unit] of Object.entries(VALUE)) {
        total += (res[key as keyof typeof res] ?? 0) * unit;
      }
      return total;
    };
    const a = worth('granit');
    const b = worth('ermitage');
    const ratio = Math.max(a, b) / Math.min(a, b);
    expect(ratio, `${a} contre ${b}`).toBeLessThan(1.1);
  });

  it('chaque faction dispose des mêmes catégories de bâtiments structurants', () => {
    for (const faction of ['granit', 'ermitage'] as const) {
      const kinds = new Set<string>();
      for (const def of BUILDING_LIST) {
        if (def.faction !== faction && def.faction !== 'commun') continue;
        for (const grant of def.grants) kinds.add(grant.kind);
      }
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
        expect(kinds.has(required), `${faction} : ${required}`).toBe(true);
      }
    }
  });
});

describe('formule de puissance', () => {
  it('la puissance de chaque créature est exactement celle que la formule donne', () => {
    for (const def of CREATURE_LIST) {
      expect(computePower(def), def.id).toBe(def.power);
    }
  });

  it('la formule est monotone : plus de dégâts donne plus de puissance', () => {
    const base = CREATURES.granit_t4;
    const stronger = computePower({ ...base, dmgMax: base.dmgMax + 4 });
    const tougher = computePower({ ...base, hp: base.hp + 10 });
    const faster = computePower({ ...base, speed: base.speed + 2 });
    expect(stronger).toBeGreaterThan(base.power);
    expect(tougher).toBeGreaterThan(base.power);
    expect(faster).toBeGreaterThan(base.power);
  });

  it('elle reste dans l’échelle attendue par le noyau', () => {
    const weakest = Math.min(...CREATURE_LIST.map((c) => c.power));
    const strongest = Math.max(...CREATURE_LIST.map((c) => c.power));
    expect(weakest).toBeGreaterThan(20);
    expect(weakest).toBeLessThan(80);
    expect(strongest).toBeGreaterThan(6000);
    expect(strongest).toBeLessThan(14000);
  });
});

describe('gardes neutres', () => {
  it('les fourchettes croissent d’un anneau à l’autre', () => {
    const maxOf = (ring: 1 | 2 | 3 | 4): number =>
      Math.max(...NEUTRAL_GUARDS.filter((g) => g.ring === ring).map((g) => g.powerMax));
    const minOf = (ring: 1 | 2 | 3 | 4): number =>
      Math.min(...NEUTRAL_GUARDS.filter((g) => g.ring === ring).map((g) => g.powerMin));
    expect(minOf(1)).toBeLessThan(minOf(2));
    expect(minOf(2)).toBeLessThan(minOf(3));
    expect(minOf(3)).toBeLessThan(minOf(4));
    expect(maxOf(1)).toBeLessThan(maxOf(2));
    expect(maxOf(2)).toBeLessThan(maxOf(3));
    expect(maxOf(3)).toBeLessThan(maxOf(4));
  });

  it('l’anneau extérieur reste franchissable avec une armée de départ', () => {
    // Armée de départ typique : rang 1 et rang 2 d'un héros du contenu.
    const start = HERO_LIST.find((h) => h.id === 'paul');
    expect(start).toBeDefined();
    let power = 0;
    for (const stack of start?.start.army ?? []) {
      power += CREATURES[stack.creature].power * stack.count;
    }
    const easiest = Math.min(...NEUTRAL_GUARDS.filter((g) => g.ring === 1).map((g) => g.powerMin));
    expect(easiest).toBeLessThan(power);
  });

  it('la garde de la Maison du Trésor exige une armée de fin de partie', () => {
    const maison = Math.min(...NEUTRAL_GUARDS.filter((g) => g.ring === 4).map((g) => g.powerMin));
    // Dix créatures de rang 7 améliorées valent bien davantage.
    expect(maison).toBeGreaterThan(CREATURES.granit_t7.power * 5);
    expect(maison).toBeLessThan(CREATURES.granit_t7_up.power * 20);
  });
});

describe('sorts et compétences', () => {
  it('le coût en mana croît avec le degré, dans chaque école', () => {
    for (const school of ['braises', 'sources', 'brumes', 'racines'] as const) {
      let previous = 0;
      for (let level = 1; level <= 8; level++) {
        const def = SPELL_LIST.find((s) => s.school === school && s.level === level);
        expect(def, `${school}_${level}`).toBeDefined();
        expect(def?.cost ?? 0, `${school}_${level}`).toBeGreaterThan(previous);
        previous = def?.cost ?? 0;
      }
    }
  });

  it('chaque école propose au moins un sort de soutien et un effet marquant', () => {
    for (const school of ['braises', 'sources', 'brumes', 'racines'] as const) {
      const spells = SPELL_LIST.filter((s) => s.school === school);
      expect(spells.some((s) => s.level >= 7)).toBe(true);
      expect(spells.some((s) => s.effects.length >= 2)).toBe(true);
    }
    // Les Sources soignent, les Braises brûlent, les Racines invoquent.
    expect(
      SPELL_LIST.some((s) => s.school === 'sources' && s.effects.some((e) => e.kind === 'heal')),
    ).toBe(true);
    expect(
      SPELL_LIST.some((s) => s.school === 'braises' && s.effects.some((e) => e.kind === 'damage')),
    ).toBe(true);
    expect(
      SPELL_LIST.some((s) => s.school === 'racines' && s.effects.some((e) => e.kind === 'summon')),
    ).toBe(true);
    expect(SPELL_LIST.filter((s) => s.scope !== 'combat').length).toBeGreaterThanOrEqual(5);
  });

  it('les compétences progressent d’un rang à l’autre', () => {
    // `resist_bp` et `xp_bp` mis à part, un `bp` est un multiplicateur autour
    // de 10000 ; `resist_bp` est une quantité absolue.
    const ABSOLUTE_BP = new Set(['resist_bp']);
    for (const def of SKILL_LIST) {
      const weight = (rank: 0 | 1 | 2): number =>
        def.effects[rank].reduce((sum, effect) => {
          if (!('bp' in effect)) return sum + Math.abs(effect.value);
          const bp = effect.bp;
          return sum + (ABSOLUTE_BP.has(effect.kind) ? Math.abs(bp) : Math.abs(bp - 10000));
        }, 0);
      expect(weight(1), `${def.id} rang 2`).toBeGreaterThan(weight(0));
      expect(weight(2), `${def.id} rang 3`).toBeGreaterThan(weight(1));
    }
  });
});

describe('héros', () => {
  it('les caractéristiques de départ sont cohérentes avec la classe', () => {
    for (const def of HERO_LIST) {
      const { vaillance, garde, mystique, savoir } = def.start;
      const total = vaillance + garde + mystique + savoir;
      expect(total, `${def.id}`).toBeGreaterThanOrEqual(6);
      expect(total, `${def.id}`).toBeLessThanOrEqual(9);

      if (def.class.startsWith('Prieur')) {
        expect(mystique + savoir, `${def.id} magie`).toBeGreaterThan(vaillance + garde);
      }
      if (def.class.startsWith('Castellan')) {
        expect(vaillance + garde, `${def.id} guerre`).toBeGreaterThan(mystique + savoir);
      }
      if (def.class.startsWith('Veneur') || def.class.startsWith('Veneuse')) {
        expect(vaillance, `${def.id} vaillance`).toBeGreaterThanOrEqual(2);
      }
    }
  });

  it('aucun héros ne démarre avec une armée démesurée', () => {
    const powers = HERO_LIST.map((h) =>
      h.start.army.reduce((sum, s) => sum + CREATURES[s.creature].power * s.count, 0),
    );
    const min = Math.min(...powers);
    const max = Math.max(...powers);
    expect(min).toBeGreaterThan(1200);
    expect(max / min, `${min} contre ${max}`).toBeLessThan(2);
  });

  it('les poids de compétence couvrent les vingt compétences sans dépasser cent', () => {
    for (const def of HERO_LIST) {
      const entries = Object.entries(def.skillWeights);
      expect(entries, `${def.id}`).toHaveLength(20);
      for (const [id, weight] of entries) {
        expect(weight, `${def.id}/${id}`).toBeGreaterThan(0);
        expect(weight, `${def.id}/${id}`).toBeLessThanOrEqual(100);
      }
      // Le héros doit avoir de vraies affinités, pas une table plate.
      const values = entries.map(([, w]) => w ?? 0);
      expect(Math.max(...values) - Math.min(...values), `${def.id}`).toBeGreaterThanOrEqual(40);
    }
  });

  it('chaque faction couvre les grandes spécialités', () => {
    for (const faction of ['granit', 'ermitage'] as const) {
      const kinds = new Set(
        HERO_LIST.filter((h) => h.faction === faction).map((h) => h.specialty.kind),
      );
      expect(kinds.has('creature'), `${faction} créature`).toBe(true);
      expect(kinds.has('skill'), `${faction} compétence`).toBe(true);
      expect(kinds.size, `${faction}`).toBeGreaterThanOrEqual(4);
    }
  });
});

describe('artefacts', () => {
  it('la puissance croît avec la rareté', () => {
    const budget = (rarity: string): number[] =>
      ARTIFACT_LIST.filter((a) => a.rarity === rarity).map((a) => {
        const primary = Object.values(a.primary ?? {}).reduce((s, v) => s + (v ?? 0), 0);
        return a.effects.length + primary;
      });
    const avg = (values: number[]): number => values.reduce((s, v) => s + v, 0) / values.length;
    expect(avg(budget('rare'))).toBeGreaterThan(avg(budget('commun')));
    expect(avg(budget('majeur'))).toBeGreaterThan(avg(budget('rare')));
    expect(avg(budget('relique'))).toBeGreaterThan(avg(budget('majeur')));
  });

  it('les communs restent modestes et les reliques restent rares', () => {
    for (const def of ARTIFACT_LIST) {
      if (def.rarity === 'commun') {
        expect(def.effects.length, def.id).toBeLessThanOrEqual(1);
        expect(def.primary, def.id).toBeUndefined();
      }
      if (def.rarity === 'relique') {
        expect(def.effects.length, def.id).toBeGreaterThanOrEqual(2);
      }
    }
    const reliques = ARTIFACT_LIST.filter((a) => a.rarity === 'relique').length;
    expect(reliques * 4).toBeLessThan(ARTIFACT_LIST.length);
  });

  it('tous les emplacements d’équipement sont pourvus', () => {
    const slots = new Set(ARTIFACT_LIST.map((a) => a.slot));
    for (const slot of [
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
    ]) {
      expect(slots.has(slot as never), slot).toBe(true);
    }
  });
});

describe('coûts de construction', () => {
  it('les demeures coûtent de plus en plus cher', () => {
    for (const faction of ['granit', 'ermitage'] as const) {
      let previous = 0;
      for (let tier = 1; tier <= 7; tier++) {
        const def = BUILDING_LIST.find((b) => b.id === `${faction}_demeure_${tier}`);
        expect(def, `${faction}_demeure_${tier}`).toBeDefined();
        const ecus = def?.cost.ecus ?? 0;
        expect(ecus, `${faction}_demeure_${tier}`).toBeGreaterThan(previous);
        previous = ecus;
      }
    }
  });

  it('un atelier d’amélioration coûte plus que sa demeure', () => {
    for (const faction of ['granit', 'ermitage'] as const) {
      for (let tier = 1; tier <= 7; tier++) {
        const dwelling = BUILDING_LIST.find((b) => b.id === `${faction}_demeure_${tier}`);
        const upgrade = BUILDING_LIST.find((b) => b.id === `${faction}_amelioration_${tier}`);
        expect(costWeight(upgrade?.cost ?? {})).toBeGreaterThan(costWeight(dwelling?.cost ?? {}));
      }
    }
  });

  it('les positions de scène ne se superposent pas dans une même cité', () => {
    for (const faction of ['granit', 'ermitage'] as const) {
      const seen = new Map<string, string>();
      for (const def of BUILDING_LIST) {
        if (def.faction !== faction && def.faction !== 'commun') continue;
        const key = `${def.scene.x}:${def.scene.y}`;
        const previous = seen.get(key);
        expect(previous, `${def.id} occupe la place de ${previous ?? ''}`).toBeUndefined();
        seen.set(key, def.id);
      }
    }
  });
});
