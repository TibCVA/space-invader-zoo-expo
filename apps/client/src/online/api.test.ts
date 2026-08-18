/**
 * Le client HTTP des parties : mémoire des jetons et traduction des réponses.
 *
 * Deux propriétés comptent plus que les autres, et ce sont celles que l'on
 * vérifie ici :
 *
 *  1. **Un seul emplacement de stockage** porte tous les jetons, sous forme
 *     d'un objet `code → jeton`. Cinq cousins ne doivent pas laisser cinq
 *     lignes derrière eux.
 *  2. **Le jeton ne sort que par l'en-tête.** On inspecte chaque requête :
 *     l'URL ne doit jamais contenir le secret, et l'en-tête doit être celui
 *     que le protocole impose.
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { PARTIES_API, PLAYER_TOKEN_HEADER } from '@auvergne/protocol';
import {
  CLEF_JETONS,
  ErreurConflit,
  ErreurPartie,
  ErreurReseau,
  codesConnus,
  dernierePartie,
  estEnRetard,
  estTemporaire,
  installerTransport,
  jetonDe,
  lireEtat,
  lireJetons,
  oublierJeton,
  retenirJeton,
} from './api.js';

/* ── Un `localStorage` de papier ─────────────────────────────────────────── */

class StockageFactice implements Storage {
  private readonly boite = new Map<string, string>();

  get length(): number {
    return this.boite.size;
  }

  clear(): void {
    this.boite.clear();
  }

  getItem(clef: string): string | null {
    return this.boite.get(clef) ?? null;
  }

  key(index: number): string | null {
    return [...this.boite.keys()][index] ?? null;
  }

  removeItem(clef: string): void {
    this.boite.delete(clef);
  }

  setItem(clef: string, valeur: string): void {
    this.boite.set(clef, valeur);
  }

  /** Toutes les clefs écrites : c'est ce que l'on veut compter. */
  clefs(): string[] {
    return [...this.boite.keys()];
  }
}

let memoire: StockageFactice;

beforeEach(() => {
  memoire = new StockageFactice();
  Object.defineProperty(globalThis, 'localStorage', {
    value: memoire,
    configurable: true,
    writable: true,
  });
});

afterEach(() => {
  installerTransport(null);
  Reflect.deleteProperty(globalThis as Record<string, unknown>, 'localStorage');
});

/* ── Mémoire des jetons ──────────────────────────────────────────────────── */

describe('mémoire des jetons', () => {
  it('range tous les jetons dans une seule clef, sous forme d’objet', () => {
    retenirJeton('FOREZ-7K2P', 'a'.repeat(32));
    retenirJeton('GRANIT-4H9M', 'b'.repeat(32));
    retenirJeton('SAGNES-2C7X', 'c'.repeat(32));

    expect(memoire.clefs()).toEqual([CLEF_JETONS]);
    expect(lireJetons()).toEqual({
      'FOREZ-7K2P': 'a'.repeat(32),
      'GRANIT-4H9M': 'b'.repeat(32),
      'SAGNES-2C7X': 'c'.repeat(32),
    });
  });

  it('relit un jeton par son code, quelle que soit la casse saisie', () => {
    retenirJeton('FOREZ-7K2P', 'd'.repeat(32));
    expect(jetonDe('forez-7k2p')).toBe('d'.repeat(32));
    expect(jetonDe(' FOREZ-7K2P ')).toBe('d'.repeat(32));
    expect(jetonDe('VOLLORE-3J8K')).toBeNull();
  });

  it('remplace un jeton sans en dupliquer l’entrée', () => {
    retenirJeton('FOREZ-7K2P', 'e'.repeat(32));
    retenirJeton('FOREZ-7K2P', 'f'.repeat(32));
    expect(Object.keys(lireJetons())).toHaveLength(1);
    expect(jetonDe('FOREZ-7K2P')).toBe('f'.repeat(32));
  });

  it('oublie un jeton sans toucher aux autres', () => {
    retenirJeton('FOREZ-7K2P', 'g'.repeat(32));
    retenirJeton('GRANIT-4H9M', 'h'.repeat(32));
    oublierJeton('FOREZ-7K2P');
    expect(codesConnus()).toEqual(['GRANIT-4H9M']);
  });

  it('désigne comme dernière partie la plus récemment mémorisée', () => {
    retenirJeton('FOREZ-7K2P', 'i'.repeat(32));
    retenirJeton('GRANIT-4H9M', 'j'.repeat(32));
    expect(dernierePartie()).toBe('GRANIT-4H9M');
    retenirJeton('FOREZ-7K2P', 'k'.repeat(32));
    expect(dernierePartie()).toBe('FOREZ-7K2P');
  });

  it('survit à un trousseau abîmé sans lever', () => {
    memoire.setItem(CLEF_JETONS, '{ ceci n’est pas du JSON');
    expect(lireJetons()).toEqual({});
    expect(jetonDe('FOREZ-7K2P')).toBeNull();
  });

  it('reste muet quand le stockage est refusé', () => {
    Reflect.deleteProperty(globalThis as Record<string, unknown>, 'localStorage');
    expect(() => retenirJeton('FOREZ-7K2P', 'l'.repeat(32))).not.toThrow();
    expect(jetonDe('FOREZ-7K2P')).toBeNull();
  });
});

