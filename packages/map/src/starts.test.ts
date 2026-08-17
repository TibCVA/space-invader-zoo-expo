import { describe, expect, it } from 'vitest';
import { REGIONS, type StartKey } from '@auvergne/engine';
import { anchorCell } from './anchors.js';
import { NEUTRAL_CENTERS, START_KEYS, START_POSITIONS, START_SETS } from './starts.js';

const ALL: StartKey[] = ['arconsat', 'viscomtat', 'cervieres', 'noiretable', 'renaudie'];

describe('positions de départ', () => {
  it('publie exactement les cinq clefs du brief', () => {
    expect(Object.keys(START_POSITIONS).sort()).toEqual([...ALL].sort());
    expect([...START_KEYS].sort()).toEqual([...ALL].sort());
  });

  it('remplit le contrat StartPosition', () => {
    for (const key of ALL) {
      const sp = START_POSITIONS[key];
      expect(sp.key).toBe(key);
      expect(sp.label.length).toBeGreaterThan(3);
      expect(sp.townUid).toBe(`T_${key === 'renaudie' ? 'renaudie' : key}`);
      expect(REGIONS).toContain(sp.region);
      expect(Number.isInteger(sp.at.col)).toBe(true);
      expect(Number.isInteger(sp.at.row)).toBe(true);
    }
  });

  it('se place exactement sur l’ancrage du bourg', () => {
    expect(START_POSITIONS.arconsat.at).toEqual(anchorCell('arconsat'));
    expect(START_POSITIONS.viscomtat.at).toEqual(anchorCell('viscomtat'));
    expect(START_POSITIONS.cervieres.at).toEqual(anchorCell('cervieres'));
    expect(START_POSITIONS.noiretable.at).toEqual(anchorCell('noiretable'));
    expect(START_POSITIONS.renaudie.at).toEqual(anchorCell('renaudie'));
  });

  it('donne des identifiants de cité uniques', () => {
    const uids = new Set(ALL.map((k) => START_POSITIONS[k].townUid));
    expect(uids.size).toBe(5);
    for (const n of NEUTRAL_CENTERS) expect(uids.has(n.townUid)).toBe(false);
  });

  it('éloigne suffisamment les capitales les unes des autres', () => {
    for (let i = 0; i < ALL.length; i++) {
      for (let j = i + 1; j < ALL.length; j++) {
        const a = START_POSITIONS[ALL[i]].at;
        const b = START_POSITIONS[ALL[j]].at;
        const d = Math.max(Math.abs(a.col - b.col), Math.abs(a.row - b.row));
        expect(d, `${ALL[i]} / ${ALL[j]}`).toBeGreaterThan(60);
      }
    }
  });
});

describe('combinaisons équilibrées', () => {
  it('couvre 2, 3, 4 et 5 bannières', () => {
    expect(Object.keys(START_SETS).sort()).toEqual(['2', '3', '4', '5']);
  });

  it('propose des ensembles de la bonne taille, sans doublon interne', () => {
    for (const n of [2, 3, 4, 5] as const) {
      const sets = START_SETS[n];
      expect(sets.length, `${n} joueurs`).toBeGreaterThanOrEqual(1);
      for (const set of sets) {
        expect(set.length).toBe(n);
        expect(new Set(set).size).toBe(n);
        for (const key of set) expect(ALL).toContain(key);
      }
    }
  });

  it('ne propose jamais deux fois le même ensemble', () => {
    for (const n of [2, 3, 4, 5] as const) {
      const seen = new Set<string>();
      for (const set of START_SETS[n]) {
        const signature = [...set].sort().join('|');
        expect(seen.has(signature), `doublon pour ${n} joueurs : ${signature}`).toBe(false);
        seen.add(signature);
      }
    }
  });

  it('emploie les cinq départs à cinq bannières', () => {
    expect(START_SETS[5].length).toBe(1);
    expect([...START_SETS[5][0]].sort()).toEqual([...ALL].sort());
  });

  it('donne à chaque départ au moins une combinaison à deux, trois et quatre', () => {
    for (const n of [2, 3, 4] as const) {
      const used = new Set<StartKey>();
      for (const set of START_SETS[n]) for (const key of set) used.add(key);
      expect(used.size, `${n} joueurs`).toBe(5);
    }
  });

  it('espace correctement les bannières dans chaque combinaison', () => {
    for (const n of [2, 3, 4, 5] as const) {
      for (const set of START_SETS[n]) {
        for (let i = 0; i < set.length; i++) {
          for (let j = i + 1; j < set.length; j++) {
            const a = START_POSITIONS[set[i]].at;
            const b = START_POSITIONS[set[j]].at;
            const d = Math.max(Math.abs(a.col - b.col), Math.abs(a.row - b.row));
            expect(d, `${set[i]} / ${set[j]}`).toBeGreaterThan(60);
          }
        }
      }
    }
  });

  it('choisit à deux bannières des paires réellement opposées', () => {
    for (const set of START_SETS[2]) {
      const a = START_POSITIONS[set[0]].at;
      const b = START_POSITIONS[set[1]].at;
      const d = Math.max(Math.abs(a.col - b.col), Math.abs(a.row - b.row));
      expect(d, set.join(' / ')).toBeGreaterThan(80);
    }
  });
});

describe('centres neutres capturables', () => {
  it('reprend les quatre bourgs du brief', () => {
    expect(NEUTRAL_CENTERS.map((n) => n.anchor).sort()).toEqual(
      ['chabreloche', 'hermitage', 'le_lac', 'vollore'].sort(),
    );
  });

  it('donne à chacun une vocation économique et une région', () => {
    for (const n of NEUTRAL_CENTERS) {
      expect(n.vocation.length).toBeGreaterThan(4);
      expect(REGIONS).toContain(n.region);
      expect(n.townUid.startsWith('T_')).toBe(true);
    }
  });
});
