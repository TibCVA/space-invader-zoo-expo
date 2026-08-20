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
  const { code, actif, jetonActif, jetonAutre } = partie;
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

  /*
   * LE COUP EST JOUÉ PAR LE BOUTON, PAS PAR L'API.
   *
   * Cette épreuve postait `{ type: 'EndTurn' }` directement au service. Elle
   * était verte, et elle l'était honnêtement : c'est le serveur qu'elle
   * vérifiait, et le serveur allait bien. Mais elle a laissé passer un défaut
   * qui rendait le jeu injouable — `EndTurn` n'était émise par AUCUN chemin de
   * l'interface. Pas de bouton, pas de raccourci, rien dans la barre de pouce.
   * Un cousin ne pouvait pas rendre la main, donc la partie ne dépassait pas
   * le tour du premier.
   *
   * On clique donc le bouton. Si la commande cesse un jour d'être branchée, ce
   * sont ces lignes qui rougissent.
   */
  console.log('▸ le joueur actif rend la main EN CLIQUANT le bouton');
  const avant = await (await fetch(`${base}/api/parties/${code}/pouls`)).json();

  await a.page.getByRole('button', { name: /Entrer dans la partie/i }).click();
  /* La carte reconstruit l'atlas : sans GPU, il lui faut son temps. */
  const bouton = a.page.getByRole('button', { name: /^Fin du tour$/i });
  let cliquable = true;
  try {
    await bouton.waitFor({ state: 'visible', timeout: 90_000 });
  } catch {
    cliquable = false;
  }
  exige(cliquable, 'la carte offre un bouton « Fin du tour »');
  if (cliquable) {
    await bouton.click();
    /* Des héros ont encore de la marche au premier jour : HMM3 fait confirmer,
       et nous aussi. La confirmation peut donc apparaître — ou non, si tout le
       monde a fini. Les deux cas sont légitimes. */
    const confirmer = a.page.getByRole('button', { name: /Rendre la main/i });
    if (await confirmer.isVisible().catch(() => false)) await confirmer.click();
  }

  console.log('▸ le serveur et l’autre navigateur constatent le changement');
  /* Le relais part sans être attendu (`dispatch` est synchrone par contrat) :
     on laisse au coup le temps d'arriver plutôt que de mesurer trop tôt. */
  let apres = avant;
  for (let essai = 0; essai < 20 && apres.seq === avant.seq; essai += 1) {
    await a.page.waitForTimeout(500);
    apres = await (await fetch(`${base}/api/parties/${code}/pouls`)).json();
  }
  await b.page.waitForTimeout(3000);
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
