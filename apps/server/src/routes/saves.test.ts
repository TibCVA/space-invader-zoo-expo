/**
 * Emplacements de sauvegarde : aller-retour complet, politique
 * d'emplacements, quotas, intégrité, isolation entre identités.
 *
 * Toutes les sauvegardes manipulées ici sont de **vraies** parties issues de
 * `createGame`, sur la carte réelle du Forez : le contrôle de hash a donc un
 * sens, et une régression du moteur de sérialisation ferait tomber ces tests.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  API,
  AUTOSAVE_SLOTS,
  MANUAL_SLOTS,
  type IntegrityReport,
  type SaveSlot,
} from '@auvergne/protocol';
import { deserializeState, serializeState, stateHash } from '@auvergne/protocol';
import { ENGINE_VERSION } from '@auvergne/engine';
import {
  TEST_THUMBNAIL,
  startTestServer,
  testGame,
  testUpload,
  type TestServer,
} from '../testkit.js';

let srv: TestServer;

beforeAll(async () => {
  srv = await startTestServer();
}, 60_000);

afterAll(async () => {
  await srv.stop();
});

interface ErreurCorps {
  erreur: string;
  code: string;
}

async function put(
  server: TestServer,
  id: string,
  payload: unknown,
): Promise<ReturnType<TestServer['call']> extends Promise<infer R> ? R : never> {
  return server.call({ method: 'PUT', url: API.save(id), payload: payload as object });
}

describe('aller-retour complet', () => {
  it('enregistre puis recharge une partie, hash intact', async () => {
    const server = await startTestServer();
    try {
      const etat = testGame(3);
      const upload = testUpload({ id: 'partie-1', name: 'Col des Sagnes', state: etat });

      const depot = await put(server, 'partie-1', upload);
      expect(depot.statusCode).toBe(201);
      const depose = depot.json<{ slot: SaveSlot; integrite: IntegrityReport }>();
      expect(depose.slot.hash).toBe(etat.hash);
      expect(depose.slot.turn).toBe(etat.turn);
      expect(depose.integrite.ok).toBe(true);

      const lecture = await server.call({ method: 'GET', url: API.save('partie-1') });
      expect(lecture.statusCode).toBe(200);
      const corps = lecture.json<{
        slot: SaveSlot;
        state: string;
        commands: unknown[];
        integrite: IntegrityReport;
      }>();
      expect(corps.slot.name).toBe('Col des Sagnes');
      expect(corps.integrite.ok).toBe(true);
      expect(corps.integrite.hashObtenu).toBe(etat.hash);

      const relu = deserializeState(corps.state);
      expect(stateHash(relu)).toBe(etat.hash);
      expect(relu.turn).toBe(etat.turn);
      expect(relu.players.P1.fog).toBeInstanceOf(Uint8Array);
      expect(relu.players.P1.fog).toEqual(etat.players.P1.fog);
    } finally {
      await server.stop();
    }
  }, 60_000);

  it('remplace un emplacement existant sans créer de doublon', async () => {
    const server = await startTestServer();
    try {
      const avance = testGame(5);
      expect(avance.turn).toBeGreaterThan(1);

      await put(server, 'partie-1', testUpload({ id: 'partie-1', turns: 0 }));
      const deux = await put(
        server,
        'partie-1',
        testUpload({ id: 'partie-1', name: 'Reprise', state: avance }),
      );
      expect(deux.statusCode).toBe(200);
      expect(deux.json<{ remplace: boolean }>().remplace).toBe(true);

      const liste = await server.call({ method: 'GET', url: API.saves });
      const emplacements = liste.json<{ emplacements: SaveSlot[] }>().emplacements;
      expect(emplacements).toHaveLength(1);
      expect(emplacements[0].name).toBe('Reprise');
      expect(emplacements[0].turn).toBe(avance.turn);
    } finally {
      await server.stop();
    }
  }, 60_000);

  it("conserve la date de création à travers les réécritures", async () => {
    const server = await startTestServer();
    try {
      const un = await put(server, 'partie-1', testUpload({ id: 'partie-1' }));
      const creation = un.json<{ slot: SaveSlot }>().slot.createdAt;
      await new Promise((r) => setTimeout(r, 5));
      const deux = await put(server, 'partie-1', testUpload({ id: 'partie-1', turns: 1 }));
      const slot = deux.json<{ slot: SaveSlot }>().slot;
      expect(slot.createdAt).toBe(creation);
      expect(slot.updatedAt >= creation).toBe(true);
    } finally {
      await server.stop();
    }
  }, 60_000);

  it('accepte une vignette en data-url et la restitue', async () => {
    const server = await startTestServer();
    try {
      await put(
        server,
        'avec-vignette',
        testUpload({ id: 'avec-vignette', thumbnail: TEST_THUMBNAIL }),
      );
      const liste = await server.call({ method: 'GET', url: API.saves });
      expect(liste.json<{ emplacements: SaveSlot[] }>().emplacements[0].thumbnail).toBe(
        TEST_THUMBNAIL,
      );
    } finally {
      await server.stop();
    }
  }, 60_000);
});

describe('le serveur ne croit pas le client', () => {
  it("refuse une empreinte qui ne correspond pas à l'état", async () => {
    const upload = testUpload({ id: 'menteur' });
    upload.slot.hash = '0123456789abcdef';
    const res = await put(srv, 'menteur', upload);
    expect(res.statusCode).toBe(409);
    const corps = res.json<ErreurCorps>();
    expect(corps.code).toBe('sauvegarde_corrompue');
    expect(corps.erreur).toMatch(/empreinte annoncée/);
  }, 60_000);

  it("refuse un état modifié après coup", async () => {
    const etat = testGame(1);
    const brut = JSON.parse(serializeState(etat)) as Record<string, unknown>;
    (brut.players as Record<string, { resources: Record<string, number> }>).P1.resources.ecus =
      999_999;
    const upload = testUpload({ id: 'triche', state: etat });
    upload.state = JSON.stringify(brut);

    const res = await put(srv, 'triche', upload);
    expect(res.statusCode).toBe(409);
    expect(res.json<ErreurCorps>().erreur).toMatch(/empreinte incohérente/);
  }, 60_000);

  it("recalcule le jour, la semaine et les bannières à partir de l'état", async () => {
    const server = await startTestServer();
    try {
      // Assez de fins de tour pour franchir la première semaine.
      const etat = testGame(16);
      expect(etat.turn).toBeGreaterThan(7);

      const upload = testUpload({ id: 'faux-resume', state: etat });
      upload.slot.turn = 1;
      upload.slot.week = 1;
      upload.slot.players = [{ name: 'Usurpateur', faction: 'granit', color: '#000000' }];

      const res = await put(server, 'faux-resume', upload);
      expect(res.statusCode).toBe(201);
      const slot = res.json<{ slot: SaveSlot }>().slot;
      expect(slot.turn).toBe(etat.turn);
      expect(slot.week).toBe(Math.floor((etat.turn - 1) / 7) + 1);
      expect(slot.week).toBeGreaterThan(1);
      expect(slot.players).toHaveLength(2);
      expect(slot.players.map((p) => p.name)).toContain('Châtellenie de Granit');
    } finally {
      await server.stop();
    }
  }, 60_000);

  it("refuse un identifiant d'adresse différent de celui du descripteur", async () => {
    const res = await put(srv, 'adresse-a', testUpload({ id: 'descripteur-b' }));
    expect(res.statusCode).toBe(400);
    expect(res.json<ErreurCorps>().erreur).toMatch(/ne correspond pas/);
  }, 60_000);

  it('refuse un identifiant tentant une traversée de répertoire', async () => {
    const res = await srv.call({ method: 'GET', url: '/api/saves/..%2F..%2Fetc%2Fpasswd' });
    expect(res.statusCode).toBe(400);
    expect(res.json<ErreurCorps>().code).toBe('identifiant_invalide');
  });

  it('refuse une vignette pointant vers une ressource distante', async () => {
    const upload = testUpload({ id: 'vignette-distante' });
    (upload.slot as { thumbnail?: string }).thumbnail = 'https://exemple.test/x.png';
    const res = await put(srv, 'vignette-distante', upload);
    expect(res.statusCode).toBe(400);
    expect(res.json<ErreurCorps>().erreur).toMatch(/data-url|vignette/i);
  }, 60_000);

  it('refuse une commande inventée dans le journal', async () => {
    const upload = testUpload({ id: 'journal-truque' });
    (upload.commands as unknown[]).push({ type: 'DonneMoiTout' });
    const res = await put(srv, 'journal-truque', upload);
    expect(res.statusCode).toBe(400);
    expect(res.json<ErreurCorps>().code).toBe('requete_invalide');
  }, 60_000);

  it("refuse un état qui n'est pas un état de partie", async () => {
    const upload = testUpload({ id: 'pas-un-etat' });
    upload.state = '{"bonjour":true}';
    const res = await put(srv, 'pas-un-etat', upload);
    expect(res.statusCode).toBe(400);
    expect(res.json<ErreurCorps>().erreur).toMatch(/champs manquants/);
  }, 60_000);
});

describe('politique des emplacements', () => {
  it('accepte douze emplacements manuels et refuse le treizième', async () => {
    const server = await startTestServer();
    try {
      const base = testUpload({ id: 'manuel-1' });
      for (let i = 1; i <= MANUAL_SLOTS; i++) {
        const upload = { ...base, slot: { ...base.slot, id: `manuel-${i}`, name: `Partie ${i}` } };
        const res = await put(server, `manuel-${i}`, upload);
        expect(res.statusCode, `emplacement ${i}`).toBe(201);
      }

      const trop = { ...base, slot: { ...base.slot, id: 'manuel-13', name: 'De trop' } };
      const refus = await put(server, 'manuel-13', trop);
      expect(refus.statusCode).toBe(409);
      const corps = refus.json<ErreurCorps>();
      expect(corps.code).toBe('emplacements_pleins');
      expect(corps.erreur).toContain('12 emplacements manuels sont occupés');

      // Écraser un emplacement existant reste possible.
      const ecrase = { ...base, slot: { ...base.slot, id: 'manuel-4', name: 'Écrasée' } };
      expect((await put(server, 'manuel-4', ecrase)).statusCode).toBe(200);
    } finally {
      await server.stop();
    }
  }, 120_000);

  it('fait tourner les trois emplacements automatiques', async () => {
    const server = await startTestServer();
    try {
      const base = testUpload({ id: 'auto-1', autosave: true });
      for (let i = 1; i <= AUTOSAVE_SLOTS; i++) {
        const upload = {
          ...base,
          slot: {
            ...base.slot,
            id: `auto-${i}`,
            name: `Automatique ${i}`,
            updatedAt: new Date(Date.now() + i * 1000).toISOString(),
          },
        };
        expect((await put(server, `auto-${i}`, upload)).statusCode).toBe(201);
        await new Promise((r) => setTimeout(r, 3));
      }

      const quatrieme = {
        ...base,
        slot: { ...base.slot, id: 'auto-4', name: 'Automatique 4' },
      };
      const res = await put(server, 'auto-4', quatrieme);
      expect(res.statusCode).toBe(201);
      expect(res.json<{ evince: string | null }>().evince).toBe('auto-1');

      const liste = await server.call({ method: 'GET', url: API.saves });
      const ids = liste.json<{ emplacements: SaveSlot[] }>().emplacements.map((s) => s.id);
      expect(ids).toHaveLength(AUTOSAVE_SLOTS);
      expect(ids).not.toContain('auto-1');
      expect(ids).toContain('auto-4');
    } finally {
      await server.stop();
    }
  }, 120_000);

  it('les emplacements automatiques ne consomment pas les manuels', async () => {
    const server = await startTestServer();
    try {
      await put(server, 'auto-1', testUpload({ id: 'auto-1', autosave: true }));
      await put(server, 'manuel-1', testUpload({ id: 'manuel-1', autosave: false }));
      const liste = await server.call({ method: 'GET', url: API.saves });
      const quota = liste.json<{
        quota: { manuels: { utilises: number }; automatiques: { utilises: number } };
      }>().quota;
      expect(quota.manuels.utilises).toBe(1);
      expect(quota.automatiques.utilises).toBe(1);
    } finally {
      await server.stop();
    }
  }, 60_000);

  it('filtre la liste sur le drapeau automatique', async () => {
    const server = await startTestServer();
    try {
      await put(server, 'auto-1', testUpload({ id: 'auto-1', autosave: true }));
      await put(server, 'manuel-1', testUpload({ id: 'manuel-1', autosave: false }));
      const auto = await server.call({ method: 'GET', url: `${API.saves}?autosave=1` });
      expect(auto.json<{ emplacements: SaveSlot[] }>().emplacements.map((s) => s.id)).toEqual([
        'auto-1',
      ]);
      const manuel = await server.call({ method: 'GET', url: `${API.saves}?autosave=0` });
      expect(manuel.json<{ emplacements: SaveSlot[] }>().emplacements.map((s) => s.id)).toEqual([
        'manuel-1',
      ]);
    } finally {
      await server.stop();
    }
  }, 60_000);
});

describe('quotas', () => {
  it('annonce la consommation en français', async () => {
    const server = await startTestServer();
    try {
      await put(server, 'partie-1', testUpload({ id: 'partie-1' }));
      const liste = await server.call({ method: 'GET', url: API.saves });
      const quota = liste.json<{ quota: { resume: string; octetsUtilises: number } }>().quota;
      expect(quota.octetsUtilises).toBeGreaterThan(0);
      expect(quota.resume).toContain('emplacement');
      expect(quota.resume).toContain('sur 12');
      expect(quota.resume).toMatch(/Mo|Ko|octets/);
    } finally {
      await server.stop();
    }
  }, 60_000);

  it('refuse un corps au-delà de 24 Mo', async () => {
    const upload = testUpload({ id: 'trop-lourd' });
    // On dépasse volontairement la limite de corps de la route.
    const bourrage = 'x'.repeat(25 * 1024 * 1024);
    const res = await srv.call({
      method: 'PUT',
      url: API.save('trop-lourd'),
      headers: { 'content-type': 'application/json' },
      payload: JSON.stringify({ ...upload, bourrage }),
    });
    expect(res.statusCode).toBe(413);
    expect(res.json<ErreurCorps>().code).toBe('charge_trop_lourde');
    expect(res.json<ErreurCorps>().erreur).toContain('24 Mo');
  }, 120_000);
});

describe('intégrité au chargement', () => {
  it('refuse une sauvegarde altérée dans le stockage', async () => {
    const server = await startTestServer();
    try {
      await put(server, 'alterable', testUpload({ id: 'alterable' }));
      // On abîme l'état directement dans le stockage, comme le ferait une
      // corruption disque ou une manipulation manuelle du fichier.
      const identity = (
        await server.call({ method: 'GET', url: API.identity })
      ).json<{ identite: string }>().identite;
      const save = await server.ctx.storage.getSave(identity, 'alterable');
      expect(save).not.toBeNull();
      if (save === null) return;
      const brut = JSON.parse(save.state) as Record<string, unknown>;
      brut.turn = (brut.turn as number) + 40;
      await server.ctx.storage.putSave(identity, { ...save, state: JSON.stringify(brut) });

      const res = await server.call({ method: 'GET', url: API.save('alterable') });
      expect(res.statusCode).toBe(409);
      const corps = res.json<ErreurCorps>();
      expect(corps.code).toBe('sauvegarde_corrompue');
      expect(corps.erreur).toMatch(/altéré/);
    } finally {
      await server.stop();
    }
  }, 60_000);

  it('refuse une version de moteur incompatible, puis cède devant force=1', async () => {
    const server = await startTestServer();
    try {
      await put(server, 'ancienne', testUpload({ id: 'ancienne' }));
      const identity = (
        await server.call({ method: 'GET', url: API.identity })
      ).json<{ identite: string }>().identite;
      const save = await server.ctx.storage.getSave(identity, 'ancienne');
      if (save === null) throw new Error('sauvegarde absente');
      await server.ctx.storage.putSave(identity, {
        ...save,
        versions: { ...save.versions, moteur: '9.0.0-ancien' },
      });

      const refus = await server.call({ method: 'GET', url: API.save('ancienne') });
      expect(refus.statusCode).toBe(409);
      const corps = refus.json<ErreurCorps>();
      expect(corps.code).toBe('versions_incompatibles');
      expect(corps.erreur).toContain('9.0.0-ancien');
      expect(corps.erreur).toContain(ENGINE_VERSION);

      const force = await server.call({ method: 'GET', url: `${API.save('ancienne')}?force=1` });
      expect(force.statusCode).toBe(200);
      const rapport = force.json<{ integrite: IntegrityReport }>().integrite;
      expect(rapport.ok).toBe(false);
      expect(rapport.versions.moteur.compatible).toBe(false);
      expect(rapport.avertissements.length).toBeGreaterThan(0);
    } finally {
      await server.stop();
    }
  }, 60_000);

  it('accepte une différence de version mineure', async () => {
    const server = await startTestServer();
    try {
      await put(server, 'mineure', testUpload({ id: 'mineure' }));
      const identity = (
        await server.call({ method: 'GET', url: API.identity })
      ).json<{ identite: string }>().identite;
      const save = await server.ctx.storage.getSave(identity, 'mineure');
      if (save === null) throw new Error('sauvegarde absente');
      await server.ctx.storage.putSave(identity, {
        ...save,
        versions: { ...save.versions, contenu: '1.9.9-forez' },
      });
      const res = await server.call({ method: 'GET', url: API.save('mineure') });
      expect(res.statusCode).toBe(200);
      expect(res.json<{ integrite: IntegrityReport }>().integrite.ok).toBe(true);
    } finally {
      await server.stop();
    }
  }, 60_000);
});

describe('suppression et renommage', () => {
  it('supprime un emplacement puis le déclare introuvable', async () => {
    const server = await startTestServer();
    try {
      await put(server, 'a-jeter', testUpload({ id: 'a-jeter' }));
      const suppression = await server.call({ method: 'DELETE', url: API.save('a-jeter') });
      expect(suppression.statusCode).toBe(200);
      expect(suppression.json<{ supprime: boolean }>().supprime).toBe(true);

      const encore = await server.call({ method: 'DELETE', url: API.save('a-jeter') });
      expect(encore.statusCode).toBe(404);
      expect(encore.json<ErreurCorps>().erreur).toMatch(/n'existe pas/);
    } finally {
      await server.stop();
    }
  }, 60_000);

  it('renomme un emplacement', async () => {
    const server = await startTestServer();
    try {
      await put(server, 'a-renommer', testUpload({ id: 'a-renommer' }));
      const res = await server.call({
        method: 'POST',
        url: API.renameSave('a-renommer'),
        payload: { name: '  Veille de Cervières  ' },
      });
      expect(res.statusCode).toBe(200);
      expect(res.json<{ slot: SaveSlot }>().slot.name).toBe('Veille de Cervières');
    } finally {
      await server.stop();
    }
  }, 60_000);

  it('refuse un nom vide et un emplacement inconnu', async () => {
    const vide = await srv.call({
      method: 'POST',
      url: API.renameSave('inexistant'),
      payload: { name: '   ' },
    });
    expect(vide.statusCode).toBe(400);
    expect(vide.json<ErreurCorps>().code).toBe('nom_invalide');

    const absent = await srv.call({
      method: 'POST',
      url: API.renameSave('inexistant'),
      payload: { name: 'Peu importe' },
    });
    expect(absent.statusCode).toBe(404);
  });

  it('déclare introuvable une sauvegarde jamais écrite', async () => {
    const res = await srv.call({ method: 'GET', url: API.save('jamais-vue') });
    expect(res.statusCode).toBe(404);
    expect(res.json<ErreurCorps>().code).toBe('sauvegarde_introuvable');
  });
});

describe('isolation entre identités', () => {
  it('une identité ne voit jamais les sauvegardes d’une autre', async () => {
    const server = await startTestServer();
    try {
      await put(server, 'privee', testUpload({ id: 'privee', name: 'Ma partie' }));
      const premiere = await server.call({ method: 'GET', url: API.saves });
      expect(premiere.json<{ emplacements: SaveSlot[] }>().emplacements).toHaveLength(1);

      server.forgetIdentity();
      const seconde = await server.call({ method: 'GET', url: API.saves });
      expect(seconde.json<{ emplacements: SaveSlot[] }>().emplacements).toHaveLength(0);

      const vol = await server.call({ method: 'GET', url: API.save('privee') });
      expect(vol.statusCode).toBe(404);
    } finally {
      await server.stop();
    }
  }, 60_000);
});
