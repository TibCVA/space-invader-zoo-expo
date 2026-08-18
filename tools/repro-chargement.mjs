#!/usr/bin/env node
/**
 * Le chargement se fige-t-il sous la CSP réelle du serveur ?
 *
 * On sert le jeu par le **vrai binaire**, celui qui envoie
 * `script-src 'self'`, et l'on ouvre N fois de suite la scène la plus lourde.
 * Pour chaque essai on note si l'écran de chargement disparaît, et à quel
 * pourcentage il s'est arrêté sinon. Les violations de CSP sont relevées.
 */
import { chromium } from '@playwright/test';
import { spawn } from 'node:child_process';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const PORT = Number(process.env.SHOT_PORT ?? 4244);
const base = `http://127.0.0.1:${PORT}`;
const ESSAIS = Number(process.argv[2] ?? 6);
const PATIENCE_MS = Number(process.argv[3] ?? 45_000);

async function attendre(url, ms = 60_000) {
  const debut = Date.now();
  for (;;) {
    try { const r = await fetch(url); if (r.ok || r.status === 404) return; } catch { /* rien */ }
    if (Date.now() - debut > ms) throw new Error(`serveur injoignable : ${url}`);
    await new Promise((r) => setTimeout(r, 300));
  }
}

const serveur = spawn('node', ['apps/server/dist/server.js'], {
  cwd: ROOT, stdio: 'ignore', detached: true,
  env: { ...process.env, PORT: String(PORT), AUVERGNE_STORAGE: 'memory' },
});
let navigateur;
const resultats = [];

try {
  await attendre(`${base}/api/parties/mes-parties`);
  navigateur = await chromium.launch({ args: ['--no-sandbox', '--disable-dev-shm-usage'] });

  for (let i = 1; i <= ESSAIS; i += 1) {
    const ctx = await navigateur.newContext({ viewport: { width: 1280, height: 720 }, locale: 'fr-FR' });
    const page = await ctx.newPage();
    const violations = [];
    page.on('console', (m) => {
      const t = m.text();
      if (/Content Security Policy|Refused to|worker/i.test(t)) violations.push(t.slice(0, 200));
    });

    const debut = Date.now();
    await page.goto(`${base}/#/demo/combat`, { waitUntil: 'load', timeout: 30_000 });

    let fini = false;
    let dernierLibelle = '';
    while (Date.now() - debut < PATIENCE_MS) {
      const chargement = await page.locator('.chargement, [class*="chargement"]').count().catch(() => 0);
      if (chargement === 0) { fini = true; break; }
      dernierLibelle = await page
        .locator('.chargement, [class*="chargement"]')
        .first()
        .innerText()
        .catch(() => dernierLibelle);
      await page.waitForTimeout(500);
    }

    const ms = Date.now() - debut;
    const etape = (dernierLibelle.split('\n').find((l) => /…/.test(l)) ?? '').trim();
    resultats.push({ essai: i, fini, ms, etape, violations: violations.length });
    console.log(
      `  ${fini ? '✓' : '✗'} essai ${i} : ${fini ? `chargé en ${(ms / 1000).toFixed(1)} s` : `FIGÉ après ${(ms / 1000).toFixed(0)} s — « ${etape} »`}` +
        (violations.length ? ` · ${violations.length} refus CSP` : ''),
    );
    for (const v of violations.slice(0, 2)) console.log(`        ${v}`);
    await ctx.close();
  }
} finally {
  if (navigateur) await navigateur.close();
  try { process.kill(-serveur.pid, 'SIGTERM'); } catch { /* déjà mort */ }
}

const figes = resultats.filter((r) => !r.fini).length;
console.log(`\n▸ ${figes} figé(s) sur ${resultats.length} essais sous la CSP réelle.`);
process.exit(figes > 0 ? 1 : 0);
