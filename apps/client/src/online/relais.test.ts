/**
 * Le relais est le seul endroit du client qui sache qu'une partie est en ligne.
 * Quatre propriétés le rendent sûr, et chacune a sa raison d'être :
 *
 *  1. **Hors ligne, il ne fait rien.** `transmettre` doit pouvoir être appelé
 *     à chaque commande d'une partie solo sans conséquence ni coût.
 *  2. **Il annonce la séquence sur laquelle le joueur a joué**, pas une plus
 *     récente : c'est ce qui permet au serveur de détecter un retard.
 *  3. **Une réponse qui arrive après un changement de partie est ignorée.**
 *     Adopter l'état d'une partie qu'on a quittée écraserait l'autre — c'est le
 *     genre de bogue qui ne se voit qu'un mercredi soir, chez un cousin.
 *  4. **Un conflit ne perd pas le geste** : il remonte un message et l'état à
 *     jour, jamais un silence.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { Command } from '@auvergne/engine';
import type { PartyCommandPayload, PartyStatePayload } from '@auvergne/protocol';

import { brancherRelais, couperRelais, envoisEnVol, noterSeq, relaisActif, transmettre } from './relais.js';
import * as commandes from './commandes.js';

const COMMANDE: Command = { type: 'EndTurn' };

function etatFactice(code: string, seq: number): PartyStatePayload {
  return {
    code,
    seq,
    statut: 'en_cours',
    activePlayer: 'P2',
    monSlot: 'P1',
    monTour: false,
    setup: {},
    etat: '',
    hash: 'h',
    brouillardMasque: true,
    joueurs: [],
    updatedAt: '2026-08-18T00:00:00.000Z',
    gagnant: null,
  };
}

function reponse(code: string, seq: number): PartyCommandPayload {
  return {
    ok: true,
    rejeu: false,
    seq,
    activePlayer: 'P2',
    monTour: false,
    journal: ['Le héros se met en route.'],
    toursIa: ['P3'],
    etat: etatFactice(code, seq),
  };
}

/** Laisse tourner les promesses déjà résolues. */
const souffler = (): Promise<void> => new Promise((r) => setTimeout(r, 0));

afterEach(() => {
  couperRelais();
  vi.restoreAllMocks();
});

describe('relais des commandes en ligne', () => {
  it('ne transmet rien tant qu’aucune partie en ligne n’est branchée', () => {
    const envoi = vi.spyOn(commandes, 'envoyerCommandeFiable');
    expect(relaisActif()).toBeNull();
    expect(transmettre(COMMANDE)).toBe(false);
    expect(envoi).not.toHaveBeenCalled();
  });

  it('annonce la séquence connue, puis adopte celle que le serveur renvoie', async () => {
    const envoi = vi
      .spyOn(commandes, 'envoyerCommandeFiable')
      .mockResolvedValue({ issue: 'applique', cle: 'k1', charge: reponse('FOREZ-7K2P', 12), tentatives: 1 });
    const echos: unknown[] = [];
    brancherRelais({ code: 'FOREZ-7K2P', seq: 7, monSlot: 'P1' }, (e) => echos.push(e));

    expect(transmettre(COMMANDE)).toBe(true);
    /* La séquence envoyée est celle d'avant le coup : le serveur doit pouvoir
       constater un retard, ce qu'il ne pourrait pas si on lui donnait la
       sienne. */
    expect(envoi.mock.calls[0][2]).toBe(7);

    await souffler();
    expect(relaisActif()?.seq).toBe(12);
    expect(echos).toHaveLength(1);
    expect((echos[0] as { toursIa: string[] }).toursIa).toEqual(['P3']);
    expect(envoisEnVol()).toBe(0);
  });

  it('ignore une réponse qui arrive après un changement de partie', async () => {
    let resoudre: ((v: commandes.ResultatEnvoi) => void) | null = null;
    vi.spyOn(commandes, 'envoyerCommandeFiable').mockReturnValue(
      new Promise<commandes.ResultatEnvoi>((r) => {
        resoudre = r;
      }),
    );
    const echos: unknown[] = [];
    brancherRelais({ code: 'FOREZ-7K2P', seq: 3, monSlot: 'P1' }, (e) => echos.push(e));
    transmettre(COMMANDE);

    /* Le joueur ouvre une autre partie pendant que le coup vole. */
    brancherRelais({ code: 'GRANIT-4M9X', seq: 1, monSlot: 'P2' }, (e) => echos.push(e));
    resoudre?.({ issue: 'applique', cle: 'k1', charge: reponse('FOREZ-7K2P', 99), tentatives: 1 });
    await souffler();

    expect(echos).toHaveLength(0);
    expect(relaisActif()?.code).toBe('GRANIT-4M9X');
    expect(relaisActif()?.seq).toBe(1);
  });

  it('remonte un conflit avec son message et l’état à jour', async () => {
    vi.spyOn(commandes, 'envoyerCommandeFiable').mockResolvedValue({
      issue: 'conflit',
      cle: 'k1',
      etat: etatFactice('FOREZ-7K2P', 42),
      message: 'Un autre coup est passé avant le vôtre.',
      tentatives: 1,
    });
    const echos: { avertissement: string | null; etat: PartyStatePayload | null }[] = [];
    brancherRelais({ code: 'FOREZ-7K2P', seq: 5, monSlot: 'P1' }, (e) => echos.push(e));

    transmettre(COMMANDE);
    await souffler();

    expect(echos).toHaveLength(1);
    expect(echos[0].avertissement).toBeTruthy();
    expect(echos[0].etat?.seq).toBe(42);
    expect(relaisActif()?.seq).toBe(42);
  });

  it('ne fait jamais reculer la séquence', () => {
    brancherRelais({ code: 'FOREZ-7K2P', seq: 10, monSlot: 'P1' }, () => undefined);
    noterSeq(14);
    expect(relaisActif()?.seq).toBe(14);
    noterSeq(9);
    expect(relaisActif()?.seq).toBe(14);
  });
});
