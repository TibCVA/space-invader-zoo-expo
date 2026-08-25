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
import { spawn } from 'node:child_process';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { portLibre } from './port-libre.mjs';
import { lancerNavigateur } from './navigateur.mjs';

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

/**
 * Le nombre d'écus lu dans la barre du trésor du bandeau.
 *
 * On lit l'ÉCRAN et non l'état interne : c'est le nombre que le propriétaire
 * regarde, et c'est lui qui doit bouger quand il paie. L'espace fine
 * insécable qui sépare les milliers est retirée avant conversion.
 */
async function lireOr(page) {
  const brut = await page
    .locator('.jeu-bandeau__tresor .hmm-ressource__valeur')
    .first()
    .innerText()
    .catch(() => null);
  if (brut === null) return null;
  const n = Number(brut.replace(/[^\d-]/g, ''));
  return Number.isFinite(n) ? n : null;
}

/** Les deux appareils sur lesquels les cousins jouent. */
const APPAREILS = [
  { nom: 'ordinateur', viewport: { width: 1440, height: 900 }, mobile: false },
  { nom: 'iPhone', viewport: { width: 390, height: 844 }, mobile: true, dpr: 3 },
];

try {
  await attendre(distant ? `${base}/health` : `${base}/api/parties/mes-parties`);
  navigateur = await lancerNavigateur(Boolean(distant));

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
    /*
     * LE SIGNAL D'OUVERTURE EST LA LÉGENDE DE LA SCÈNE, PAS LE BOUTON.
     *
     * « Fin du tour » vit désormais à la RACINE de l'application, hors de la
     * scène Pixi, pour exister aussi dans la cité. Il apparaît donc AVANT que
     * la carte ne soit peinte, et l'attendre faisait mesurer trop tôt : la
     * légende n'était pas encore dans le document et l'épreuve lisait un
     * calendrier vide. La légende, elle, n'est rendue que lorsque la scène est
     * prête (`scene.tsx` : `prete && legende`).
     */
    let arrive = true;
    try {
      await page.locator('.jeu-scene__legende').waitFor({ state: 'visible', timeout: 240_000 });
    } catch {
      arrive = false;
    }
    exige(arrive, 'la carte s’ouvre');
    const finDuTour = page.getByRole('button', { name: /^Fin du tour$/i });
    exige(await finDuTour.isVisible().catch(() => false), 'elle offre « Fin du tour »');

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

    /*
     * BÂTIR ET RECRUTER — le reste de la boucle de HMM3.
     *
     * Le client n'émettait ni `BuildInTown` ni `RecruitCreatures` : on pouvait
     * marcher, se battre et rendre la main, mais rien faire grandir. Des tests
     * de logique pure ne prouvent PAS qu'un bouton est branché — c'est
     * exactement la leçon de la fin de tour, dont les gardes unitaires étaient
     * vertes alors qu'aucun chemin de l'interface n'émettait la commande. On
     * clique donc, et on exige que le trésor bouge.
     */
    console.log('   — la cité : bâtir');
    const alerteCite = page.getByRole('button', { name: /^Cité$/i });
    let cite = true;
    try {
      await alerteCite.waitFor({ state: 'visible', timeout: 20_000 });
      await alerteCite.click();
      /* Le panneau liste les places tenues : on entre dans la première. */
      await page.locator('.royaume__vignette').first().click({ timeout: 20_000 });
      await page.getByRole('button', { name: /Bâtir et recruter/i }).click({ timeout: 180_000 });
    } catch (e) {
      cite = false;
      await page.screenshot({ path: `shots/echec-cite-${appareil.nom}.png` }).catch(() => {});
      console.log('      ', String(e).split('\n')[0].slice(0, 160));
    }
    exige(cite, 'on atteint sa cité et on ouvre ses commandes');

    if (cite) {
      const orAvant = await lireOr(page);
      /* Le Marché, et pas « le premier abordable » : la cité n'a droit qu'à
         UNE construction par jour (règle du moteur, vue en capture d'échec —
         tous les boutons grisés « Une seule construction par cité et par
         jour »), et c'est le comptoir du Marché que l'épreuve doit ouvrir
         deux pas plus loin. */
      const batir = page
        .locator('.cite-cmd__ligne', { hasText: 'Marché' })
        .locator('button:not([disabled])')
        .first();
      let bati = true;
      try {
        await batir.waitFor({ state: 'visible', timeout: 20_000 });
        await batir.click();
        await page.waitForTimeout(1500);
      } catch (e) {
        bati = false;
        await page.screenshot({ path: `shots/echec-batir-${appareil.nom}.png` }).catch(() => {});
        console.log('      ', String(e).split('\n')[0].slice(0, 160));
      }
      exige(bati, 'un bâtiment au moins est finançable et son bouton répond');
      const orApres = await lireOr(page);
      exige(
        bati && orApres !== null && orAvant !== null && orApres < orAvant,
        `le trésor a payé la construction : ${String(orAvant)} → ${String(orApres)} écus`,
      );

      console.log('   — la cité : recruter');
      let recrute = true;
      let avantRecrue = null;
      try {
        await page.getByRole('button', { name: /^Recruter$/i }).first().click({ timeout: 20_000 });
        await page.waitForTimeout(600);
        avantRecrue = await lireOr(page);
        const recruter = page.locator('.cite-cmd__ligne button:not([disabled])').first();
        await recruter.waitFor({ state: 'visible', timeout: 20_000 });
        await recruter.click();
        await page.waitForTimeout(1500);
      } catch (e) {
        recrute = false;
        await page.screenshot({ path: `shots/echec-recrue-${appareil.nom}.png` }).catch(() => {});
        console.log('      ', String(e).split('\n')[0].slice(0, 160));
      }
      const apresRecrue = await lireOr(page);
      exige(
        recrute && apresRecrue !== null && avantRecrue !== null && apresRecrue < avantRecrue,
        `le trésor a payé les recrues : ${String(avantRecrue)} → ${String(apresRecrue)} écus`,
      );

      /*
       * ON DOIT VOIR CE QU'ON RECRUTE, ET D'OÙ ÇA VIENT.
       *
       * Plainte du propriétaire : « ce n'est pas clair quelle créature (pas
       * d'image) on recrute ni où elles sont ». La ligne de recrutement
       * n'avait qu'un nom et un prix.
       *
       * L'image n'est PAS un fichier du manifeste — il n'y a aucune peinture
       * de créature —, c'est la bête de l'atlas, extraite du rendu partagé au
       * vol. Elle ne peut donc être prouvée QUE dans un vrai navigateur : le
       * test unitaire de `vignetteCreature` passerait tout aussi bien si le
       * rendu ne rendait rien. On exige ici une image réellement décodée par
       * le navigateur, largeur naturelle non nulle — un `src` présent mais
       * vide donnerait un cadre vide sans rien casser, et c'est exactement ce
       * qu'une première capture avait laissé croire.
       */
      const vignette = page.locator('.cite-cmd__vignette img').first();
      let peinte = false;
      try {
        await vignette.waitFor({ state: 'attached', timeout: 30_000 });
        peinte = await vignette.evaluate(
          (n) => n instanceof HTMLImageElement && n.complete && n.naturalWidth > 8,
        );
      } catch { /* pas d'image du tout */ }
      exige(peinte, 'la ligne de recrutement montre la créature elle-même');

      const demeures = await page.locator('.cite-cmd__demeure').count();
      exige(demeures > 0, `chaque recrue dit de quelle demeure elle sort (${demeures})`);

      /*
       * LE MARCHÉ — TradeResources, orpheline jusqu'ici.
       *
       * Le comptoir vit dans un onglet qui n'existe que si le bâtiment est
       * levé. On le lève DEPUIS l'onglet Bâtir (700 écus, 6 bois : toujours
       * abordable au premier jour), puis on cède du bois contre des écus et
       * on exige que les écus MONTENT — un échange qui ne change pas le
       * trésor n'est pas un échange.
       */
      console.log('   — la cité : le marché');
      let marchande = true;
      let ecusApresMarche = null;
      try {
        await page.getByRole('button', { name: /^Marché$/i }).first().click({ timeout: 20_000 });
        const avantEcus = await lireOr(page);
        await page.getByRole('button', { name: /Conclure l’échange/i }).click({ timeout: 20_000 });
        await page.waitForTimeout(1200);
        ecusApresMarche = await lireOr(page);
        marchande = avantEcus !== null && ecusApresMarche !== null && ecusApresMarche > avantEcus;
      } catch (e) {
        marchande = false;
        await page.screenshot({ path: `shots/echec-marche-${appareil.nom}.png` }).catch(() => {});
        console.log('      ', String(e).split('\n')[0].slice(0, 160));
      }
      exige(marchande, 'le marché change du bois en écus, et les écus montent');

      /*
       * L'AUBERGE — HireHero, orpheline jusqu'ici.
       *
       * La cité de départ naît avec son auberge : l'onglet est là dès le
       * premier jour. Engager le premier capitaine doit coûter exactement
       * 2500 écus — le prix annoncé est le prix payé.
       */
      console.log('   — la cité : l’auberge');
      let engage = true;
      try {
        await page.getByRole('button', { name: /^Auberge$/i }).first().click({ timeout: 20_000 });
        const avantEcus = await lireOr(page);
        await page.getByRole('button', { name: /^Engager$/i }).first().click({ timeout: 20_000 });
        await page.waitForTimeout(1500);
        const apresEcus = await lireOr(page);
        engage = avantEcus !== null && apresEcus !== null && avantEcus - apresEcus === 2500;
        if (!engage) console.log(`       écus : ${String(avantEcus)} → ${String(apresEcus)}`);
      } catch (e) {
        engage = false;
        await page.screenshot({ path: `shots/echec-auberge-${appareil.nom}.png` }).catch(() => {});
        console.log('      ', String(e).split('\n')[0].slice(0, 160));
      }
      exige(engage, 'l’auberge engage un capitaine pour 2500 écus exactement');

      /*
       * ET ON DOIT POUVOIR RESSORTIR.
       *
       * « la navigation entre bâtiments et sortie et recrutement est pas
       * fluide ». On revient donc à la carte par le bouton de sortie, et l'on
       * exige que la carte soit bien là — un panneau qui se ferme sur une
       * page morte n'est pas une sortie.
       */
      let sortie = true;
      try {
        await page.getByRole('button', { name: /Quitter la cité/i }).first()
          .click({ timeout: 20_000 });
        await page.locator('.jeu-scene__legende').waitFor({ state: 'visible', timeout: 90_000 });
      } catch (e) {
        sortie = false;
        await page.screenshot({ path: `shots/echec-sortie-${appareil.nom}.png` }).catch(() => {});
        console.log('      ', String(e).split('\n')[0].slice(0, 160));
      }
      exige(sortie, 'la porte de la cité ramène à la carte');

      /*
       * LE HÉROS SUIVANT — il n'existe qu'à partir de deux héros, et
       * l'auberge vient d'engager le second : le bouton doit être là, et le
       * geste doit laisser la carte vivante. C'est la seule épreuve possible
       * au premier jour ; le centrage caméra, lui, se voit à l'œil.
       */
      let suivant = true;
      try {
        const bouton = page.getByRole('button', { name: /Héros suivant/i });
        await bouton.waitFor({ state: 'visible', timeout: 20_000 });
        await bouton.click();
        await page.waitForTimeout(900);
        await bouton.click();
        await page.waitForTimeout(900);
        suivant = await page.locator('.jeu-scene__legende').isVisible();
      } catch (e) {
        suivant = false;
        await page.screenshot({ path: `shots/echec-suivant-${appareil.nom}.png` }).catch(() => {});
        console.log('      ', String(e).split('\n')[0].slice(0, 160));
      }
      exige(suivant, 'deux héros : « Héros suivant » existe et cycle sans casser la carte');
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
