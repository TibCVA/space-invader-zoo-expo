/**
 * Stockage : politique d'emplacements, repli automatique, et conformité des
 * trois implémentations au même contrat.
 *
 * `MemoryStorage` et `FileStorage` sont soumis à la **même** batterie de
 * tests : c'est la seule façon de garantir qu'une bascule PostgreSQL →
 * fichier → mémoire ne change pas le comportement observé par le joueur.
 * `PostgresStorage` n'est pas testé ici faute de base dans l'environnement de
 * compilation ; sa migration est en revanche vérifiée au démarrage réel.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  AUTOSAVE_SLOTS,
  MANUAL_SLOTS,
  MAX_IDENTITY_BYTES,
  MAX_SAVE_BYTES,
  defaultProfile,
  type SaveSlot,
} from '@auvergne/protocol';
import {
  createStorage,
  emptySeat,
  formatOctets,
  planSlotWrite,
  scrubSecrets,
  sortSlots,
  usageOf,
  type SaveMeta,
  type Storage,
  type StoredParty,
  type StoredSave,
} from './index.js';
import { MemoryStorage } from './memory.js';
import { FileStorage } from './file.js';
import { testSetup } from '../testkit.js';

const NOW = '2026-08-17T09:00:00.000Z';

function slot(over: Partial<SaveSlot> = {}): SaveSlot {
  return {
    id: 'emplacement-1',
    name: 'Marche du Forez',
    turn: 12,
    week: 2,
    players: [{ name: 'Granit', faction: 'granit', color: '#8C2230' }],
    createdAt: NOW,
    updatedAt: NOW,
    autosave: false,
    hash: '5631d03501bfb659',
    ...over,
  };
}

function meta(over: Partial<SaveSlot> = {}, bytes = 1000): SaveMeta {
  return {
    slot: slot(over),
    versions: { moteur: '1.0.0', contenu: '1.0.0', carte: '1.0.0' },
    bytes,
  };
}

function stored(over: Partial<SaveSlot> = {}, bytes = 1000): StoredSave {
  return {
    ...meta(over, bytes),
    setup: testSetup(),
    state: '{"engineVersion":"1.0.0-noyau"}',
    commands: [{ type: 'EndTurn' }],
  };
}

/**
 * L'ordre des clefs est volontairement anti-alphabétique : `etat` doit
 * ressortir du stockage **octet pour octet**, sans quoi le hash de la partie
 * ne serait plus vérifiable (cf. l'en-tête de `storage/parties.ts`).
 */
const ETAT_TEXTE = '{"zebre":1,"alpha":2}';

/** Une partie en ligne complète : hôte sans bannière, un cousin installé. */
function partieStockee(): StoredParty {
  return {
    code: 'FOREZ-7K2P',
    hote: IDENTITE,
    jetonHote: '0'.repeat(32),
    setup: { bannieres: 2, duree: 'standard', victoire: 'couronne', graine: 20260818 },
    statut: 'salon',
    seq: 3,
    activePlayer: null,
    versions: { moteur: '1.0.0', contenu: '1.0.0', carte: '1.0.0' },
    joueurs: [
      {
        ...emptySeat('P1'),
        jeton: 'a'.repeat(32),
        identite: AUTRE,
        nom: 'Jean',
        faction: 'ermitage',
        heros: 'agathe',
        avatar: 'agathe',
        depart: 'renaudie',
        kind: 'humain',
        pret: true,
        dernierVuLe: NOW,
      },
      emptySeat('P2'),
    ],
    etat: ETAT_TEXTE,
    hash: '5631d03501bfb659',
    instantanes: [{ seq: 3, etat: ETAT_TEXTE, hash: '5631d03501bfb659', creeLe: NOW }],
    commandes: [
      {
        seq: 3,
        joueur: 'P1',
        commande: { type: 'EndTurn' },
        cleIdempotence: 'cle-de-jean-1',
        appliqueLe: NOW,
        ok: true,
        erreur: null,
        journal: ['Jean lève le camp.'],
        toursIa: [],
      },
    ],
    creeLe: NOW,
    majLe: NOW,
    termineeLe: null,
    gagnant: null,
  };
}

