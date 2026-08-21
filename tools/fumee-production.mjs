#!/usr/bin/env node
/**
 * Épreuve de fumée du site DÉPLOYÉ — une vraie partie, jouée par l'API.
 *
 * **Ce qu'elle prouve, et ce qu'elle ne prouve pas.** Les épreuves de bout en
 * bout pilotent un navigateur ; depuis ce conteneur, Chromium ne joint pas
 * l'internet public — mesuré, `net::ERR_CONNECTION_RESET` avec le mandataire,
 * sans le mandataire et avec `--proxy-server`, et le mandataire n'enregistre
 * aucune tentative. La preuve par le navigateur reste donc faite sur le paquet
 * LOCAL, construit depuis la même révision que celle qui sert en ligne.
 *
 * Ce que celle-ci ajoute, et que rien d'autre ne couvre : le serveur déployé,
 * sa base, sa politique de sécurité et ses fichiers, éprouvés à distance sur
 * une partie qui court vraiment — création, deux bannières, lancement, un coup
 * joué, l'ordinateur qui répond, et la partie retrouvée après coup.
 *
 *   node tools/fumee-production.mjs [url]
 */
import { monterPartie, poster } from './partie-en-ligne.mjs';

const base = process.argv[2] ?? 'https://auvergne-web-production.up.railway.app';

const dit = (ok, texte) => console.log(`  ${ok ? '✓' : '✗'} ${texte}`);
let echecs = 0;
const exige = (condition, texte) => {
  dit(condition, texte);
  if (!condition) echecs += 1;
};

/** Récupère une adresse et rend `{ statut, type, octets }`. */
async function tete(chemin) {
  try {
    const r = await fetch(`${base}${chemin}`);
    const corps = await r.arrayBuffer();
    return { statut: r.status, type: r.headers.get('content-type') ?? '', octets: corps.byteLength };
  } catch (e) {
    return { statut: 0, type: String(e).slice(0, 60), octets: 0 };
  }
}

console.log(`▸ site éprouvé : ${base}`);

/* ── 1. La révision servie ────────────────────────────────────────────────── */
const sante = await (await fetch(`${base}/health`)).json();
exige(sante.ok === true, `le service répond (base ${String(sante.base)})`);
exige(typeof sante.commit === 'string' && sante.commit.length === 40, `révision servie : ${String(sante.commit).slice(0, 12)}`);

/* ── 2. Les fichiers que le navigateur réclamera ─────────────────────────── */
const page = await tete('/');
exige(page.statut === 200 && page.type.includes('html'), `la page se sert (${page.statut}, ${page.octets} octets)`);

const manifeste = await fetch(`${base}/img/manifeste.json`).then((r) => r.json()).catch(() => null);
exige(
  manifeste !== null && Array.isArray(manifeste.entrees) && manifeste.entrees.length > 100,
  `le manifeste des images est servi (${manifeste?.entrees?.length ?? 0} entrées)`,
);

/*
 * Trois images tirées du manifeste réel, et non écrites en dur : une entrée
 * codée en dur finirait par désigner un fichier renommé, et l'épreuve
 * annoncerait une panne qui n'existe pas — ou pire, passerait sur un manifeste
 * vidé.
 */
if (manifeste) {
  const echantillon = [0, Math.floor(manifeste.entrees.length / 2), manifeste.entrees.length - 1];
  for (const i of echantillon) {
    const e = manifeste.entrees[i];
    const r = await tete(`/img/${e.fichier}`);
    exige(r.statut === 200 && r.octets > 0, `image servie : ${e.clef} (${r.octets} octets)`);
  }
}

/* ── 3. Une vraie partie, du salon au coup joué ──────────────────────────── */
console.log('▸ une partie à deux bannières, dont une confiée à l’ordinateur');
let partie = null;
try {
  partie = await monterPartie(base, { deuxiemeBanniere: 'ia' });
} catch (e) {
  exige(false, `montage du salon : ${String(e).slice(0, 120)}`);
}

if (partie) {
  const { code, jetonActif, jarActif } = partie;
  exige(true, `partie créée et lancée : ${code}`);

  const avant = await (await fetch(`${base}/api/parties/${code}/pouls`)).json();
  const coup = await poster(
    base,
    `/api/parties/${code}/commande`,
    { commande: { type: 'EndTurn' }, cleIdempotence: `fumee-production-${code}-1`, seqAttendu: avant.seq },
    jetonActif,
    jarActif,
  );
  exige(coup.statut === 200, `le coup est accepté par le serveur déployé (${coup.statut})`);

  const apres = await (await fetch(`${base}/api/parties/${code}/pouls`)).json();
  exige(apres.seq > avant.seq, `la séquence a avancé : ${avant.seq} → ${apres.seq}`);
  /* Conditionnée à l'avancée de la séquence : sans cela, une partie qui ne
     bouge pas du tout rend « la main est revenue » VRAI par immobilité, et
     c'est ce qu'a fait la première version de cette ligne. */
  exige(
    apres.seq > avant.seq && apres.activePlayer === avant.activePlayer,
    `l’ordinateur a joué son tour et la main est revenue à ${String(apres.activePlayer)}`,
  );

  /* La partie doit se retrouver : c'est la promesse du jeu asynchrone, et
     c'est elle qui était rompue quand une reprise n'essayait que le local. */
  const relu = await fetch(`${base}/api/parties/${code}/etat`, {
    headers: { 'x-jeton-joueur': jetonActif },
  });
  exige(relu.status === 200, `la partie se retrouve avec son jeton (${relu.status})`);
}

console.log(
  echecs === 0
    ? '\n▸ site déployé : tout est vert.'
    : `\n▸ ${echecs} vérification(s) en échec sur le site déployé.`,
);
process.exit(echecs === 0 ? 0 : 1);
