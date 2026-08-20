import { describe, expect, it } from 'vitest';
import {
  CELL_PASSABLE,
  RESOURCE_KEYS,
  TERRAINS,
  type MapObject,
  type MapObjectKind,
  type SealId,
} from '@auvergne/engine';
import { anchorCell } from './anchors.js';
import { buildWorld } from './build.js';
import { COLS, ROWS, idx } from './grid.js';
import { objectValue } from './objects.js';
import { NEUTRAL_CENTERS, START_KEYS, START_POSITIONS } from './starts.js';

const world = buildWorld(20260817);
const objects = world.objects;

function byKind(kind: MapObjectKind): MapObject[] {
  return objects.filter((o) => o.kind === kind);
}

function power(o: MapObject): number {
  const tiers: Record<string, number> = {
    '1': 10,
    '2': 32,
    '3': 85,
    '4': 190,
    '5': 420,
    '6': 900,
    '7': 2100,
  };
  let total = 0;
  for (const s of o.guard ?? []) total += (tiers[s.creature.slice(-1)] ?? 100) * s.count;
  return total;
}

describe('objets — intégrité', () => {
  it('donne un identifiant unique à chaque objet', () => {
    const uids = new Set(objects.map((o) => o.uid));
    expect(uids.size).toBe(objects.length);
    for (const o of objects) expect(o.uid.startsWith('O_')).toBe(true);
  });

  it('ne pose jamais deux objets sur la même case', () => {
    const taken = new Set<number>();
    for (const o of objects) {
      for (const f of o.footprint) {
        const i = idx(f.col, f.row);
        expect(taken.has(i), `case occupée deux fois : ${f.col},${f.row}`).toBe(false);
        taken.add(i);
      }
    }
  });

  it('pose toute empreinte dans la grille, sur du terrain franchissable', () => {
    for (const o of objects) {
      for (const f of o.footprint) {
        expect(f.col).toBeGreaterThanOrEqual(0);
        expect(f.col).toBeLessThan(COLS);
        expect(f.row).toBeGreaterThanOrEqual(0);
        expect(f.row).toBeLessThan(ROWS);
        expect(TERRAINS[world.terrain[idx(f.col, f.row)]], o.uid).not.toBe('eau');
      }
      const i = idx(o.entrance.col, o.entrance.row);
      expect(world.flags[i] & CELL_PASSABLE, `entrée bloquée : ${o.uid}`).not.toBe(0);
    }
  });

  /*
   * Le même invariant, sur plusieurs graines — et ce n'est pas du zèle.
   *
   * Deux postes de garde et un tas d'écus se sont retrouvés plantés au milieu
   * d'une rivière : un tablier de pont et un gué sont praticables et portent la
   * voie, si bien qu'ils passaient tous les filtres. En corrigeant la source des
   * caches, le tirage aval s'est décalé et le test d'une seule graine est
   * redevenu vert — alors que les postes, eux, n'étaient pas corrigés du tout.
   * Un invariant de placement vérifié sur une graine ne dit rien : il dit
   * seulement qu'aucun objet n'est tombé à l'eau CETTE fois-ci.
   */
  it('ne pose jamais rien sur l’eau, sur aucune graine', () => {
    for (const graine of [20250816, 20260817, 1, 424242, 987654321]) {
      const w = graine === 20260817 ? world : buildWorld(graine);
      for (const o of w.objects) {
        for (const f of o.footprint) {
          expect(
            TERRAINS[w.terrain[idx(f.col, f.row)]],
            `${o.uid} (${o.kind}) sur l'eau en ${String(f.col)},${String(f.row)} — graine ${String(graine)}`,
          ).not.toBe('eau');
        }
      }
    }
  });

  it('inclut l’entrée dans l’empreinte et la place sur `at`', () => {
    for (const o of objects) {
      expect(o.entrance).toEqual(o.at);
      const inside = o.footprint.some(
        (f) => f.col === o.entrance.col && f.row === o.entrance.row,
      );
      expect(inside, o.uid).toBe(true);
    }
  });

  it('renseigne objectAt de façon cohérente', () => {
    for (let k = 0; k < objects.length; k++) {
      for (const f of objects[k].footprint) {
        expect(world.objectAt[idx(f.col, f.row)]).toBe(k + 1);
      }
    }
  });

  it('n’expose que des données sérialisables', () => {
    for (const o of objects) {
      expect(() => JSON.parse(JSON.stringify(o.data))).not.toThrow();
    }
  });
});