/* ── Politique d'emplacements ───────────────────────────────────────────── */

describe('planSlotWrite', () => {
  it('accepte un premier emplacement manuel', () => {
    const plan = planSlotWrite([], 'a', false, 1000);
    expect(plan).toEqual({ ok: true, remplace: false, evince: null });
  });

  it('accepte la mise à jour d’un emplacement existant', () => {
    const plan = planSlotWrite([meta({ id: 'a' })], 'a', false, 2000);
    expect(plan.ok && plan.remplace).toBe(true);
  });

  it('refuse le treizième emplacement manuel, en français', () => {
    const existants = Array.from({ length: MANUAL_SLOTS }, (_, i) => meta({ id: `m${i}` }));
    const plan = planSlotWrite(existants, 'm-neuf', false, 1000);
    expect(plan.ok).toBe(false);
    if (!plan.ok) {
      expect(plan.code).toBe('emplacements_pleins');
      expect(plan.message).toContain('12 emplacements manuels');
      expect(plan.message).toMatch(/Supprimez/);
    }
  });

  it('évince la plus ancienne des sauvegardes automatiques', () => {
    const existants = [
      meta({ id: 'auto-a', autosave: true, updatedAt: '2026-08-17T08:00:00.000Z' }),
      meta({ id: 'auto-b', autosave: true, updatedAt: '2026-08-17T09:00:00.000Z' }),
      meta({ id: 'auto-c', autosave: true, updatedAt: '2026-08-17T10:00:00.000Z' }),
    ];
    const plan = planSlotWrite(existants, 'auto-d', true, 1000);
    expect(plan.ok && plan.evince).toBe('auto-a');
  });

  it('n’évince rien tant que les trois emplacements ne sont pas pris', () => {
    const existants = [meta({ id: 'auto-a', autosave: true })];
    const plan = planSlotWrite(existants, 'auto-b', true, 1000);
    expect(plan.ok && plan.evince).toBeNull();
    expect(AUTOSAVE_SLOTS).toBe(3);
  });

  it('refuse une sauvegarde au-delà de 24 Mo', () => {
    const plan = planSlotWrite([], 'a', false, MAX_SAVE_BYTES + 1);
    expect(plan.ok).toBe(false);
    if (!plan.ok) {
      expect(plan.code).toBe('charge_trop_lourde');
      expect(plan.message).toContain('24 Mo');
    }
  });

  it('refuse un dépassement du quota de 200 Mo par identité', () => {
    const gros = Math.floor(MAX_IDENTITY_BYTES / 4);
    const existants = [
      meta({ id: 'a' }, gros),
      meta({ id: 'b' }, gros),
      meta({ id: 'c' }, gros),
      meta({ id: 'd' }, gros),
    ];
    const plan = planSlotWrite(existants, 'e', false, 1024);
    expect(plan.ok).toBe(false);
    if (!plan.ok) {
      expect(plan.code).toBe('quota_depasse');
      expect(plan.message).toContain('Mo');
    }
  });

  it('tient compte de la place libérée par la rotation automatique', () => {
    // Sept parties manuelles volumineuses + trois automatiques frôlent les
    // 200 Mo : une quatrième automatique ne passe que parce que la rotation
    // libère la plus ancienne.
    const manuel = 24_000_000;
    const auto = 13_000_000;
    const existants = [
      ...Array.from({ length: 7 }, (_, i) => meta({ id: `m${i}` }, manuel)),
      meta({ id: 'auto-a', autosave: true, updatedAt: '2026-08-17T08:00:00.000Z' }, auto),
      meta({ id: 'auto-b', autosave: true, updatedAt: '2026-08-17T09:00:00.000Z' }, auto),
      meta({ id: 'auto-c', autosave: true, updatedAt: '2026-08-17T10:00:00.000Z' }, auto),
    ];
    const totalActuel = 7 * manuel + 3 * auto;
    expect(totalActuel).toBeLessThan(MAX_IDENTITY_BYTES);
    expect(totalActuel + auto).toBeGreaterThan(MAX_IDENTITY_BYTES);

    const plan = planSlotWrite(existants, 'auto-d', true, auto);
    expect(plan.ok).toBe(true);
    expect(plan.ok && plan.evince).toBe('auto-a');
  });
});

