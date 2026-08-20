#!/usr/bin/env node
/**
 * Épreuve de bout en bout du multijoueur asynchrone, **dans un navigateur**.
 *
 * Ce que les tests unitaires ne peuvent pas prouver : qu'un cousin ouvre le
 * lien, entre dans la partie, joue son coup depuis l'écran de jeu, et que le
 * serveur en tienne compte. Deux contextes de navigateur distincts — donc deux
 * `localStorage`, deux trousseaux de jetons — jouent chacun leur tour.
 *
 * Le parcours est monté par l'API (c'est le salon, déjà éprouvé) ; ce qui est
 * vérifié ici, c'est **la boucle de jeu** : entrée dans la partie, séquence qui
 * avance après un coup, et l'autre navigateur qui voit le changement.
 */
import { chromium } from '@playwright/test';
import { spawn } from 'node:child_process';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { portLibre } from './port-libre.mjs';
import { monterPartie, munirDuJeton, poster as posterVers } from './partie-en-ligne.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const PORT = await portLibre();
const base = `http://127.0.0.1:${PORT}`;

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

/* Le montage du salon vit dans `partie-en-ligne.mjs` : le harnais de capture
   monte la même partie, et deux copies d'un même parcours dérivent. */
const poster = (chemin, corps, jeton, jar) => posterVers(base, chemin, corps, jeton, jar);

const serveur = spawn('node', ['apps/server/dist/server.js'], {
  cwd: ROOT, stdio: 'ignore', detached: true,
  env: { ...process.env, PORT: String(PORT), AUVERGNE_STORAGE: 'memory' },
});
let navigateur;

try {
  await attendre(`${base}/api/parties/mes-parties`);

  console.log('▸ montage du salon par l’API');
  const partie = await monterPartie(base);
  const { code, actif, jetonActif, jetonAutre, hote, cousin } = partie;
  exige(typeof code === 'string' && code.length > 5, `partie créée : ${code}`);
  exige(actif === 'P1' || actif === 'P2', `la partie est lancée, la main est à ${String(actif)}`);

  navigateur = await chromium.launch({ args: ['--no-sandbox', '--disable-dev-shm-usage'] });

  /** Ouvre un navigateur muni d'un jeton, et entre dans la partie. */
  const ouvrir = async (jeton, nom) => {
    const ctx = await navigateur.newContext({ viewport: { width: 1400, height: 900 }, locale: 'fr-FR' });
    const page = await ctx.newPage();
    const erreurs = [];
    page.on('console', (m) => { if (m.type() === 'error') erreurs.push(m.text().slice(0, 240)); });
    page.on('pageerror', (e) => erreurs.push(String(e).slice(0, 240)));
    await munirDuJeton(page, base, code, jeton);
    await page.goto(`${base}/#/en-ligne/${code}`, { waitUntil: 'load' });
    await page.waitForTimeout(6000);
    return { ctx, page, erreurs, nom };
  };

  console.log('▸ les deux cousins ouvrent le lien');
  const a = await ouvrir(jetonActif, 'joueur actif');
  const b = await ouvrir(jetonAutre, 'joueur en attente');

  const texteA = await a.page.locator('body').innerText();
  const texteB = await b.page.locator('body').innerText();
  exige(!/introuvable|panne/i.test(texteA), 'le joueur actif voit un écran valide');
  exige(/attente|tour|entrer|partie/i.test(texteB), 'le joueur en attente voit son écran d’attente');

  console.log('▸ le joueur actif joue un coup');
  const avant = await (await fetch(`${base}/api/parties/${code}/pouls`)).json();
  const coup = await poster(`/api/parties/${code}/commande`,
    { commande: { type: 'EndTurn' }, cleIdempotence: 'epreuve-navigateur-1', seqAttendu: avant.seq },
    jetonActif, actif === 'P1' ? hote : cousin);
  exige(coup.statut === 200, `le coup est accepté (séquence ${avant.seq} → ${coup.corps?.seq})`);

  console.log('▸ l’autre navigateur constate le changement');
  await b.page.waitForTimeout(7000);
  const apres = await (await fetch(`${base}/api/parties/${code}/pouls`)).json();
  exige(apres.seq > avant.seq, `la séquence a avancé : ${avant.seq} → ${apres.seq}`);
  exige(apres.activePlayer !== avant.activePlayer, `la main a changé : ${avant.activePlayer} → ${apres.activePlayer}`);

  const toutesErreurs = [...a.erreurs, ...b.erreurs];
  exige(toutesErreurs.length === 0, `aucune erreur console (${toutesErreurs.length})`);
  for (const e of toutesErreurs.slice(0, 6)) console.log('      ', e);

  await a.ctx.close();
  await b.ctx.close();
} finally {
  if (navigateur) await navigateur.close();
  try { process.kill(-serveur.pid, 'SIGTERM'); } catch { /* déjà mort */ }
}

console.log(echecs === 0 ? '\n▸ parcours complet : tout est vert.' : `\n▸ ${echecs} vérification(s) en échec.`);
process.exit(echecs === 0 ? 0 : 1);
