/**
 * LE FILTRE D'ÉQUITÉ DU JOURNAL — chaque bannière ne lit que SA chronique,
 * les faits du monde, et les faits publics.
 *
 * Mesuré avant le correctif : `etatPublic` servait le journal entier — un
 * joueur en ligne lisait les constructions et recrutements de l'adversaire
 * dans des cités sous brouillard. Même famille de fuite que le brouillard
 * lui-même, déjà masqué au même endroit.
 */
import { describe, expect, it } from 'vitest';
import { journalServi } from './chronique.js';

const JOURNAL = [
  { turn: 3, player: 'P1' as const, text: 'La Palissade s’élève à Arconsat.', kind: 'info' },
  { turn: 3, player: null, text: 'Le temps tourne à l’éclaircie.', kind: 'info' },
  { turn: 4, player: 'P2' as const, text: 'Le Fort s’élève à La Renaudie.', kind: 'info' },
  {
    turn: 5,
    player: 'P2' as const,
    text: 'Cervières passe sous la bannière de l’Ermitage.',
    kind: 'warn',
    portee: 'publique' as const,
  },
];

describe('le journal servi à une bannière', () => {
  it('garde mes lignes, les faits du monde et les faits publics — rien du privé des autres', () => {
    const pourP1 = journalServi(JOURNAL, 'P1');
    expect(pourP1.map((e) => e.text)).toEqual([
      'La Palissade s’élève à Arconsat.',
      'Le temps tourne à l’éclaircie.',
      'Cervières passe sous la bannière de l’Ermitage.',
    ]);
  });

  it('et symétriquement pour l’autre bannière', () => {
    const pourP2 = journalServi(JOURNAL, 'P2');
    expect(pourP2.some((e) => e.text.includes('Arconsat'))).toBe(false);
    expect(pourP2.some((e) => e.text.includes('La Renaudie'))).toBe(true);
    expect(pourP2.some((e) => e.portee === 'publique')).toBe(true);
  });
});