describe('aides', () => {
  it('met en forme les octets en français', () => {
    expect(formatOctets(512)).toBe('512 octets');
    expect(formatOctets(2048)).toBe('2 Ko');
    expect(formatOctets(24 * 1024 * 1024)).toContain('Mo');
  });

  it('classe les manuels avant les automatiques, du plus récent au plus ancien', () => {
    const items = [
      meta({ id: 'auto', autosave: true, updatedAt: '2026-08-17T12:00:00.000Z' }),
      meta({ id: 'vieux', updatedAt: '2026-08-16T12:00:00.000Z' }),
      meta({ id: 'recent', updatedAt: '2026-08-17T11:00:00.000Z' }),
    ];
    expect(sortSlots(items).map((m) => m.slot.id)).toEqual(['recent', 'vieux', 'auto']);
  });

  it('additionne la consommation', () => {
    const usage = usageOf([meta({ id: 'a' }, 10), meta({ id: 'b', autosave: true }, 32)]);
    expect(usage).toEqual({ bytes: 42, manuels: 1, automatiques: 1 });
  });

  it('masque les chaînes de connexion dans un message d’erreur', () => {
    const brut = 'connect ECONNREFUSED postgres://user:motdepasse@10.0.0.4:5432/forez';
    expect(scrubSecrets(brut)).not.toContain('motdepasse');
    expect(scrubSecrets(brut)).toContain('connexion masquée');
    expect(scrubSecrets('password: hunter2')).toContain('«masqué»');
  });
});

/* ── Contrat commun aux implémentations ─────────────────────────────────── */

const IDENTITE = 'a1b2c3d4e5f60718293a4b5c6d7e8f90';
const AUTRE = 'ffffffffffffffffffffffffffffffff';

