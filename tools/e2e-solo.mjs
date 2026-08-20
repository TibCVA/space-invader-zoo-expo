#!/usr/bin/env node
/**
 * Épreuve de bout en bout de la partie SOLO contre l'IA, dans un navigateur.
 *
 * **Pourquoi elle existe.** « Nouvelle partie » monte une partie entièrement
 * LOCALE : `demarrerPartie` appelle `createGame` dans le navigateur, et rien
 * n'est envoyé au serveur. Les bannières confiées à l'ordinateur y sont donc
 * jouées par… personne. Le serveur sait dérouler l'IA (`deroulerIa` dans
 * `routes/parties.ts`), mais il n'est pas dans la boucle d'une partie locale.
 *
 * Ce que cela donnait, avant correction : on rend la main, la bannière de
 * l'ordinateur prend le tour, et la partie s'arrête là pour toujours. Le
 * chemin le plus naturel depuis l'accueil — « Nouvelle partie », des
 * adversaires en IA, « Lever les bannières » — ne dépassait pas le premier
 * tour.
 *
 * L'épreuve joue ce parcours au clic et exige que **la main revienne** au
 * joueur humain. Elle n'interroge aucun état interne : elle lit ce que
 * l'écran affiche, comme le ferait le propriétaire.
 *
 *   node tools/e2e-solo.mjs            → sert le bundle local
 *   node tools/e2e-solo.mjs <url>      → éprouve un site déjà déployé
 */
import { chromium } from '@playwright/test';
import { spawn } from 'node:child_process';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { portLibre } from './port-libre.mjs';

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

/** Les deux appareils sur lesquels les cousins jouent. */
const APPAREILS = [
  { nom: 'ordinateur', viewport: { width: 1440, height: 900 }, mobile: false },
  { nom: 'iPhone', viewport: { width: 390, height: 844 }, mobile: true, dpr: 3 },
];

try {
  await attendre(distant ? `${base}/health` : `${base}/api/parties/mes-parties`);
  navigateur = await chromium.launch({ args: ['--no-sandbox', '--disable-dev-shm-usage'] });

  for (const appareil of APPAREILS) {
    console.log(`\n▸ partie solo contre l'IA — ${appareil.nom}`);
    const ctx = await navigateur.newContext({
      viewport: appareil.viewport,
      deviceScaleFactor: appareil.dpr ?? 1,
      isMobile: appareil.mobile,
      hasTouch: appareil.mobile,
      locale: 'fr-FR',
    });
    const page = await ctx.newPage();
    const erreurs = [];
    page.on('console', (m) => { if (m.type() === 'error') erreurs.push(m.text().slice(0, 240)); });
    page.on('pageerror', (e) => erreurs.push(String(e).slice(0, 240)));

    /* L'assistant, puis les bannières. Les réglages par défaut donnent déjà
       une bannière humaine et des bannières d'IA : c'est exactement ce que le
       propriétaire obtient en cliquant sans rien changer. */
    await page.goto(`${base}/#/nouvelle-partie`, { waitUntil: 'load', timeout: 60_000 });
    const lever = page.getByRole('button', { name: /Lever les bannières/i });
    await lever.waitFor({ state: 'visible', timeout: 30_000 });
    await lever.click();

    /* La carte se construit puis l'atlas se peint : sans GPU, il faut du temps.
       Deux cent quarante secondes, et ce n'est pas une marge de confort : le
       premier contexte du navigateur est FROID — rien n'est compilé, rien n'est
       en cache — et il a été mesuré à plus de cent vingt secondes là où le
       second passe en quarante-cinq. Une épreuve qui échoue sur la lenteur du
       premier essai ne dit rien du produit. */
    const finDuTour = page.getByRole('button', { name: /^Fin du tour$/i });
    let arrive = true;
    try {
      await finDuTour.waitFor({ state: 'visible', timeout: 240_000 });
    } catch {
      arrive = false;
    }
    exige(arrive, 'la carte s’ouvre et offre « Fin du tour »');

    if (arrive) {
      /* Le calendrier AVANT le coup, pour pouvoir exiger qu'il ait bougé. */
      const calendrierAvant = (await page.locator('body').innerText()).match(
        /semaine\s*\d+,?\s*jour\s*\d+/i,
      )?.[0] ?? '';

      await finDuTour.click();
      const confirmer = page.getByRole('button', { name: /Rendre la main/i });
      if (await confirmer.isVisible().catch(() => false)) await confirmer.click();

      /*
       * LE CŒUR DE L'ÉPREUVE : la main doit REVENIR.
       *
       * Les bannières de l'ordinateur jouent leur tour, puis le joueur humain
       * reprend et le bouton « Fin du tour » réapparaît. Tant que l'IA n'était
       * jouée par personne, l'écran restait sur « La main est à … » pour
       * toujours — et c'est exactement ce que ces lignes attrapent.
       */
      let revenue = true;
      try {
        await finDuTour.waitFor({ state: 'visible', timeout: 90_000 });
      } catch {
        revenue = false;
      }
      const texte = await page.locator('body').innerText();
      exige(revenue, 'la main revient au joueur après le tour de l’ordinateur');
      if (!revenue) console.log('      écran :', texte.replace(/\s+/g, ' ').slice(0, 200));

      /*
       * Le calendrier doit avoir AVANCÉ. Une main qui revient sans que le jour
       * bouge voudrait dire que personne n'a rien joué entre-temps — c'est le
       * faux vert qu'une simple recherche du mot « jour » aurait donné, et la
       * première version de cette épreuve le donnait.
       */
      const calendrierApres = texte.match(/semaine\s*\d+,?\s*jour\s*\d+/i)?.[0] ?? '';
      exige(
        calendrierAvant !== '' && calendrierApres !== '' && calendrierApres !== calendrierAvant,
        `la journée a avancé : « ${calendrierAvant} » → « ${calendrierApres} »`,
      );
    }

    exige(erreurs.length === 0, `aucune erreur console (${erreurs.length})`);
    for (const e of erreurs.slice(0, 4)) console.log('      ', e);
    await ctx.close();
  }
} finally {
  if (navigateur) await navigateur.close();
  if (serveur) { try { process.kill(-serveur.pid, 'SIGTERM'); } catch { /* déjà mort */ } }
}

console.log(echecs === 0 ? '\n▸ solo contre l’IA : tout est vert.' : `\n▸ ${echecs} vérification(s) en échec.`);
process.exit(echecs === 0 ? 0 : 1);