describe('objets — les repères fixes', () => {
  it('pose les cinq capitales sur les positions de départ', () => {
    const towns = byKind('ville');
    expect(towns.length).toBe(5);
    for (const key of START_KEYS) {
      const sp = START_POSITIONS[key];
      const town = towns.find((t) => t.data.townUid === sp.townUid);
      expect(town, key).toBeDefined();
      expect((town as MapObject).at).toEqual(sp.at);
      expect((town as MapObject).data.capital).toBe(true);
      expect((town as MapObject).footprint.length).toBe(4);
      expect((town as MapObject).guard).toBeUndefined();
    }
  });

  it('pose les quatre centres neutres capturables, gardés', () => {
    const villages = byKind('village');
    expect(villages.length).toBe(4);
    for (const n of NEUTRAL_CENTERS) {
      const v = villages.find((x) => x.data.townUid === n.townUid);
      expect(v, n.townUid).toBeDefined();
      expect((v as MapObject).at).toEqual(anchorCell(n.anchor));
      expect(((v as MapObject).guard ?? []).length).toBeGreaterThan(0);
    }
  });

  it('pose la Maison du Trésor sur son ancrage, avec une garde unique', () => {
    const houses = byKind('maison_tresor');
    expect(houses.length).toBe(1);
    const house = houses[0];
    expect(house.at).toEqual(anchorCell('maison_tresor'));
    const guard = house.guard ?? [];
    expect(guard.length).toBeGreaterThanOrEqual(4);
    const factions = new Set(guard.map((s) => s.creature.split('_')[0]));
    expect(factions.size).toBe(2);
    // Elle doit être la garde la plus redoutable de la carte.
    for (const o of objects) {
      if (o.uid === house.uid) continue;
      expect(power(house)).toBeGreaterThan(power(o));
    }
  });

  it('pose les cinq Sceaux des Marches, tous distincts et bien gardés', () => {
    const seals = byKind('sceau');
    expect(seals.length).toBe(5);
    const ids = new Set<SealId>();
    for (const s of seals) {
      const id = s.data.seal as SealId;
      expect(id).toBeTruthy();
      ids.add(id);
      expect((s.data.name as string).length).toBeGreaterThan(5);
      expect((s.data.lore as string).length).toBeGreaterThan(20);
      expect(power(s)).toBeGreaterThan(3000);
    }
    expect([...ids].sort()).toEqual(
      ['brumes', 'farges', 'hautes_futaies', 'hermitage', 'pamole'].sort(),
    );
  });

  it('pose un réseau de bornes armoriées digne de ce nom', () => {
    const bornes = byKind('borne');
    expect(bornes.length).toBeGreaterThanOrEqual(8);
    for (const b of bornes) {
      expect(b.data.network).toBe('marches');
      expect(b.guard).toBeUndefined();
    }
  });

  it('pose belvédères, sanctuaires, sources, auberges et doléances', () => {
    expect(byKind('belvedere').length).toBeGreaterThanOrEqual(4);
    expect(byKind('sanctuaire').length).toBeGreaterThanOrEqual(3);
    expect(byKind('source').length).toBeGreaterThanOrEqual(3);
    expect(byKind('auberge').length).toBeGreaterThanOrEqual(6);
    expect(byKind('quete').length).toBeGreaterThanOrEqual(8);
    expect(byKind('caravane').length).toBeGreaterThanOrEqual(4);
  });

  it('place un belvédère sur Pierre Pamole et un autre à Cervières', () => {
    const belv = byKind('belvedere');
    const pamole = anchorCell('pamole');
    const near = belv.some(
      (b) => Math.max(Math.abs(b.at.col - pamole.col), Math.abs(b.at.row - pamole.row)) <= 6,
    );
    expect(near).toBe(true);
    const cervieres = anchorCell('cervieres');
    expect(
      belv.some(
        (b) =>
          Math.max(Math.abs(b.at.col - cervieres.col), Math.abs(b.at.row - cervieres.row)) <= 12,
      ),
    ).toBe(true);
  });
});