/* ── Le jeton ne voyage que dans l'en-tête ───────────────────────────────── */

describe('transport du jeton', () => {
  it('porte le jeton dans l’en-tête du protocole, et jamais dans l’URL', async () => {
    const secret = '9f3c1d2e4a5b6c7d8e9f0a1b2c3d4e5f';
    retenirJeton('FOREZ-7K2P', secret);
    const vues: { url: string; entetes: Record<string, string> }[] = [];

    installerTransport((url, init) => {
      vues.push({ url, entetes: (init.headers ?? {}) as Record<string, string> });
      return Promise.resolve(
        new Response(JSON.stringify({ seq: 4, etat: 'x' }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
      );
    });

    await lireEtat('FOREZ-7K2P', 3);

    expect(vues).toHaveLength(1);
    expect(vues[0].entetes[PLAYER_TOKEN_HEADER]).toBe(secret);
    expect(vues[0].url).toBe(`${PARTIES_API.etat('FOREZ-7K2P')}?depuis=3`);
    expect(vues[0].url).not.toContain(secret);
  });

  it('traduit un 304 par `null` : rien n’a bougé depuis cette séquence', async () => {
    installerTransport(() => Promise.resolve(new Response(null, { status: 304 })));
    await expect(lireEtat('FOREZ-7K2P', 12)).resolves.toBeNull();
  });

  it('traduit une coupure réseau en `ErreurReseau`, réessayable', async () => {
    installerTransport(() => Promise.reject(new TypeError('Failed to fetch')));
    const echec = await lireEtat('FOREZ-7K2P').catch((e: unknown) => e);
    expect(echec).toBeInstanceOf(ErreurReseau);
    expect(estTemporaire(echec)).toBe(true);
  });

  it('garde le message français du serveur, et son code', async () => {
    installerTransport(() =>
      Promise.resolve(
        new Response(JSON.stringify({ erreur: 'Cette bannière est déjà prise.', code: 'banniere_prise' }), {
          status: 409,
          headers: { 'content-type': 'application/json' },
        }),
      ),
    );
    const echec = await lireEtat('FOREZ-7K2P').catch((e: unknown) => e);
    expect(echec).toBeInstanceOf(ErreurConflit);
    expect((echec as ErreurPartie).message).toBe('Cette bannière est déjà prise.');
    expect((echec as ErreurPartie).code).toBe('banniere_prise');
    expect(estEnRetard(echec)).toBe(true);
    expect(estTemporaire(echec)).toBe(false);
  });

  it('juge temporaires les 429 et les 5xx, définitifs les 4xx ordinaires', async () => {
    expect(estTemporaire(new ErreurPartie('trop vite', 'quota', 429))).toBe(true);
    expect(estTemporaire(new ErreurPartie('panne', 'erreur_interne', 503))).toBe(true);
    expect(estTemporaire(new ErreurPartie('interdit', 'jeton_invalide', 403))).toBe(false);
  });
});
