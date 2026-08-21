#!/usr/bin/env node
/**
 * Épreuve de la partie EN LIGNE contre l'ordinateur.
 *
 * Il existe deux façons de jouer contre l'IA, et elles n'empruntent pas le
 * même chemin :
 *
 *  - **en solo**, la partie est locale et c'est le navigateur qui déroule les
 *    tours de l'ordinateur (`deroulerIaLocale`) — éprouvé par `e2e-solo.mjs` ;
 *  - **en ligne**, le serveur reste seul juge et c'est lui qui les déroule
 *    (`deroulerIa`, dans `routes/parties.ts`). C'est ce chemin-ci.
 *
 * Le second sert aussi aux parties mixtes, celles où les cousins manquants
 * sont remplacés par l'ordinateur — le cas le plus probable un soir de
 * semaine. Il n'était éprouvé nulle part.
 *
 *   node tools/e2e-ia-en-ligne.mjs           → sert le bundle local
 *   node tools/e2e-ia-en-ligne.mjs <url>     → éprouve un site déjà déployé
 */
import { chromium } from '@playwright/test';
import { spawn } from 'node:child_process';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { portLibre } from './port-libre.mjs';
import { monterPartie, munirDuJeton } from './partie-en-ligne.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const distant = process.argv[2] && !process.argv[2].startsWith('--') ? process.argv[2] : null;
const PORT = distant ? 0 : await portLibre();
const base = distant ?? `http://127.0.0.1:${PORT}`;

const dit = (ok, texte) => console.log(`  ${ok ? '✓' : '✗'} ${texte}`);
let echecs = 0;
const exige = (condition, texte) => {
  dit(condition, texte);
  if (!condition) echecs += 1;
};

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

const serveur = distant
  ? null
  : spawn('node', ['apps/server/dist/server.js'], {
      cwd: ROOT, stdio: 'ignore', detached: true,
      env: { ...process.env, PORT: String(PORT), AUVERGNE_STORAGE: 'memory' },
    });

let navigateur;

try {
  await attendre(distant ? `${base}/health` : `${base}/api/parties/mes-parties`);

  console.log('▸ une bannière humaine, une bannière confiée à l’ordinateur');
  const { code, jetonActif } = await monterPartie(base, { deuxiemeBanniere: 'ia' });
  exige(typeof code === 'string' && code.length > 5, `partie créée : ${code}`);

  navigateur = await chromium.launch({ args: ['--no-sandbox', '--disable-dev-shm-usage'] });
  const ctx = await navigateur.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 3,
    isMobile: true,
    hasTouch: true,
    locale: 'fr-FR',
  });
  const page = await ctx.newPage();
  const erreurs = [];
  page.on('console', (m) => { if (m.type() === 'error') erreurs.push(m.text().slice(0, 240)); });
  page.on('pageerror', (e) => erreurs.push(String(e).slice(0, 240)));

  await munirDuJeton(page, base, code, jetonActif);
  await page.goto(`${base}/#/en-ligne/${code}`, { waitUntil: 'load', timeout: 60_000 });
  await page.getByRole('button', { name: /Entrer dans la partie/i }).click();

  const finDuTour = page.getByRole('button', { name: /^Fin du tour$/i });
  let arrive = true;
  try {
    await finDuTour.waitFor({ state: 'visible', timeout: 240_000 });
  } catch {
    arrive = false;
  }
  exige(arrive, 'la carte s’ouvre et offre « Fin du tour »');

  if (arrive) {
    const avant = await (await fetch(`${base}/api/parties/${code}/pouls`)).json();
    await finDuTour.click();
    const confirmer = page.getByRole('button', { name: /Rendre la main/i });
    if (await confirmer.isVisible().catch(() => false)) await confirmer.click();

    /*
     * Le serveur déroule la bannière de l'ordinateur DANS la requête qui reçoit
     * le coup humain : la main doit donc revenir au joueur, et la journée avoir
     * avancé, sans qu'on ait rien d'autre à faire.
     */
    let apres = avant;
    for (let essai = 0; essai < 40 && apres.seq === avant.seq; essai += 1) {
      await page.waitForTimeout(500);
      apres = await (await fetch(`${base}/api/parties/${code}/pouls`)).json();
    }
    exige(apres.seq > avant.seq, `la séquence a avancé : ${avant.seq} → ${apres.seq}`);
    exige(
      apres.activePlayer === avant.activePlayer,
      `l’ordinateur a joué et la main est revenue à ${String(apres.activePlayer)}`,
    );

    let revenue = true;
    try {
      await finDuTour.waitFor({ state: 'visible', timeout: 90_000 });
    } catch {
      revenue = false;
    }
    exige(revenue, 'le bouton « Fin du tour » revient à l’écran du joueur');
  }

  exige(erreurs.length === 0, `aucune erreur console (${erreurs.length})`);
  for (const e of erreurs.slice(0, 4)) console.log('      ', e);
  await ctx.close();
} finally {
  if (navigateur) await navigateur.close();
  if (serveur) { try { process.kill(-serveur.pid, 'SIGTERM'); } catch { /* déjà mort */ } }
}

console.log(echecs === 0 ? '\n▸ IA en ligne : tout est vert.' : `\n▸ ${echecs} vérification(s) en échec.`);
process.exit(echecs === 0 ? 0 : 1);
