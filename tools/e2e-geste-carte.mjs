#!/usr/bin/env node
/**
 * Épreuve du GESTE DE CARTE au doigt — la boucle de jeu la plus fréquente.
 *
 * **Le défaut qu'elle garde.** Le propriétaire, jouant sur iPhone : « dès que
 * je veux cliquer sur un endroit pour que le héros s'y rende, cela ouvre la
 * vignette de l'endroit et cache la carte ». Reproduit et mesuré : toucher son
 * propre héros ouvrait un carton d'inspection couvrant 45 % de la carte, posé
 * juste au-dessus de l'endroit où il faut toucher ensuite. Or marcher demande
 * trois appuis — choisir, viser, confirmer — et le premier masquait les deux
 * autres.
 *
 * La règle posée en réponse, et que cette épreuve tient : **l'action l'emporte
 * sur l'information**. Un appui court agit quand il y a quelque chose à faire ;
 * il n'informe que s'il n'y avait rien. L'appui long informe toujours — c'est
 * le clic droit de HMM3 traduit au doigt.
 *
 * Quatre gestes, quatre vérifications. Aucun état interne n'est interrogé : la
 * position du héros est relue AU SERVEUR, et la fiche est cherchée dans le DOM.
 *
 *   node tools/e2e-geste-carte.mjs [url]
 */
import { spawn } from 'node:child_process';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { portLibre } from './port-libre.mjs';
import { lancerNavigateur } from './navigateur.mjs';
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
  const { code, jetonActif, actif } = await monterPartie(base);

  navigateur = await lancerNavigateur(Boolean(distant));
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
  /* La légende n'est rendue que lorsque la scène est prête : c'est elle le
     signal d'ouverture, et non « Fin du tour », qui vit désormais hors de la
     scène et apparaît avant que la carte ne soit peinte. */
  await page.locator('.jeu-scene__legende').waitFor({ state: 'visible', timeout: 240_000 });
  await page.waitForTimeout(2500);

  /** La position du héros, relue au serveur — jamais dans le navigateur. */
  const position = async () => {
    const r = await fetch(`${base}/api/parties/${code}/etat`, {
      headers: { 'x-jeton-joueur': jetonActif },
    });
    const j = await r.json();
    const st = typeof j.etat === 'string' ? JSON.parse(j.etat) : (j.etat ?? j.state ?? j);
    const uid = st.players?.[actif]?.heroes?.[0];
    return st.heroes?.[uid]?.at ?? null;
  };
  const ficheOuverte = async () => (await page.locator('.carte-fiche').count()) > 0;

  /* Le héros est cadré au centre de la scène à l'ouverture : la carte s'ouvre
     sur lui (`cadrageInitial`). Le centre du cadre utile est donc sa case. */
  const HEROS = { x: 196, y: 412 };
  const DESTINATION = { x: 196, y: 500 };

  const depart = await position();
  exige(depart !== null, `le héros est en ${JSON.stringify(depart)}`);

  await page.touchscreen.tap(HEROS.x, HEROS.y);
  await page.waitForTimeout(800);
  exige(!(await ficheOuverte()), 'appui court sur le héros : il est choisi, AUCUNE fiche ne s’ouvre');

  await page.touchscreen.tap(DESTINATION.x, DESTINATION.y);
  await page.waitForTimeout(800);
  exige(!(await ficheOuverte()), 'appui court sur la destination : AUCUNE fiche ne s’ouvre');
  const apresVisee = await position();
  exige(
    JSON.stringify(apresVisee) === JSON.stringify(depart),
    'le premier appui VISE et ne déplace rien — le rythme de HMM3',
  );

  await page.touchscreen.tap(DESTINATION.x, DESTINATION.y);
  await page.waitForTimeout(1800);
  const apresDepart = await position();
  exige(
    JSON.stringify(apresDepart) !== JSON.stringify(depart),
    `le second appui met en route : ${JSON.stringify(depart)} → ${JSON.stringify(apresDepart)}`,
  );

  /*
   * L'appui LONG. Playwright n'a pas de geste « tenir le doigt » : on émet
   * donc les deux événements de pointeur nous-mêmes, avec le délai réel entre
   * les deux. C'est le même chemin de code que celui d'un vrai doigt —
   * `pointerdown` puis `pointerup` sur le canevas, séparés de plus de 520 ms.
   */
  await page.evaluate(() => {
    const c = document.querySelector('canvas');
    if (!c) return undefined;
    const r = c.getBoundingClientRect();
    const ev = (type) =>
      new PointerEvent(type, {
        pointerId: 1,
        pointerType: 'touch',
        clientX: r.left + 196,
        clientY: r.top + 200,
        bubbles: true,
      });
    c.dispatchEvent(ev('pointerdown'));
    return new Promise((res) => {
      setTimeout(() => {
        c.dispatchEvent(ev('pointerup'));
        res(undefined);
      }, 700);
    });
  });
  await page.waitForTimeout(800);
  exige(await ficheOuverte(), 'appui LONG : la fiche d’inspection s’ouvre — le clic droit de HMM3');

  exige(erreurs.length === 0, `aucune erreur console (${erreurs.length})`);
  for (const e of erreurs.slice(0, 4)) console.log('      ', e);
  await ctx.close();
} finally {
  if (navigateur) await navigateur.close();
  if (serveur) { try { process.kill(-serveur.pid, 'SIGTERM'); } catch { /* déjà mort */ } }
}

console.log(echecs === 0 ? '\n▸ geste de carte : tout est vert.' : `\n▸ ${echecs} vérification(s) en échec.`);
process.exit(echecs === 0 ? 0 : 1);
