#!/usr/bin/env node
/**
 * Harnais de capture pour la revue visuelle.
 *
 *   node tools/screenshot.mjs                      → toutes les scènes
 *   node tools/screenshot.mjs accueil carte        → sous-ensemble
 *   node tools/screenshot.mjs --dir shots/tour3    → dossier de sortie
 *
 * Construit le client, sert le bundle, puis capture chaque scène en 1920×1080
 * et en 390×844 (iPhone). Écrit aussi un rapport des erreurs console, qui
 * comptent comme un échec de la revue.
 */
import { chromium } from '@playwright/test';
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const PORT = Number(process.env.SHOT_PORT ?? 4188);

/** Chaque scène est atteinte par un fragment d'URL géré par le client. */
const SCENES = {
  accueil: { hash: '#/', wait: 6500, label: "Page d'accueil" },
  nouvelle: { hash: '#/nouvelle-partie', wait: 3000, label: 'Assistant de nouvelle partie' },
  codex: { hash: '#/codex', wait: 1400, label: 'Codex' },
  options: { hash: '#/options', wait: 1000, label: 'Options' },
  carte: { hash: '#/demo/carte', wait: 5200, label: "Carte d'aventure" },
  cite_granit: { hash: '#/demo/cite/granit', wait: 3600, label: 'Cité — Châtellenie de Granit' },
  cite_ermitage: { hash: '#/demo/cite/ermitage', wait: 3600, label: 'Cité — Ermitage des Bois Noirs' },
  combat: { hash: '#/demo/combat', wait: 4200, label: 'Combat tactique' },
  heros: { hash: '#/demo/heros', wait: 4000, label: 'Fiche de héros' },
  royaume: { hash: '#/demo/royaume', wait: 1600, label: 'Vue du royaume' },
  planche_art: { hash: '#/demo/planche-art', wait: 6000, label: 'Planche de contact — créatures' },
  galerie_ui: { hash: '#/demo/galerie', wait: 1800, label: 'Galerie du design system' },
  sauvegardes: { hash: '#/demo/sauvegardes', wait: 1400, label: 'Emplacements de sauvegarde' },
};

const VIEWPORTS = [
  { key: 'bureau', width: 1920, height: 1080, dpr: 1, mobile: false },
  { key: 'iphone', width: 390, height: 844, dpr: 3, mobile: true },
];

function arg(name, fallback) {
  const i = process.argv.indexOf(name);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

const outDir = resolve(ROOT, arg('--dir', 'shots'));
const only = process.argv.slice(2).filter((a) => !a.startsWith('--') && SCENES[a]);
const scenes = only.length ? only : Object.keys(SCENES);
const skipBuild = process.argv.includes('--no-build');

function run(cmd, args, opts = {}) {
  return new Promise((res, rej) => {
    const p = spawn(cmd, args, { cwd: ROOT, stdio: 'inherit', ...opts });
    p.on('exit', (c) => (c === 0 ? res() : rej(new Error(`${cmd} a échoué (${c})`))));
    p.on('error', rej);
  });
}

async function waitForServer(url, timeoutMs = 90_000) {
  const start = Date.now();
  for (;;) {
    try {
      const r = await fetch(url);
      if (r.ok || r.status === 404) return;
    } catch {
      /* pas encore prêt */
    }
    if (Date.now() - start > timeoutMs) throw new Error(`serveur injoignable : ${url}`);
    await new Promise((r) => setTimeout(r, 400));
  }
}

async function main() {
  mkdirSync(outDir, { recursive: true });

  if (!skipBuild) {
    console.log('▸ construction du client…');
    await run('pnpm', ['--filter', '@auvergne/client', 'build']);
  }
  if (!existsSync(resolve(ROOT, 'apps/client/dist/index.html'))) {
    throw new Error('apps/client/dist/index.html absent — la construction a échoué.');
  }

  console.log('▸ démarrage du serveur de prévisualisation…');
  const server = spawn(
    'pnpm',
    ['--filter', '@auvergne/client', 'exec', 'vite', 'preview', '--port', String(PORT), '--strictPort'],
    { cwd: ROOT, stdio: 'ignore', detached: true },
  );
  const base = `http://127.0.0.1:${PORT}`;

  const report = { generatedAt: new Date().toISOString(), shots: [], consoleErrors: [] };
  let browser;
  try {
    await waitForServer(base);
    browser = await chromium.launch({ args: ['--no-sandbox', '--disable-dev-shm-usage'] });

    for (const key of scenes) {
      const scene = SCENES[key];
      for (const vp of VIEWPORTS) {
        const ctx = await browser.newContext({
          viewport: { width: vp.width, height: vp.height },
          deviceScaleFactor: vp.dpr,
          isMobile: vp.mobile,
          hasTouch: vp.mobile,
          locale: 'fr-FR',
          reducedMotion: 'no-preference',
        });
        const page = await ctx.newPage();
        const errors = [];
        page.on('console', (m) => {
          if (m.type() === 'error') errors.push(m.text().slice(0, 400));
        });
        page.on('pageerror', (e) => errors.push(String(e).slice(0, 400)));

        const url = `${base}/${scene.hash}`;
        try {
          await page.goto(url, { waitUntil: 'load', timeout: 45_000 });
          await page.waitForTimeout(scene.wait);
          const file = resolve(outDir, `${key}--${vp.key}.png`);
          await page.screenshot({ path: file, fullPage: false });
          report.shots.push({ scene: key, label: scene.label, viewport: vp.key, file, errors: errors.length });
          console.log(`  ✓ ${key} · ${vp.key}${errors.length ? ` (${errors.length} erreurs console)` : ''}`);
        } catch (e) {
          report.shots.push({ scene: key, viewport: vp.key, error: String(e).slice(0, 300) });
          console.log(`  ✗ ${key} · ${vp.key} : ${e}`);
        }
        if (errors.length) report.consoleErrors.push({ scene: key, viewport: vp.key, errors });
        await ctx.close();
      }
    }
  } finally {
    if (browser) await browser.close();
    try {
      process.kill(-server.pid, 'SIGTERM');
    } catch {
      /* déjà arrêté */
    }
  }

  writeFileSync(resolve(outDir, 'rapport.json'), JSON.stringify(report, null, 2));
  const failed = report.shots.filter((s) => s.error).length;
  console.log(`\n▸ ${report.shots.length} captures dans ${outDir} · ${failed} échecs · ${report.consoleErrors.length} scènes avec erreurs console`);
  if (failed) process.exitCode = 1;
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