function contratDeStockage(nom: string, fabrique: () => Promise<Storage>): void {
  describe(`contrat — ${nom}`, () => {
    let storage: Storage;

    beforeEach(async () => {
      storage = await fabrique();
      await storage.init();
    });

    afterEach(async () => {
      await storage.close();
    });

    it('rend une liste vide pour une identité inconnue', async () => {
      expect(await storage.listSaves(IDENTITE)).toEqual([]);
      expect(await storage.listMeta(IDENTITE)).toEqual([]);
      expect(await storage.getSave(IDENTITE, 'inconnue')).toBeNull();
      expect(await storage.getProfile(IDENTITE)).toBeNull();
    });

    it('écrit puis relit une sauvegarde à l’identique', async () => {
      const save = stored({ id: 'partie-1' }, 4242);
      await storage.putSave(IDENTITE, save);
      const relu = await storage.getSave(IDENTITE, 'partie-1');
      expect(relu).not.toBeNull();
      expect(relu?.slot).toEqual(save.slot);
      expect(relu?.state).toBe(save.state);
      expect(relu?.commands).toEqual(save.commands);
      expect(relu?.bytes).toBe(4242);
      expect(relu?.versions).toEqual(save.versions);
    });

    it('liste les descripteurs sans charger les états', async () => {
      await storage.putSave(IDENTITE, stored({ id: 'a' }, 100));
      await storage.putSave(IDENTITE, stored({ id: 'b', autosave: true }, 200));
      const metas = await storage.listMeta(IDENTITE);
      expect(metas.map((m) => m.slot.id)).toEqual(['a', 'b']);
      expect(usageOf(metas)).toEqual({ bytes: 300, manuels: 1, automatiques: 1 });
    });

    it('remplace une sauvegarde sans en créer une seconde', async () => {
      await storage.putSave(IDENTITE, stored({ id: 'a', name: 'Un' }));
      await storage.putSave(IDENTITE, stored({ id: 'a', name: 'Deux' }));
      const liste = await storage.listSaves(IDENTITE);
      expect(liste).toHaveLength(1);
      expect(liste[0].name).toBe('Deux');
    });

    it('supprime, puis signale l’absence', async () => {
      await storage.putSave(IDENTITE, stored({ id: 'a' }));
      expect(await storage.deleteSave(IDENTITE, 'a')).toBe(true);
      expect(await storage.deleteSave(IDENTITE, 'a')).toBe(false);
      expect(await storage.getSave(IDENTITE, 'a')).toBeNull();
    });

    it('renomme et met à jour l’horodatage', async () => {
      await storage.putSave(IDENTITE, stored({ id: 'a', name: 'Avant' }));
      const renomme = await storage.renameSave(IDENTITE, 'a', 'Après');
      expect(renomme?.name).toBe('Après');
      expect((await storage.getSave(IDENTITE, 'a'))?.slot.name).toBe('Après');
      expect(await storage.renameSave(IDENTITE, 'absent', 'X')).toBeNull();
    });

    it('isole strictement deux identités', async () => {
      await storage.putSave(IDENTITE, stored({ id: 'a' }));
      expect(await storage.listSaves(AUTRE)).toEqual([]);
      expect(await storage.getSave(AUTRE, 'a')).toBeNull();
      expect(await storage.deleteSave(AUTRE, 'a')).toBe(false);
      expect(await storage.getSave(IDENTITE, 'a')).not.toBeNull();
    });

    it('conserve un profil', async () => {
      const profil = defaultProfile(NOW);
      await storage.putProfile(IDENTITE, profil);
      expect(await storage.getProfile(IDENTITE)).toEqual(profil);
      expect(await storage.getProfile(AUTRE)).toBeNull();
    });

    it('conserve un replay', async () => {
      await storage.putReplay(IDENTITE, {
        id: 'replay-1',
        saveId: 'a',
        setup: testSetup(),
        commands: [{ type: 'EndTurn' }],
        finalHash: '5631d03501bfb659',
        createdAt: NOW,
      });
      const replays = await storage.listReplays(IDENTITE);
      expect(replays).toHaveLength(1);
      expect(replays[0].finalHash).toBe('5631d03501bfb659');
      expect(await storage.listReplays(AUTRE)).toEqual([]);
    });

    it('compte les identités et les sauvegardes', async () => {
      await storage.putSave(IDENTITE, stored({ id: 'a' }));
      await storage.putSave(AUTRE, stored({ id: 'b' }));
      const stats = await storage.stats();
      expect(stats.identites).toBeGreaterThanOrEqual(2);
      expect(stats.sauvegardes).toBe(2);
    });

    it('ne partage jamais de référence mutable avec l’appelant', async () => {
      const save = stored({ id: 'a', name: 'Original' });
      await storage.putSave(IDENTITE, save);
      save.slot.name = 'Modifié après coup';
      expect((await storage.getSave(IDENTITE, 'a'))?.slot.name).toBe('Original');
    });

    /* ── Parties en ligne ─────────────────────────────────────────────── */

    it('écrit puis relit une partie en ligne à l’identique', async () => {
      const partie = partieStockee();
      await storage.createParty(partie);

      const relue = await storage.getParty('FOREZ-7K2P');
      expect(relue).not.toBeNull();
      expect(relue?.hote).toBe(IDENTITE);
      expect(relue?.setup).toEqual(partie.setup);
      expect(relue?.joueurs).toHaveLength(2);
      // `etat` est du texte, pas du JSON réordonné : le hash doit rester
      // vérifiable octet pour octet.
      expect(relue?.etat).toBe(partie.etat);
      expect(relue?.hash).toBe(partie.hash);
      expect(relue?.instantanes[0]?.etat).toBe(partie.etat);
      expect(relue?.commandes[0]?.cleIdempotence).toBe('cle-de-jean-1');
      expect(await storage.getParty('FOREZ-0000')).toBeNull();
    });

    it('refuse deux parties sous le même code', async () => {
      await storage.createParty(partieStockee());
      await expect(storage.createParty(partieStockee())).rejects.toThrow();
    });

    it('remplace une partie existante et fait avancer le `seq`', async () => {
      const partie = partieStockee();
      await storage.createParty(partie);

      partie.seq = 4;
      partie.statut = 'en_cours';
      partie.activePlayer = 'P2';
      partie.commandes.push({
        seq: 4,
        joueur: 'P1',
        commande: { type: 'EndTurn' },
        cleIdempotence: 'cle-de-thibaut-2',
        appliqueLe: NOW,
        ok: true,
        erreur: null,
        journal: ['Thibaut passe la main.'],
        toursIa: [],
      });
      await storage.putParty(partie);

      const relue = await storage.getParty('FOREZ-7K2P');
      expect(relue?.seq).toBe(4);
      expect(relue?.statut).toBe('en_cours');
      expect(relue?.activePlayer).toBe('P2');
      expect(relue?.commandes).toHaveLength(2);
      expect(await storage.countParties()).toBe(1);
    });

    it('retrouve les parties d’une identité, par bannière ou par hôte', async () => {
      await storage.createParty(partieStockee());

      // L'hôte n'a pas pris de bannière ; l'autre cousin tient la sienne.
      expect((await storage.listPartiesOf(IDENTITE)).map((p) => p.code)).toEqual(['FOREZ-7K2P']);
      expect((await storage.listPartiesOf(AUTRE)).map((p) => p.code)).toEqual(['FOREZ-7K2P']);
      expect(await storage.listPartiesOf('f0f0f0f0f0f0f0f0f0f0f0f0f0f0f0f0')).toEqual([]);
    });
  });
}

