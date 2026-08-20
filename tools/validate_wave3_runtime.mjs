#!/usr/bin/env node
/** Vérifie le chargement réel de la vague 3 dans le client de production. */

import { chromium } from '@playwright/test';
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { portLibre } from './port-libre.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const client = resolve(ROOT, 'apps/client/dist/index.html');
const serverBin = resolve(ROOT, 'apps/server/dist/server.js');
if (!existsSync(client) || !existsSync(serverBin)) {
  throw new Error('build client/serveur absent — construisez les deux paquets avant ce validateur');
}

const port = await portLibre();
const base = `http://127.0.0.1:${port}`;
const server = spawn('node', ['apps/server/dist/server.js'], {
  cwd: ROOT,
  stdio: 'ignore',
  detached: true,
  env: { ...process.env, PORT: String(port), AUVERGNE_STORAGE: 'memory' },
});

async function attendreServeur() {
  const limite = Date.now() + 90_000;
  while (Date.now() < limite) {
    try {
      const response = await fetch(base);
      if (response.ok || response.status === 404) return;
    } catch {
      // Le serveur est encore en démarrage.
    }
    await new Promise((resolveWait) => setTimeout(resolveWait, 400));
  }
  throw new Error(`serveur injoignable : ${base}`);
}

let browser;
try {
  await attendreServeur();
  browser = await chromium.launch({ args: ['--no-sandbox', '--disable-dev-shm-usage'] });
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
  const consoleErrors = [];
  const artWarnings = [];
  page.on('console', (message) => {
    const text = message.text();
    if (message.type() === 'error') consoleErrors.push(text);
    if (text.includes('[art]') && /(ignorée|non chargée)/i.test(text)) artWarnings.push(text);
  });
  page.on('pageerror', (error) => consoleErrors.push(String(error)));

  await page.goto(`${base}/#/demo/carte`, { waitUntil: 'load', timeout: 45_000 });
  await page.waitForTimeout(60_000);
  await page.goto(`${base}/#/diagnostic`, { waitUntil: 'load', timeout: 45_000 });
  await page.waitForTimeout(1_000);

  const body = await page.locator('body').innerText();
  const match = body.match(/Images peintes chargées\s+(\d+) en (\d+) ms/i);
  const charges = match ? Number(match[1]) : null;
  const abandons = /Images abandonnées/i.test(body);
  const errors = [];
  if (charges !== 197) errors.push(`images chargées: ${String(charges)}, attendu: 197`);
  if (abandons) errors.push('le diagnostic signale des images abandonnées');
  if (artWarnings.length) errors.push(`${artWarnings.length} avertissement(s) de repli artistique`);
  if (consoleErrors.length) errors.push(`${consoleErrors.length} erreur(s) console`);

  console.log(
    JSON.stringify(
      {
        charges,
        dureeMs: match ? Number(match[2]) : null,
        abandons,
        artWarnings,
        consoleErrors,
        errors,
      },
      null,
      2,
    ),
  );
  if (errors.length) process.exitCode = 1;
} finally {
  if (browser) await browser.close();
  try {
    if (process.platform === 'win32') server.kill('SIGTERM');
    else process.kill(-server.pid, 'SIGTERM');
  } catch {
    // Déjà arrêté.
  }
}
