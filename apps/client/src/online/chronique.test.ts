/**
 * LA CHRONIQUE DE L'ABSENCE — au retour de la main, le monde raconte ce qui
 * s'est passé.
 *
 * Le jeu par correspondance avait un trou : la main revenait, l'état avait
 * changé en silence, et rien ne pointait vers le journal. `lignesNouvelles`
 * compte ce que CE navigateur n'a pas encore vu, à partir du repère
 * « dernière ligne vue » tenu par partie.
 */
import { describe, expect, it } from 'vitest';
import { lignesNouvelles } from './partie.js';

const JOURNAL = [
  { turn: 3, player: 'P1' as const, text: 'mon fait ancien' },
  { turn: 4, player: 'P2' as const, text: 'fait adverse ancien' },
  { turn: 5, player: 'P2' as const, text: 'Cervières passe sous la bannière de l’Ermitage.' },
  { turn: 5, player: null, text: 'Nouvelle semaine.' },
  { turn: 6, player: 'P1' as const, text: 'mon fait récent' },
];

describe('les lignes nouvelles depuis le repère', () => {
  it('tout ce qui SUIT la dernière ligne vue, mes propres lignes exclues', () => {
    const repere = { clef: '4|P2|fait adverse ancien', tour: 4 };
    const nouvelles = lignesNouvelles({ journal: JOURNAL }, 'P1', repere);
    expect(nouvelles.map((e) => e.text)).toEqual([
      'Cervières passe sous la bannière de l’Ermitage.',
      'Nouvelle semaine.',
    ]);
  });

  it('sans repère (première visite), rien : on ne raconte pas une partie entière', () => {
    expect(lignesNouvelles({ journal: JOURNAL }, 'P1', null)).toEqual([]);
  });

  it('repère poussé hors du journal borné : on retombe sur le tour', () => {
    const repere = { clef: '1|P2|ligne disparue', tour: 4 };
    const nouvelles = lignesNouvelles({ journal: JOURNAL }, 'P1', repere);
    expect(nouvelles.map((e) => e.turn)).toEqual([5, 5]);
  });
});
