/**
 * Montage d'une VRAIE partie en ligne, par l'API du serveur.
 *
 * Pourquoi ce fichier existe. Le harnais de capture ne visitait que `#/demo/*`,
 * où le cadrage est correct par définition et où il n'y a pas de brouillard.
 * Le défaut que le propriétaire a vu en production — « la carte n'affiche rien
 * à l'écran » — ne vivait que dans une partie EN LIGNE : cadrage posé sur un
 * territoire jamais exploré, et reprise qui n'essayait que la sauvegarde
 * locale, que le mode en ligne n'a pas. Deux défauts visibles en trente
 * secondes dans un navigateur, invisibles à un harnais qui ne va pas là.
 *
 * Le montage était écrit à la main dans `e2e-en-ligne.mjs`. Deux copies d'un
 * même parcours dérivent : celle qui sert aux captures aurait fini par monter
 * une partie que le service n'accepte plus, et la capture aurait montré un
 * écran de salon en croyant montrer une carte. Une seule définition, donc.
 */

/**
 * Bocal à témoins minimal.
 *
 * Sans lui, chaque `fetch` de Node est un navigateur neuf : l'hôte qui crée la
 * partie n'est plus reconnu comme hôte au moment de la lancer, et le service a
 * raison de refuser.
 */
export function bocal() {
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

/** POST JSON muni, au besoin, d'un jeton de joueur et d'un bocal à témoins. */
export async function poster(base, chemin, corps, jeton, jar) {
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
}

/** Clef du trousseau de jetons dans le `localStorage` du client. */
export const CLEF_JETONS = 'auvergne.parties.jetons.v1';

/**
 * Monte une partie à deux bannières et la lance. Rend de quoi ouvrir un
 * navigateur du côté de l'un ou l'autre cousin.
 *
 * Jette si une étape échoue : un montage à moitié fait produirait des captures
 * d'écran de salon qu'on prendrait pour des captures de jeu.
 */
export async function monterPartie(base, options = {}) {
  const hote = bocal();
  const cousin = bocal();

  const creation = await poster(
    base,
    '/api/parties',
    { bannieres: 2, duree: options.duree ?? 'eclair', victoire: options.victoire ?? 'couronne' },
    null,
    hote,
  );
  const code = creation.corps?.code;
  if (typeof code !== 'string' || code.length < 5) {
    throw new Error(`création refusée (${String(creation.statut)}) : ${JSON.stringify(creation.corps)}`);
  }

  const p1 = await poster(
    base,
    `/api/parties/${code}/rejoindre`,
    { slot: 'P1', nom: 'Thibaut', faction: 'granit', heros: 'thibaut', depart: 'arconsat' },
    creation.corps.jeton,
    hote,
  );
  /*
   * La seconde bannière est prise par un cousin, ou confiée à l'ordinateur.
   *
   * Le second cas n'est pas un détail d'épreuve : c'est la façon dont on joue
   * contre l'IA en ligne, et c'est le serveur qui déroule ces tours-là
   * (`deroulerIa`). Sans une épreuve qui l'emprunte, ce chemin ne serait
   * vérifié nulle part — et l'on sait maintenant ce que coûte un chemin de jeu
   * que personne ne parcourt.
   */
  let p2 = { statut: 201, corps: { jeton: null } };
  if (options.deuxiemeBanniere === 'ia') {
    const ia = await poster(
      base,
      `/api/parties/${code}/ia`,
      { slot: 'P2', action: 'confier', profil: options.profilIa ?? 'equilibre' },
      p1.corps.jeton,
      hote,
    );
    if (ia.statut !== 200) {
      throw new Error(`bannière d'IA refusée (${String(ia.statut)}) : ${JSON.stringify(ia.corps)}`);
    }
  } else {
    p2 = await poster(
      base,
      `/api/parties/${code}/rejoindre`,
      { slot: 'P2', nom: 'Jean', faction: 'ermitage', heros: 'agathe', depart: 'renaudie' },
      null,
      cousin,
    );
  }
  /* `rejoindre` crée une ressource : 201, et non 200. */
  if (p1.statut !== 201 || p2.statut !== 201) {
    throw new Error(`bannières refusées (${String(p1.statut)}, ${String(p2.statut)})`);
  }

  const lancement = await poster(base, `/api/parties/${code}/lancer`, {}, p1.corps.jeton, hote);
  if (lancement.statut !== 200 || lancement.corps?.statut !== 'en_cours') {
    throw new Error(
      `lancement refusé (${String(lancement.statut)}) : ${String(lancement.corps?.erreur ?? lancement.corps?.statut)}`,
    );
  }

  const actif = lancement.corps.activePlayer;
  return {
    code,
    actif,
    hote,
    cousin,
    jetons: { P1: p1.corps.jeton, P2: p2.corps.jeton },
    /** Jeton du joueur qui a la main — celui dont l'écran montre la carte jouable. */
    jetonActif: actif === 'P1' ? p1.corps.jeton : p2.corps.jeton,
    jetonAutre: actif === 'P1' ? p2.corps.jeton : p1.corps.jeton,
    /** Bocal du joueur qui a la main, pour poster un coup en son nom. */
    jarActif: actif === 'P1' ? hote : cousin,
  };
}

/**
 * Dépose le jeton dans le `localStorage` d'un contexte de navigateur.
 *
 * Il faut être sur l'origine du serveur pour écrire son stockage local : on
 * charge donc la racine avant. C'est exactement ce que fait un cousin qui
 * ouvre le lien reçu.
 */
export async function munirDuJeton(page, base, code, jeton) {
  await page.goto(`${base}/`, { waitUntil: 'load' });
  await page.evaluate(
    ([clef, c, j]) => {
      localStorage.setItem(clef, JSON.stringify({ [c]: j }));
    },
    [CLEF_JETONS, code, jeton],
  );
}
