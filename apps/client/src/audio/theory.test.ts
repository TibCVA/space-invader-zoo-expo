/**
 * Tests de la théorie musicale.
 *
 * Aucun `AudioContext` n'est nécessaire : `theory.ts` est purement
 * arithmétique. On y vérifie l'exactitude des modes, la cohérence des
 * cadences, la conformité des rythmes et — le point critique — le
 * déterminisme complet de la génération mélodique.
 */

import { describe, expect, it } from 'vitest';
import {
  CADENCES,
  CADENCE_NAMES,
  MODES,
  MODE_NAMES,
  RHYTHMS,
  RHYTHM_NAMES,
  beatSeconds,
  cadence,
  chord,
  clampBpm,
  counterLine,
  createRng,
  degreeToMidi,
  generateMelody,
  hashSeed,
  inMode,
  isClosing,
  midiToFreq,
  midiToFreqAncient,
  openFifth,
  patternLength,
  pitchClasses,
  progression,
  quantizeToMode,
  rhythmGrid,
  scale,
  transpose,
  type MelodyOptions,
} from './theory.js';

describe('générateur pseudo-aléatoire', () => {
  it('produit exactement la même suite pour une même graine', () => {
    const a = createRng(12345);
    const b = createRng(12345);
    const seriesA = Array.from({ length: 64 }, () => a.next());
    const seriesB = Array.from({ length: 64 }, () => b.next());
    expect(seriesA).toEqual(seriesB);
  });

  it('produit des suites différentes pour des graines différentes', () => {
    const a = Array.from({ length: 32 }, (_, i) => createRng(1).next() + i * 0);
    const b = Array.from({ length: 32 }, (_, i) => createRng(2).next() + i * 0);
    expect(a[0]).not.toEqual(b[0]);
  });

  it('reste dans [0, 1[', () => {
    const rng = createRng(777);
    for (let i = 0; i < 5000; i += 1) {
      const v = rng.next();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });

  it('borne correctement les entiers', () => {
    const rng = createRng(99);
    for (let i = 0; i < 2000; i += 1) {
      const v = rng.int(3, 7);
      expect(Number.isInteger(v)).toBe(true);
      expect(v).toBeGreaterThanOrEqual(3);
      expect(v).toBeLessThanOrEqual(7);
    }
  });

  it('respecte les poids du tirage pondéré', () => {
    const rng = createRng(2024);
    let a = 0;
    for (let i = 0; i < 4000; i += 1) if (rng.weighted(['a', 'b'], [9, 1]) === 'a') a += 1;
    expect(a).toBeGreaterThan(3300);
    expect(a).toBeLessThan(3900);
  });

  it('dérive des flux indépendants et reproductibles', () => {
    const first = createRng(5).fork(3);
    const second = createRng(5).fork(3);
    const third = createRng(5).fork(4);
    expect(first.next()).toBe(second.next());
    expect(createRng(5).fork(3).next()).not.toBe(third.next());
  });

  it('hache les chaînes de façon stable', () => {
    expect(hashSeed('durolle')).toBe(hashSeed('durolle'));
    expect(hashSeed('durolle')).not.toBe(hashSeed('cervières'));
    expect(hashSeed('')).toBeGreaterThanOrEqual(0);
  });
});

describe('modes anciens', () => {
  it('déclare sept degrés par mode, tous dans une octave', () => {
    for (const name of MODE_NAMES) {
      const steps = MODES[name];
      expect(steps).toHaveLength(7);
      expect(steps[0]).toBe(0);
      for (let i = 1; i < steps.length; i += 1) {
        expect(steps[i]).toBeGreaterThan(steps[i - 1] as number);
        expect(steps[i]).toBeLessThan(12);
      }
    }
  });

  it('donne les intervalles exacts des quatre modes imposés', () => {
    expect([...MODES.dorien]).toEqual([0, 2, 3, 5, 7, 9, 10]);
    expect([...MODES.eolien]).toEqual([0, 2, 3, 5, 7, 8, 10]);
    expect([...MODES.mixolydien]).toEqual([0, 2, 4, 5, 7, 9, 10]);
    expect([...MODES.phrygien]).toEqual([0, 1, 3, 5, 7, 8, 10]);
  });

  it('distingue le dorien de l’éolien par la sixte', () => {
    expect(MODES.dorien[5]).toBe(9);
    expect(MODES.eolien[5]).toBe(8);
  });

  it('distingue le phrygien par sa seconde abaissée', () => {
    expect(MODES.phrygien[1]).toBe(1);
  });

  it('construit une gamme montante close à l’octave', () => {
    const notes = scale(62, 'dorien', 1);
    expect(notes).toEqual([62, 64, 65, 67, 69, 71, 72, 74]);
  });

  it('construit une gamme sur deux octaves', () => {
    const notes = scale(60, 'eolien', 2);
    expect(notes).toHaveLength(15);
    expect(notes[0]).toBe(60);
    expect(notes[notes.length - 1]).toBe(84);
    for (let i = 1; i < notes.length; i += 1) {
      expect(notes[i]).toBeGreaterThan(notes[i - 1] as number);
    }
  });

  it('fait déborder les degrés sur les octaves voisines', () => {
    expect(degreeToMidi(60, 'dorien', 7)).toBe(72);
    expect(degreeToMidi(60, 'dorien', 14)).toBe(84);
    expect(degreeToMidi(60, 'dorien', -1)).toBe(58);
    expect(degreeToMidi(60, 'dorien', -7)).toBe(48);
  });

  it('énumère les sept classes de hauteur du mode', () => {
    const classes = pitchClasses(62, 'dorien');
    expect(classes).toHaveLength(7);
    expect(classes).toEqual([0, 2, 4, 5, 7, 9, 11]);
  });

  it('reconnaît l’appartenance au mode toutes octaves confondues', () => {
    expect(inMode(62, 62, 'dorien')).toBe(true);
    expect(inMode(74, 62, 'dorien')).toBe(true);
    expect(inMode(63, 62, 'dorien')).toBe(false);
  });

  it('rabat une note étrangère sur le degré le plus proche', () => {
    expect(quantizeToMode(63, 62, 'dorien')).toBe(62);
    expect(inMode(quantizeToMode(66, 62, 'phrygien'), 62, 'phrygien')).toBe(true);
    for (let midi = 48; midi < 84; midi += 1) {
      expect(inMode(quantizeToMode(midi, 55, 'mixolydien'), 55, 'mixolydien')).toBe(true);
    }
  });

  it('empile des tierces modales pour former un accord', () => {
    expect(chord(62, 'dorien', 0, 3)).toEqual([62, 65, 69]);
    expect(chord(62, 'dorien', 0, 4)).toEqual([62, 65, 69, 72]);
    expect(chord(62, 'dorien', 4, 3)).toEqual([69, 72, 76]);
  });

  it('produit une quinte à vide de sept demi-tons sur la finale', () => {
    const [low, high] = openFifth(62, 'dorien', 0) as [number, number];
    expect(high - low).toBe(7);
  });

  it('transpose sans altérer la structure', () => {
    const notes = scale(60, 'lydien', 1);
    const moved = transpose(notes, 5);
    expect(moved.map((n, i) => n - (notes[i] as number))).toEqual(notes.map(() => 5));
  });
});

describe('fréquences', () => {
  it('accorde le la3 à 440 Hz', () => {
    expect(midiToFreq(69)).toBeCloseTo(440, 6);
    expect(midiToFreq(81)).toBeCloseTo(880, 6);
    expect(midiToFreq(57)).toBeCloseTo(220, 6);
  });

  it('respecte le diapason demandé', () => {
    expect(midiToFreq(69, 415)).toBeCloseTo(415, 6);
  });

  it('reste très proche du tempérament égal en accord ancien', () => {
    for (let midi = 40; midi < 90; midi += 1) {
      const ratio = midiToFreqAncient(midi) / midiToFreq(midi);
      expect(ratio).toBeGreaterThan(0.99);
      expect(ratio).toBeLessThan(1.01);
    }
  });

  it('n’altère rien quand le tempérament ancien est désactivé', () => {
    expect(midiToFreqAncient(64, 0)).toBeCloseTo(midiToFreq(64), 9);
  });
});

describe('cadences', () => {
  it('déclare toutes les cadences annoncées', () => {
    for (const name of CADENCE_NAMES) {
      expect(CADENCES[name].length).toBeGreaterThanOrEqual(2);
    }
    expect(CADENCE_NAMES).toHaveLength(7);
  });

  it('donne les degrés attendus des cadences modales', () => {
    expect(cadence('plagale')).toEqual([3, 0]);
    expect(cadence('phrygienne')).toEqual([1, 0]);
    expect(cadence('sous_finale')).toEqual([6, 0]);
    expect(cadence('ouverte')).toEqual([0, 4]);
    expect(cadence('antique')).toEqual([6, 4, 0]);
  });

  it('rend une copie mutable', () => {
    const c = cadence('plagale');
    c.push(9);
    expect(cadence('plagale')).toEqual([3, 0]);
  });

  it('distingue les cadences conclusives des cadences suspensives', () => {
    expect(isClosing('plagale')).toBe(true);
    expect(isClosing('phrygienne')).toBe(true);
    expect(isClosing('antique')).toBe(true);
    expect(isClosing('ouverte')).toBe(false);
    expect(isClosing('suspendue')).toBe(false);
  });

  it('ne comporte aucune sensible tonale (degré 6 haussé)', () => {
    // Une cadence modale ne se referme jamais par un demi-tonascendant
    // emprunté : tous les degrés sont naturels au mode.
    for (const name of CADENCE_NAMES) {
      for (const degree of CADENCES[name]) {
        expect(degree).toBeGreaterThanOrEqual(0);
        expect(degree).toBeLessThanOrEqual(6);
      }
    }
  });
});

describe('progressions', () => {
  it('respecte la longueur demandée', () => {
    for (let bars = 2; bars <= 16; bars += 1) {
      expect(progression(42, 'dorien', bars, 'plagale')).toHaveLength(bars);
    }
  });

  it('se termine toujours par la cadence demandée', () => {
    for (const name of CADENCE_NAMES) {
      const degrees = progression(7, 'eolien', 8, name);
      const tail = degrees.slice(degrees.length - CADENCES[name].length);
      expect(tail).toEqual([...CADENCES[name]]);
    }
  });

  it('est déterministe', () => {
    expect(progression(2025, 'mixolydien', 8, 'sous_finale')).toEqual(
      progression(2025, 'mixolydien', 8, 'sous_finale'),
    );
  });

  it('change avec la graine', () => {
    const a = progression(1, 'dorien', 12, 'plagale');
    const b = progression(2, 'dorien', 12, 'plagale');
    expect(a).not.toEqual(b);
  });

  it('ne sort jamais des sept degrés', () => {
    for (let seed = 0; seed < 200; seed += 1) {
      for (const degree of progression(seed, 'phrygien', 10, 'antique')) {
        expect(degree).toBeGreaterThanOrEqual(0);
        expect(degree).toBeLessThanOrEqual(6);
      }
    }
  });
});

describe('rythmes médiévaux', () => {
  it('déclare les huit rythmes annoncés', () => {
    expect(RHYTHM_NAMES).toHaveLength(8);
    for (const name of RHYTHM_NAMES) {
      expect(RHYTHMS[name].name).toBe(name);
      expect(RHYTHMS[name].label.length).toBeGreaterThan(0);
    }
  });

  it('donne une accentuation par battue', () => {
    for (const name of RHYTHM_NAMES) {
      const def = RHYTHMS[name];
      expect(def.accents.length).toBe(def.beatsPerBar);
      for (const a of def.accents) {
        expect(a).toBeGreaterThan(0);
        expect(a).toBeLessThanOrEqual(1);
      }
    }
  });

  it('place toutes les frappes de tambour à l’intérieur de la mesure', () => {
    for (const name of RHYTHM_NAMES) {
      const def = RHYTHMS[name];
      for (const stroke of def.drum) {
        expect(stroke.at).toBeGreaterThanOrEqual(0);
        expect(stroke.at).toBeLessThan(def.beatsPerBar);
        expect(stroke.force).toBeGreaterThan(0);
        expect(stroke.force).toBeLessThanOrEqual(1);
      }
    }
  });

  it('a un premier temps marqué partout où il y a un tambour', () => {
    for (const name of RHYTHM_NAMES) {
      const drum = RHYTHMS[name].drum;
      if (drum.length === 0) continue;
      expect(drum[0]?.at).toBe(0);
      expect(drum[0]?.force).toBeGreaterThanOrEqual(0.8);
    }
  });

  it('déroule une grille dont les cellules pavent exactement les mesures', () => {
    for (const name of RHYTHM_NAMES) {
      const def = RHYTHMS[name];
      const grid = rhythmGrid(name, 4);
      expect(grid.length).toBeGreaterThan(0);
      let expected = 0;
      for (const cell of grid) {
        expect(cell.start).toBeCloseTo(expected, 9);
        expect(cell.duration).toBeGreaterThan(0);
        expected += cell.duration;
      }
      expect(expected).toBeCloseTo(def.beatsPerBar * 4, 9);
    }
  });

  it('mesure la longueur du motif', () => {
    expect(patternLength('bourree')).toBeCloseTo(2, 9);
    expect(patternLength('procession')).toBeCloseTo(4, 9);
  });
});

describe('génération mélodique', () => {
  const base: MelodyOptions = {
    seed: 20250816,
    root: 62,
    mode: 'dorien',
    bars: 8,
    rhythm: 'ductia',
    cadence: 'sous_finale',
  };

  it('est strictement déterministe pour une graine donnée', () => {
    expect(generateMelody(base)).toEqual(generateMelody(base));
  });

  it('change dès que la graine change', () => {
    const a = generateMelody(base);
    const b = generateMelody({ ...base, seed: base.seed + 1 });
    expect(a.map((n) => n.midi)).not.toEqual(b.map((n) => n.midi));
  });

  it('ne place que des notes du mode', () => {
    for (const mode of MODE_NAMES) {
      const notes = generateMelody({ ...base, mode, seed: 4242 });
      for (const note of notes) {
        expect(inMode(note.midi, base.root, mode)).toBe(true);
      }
    }
  });

  it('produit des notes ordonnées et sans trou', () => {
    const notes = generateMelody(base);
    expect(notes.length).toBeGreaterThan(8);
    for (let i = 1; i < notes.length; i += 1) {
      expect(notes[i]?.start).toBeGreaterThanOrEqual(notes[i - 1]?.start as number);
    }
    for (const note of notes) {
      expect(note.duration).toBeGreaterThan(0);
      expect(note.velocity).toBeGreaterThan(0);
      expect(note.velocity).toBeLessThanOrEqual(1);
    }
  });

  it('remplit exactement la durée demandée', () => {
    const beatsPerBar = RHYTHMS[base.rhythm].beatsPerBar;
    const notes = generateMelody(base);
    const last = notes[notes.length - 1];
    expect(last).toBeDefined();
    expect((last?.start ?? 0) + (last?.duration ?? 0)).toBeCloseTo(base.bars * beatsPerBar, 6);
  });

  it('se referme sur la finale quand la cadence est conclusive', () => {
    for (const name of CADENCE_NAMES) {
      const notes = generateMelody({ ...base, cadence: name, seed: 909 });
      const last = notes[notes.length - 1];
      const expected = CADENCES[name][CADENCES[name].length - 1];
      expect(last?.degree).toBe(expected);
    }
  });

  it('reste dans l’ambitus demandé', () => {
    const notes = generateMelody({ ...base, ambitus: 7, seed: 31337 });
    for (const note of notes) {
      expect(note.degree).toBeGreaterThanOrEqual(-4);
      expect(note.degree).toBeLessThanOrEqual(6);
    }
  });

  it('procède surtout par mouvement conjoint', () => {
    const notes = generateMelody({ ...base, bars: 24, seed: 5150, mobility: 0.5 });
    let conjoint = 0;
    for (let i = 1; i < notes.length; i += 1) {
      const step = Math.abs((notes[i]?.degree ?? 0) - (notes[i - 1]?.degree ?? 0));
      if (step <= 1) conjoint += 1;
    }
    expect(conjoint / (notes.length - 1)).toBeGreaterThan(0.6);
  });

  it('augmente le nombre de notes avec le nombre de mesures', () => {
    const short = generateMelody({ ...base, bars: 4 });
    const long = generateMelody({ ...base, bars: 16 });
    expect(long.length).toBeGreaterThan(short.length);
  });

  it('fonctionne pour tous les rythmes', () => {
    for (const rhythm of RHYTHM_NAMES) {
      const notes = generateMelody({ ...base, rhythm, seed: 606 });
      expect(notes.length).toBeGreaterThan(0);
    }
  });

  it('n’ajoute aucun ornement quand l’ornementation est nulle', () => {
    const notes = generateMelody({ ...base, ornamentation: 0 });
    expect(notes.some((n) => n.ornament)).toBe(false);
  });
});

describe('contrechant', () => {
  const melody = generateMelody({
    seed: 1789,
    root: 55,
    mode: 'mixolydien',
    bars: 8,
    rhythm: 'ductia',
    cadence: 'plagale',
  });

  it('est déterministe', () => {
    expect(counterLine(melody, 55, 'mixolydien', 1789)).toEqual(
      counterLine(melody, 55, 'mixolydien', 1789),
    );
  });

  it('reste dans le mode et sous la mélodie ou à l’unisson', () => {
    const line = counterLine(melody, 55, 'mixolydien', 1789);
    expect(line.length).toBeGreaterThan(0);
    for (const note of line) {
      expect(inMode(note.midi, 55, 'mixolydien')).toBe(true);
    }
    for (const note of line) {
      const source = melody.find((m) => m.start === note.start);
      expect(source).toBeDefined();
      expect(note.midi).toBeLessThanOrEqual(source?.midi ?? 0);
    }
  });
});

describe('tempo', () => {
  it('convertit les battues en secondes', () => {
    expect(beatSeconds(60)).toBeCloseTo(1, 9);
    expect(beatSeconds(120)).toBeCloseTo(0.5, 9);
  });

  it('borne le tempo à la fourchette 62–96 de la bible artistique', () => {
    expect(clampBpm(10)).toBe(62);
    expect(clampBpm(200)).toBe(96);
    expect(clampBpm(78)).toBe(78);
    expect(clampBpm(78.4)).toBe(78);
  });
});