contratDeStockage('mémoire', async () => new MemoryStorage());

let dossier = '';
contratDeStockage('fichier', async () => {
  dossier = await mkdtemp(join(tmpdir(), 'forez-stockage-'));
  return new FileStorage(dossier);
});

afterEach(async () => {
  if (dossier.length > 0) {
    await rm(dossier, { recursive: true, force: true });
    dossier = '';
  }
});

/* ── Spécificités du stockage fichier ───────────────────────────────────── */

describe('stockage fichier', () => {
  let racine = '';

  beforeEach(async () => {
    racine = await mkdtemp(join(tmpdir(), 'forez-fichier-'));
  });

  afterEach(async () => {
    await rm(racine, { recursive: true, force: true });
  });

  it('sépare le descripteur de la charge utile', async () => {
    const storage = new FileStorage(racine);
    await storage.init();
    await storage.putSave(IDENTITE, stored({ id: 'partie-1' }));

    const dir = join(racine, 'identites', IDENTITE, 'emplacements');
    const fichiers = (await readdir(dir)).sort();
    expect(fichiers).toEqual(['partie-1.meta.json', 'partie-1.save.json']);

    const metaBrut = JSON.parse(await readFile(join(dir, 'partie-1.meta.json'), 'utf8')) as {
      slot: SaveSlot;
      bytes: number;
    };
    expect(metaBrut.slot.id).toBe('partie-1');
    // Le descripteur ne contient pas l'état : la liste reste légère.
    expect(JSON.stringify(metaBrut)).not.toContain('engineVersion');
  });

  it('ne laisse aucun fichier temporaire derrière lui', async () => {
    const storage = new FileStorage(racine);
    await storage.init();
    for (let i = 0; i < 5; i++) await storage.putSave(IDENTITE, stored({ id: `p${i}` }));
    const dir = join(racine, 'identites', IDENTITE, 'emplacements');
    const fichiers = await readdir(dir);
    expect(fichiers.filter((f) => f.includes('.tmp-'))).toHaveLength(0);
  });

  it('refuse un identifiant hostile avant d’atteindre le disque', async () => {
    const storage = new FileStorage(racine);
    await storage.init();
    await expect(storage.getSave('../../etc', 'passwd')).rejects.toThrow(/invalide/);
    await expect(
      storage.putSave(IDENTITE, stored({ id: '../evasion' as unknown as string })),
    ).rejects.toThrow(/invalide/);
  });

  it('ignore un descripteur illisible plutôt que de faire échouer la liste', async () => {
    const storage = new FileStorage(racine);
    await storage.init();
    await storage.putSave(IDENTITE, stored({ id: 'bon' }));
    const { writeFile } = await import('node:fs/promises');
    await writeFile(
      join(racine, 'identites', IDENTITE, 'emplacements', 'casse.meta.json'),
      '{ ceci nest pas du json',
      'utf8',
    );
    const liste = await storage.listSaves(IDENTITE);
    expect(liste.map((s) => s.id)).toEqual(['bon']);
  });

  it('échoue à l’initialisation quand la racine n’est pas inscriptible', async () => {
    // Un fichier ordinaire en guise de dossier parent : `mkdir` refuse
    // immédiatement (ENOTDIR), comme le ferait un volume en lecture seule.
    const { writeFile } = await import('node:fs/promises');
    const barrage = join(racine, 'ceci-est-un-fichier');
    await writeFile(barrage, 'x', 'utf8');
    const storage = new FileStorage(join(barrage, 'forez'));
    await expect(storage.init()).rejects.toThrow();
  });
});