describe('objets — économie', () => {
  const mines = byKind('mine');

  it('pose assez de gisements, tous à ressource valide', () => {
    expect(mines.length).toBeGreaterThanOrEqual(24);
    for (const m of mines) {
      expect(RESOURCE_KEYS).toContain(m.data.resource);
      expect(m.data.amount as number).toBeGreaterThan(0);
      expect((m.data.name as string).length).toBeGreaterThan(3);
    }
  });

  it('couvre les sept ressources', () => {
    const kinds = new Set(mines.map((m) => m.data.resource));
    for (const key of RESOURCE_KEYS) expect(kinds.has(key), key).toBe(true);
  });

  it('donne à chaque départ une scierie, une carrière et un site de revenu proches', () => {
    for (const key of START_KEYS) {
      const at = START_POSITIONS[key].at;
      const near = mines.filter(
        (m) => Math.max(Math.abs(m.at.col - at.col), Math.abs(m.at.row - at.row)) <= 34,
      );
      const resources = new Set(near.map((m) => m.data.resource));
      expect(resources.has('bois'), `${key} : scierie`).toBe(true);
      expect(resources.has('granit'), `${key} : carrière`).toBe(true);
      expect(resources.has('ecus'), `${key} : site de revenu`).toBe(true);
    }
  });

  it('donne à chaque départ une auberge accessible', () => {
    const inns = byKind('auberge');
    for (const key of START_KEYS) {
      const at = START_POSITIONS[key].at;
      const near = inns.some(
        (m) => Math.max(Math.abs(m.at.col - at.col), Math.abs(m.at.row - at.row)) <= 30,
      );
      expect(near, key).toBe(true);
    }
  });

  it('sème des tas de ressources et des artefacts', () => {
    const piles = byKind('ressource');
    expect(piles.length).toBeGreaterThan(60);
    for (const p of piles) {
      expect(RESOURCE_KEYS).toContain(p.data.resource);
      expect(p.data.amount as number).toBeGreaterThan(0);
    }
    const artifacts = byKind('artefact');
    expect(artifacts.length).toBeGreaterThanOrEqual(10);
    for (const a of artifacts) {
      expect(typeof a.data.artifact).toBe('string');
      expect((a.data.artifact as string).length).toBeGreaterThan(3);
      expect(['commun', 'rare', 'majeur', 'relique']).toContain(a.data.rarity);
    }
  });

  it('pose la Clef de la Maison du Trésor à demeure, sous bonne garde', () => {
    const clef = byKind('artefact').find(
      (a) => a.data.artifact === 'clef_de_la_maison_du_tresor',
    );
    expect(clef).toBeDefined();
    const found = clef as MapObject;
    expect(found.data.fixed).toBe(true);
    expect(power(found)).toBeGreaterThan(3000);
    const mt = anchorCell('maison_tresor');
    expect(
      Math.max(Math.abs(found.at.col - mt.col), Math.abs(found.at.row - mt.row)),
    ).toBeLessThanOrEqual(14);
    // Une relique posée à demeure ne bouge pas d'une graine à l'autre.
    const other = buildWorld(999).objects.find(
      (a) => a.data.artifact === 'clef_de_la_maison_du_tresor',
    );
    expect(other).toBeDefined();
    expect((other as MapObject).at).toEqual(found.at);
  });

  it('évalue économiquement les objets utiles', () => {
    expect(objectValue(mines[0])).toBeGreaterThan(0);
    expect(objectValue(byKind('ressource')[0])).toBeGreaterThan(0);
    expect(objectValue(byKind('sceau')[0])).toBe(0);
  });
});

describe('objets — anneaux de difficulté', () => {
  it('garde les abords des départs plus faiblement que le centre', () => {
    const guards = byKind('garde');
    expect(guards.length).toBeGreaterThan(20);
    let ring1 = 0;
    let ring1Power = 0;
    let ring3 = 0;
    let ring3Power = 0;
    for (const g of guards) {
      const ring = g.data.ring as number;
      expect([1, 2, 3]).toContain(ring);
      if (ring === 1) {
        ring1++;
        ring1Power += power(g);
      } else if (ring === 3) {
        ring3++;
        ring3Power += power(g);
      }
    }
    expect(ring3).toBeGreaterThan(0);
    if (ring1 > 0) {
      expect(ring3Power / ring3).toBeGreaterThan(ring1Power / ring1);
    }
  });

  it('n’emploie que des créatures aux identifiants imposés', () => {
    const pattern = /^(granit|ermitage)_t[1-7]$/;
    for (const o of objects) {
      for (const s of o.guard ?? []) {
        expect(pattern.test(s.creature), s.creature).toBe(true);
        expect(s.count).toBeGreaterThan(0);
        expect(Number.isInteger(s.count)).toBe(true);
      }
    }
  });

  it('laisse les abords immédiats des capitales dégagés', () => {
    for (const key of START_KEYS) {
      const at = START_POSITIONS[key].at;
      for (const o of objects) {
        if (!o.guard || o.guard.length === 0) continue;
        const d = Math.max(Math.abs(o.at.col - at.col), Math.abs(o.at.row - at.row));
        expect(d, `${o.uid} trop près de ${key}`).toBeGreaterThan(5);
      }
    }
  });
});

describe('objets — rejouabilité', () => {
  it('rend exactement le même contenu pour une même graine', () => {
    const a = buildWorld(4242);
    const b = buildWorld(4242);
    expect(a).toBe(b);
    expect(JSON.stringify(a.objects)).toBe(JSON.stringify(b.objects));
  });

  it('change le contenu tiré au sort d’une graine à l’autre', () => {
    const a = buildWorld(11);
    const b = buildWorld(22);
    expect(JSON.stringify(a.objects)).not.toBe(JSON.stringify(b.objects));
  });

  it('ne bouge jamais les repères fixes d’une graine à l’autre', () => {
    const a = buildWorld(101);
    const b = buildWorld(202);
    const fixedOf = (w: typeof a): string =>
      JSON.stringify(
        w.objects
          .filter((o) =>
            ['ville', 'village', 'maison_tresor', 'sceau', 'borne', 'belvedere'].includes(o.kind),
          )
          .map((o) => `${o.kind}:${o.at.col},${o.at.row}`)
          .sort(),
      );
    expect(fixedOf(a)).toBe(fixedOf(b));
  });
});
