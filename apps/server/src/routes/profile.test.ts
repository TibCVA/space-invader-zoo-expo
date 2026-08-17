/**
 * Options du joueur : valeurs par défaut, fusion partielle, refus stricts,
 * et absence totale de donnée personnelle.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { API, ProfileSchema, type Profile } from '@auvergne/protocol';
import { startTestServer, type TestServer } from '../testkit.js';

let srv: TestServer;

beforeAll(async () => {
  srv = await startTestServer();
});

afterAll(async () => {
  await srv.stop();
});

interface Reponse {
  profil: Profile;
  pardefaut: boolean;
}

describe('GET /api/profil', () => {
  it('rend un profil par défaut valide pour un nouveau joueur', async () => {
    const server = await startTestServer();
    try {
      const res = await server.call({ method: 'GET', url: API.profile });
      expect(res.statusCode).toBe(200);
      const corps = res.json<Reponse>();
      expect(corps.pardefaut).toBe(true);
      expect(ProfileSchema.safeParse(corps.profil).success).toBe(true);
      expect(corps.profil.volumes.musique).toBe(70);
      expect(corps.profil.accessibilite.motifsBannieres).toBe(true);
      expect(corps.profil.dernierePartie).toBeNull();
    } finally {
      await server.stop();
    }
  });

  it("ne contient aucune donnée personnelle", async () => {
    const res = await srv.call({ method: 'GET', url: API.profile });
    const texte = JSON.stringify(res.json());
    for (const interdit of ['email', 'mail', 'password', 'motdepasse', 'ip', 'token']) {
      expect(texte.toLowerCase()).not.toContain(interdit);
    }
  });
});

describe('PUT /api/profil', () => {
  it('fusionne une mise à jour partielle sans écraser le reste', async () => {
    const server = await startTestServer();
    try {
      const res = await server.call({
        method: 'PUT',
        url: API.profile,
        payload: { volumes: { musique: 0 }, accessibilite: { contrasteEleve: true } },
      });
      expect(res.statusCode).toBe(200);
      const profil = res.json<Reponse>().profil;
      expect(profil.volumes.musique).toBe(0);
      expect(profil.volumes.effets).toBe(85);
      expect(profil.accessibilite.contrasteEleve).toBe(true);
      expect(profil.accessibilite.daltonisme).toBe('aucun');

      const relu = await server.call({ method: 'GET', url: API.profile });
      expect(relu.json<Reponse>().pardefaut).toBe(false);
      expect(relu.json<Reponse>().profil.volumes.musique).toBe(0);
    } finally {
      await server.stop();
    }
  });

  it('enregistre la dernière partie ouverte puis la remet à zéro', async () => {
    const server = await startTestServer();
    try {
      const pose = await server.call({
        method: 'PUT',
        url: API.profile,
        payload: {
          dernierePartie: { saveId: 'partie-1', at: '2026-08-17T09:00:00.000Z', turn: 14 },
        },
      });
      expect(pose.json<Reponse>().profil.dernierePartie?.saveId).toBe('partie-1');

      const efface = await server.call({
        method: 'PUT',
        url: API.profile,
        payload: { dernierePartie: null },
      });
      expect(efface.json<Reponse>().profil.dernierePartie).toBeNull();
    } finally {
      await server.stop();
    }
  });

  it('refuse un volume hors bornes, en français', async () => {
    const res = await srv.call({
      method: 'PUT',
      url: API.profile,
      payload: { volumes: { musique: 400 } },
    });
    expect(res.statusCode).toBe(400);
    const corps = res.json<{ erreur: string; code: string }>();
    expect(corps.code).toBe('requete_invalide');
    expect(corps.erreur).toContain('Volume maximal');
  });

  it('refuse une clef inconnue', async () => {
    const res = await srv.call({
      method: 'PUT',
      url: API.profile,
      payload: { tricherie: true },
    });
    expect(res.statusCode).toBe(400);
  });

  it('refuse un mode daltonisme inventé', async () => {
    const res = await srv.call({
      method: 'PUT',
      url: API.profile,
      payload: { accessibilite: { daltonisme: 'arc-en-ciel' } },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json<{ erreur: string }>().erreur).toContain('daltonisme');
  });
});

describe('DELETE /api/profil', () => {
  it('revient aux réglages d’origine', async () => {
    const server = await startTestServer();
    try {
      await server.call({
        method: 'PUT',
        url: API.profile,
        payload: { volumes: { effets: 3 } },
      });
      const res = await server.call({ method: 'DELETE', url: API.profile });
      expect(res.statusCode).toBe(200);
      expect(res.json<Reponse>().profil.volumes.effets).toBe(85);
    } finally {
      await server.stop();
    }
  });
});

describe('isolation', () => {
  it('deux identités ont des profils distincts', async () => {
    const server = await startTestServer();
    try {
      await server.call({
        method: 'PUT',
        url: API.profile,
        payload: { volumes: { musique: 11 } },
      });
      server.forgetIdentity();
      const autre = await server.call({ method: 'GET', url: API.profile });
      expect(autre.json<Reponse>().pardefaut).toBe(true);
      expect(autre.json<Reponse>().profil.volumes.musique).toBe(70);
    } finally {
      await server.stop();
    }
  });
});
