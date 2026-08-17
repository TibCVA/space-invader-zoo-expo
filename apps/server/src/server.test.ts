/**
 * Tests du socle : santé, diagnostic, versions, identité, en-têtes, repli SPA.
 *
 * L'exigence la plus dure du cahier des charges est vérifiée en premier : le
 * serveur doit répondre 200 sur `/health` **sans aucune base de données**.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { API, PROTOCOL_VERSION, type HealthPayload } from '@auvergne/protocol';
import { ENGINE_VERSION } from '@auvergne/engine';
import { CONTENT_VERSION } from '@auvergne/content';
import { MAP_VERSION } from '@auvergne/map';
import { startTestServer, setCookies, type TestServer } from './testkit.js';
import { sanitizeUrl } from './server.js';
import { escapeHtml } from './health.js';
import { isFingerprinted } from './static.js';
import { identityTag, isIdentity, newIdentity } from './identity.js';

let srv: TestServer;

beforeAll(async () => {
  srv = await startTestServer();
});

afterAll(async () => {
  await srv.stop();
});

describe('GET /health', () => {
  it('répond 200 sans base de données', async () => {
    const res = await srv.call({ method: 'GET', url: API.health });
    expect(res.statusCode).toBe(200);
    const body = res.json<HealthPayload>();
    expect(body.ok).toBe(true);
    expect(body.version).toBe('1.0.0');
    expect(body.base).toBe('memoire');
    expect(body.commit).toBe('essai0000');
    expect(Number.isInteger(body.uptime)).toBe(true);
    expect(body.uptime).toBeGreaterThanOrEqual(0);
  });

  it("n'est pas mis en cache et ne pose pas de cookie", async () => {
    const res = await srv.call({ method: 'GET', url: API.health });
    expect(res.headers['cache-control']).toBe('no-store');
    expect(setCookies(res)).toHaveLength(0);
  });

  it('ne divulgue aucun secret', async () => {
    const res = await srv.call({ method: 'GET', url: API.health });
    const texte = res.body;
    expect(texte).not.toMatch(/postgres:\/\//);
    expect(texte).not.toMatch(/SESSION_SECRET/);
    expect(Object.keys(res.json<Record<string, unknown>>()).sort()).toEqual([
      'base',
      'commit',
      'ok',
      'uptime',
      'version',
    ]);
  });
});

describe('GET /api/diagnostic', () => {
  it('rend une page française et autonome', async () => {
    const res = await srv.call({
      method: 'GET',
      url: API.diagnostic,
      headers: { accept: 'text/html' },
    });
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toContain('text/html');
    expect(res.body).toContain('<html lang="fr">');
    expect(res.body).toContain('Diagnostic du service');
    // Aucun asset externe : ni CDN, ni police distante.
    expect(res.body).not.toMatch(/https?:\/\//);
    expect(res.body).not.toContain('<script');
  });

  it("n'affiche que la présence des variables, jamais leur valeur", async () => {
    const res = await srv.call({
      method: 'GET',
      url: API.diagnostic,
      headers: { accept: 'text/html' },
    });
    expect(res.body).toContain('SESSION_SECRET');
    expect(res.body).toContain('non définie');
    expect(res.body).not.toMatch(/postgres:\/\//);
    expect(res.body).not.toMatch(/password/i);
  });

  it('sert du JSON si le client le demande', async () => {
    const res = await srv.call({
      method: 'GET',
      url: API.diagnostic,
      headers: { accept: 'application/json' },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json<{ base: string; versions: { moteur: string } }>();
    expect(body.base).toBe('memoire');
    expect(body.versions.moteur).toBe(ENGINE_VERSION);
  });
});

describe('GET /api/contenu/version', () => {
  it('publie les trois versions et celle du protocole', async () => {
    const res = await srv.call({ method: 'GET', url: API.contentVersion });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({
      moteur: ENGINE_VERSION,
      contenu: CONTENT_VERSION,
      carte: MAP_VERSION,
      protocole: PROTOCOL_VERSION,
      compatible: true,
    });
  });
});

describe('identité anonyme', () => {
  it('pose un cookie signé, httpOnly, sur la première requête API', async () => {
    const frais = await startTestServer();
    try {
      const res = await frais.call({ method: 'GET', url: API.identity });
      expect(res.statusCode).toBe(200);
      const cookies = setCookies(res);
      expect(cookies).toHaveLength(1);
      expect(cookies[0]).toContain('forez_identite=');
      expect(cookies[0]).toContain('HttpOnly');
      expect(cookies[0]).toContain('SameSite=Lax');
      expect(cookies[0]).toContain('Path=/');
      // La valeur est signée : elle ne peut pas être l'identité brute.
      const body = res.json<{ identite: string; nouvelle: boolean }>();
      expect(isIdentity(body.identite)).toBe(true);
      expect(body.nouvelle).toBe(true);
      expect(cookies[0]).not.toBe(`forez_identite=${body.identite}`);
      expect(cookies[0]).toContain('.');
    } finally {
      await frais.stop();
    }
  });

  it('conserve la même identité entre deux requêtes', async () => {
    const frais = await startTestServer();
    try {
      const un = await frais.call({ method: 'GET', url: API.identity });
      const deux = await frais.call({ method: 'GET', url: API.identity });
      expect(deux.json<{ identite: string }>().identite).toBe(
        un.json<{ identite: string }>().identite,
      );
      expect(deux.json<{ nouvelle: boolean }>().nouvelle).toBe(false);
    } finally {
      await frais.stop();
    }
  });

  it('refuse un cookie fabriqué à la main', async () => {
    const usurpe = newIdentity();
    const res = await srv.app.inject({
      method: 'GET',
      url: API.identity,
      headers: { cookie: `forez_identite=${usurpe}` },
    });
    expect(res.statusCode).toBe(200);
    // Signature absente : le serveur repart sur une identité neuve.
    expect(res.json<{ identite: string }>().identite).not.toBe(usurpe);
    expect(res.json<{ nouvelle: boolean }>().nouvelle).toBe(true);
  });

  it('refuse un cookie dont la signature ne correspond pas', async () => {
    const res = await srv.app.inject({
      method: 'GET',
      url: API.identity,
      headers: { cookie: `forez_identite=${newIdentity()}.signaturebidon` },
    });
    expect(res.json<{ nouvelle: boolean }>().nouvelle).toBe(true);
  });

  it('ne pose pas de cookie hors des routes /api', async () => {
    const res = await srv.call({ method: 'GET', url: API.health });
    expect(setCookies(res)).toHaveLength(0);
  });

  it("l'étiquette de journal ne révèle que huit caractères", () => {
    const id = newIdentity();
    expect(identityTag(id)).toHaveLength(8);
    expect(id.startsWith(identityTag(id))).toBe(true);
  });
});

describe('erreurs', () => {
  it('rend une erreur française sur une route API inconnue', async () => {
    const res = await srv.call({ method: 'GET', url: '/api/inconnue' });
    expect(res.statusCode).toBe(404);
    const body = res.json<{ erreur: string; code: string }>();
    expect(body.code).toBe('route_introuvable');
    expect(body.erreur).toMatch(/n'existe pas/);
  });

  it('refuse un corps JSON malformé en français', async () => {
    const res = await srv.call({
      method: 'PUT',
      url: API.profile,
      headers: { 'content-type': 'application/json' },
      payload: '{ceci n est pas du json',
    });
    expect(res.statusCode).toBe(400);
    expect(res.json<{ code: string }>().code).toBe('requete_invalide');
  });

  it('refuse une méthode non prévue', async () => {
    const res = await srv.call({ method: 'PATCH', url: API.saves });
    expect([404, 405]).toContain(res.statusCode);
    expect(res.json<{ erreur: string }>().erreur).toBeTruthy();
  });
});

describe('en-têtes de sécurité', () => {
  it('interdit le reniflage de type et le référent', async () => {
    const res = await srv.call({ method: 'GET', url: API.health });
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['referrer-policy']).toBe('no-referrer');
    expect(res.headers['x-frame-options']).toBe('SAMEORIGIN');
  });

  it('pose une politique de contenu sans origine distante sur les pages', async () => {
    const res = await srv.call({
      method: 'GET',
      url: API.diagnostic,
      headers: { accept: 'text/html' },
    });
    const csp = String(res.headers['content-security-policy'] ?? '');
    expect(csp).toContain("default-src 'self'");
    expect(csp).toContain("object-src 'none'");
    expect(csp).not.toContain('http://');
    expect(csp).not.toContain('https://');
  });
});

describe('limitation de débit', () => {
  it('annonce le plafond restant', async () => {
    const frais = await startTestServer();
    try {
      const res = await frais.call({ method: 'GET', url: API.identity });
      expect(res.headers['x-ratelimit-limit']).toBe('120');
      expect(Number(res.headers['x-ratelimit-remaining'])).toBeLessThanOrEqual(120);
    } finally {
      await frais.stop();
    }
  });

  it('refuse au-delà de 120 requêtes par minute, en français', async () => {
    const frais = await startTestServer();
    try {
      let dernier = await frais.call({ method: 'GET', url: API.identity });
      for (let i = 0; i < 130 && dernier.statusCode === 200; i++) {
        dernier = await frais.call({ method: 'GET', url: API.identity });
      }
      expect(dernier.statusCode).toBe(429);
      const body = dernier.json<{ erreur: string; code: string }>();
      expect(body.code).toBe('trop_de_requetes');
      expect(body.erreur).toMatch(/Trop de requêtes/);
      expect(dernier.headers['retry-after']).toBeDefined();

      // La sonde de santé, elle, reste toujours accessible.
      const sante = await frais.call({ method: 'GET', url: API.health });
      expect(sante.statusCode).toBe(200);
    } finally {
      await frais.stop();
    }
  });
});

describe('service du client', () => {
  it('sert une page de diagnostic soignée quand le client est absent', async () => {
    const vide = await mkdtemp(join(tmpdir(), 'forez-sans-client-'));
    const frais = await startTestServer({ clientDir: join(vide, 'dist') });
    try {
      expect(frais.ctx.clientDir).toBeNull();
      const res = await frais.call({
        method: 'GET',
        url: '/',
        headers: { accept: 'text/html' },
      });
      expect(res.statusCode).toBe(503);
      expect(res.body).toContain('L’interface n’est pas encore compilée');
      expect(res.body).toContain('pnpm --filter @auvergne/client build');
      expect(res.body).not.toMatch(/https?:\/\//);
    } finally {
      await frais.stop();
      await rm(vide, { recursive: true, force: true });
    }
  });

  it('sert index.html et retombe dessus pour une route du client', async () => {
    const frais = await startTestServer({ clientDir: null });
    try {
      if (frais.ctx.clientDir === null) return; // client non compilé dans cet environnement
      const racine = await frais.call({
        method: 'GET',
        url: '/',
        headers: { accept: 'text/html' },
      });
      expect(racine.statusCode).toBe(200);
      expect(racine.headers['cache-control']).toContain('no-cache');

      const profonde = await frais.call({
        method: 'GET',
        url: '/partie/cite/T_cervieres',
        headers: { accept: 'text/html' },
      });
      expect(profonde.statusCode).toBe(200);
      expect(profonde.body).toContain('<!doctype html>');
    } finally {
      await frais.stop();
    }
  });

  it('ne retombe pas sur index.html pour une requête JSON inconnue', async () => {
    const res = await srv.call({
      method: 'GET',
      url: '/quelque-chose',
      headers: { accept: 'application/json' },
    });
    expect(res.statusCode).toBe(404);
    expect(res.json<{ code: string }>().code).toBe('route_introuvable');
  });
});

describe('utilitaires', () => {
  it('la chaîne de requête est retirée des journaux', () => {
    expect(sanitizeUrl('/api/saves?force=1&jeton=abc')).toBe('/api/saves?…');
    expect(sanitizeUrl('/api/saves')).toBe('/api/saves');
  });

  it("l'échappement HTML neutralise les balises", () => {
    expect(escapeHtml('<script>alert("x")</script>')).toBe(
      '&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;',
    );
  });

  it('reconnaît un fichier empreint de Vite', () => {
    expect(isFingerprinted('/tmp/dist/assets/index-DUxxxjiZ.js')).toBe(true);
    expect(isFingerprinted('/tmp/dist/index.html')).toBe(false);
  });
});