/* ── Sélection automatique ──────────────────────────────────────────────── */

describe('createStorage', () => {
  it('choisit le fichier sans base de données', async () => {
    const racine = await mkdtemp(join(tmpdir(), 'forez-selection-'));
    try {
      const { storage, notes } = await createStorage({ databaseUrl: null, dataDir: racine });
      expect(storage.kind).toBe('fichier');
      expect(notes.join(' ')).toContain('Aucune base de données');
      await storage.close();
    } finally {
      await rm(racine, { recursive: true, force: true });
    }
  });

  it('retombe sur la mémoire quand le disque est inutilisable', async () => {
    const racine = await mkdtemp(join(tmpdir(), 'forez-disque-'));
    try {
      const { writeFile } = await import('node:fs/promises');
      const barrage = join(racine, 'fichier-barrage');
      await writeFile(barrage, 'x', 'utf8');
      const { storage, notes } = await createStorage({
        databaseUrl: null,
        dataDir: join(barrage, 'forez'),
      });
      expect(storage.kind).toBe('memoire');
      expect(notes.join(' ')).toContain('Repli sur la mémoire');
      await storage.close();
    } finally {
      await rm(racine, { recursive: true, force: true });
    }
  });

  it('retombe sur le fichier quand PostgreSQL est injoignable, sans divulguer l’URL', async () => {
    const racine = await mkdtemp(join(tmpdir(), 'forez-pg-'));
    try {
      const { storage, notes } = await createStorage({
        databaseUrl: 'postgresql://forez:motdepasse@127.0.0.1:1/forez',
        dataDir: racine,
      });
      expect(storage.kind).toBe('fichier');
      const texte = notes.join(' ');
      expect(texte).toContain('PostgreSQL indisponible');
      expect(texte).not.toContain('motdepasse');
      await storage.close();
    } finally {
      await rm(racine, { recursive: true, force: true });
    }
  }, 30_000);

  it('respecte le stockage mémoire imposé', async () => {
    const { storage, notes } = await createStorage({
      databaseUrl: null,
      dataDir: '/inutilise',
      forceMemory: true,
    });
    expect(storage.kind).toBe('memoire');
    expect(notes.join(' ')).toContain('imposé');
    await storage.close();
  });
});
