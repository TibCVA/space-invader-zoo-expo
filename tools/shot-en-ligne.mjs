#!/usr/bin/env node
/**
 * Capture des écrans de parties en ligne, contre le **vrai serveur**.
 *
 * Le harnais ordinaire sert le client par `vite preview`, qui ne connaît pas
 * `/api` : les écrans en ligne y afficheraient une panne réseau et l'on ne
 * verrait jamais ce que voit un joueur. Celui-ci démarre le binaire du serveur,
 * qui sert à la fois le bundle et l'API, et joue le parcours d'un cousin :
 * l'accueil des parties, la création, puis le salon.
 */
import { chromium } from '@playwright/test';
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { portLibre } from './port-libre.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const PORT = await portLibre();
const outDir = resolve(ROOT, process.argv[2] ?? 'shots/en-ligne');

async function attendre(url, ms = 60_000) {
  const debut = Date.now();
  for (;;) {
    try {
      const r = await fetch(url);
      if (r.ok || r.status === 404) return;
    } catch { /* pas encore */ }
    if (Date.now() - debut > ms) throw new Error(`serveur injoignable : ${url}`);
    await new Promise((r) => setTimeout(r, 300));
  }
}

mkdirSync(outDir, { recursive: true });
const serveur = spawn('node', ['apps/server/dist/server.js'], {
  cwd: ROOT,
  stdio: 'ignore',
  detached: true,
  env: { ...process.env, PORT: String(PORT), AUVERGNE_STORAGE: 'memory' },
});
const base = `http://127.0.0.1:${PORT}`;
const rapport = { erreurs: [], captures: [] };
let navigateur;

try {
  await attendre(`${base}/api/parties/mes-parties`);
  navigateur = await chromium.launch({ args: ['--no-sandbox', '--disable-dev-shm-usage'] });

  for (const vp of [
    { key: 'bureau', width: 1920, height: 1080, dpr: 1, mobile: false },
    { key: 'iphone', width: 390, height: 844, dpr: 3, mobile: true },
  ]) {
    const ctx = await navigateur.newContext({
      viewport: { width: vp.width, height: vp.height },
      deviceScaleFactor: vp.dpr,
      isMobile: vp.mobile,
      hasTouch: vp.mobile,
      locale: 'fr-FR',
    });
    const page = await ctx.newPage();
    page.on('console', (m) => {
      if (m.type() === 'error') rapport.erreurs.push(`${vp.key} · ${m.text().slice(0, 300)}`);
    });
    page.on('pageerror', (e) => rapport.erreurs.push(`${vp.key} · ${String(e).slice(0, 300)}`));

    await page.goto(`${base}/#/en-ligne`, { waitUntil: 'load', timeout: 45_000 });
    await page.waitForTimeout(3500);
    const salle = resolve(outDir, `salle--${vp.key}.png`);
    await page.screenshot({ path: salle });
    rapport.captures.push(salle);

    /* On crée une partie par l'interface, comme le ferait un cousin. */
    const bouton = page.getByRole('button', { name: /créer|nouvelle/i }).first();
    if (await bouton.count()) {
      await bouton.click({ timeout: 10_000 }).catch(() => undefined);
      await page.waitForTimeout(4000);
      const salon = resolve(outDir, `salon--${vp.key}.png`);
      await page.screenshot({ path: salon });
      rapport.captures.push(salon);
    }
    await ctx.close();
  }
} finally {
  if (navigateur) await navigateur.close();
  try { process.kill(-serveur.pid, 'SIGTERM'); } catch { /* déjà mort */ }
}

writeFileSync(resolve(outDir, 'rapport.json'), JSON.stringify(rapport, null, 2));
console.log(`▸ ${rapport.captures.length} captures dans ${outDir} · ${rapport.erreurs.length} erreurs console`);
for (const e of rapport.erreurs.slice(0, 8)) console.log('  ✗', e);
