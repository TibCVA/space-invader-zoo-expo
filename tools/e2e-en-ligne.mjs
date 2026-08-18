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

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const PORT = Number(process.env.SHOT_PORT ?? 4243);
const base = `http://127.0.0.1:${PORT}`;
const CLEF_JETONS = 'auvergne.parties.jetons.v1';

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

/**
 * Bocal à témoins minimal. Sans lui, chaque `fetch` de Node est un navigateur
 * neuf : l'hôte qui crée la partie n'est plus reconnu comme hôte au moment de
 * la lancer, et le service a raison de refuser.
 */
function bocal() {
  const temoins = new Map();
  return {
    entete() {
      return temoins.size === 0
        ? {}
        : { cookie: [...temoins].map(([k, v]) => `${k}=${v}`).join('; ') };
    },
    absorber(reponse) {
      for (const brut of reponse.headers.getSetCookie?.() ?? []) {
        const [paire] = brut.split(';');
        const i = paire.indexOf('=');
        if (i > 0) temoins.set(paire.slice(0, i).trim(), paire.slice(i + 1).trim());
      }
    },
  };
}

const poster = async (chemin, corps, jeton, jar) => {
  const r = await fetch(`${base}${chemin}`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(jeton ? { 'x-jeton-joueur': jeton } : {}),
      ...(jar ? jar.entete() : {}),
    },
    body: JSON.stringify(corps ?? {}),
  });
  jar?.absorber(r);
  return { statut: r.status, corps: await r.json().catch(() => null) };
};

const serveur = spawn('node', ['apps/server/dist/server.js'], {
  cwd: ROOT, stdio: 'ignore', detached: true,
  env: { ...process.env, PORT: String(PORT), AUVERGNE_STORAGE: 'memory' },
});
let navigateur;

try {
  await attendre(`${base}/api/parties/mes-parties`);

  console.log('▸ montage du salon par l’API');
  const hote = bocal();
  const cousin = bocal();
  const creation = await poster('/api/parties', { bannieres: 2, duree: 'eclair', victoire: 'couronne' }, null, hote);
  const code = creation.corps.code;
  exige(typeof code === 'string' && code.length > 5, `partie créée : ${code}`);

  const p1 = await poster(`/api/parties/${code}/rejoindre`,
    { slot: 'P1', nom: 'Thibaut', faction: 'granit', heros: 'thibaut', depart: 'arconsat' },
    creation.corps.jeton, hote);
  const p2 = await poster(`/api/parties/${code}/rejoindre`,
    { slot: 'P2', nom: 'Jean', faction: 'ermitage', heros: 'agathe', depart: 'renaudie' },
    null, cousin);
  /* `rejoindre` crée une ressource : 201, et non 200. */
  exige(p1.statut === 201 && p2.statut === 201, `les deux bannières sont prises (${p1.statut}, ${p2.statut})`);

  const lancement = await poster(`/api/parties/${code}/lancer`, {}, p1.corps.jeton, hote);
  exige(
    lancement.statut === 200 && lancement.corps.statut === 'en_cours',
    `la partie est lancée (${lancement.statut} · ${lancement.corps?.statut ?? lancement.corps?.erreur ?? '?'})`,
  );
  const actif = lancement.corps.activePlayer;
  const jetonActif = actif === 'P1' ? p1.corps.jeton : p2.corps.jeton;
  const jetonAutre = actif === 'P1' ? p2.corps.jeton : p1.corps.jeton;

  navigateur = await chromium.launch({ args: ['--no-sandbox', '--disable-dev-shm-usage'] });

  /** Ouvre un navigateur muni d'un jeton, et entre dans la partie. */
  const ouvrir = async (jeton, nom) => {
    const ctx = await navigateur.newContext({ viewport: { width: 1400, height: 900 }, locale: 'fr-FR' });
    const page = await ctx.newPage();
    const erreurs = [];
    page.on('console', (m) => { if (m.type() === 'error') erreurs.push(m.text().slice(0, 240)); });
    page.on('pageerror', (e) => erreurs.push(String(e).slice(0, 240)));
    await page.goto(`${base}/`, { waitUntil: 'load' });
    await page.evaluate(([clef, c, j]) => {
      localStorage.setItem(clef, JSON.stringify({ [c]: j }));
    }, [CLEF_JETONS, code, jeton]);
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
