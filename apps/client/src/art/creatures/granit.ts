/**
 * Les quatorze formes de la Châtellenie de Granit.
 *
 * Palette de faction : grenat `#6E1F2A`, or ancien `#C9A227`, ardoise `#414A52`,
 * ivoire `#EDE3CE`, brun de chêne `#5A4128`, ocre `#C08A3E`.
 *
 * Règle de silhouette : à 64 px, chaque forme doit se reconnaître en noir.
 *   Manant        — chapeau de paille très large, fourche en diagonale, haillons
 *   Franc-Serf    — pique haute inclinée, chapel de fer, baudrier croisé
 *   Gabelou       — cape courte, bâton en diagonale, mesure de laiton au ceint
 *   Prévôt du Sel — manteau évasé bordé d'or, bourdon en travers, clefs
 *   Arbalétrier   — arbalète ÉPAULÉE, barre horizontale à hauteur d'œil
 *   Maître-Arb.   — même geste, arc plus large, cranequin, ourlet galonné
 *   Grenadière    — jupe en cloche, cercle à broder devant, panneau de grenade
 *   Dame au Fil   — grande bannière à la grenade d'or, robe à traîne
 *   Sanglier      — masse horizontale basse, groin et défenses
 *   Verrat        — même masse, chanfrein ferré et dossière à pointes
 *   Chevalier     — cheval + lance couchée, écu chargé, heaume à plumail
 *   Banneret      — cheval + grande bannière verticale, plumail plus haut
 *   Griffon       — arc d'ailes déployées, bec crochu
 *   Griffon Cour. — ailes plus larges, collier d'or, crête blanche
 *
 * ─── La loi du corps humain (voir `squeletteBipede`) ─────────────────────────
 *
 * Les dix humains de la faction partagent quatre règles, et elles ne se
 * négocient pas créature par créature : la coiffe ne descend jamais sous −0,72
 * rayon de tête au droit du visage ; le bras est peint en deux tronçons, manche
 * puis peau ; la jambe est peinte en deux tronçons, pieds écartés ; et le tronc
 * porte toujours une basque, déchirée chez la piétaille, galonnée chez les
 * officiers. Un humain sans ces quatre choses rend « un chapeau, un tronc, deux
 * jambes fines », et c'est le défaut nommé par le propriétaire.
 */
import type { Graphics } from 'pixi.js';
import { LIGHT, assombrir, eclaircir, melanger, ombreBleutee } from '../palette.js';
import type { Poly } from '../shading.js';
import {
  arcBande,
  blob,
  contourVariable,
  densifier,
  flat,
  fuseau,
  lisser,
  perturber,
  pt,
} from '../shading.js';
import { clip, p } from '../rig.js';
import type { Fabrique, Kit, PieceDef } from './archetypes.js';
import {
  TEINTS,
  banniereTissu,
  cicatrice,
  clipCapacite,
  clipsBipede,
  clipsMonture,
  clipsQuadrupede,
  clipsVolant,
  corne,
  creatureRig,
  criniereMeches,
  ecu,
  fer,
  ferrure,
  hampe,
  main,
  membre,
  oreilleAnimale,
  orfevrerie,
  pied,
  pointeLance,
  poser,
  queue as dessinerQueue,
  rayonTete,
  sous,
  squeletteBipede,
  squeletteQuadrupede,
  squeletteVolant,
} from './archetypes.js';



const ARDOISE = 0x414a52;
const ACIER = 0x7d868f;
const CHENE = 0x5a4128;
const IVOIRE = 0xede3ce;

/* ───────────────────────── Coiffes de la Châtellenie ────────────────────── */

/**
 * Les coiffes se portent SUR le crâne, pas devant la figure.
 *
 * **Ce que le réglage précédent coûtait.** Les cinq coiffes de la Châtellenie
 * posaient leur bord entre −0,9 et +0,06 rayon — exactement la bande où vivent
 * les yeux (−0,2), les sourcils (−0,56) et le nez (+0,24). Le bord passait donc
 * devant la figure et l'effaçait : sur la planche de contact, les dix humains de
 * la Châtellenie étaient dix ovales de chair vides, et les deux arbalétriers
 * étaient impossibles à distinguer l'un de l'autre autrement que par la plume.
 * Les rendus de référence montrent tous l'inverse — chapel de fer et chapeau
 * ciré s'arrêtent à la hauteur du sourcil, et la figure entière est dessous.
 *
 * La règle tenue par les quatre fonctions qui suivent : **rien du couvre-chef ne
 * descend au-dessous de −0,70 rayon au droit du visage**, la calotte occupe le
 * dessus (−1,2 à −2,2), et les ailes du bord peuvent retomber tant qu'elles le
 * font au-delà de ±1,1 rayon, là où il n'y a plus de joue.
 */
const BORD_MINIMAL = -0.72;

function chapeauPaille(g: Graphics, k: Kit, r: number, seed: number): void {
  const paille = 0xc9a86a;
  /* Le bord : il monte de la pointe gauche retombante au sommet, puis
     redescend ; le retour longe l'intérieur juste au-dessus du front. */
  const bord: Poly = lisser(
    perturber(
      densifier(
        [
          pt(-r * 2.32, -r * 0.86),
          pt(-r * 1.12, -r * 1.46),
          pt(0, -r * 1.6),
          pt(r * 1.18, -r * 1.42),
          pt(r * 2.36, -r * 0.8),
          pt(r * 1.5, -r * 0.96),
          pt(0, r * BORD_MINIMAL),
          pt(-r * 1.55, -r * 0.98),
        ],
        r * 0.42,
      ),
      r * 0.05,
      seed + 3,
    ),
    1,
  );
  poser(g, k, bord, { couleur: paille, matiere: 'tissu', matiereAlpha: 0.3, echelle: 0.35, seed });
  const calotte = lisser(
    perturber(
      densifier([pt(-r * 0.95, -r * 1.28), pt(-r * 0.5, -r * 2.08), pt(r * 0.34, -r * 2.16), pt(r * 0.95, -r * 1.34)], r * 0.3),
      r * 0.04,
      seed + 7,
    ),
    1,
  );
  poser(g, k, calotte, {
    couleur: eclaircir(paille, 0.12),
    matiere: 'tissu',
    matiereAlpha: 0.3,
    echelle: 0.35,
    seed: seed + 1,
  });
  // brins de paille tressée, du sommet vers les ailes
  for (let i = 0; i < 5; i += 1) {
    const t = -2.2 + i * 0.42;
    g.moveTo(Math.cos(t) * r * 0.9, -r * 1.44 + Math.sin(t) * r * 0.2);
    g.quadraticCurveTo(Math.cos(t) * r * 1.6, -r * 1.28, Math.cos(t) * r * 2.08, -r * 0.86);
    g.stroke({ color: ombreBleutee(paille, 0.5), width: r * 0.06, alpha: 0.4 });
  }
  // ombre portée du bord sur le front : c'est elle qui fait tenir le chapeau
  g.moveTo(-r * 0.86, -r * 0.84);
  g.quadraticCurveTo(0, r * (BORD_MINIMAL + 0.06), r * 0.86, -r * 0.8);
  g.stroke({ color: ombreBleutee(paille, 1), width: r * 0.22, alpha: 0.5, cap: 'round' });
}

/** Chapel de fer : calotte bombée et bord rabattu, riveté. */
function chapelDeFer(g: Graphics, k: Kit, r: number, seed: number, dore = false): void {
  const bord = lisser(
    perturber(
      densifier(
        [pt(-r * 1.66, -r * 1.02), pt(0, -r * 1.34), pt(r * 1.68, -r * 0.96), pt(r * 1.24, -r * 0.76), pt(0, r * BORD_MINIMAL), pt(-r * 1.28, -r * 0.78)],
        r * 0.34,
      ),
      r * 0.03,
      seed + 2,
    ),
    1,
  );
  const calotte = lisser(
    perturber(
      densifier([pt(-r * 1.04, -r * 1.14), pt(-r * 0.64, -r * 1.96), pt(0, -r * 2.18), pt(r * 0.68, -r * 1.94), pt(r * 1.06, -r * 1.12)], r * 0.28),
      r * 0.025,
      seed + 4,
    ),
    1,
  );
  poser(g, k, calotte, {
    couleur: ACIER,
    matiere: 'metal',
    matiereAlpha: 0.24,
    echelle: 0.4,
    speculaire: { x: 0.3, y: 0.2, r: 0.11 },
    seed,
  });
  poser(g, k, bord, {
    couleur: assombrir(ACIER, 0.15),
    matiere: 'metal',
    matiereAlpha: 0.24,
    echelle: 0.4,
    speculaire: { x: 0.24, y: 0.3, r: 0.07 },
    seed: seed + 1,
  });
  // nervure centrale
  g.moveTo(0, -r * 2.14);
  g.lineTo(0, -r * 1.16);
  g.stroke({ color: eclaircir(ACIER, 0.4), width: r * 0.08, alpha: 0.6, cap: 'round' });
  for (const dx of [-0.72, 0.7]) {
    g.poly(flat(blob(dx * r, -r * 1.3, r * 0.09, r * 0.09, { seed: 3, points: 8, wobble: 0.24 }))).fill({
      color: dore ? LIGHT.rim : eclaircir(ACIER, 0.3),
      alpha: 0.85,
    });
  }
  // ombre du bord sur le front, et le camail qui pend sur la nuque
  g.moveTo(-r * 0.9, -r * 0.82);
  g.quadraticCurveTo(0, r * (BORD_MINIMAL + 0.08), r * 0.9, -r * 0.78);
  g.stroke({ color: ombreBleutee(ACIER, 1), width: r * 0.2, alpha: 0.5, cap: 'round' });
  if (dore) {
    orfevrerie(g, [pt(-r * 1.56, -r * 0.98), pt(0, -r * 1.28), pt(r * 1.58, -r * 0.94)], { epaisseur: r * 0.11 });
  }
}

/** Chapeau ciré du gabelou : bord souple, cordon, cocarde de la gabelle. */
function chapeauCire(g: Graphics, k: Kit, r: number, seed: number, cocarde: number): void {
  const noirci = melanger(CHENE, 0x2a3242, 0.6);
  const bord = lisser(
    perturber(
      densifier(
        [pt(-r * 1.82, -r * 0.94), pt(-r * 0.82, -r * 1.42), pt(r * 0.92, -r * 1.34), pt(r * 1.86, -r * 0.82), pt(r * 0.92, -r * 0.76), pt(-r * 0.92, -r * 0.78)],
        r * 0.32,
      ),
      r * 0.045,
      seed + 5,
    ),
    1,
  );
  poser(g, k, bord, { couleur: noirci, matiere: 'grain', matiereAlpha: 0.2, seed });
  const calotte = lisser(
    perturber(
      densifier([pt(-r * 0.94, -r * 1.16), pt(-r * 0.8, -r * 2.06), pt(r * 0.52, -r * 2.14), pt(r * 0.96, -r * 1.18)], r * 0.28),
      r * 0.03,
      seed + 9,
    ),
    1,
  );
  poser(g, k, calotte, {
    couleur: eclaircir(noirci, 0.14),
    matiere: 'grain',
    matiereAlpha: 0.2,
    speculaire: { x: 0.28, y: 0.24, r: 0.09 },
    seed: seed + 2,
  });
  // cordon de la gabelle, sur la calotte et non sur le front
  g.moveTo(-r * 0.96, -r * 1.32);
  g.lineTo(r * 0.98, -r * 1.3);
  g.stroke({ color: 0x6e1f2a, width: r * 0.16, alpha: 0.85, cap: 'round' });
  g.poly(flat(blob(-r * 0.84, -r * 1.38, r * 0.2, r * 0.2, { seed: 7, points: 10, wobble: 0.26 }))).fill({
    color: cocarde,
    alpha: 0.95,
  });
  g.moveTo(-r * 0.86, -r * 0.86);
  g.quadraticCurveTo(0, r * (BORD_MINIMAL + 0.02), r * 0.86, -r * 0.82);
  g.stroke({ color: ombreBleutee(noirci, 1), width: r * 0.2, alpha: 0.52, cap: 'round' });
}

/**
 * Coiffe des brodeuses : un TOURON d'étoffe enroulé, pas un capuchon.
 *
 * Le rendu de référence de la Grenadière et de la Dame donne la même chose : une
 * bande de lin roulée autour du front, nouée sur le côté, galonnée d'or chez la
 * maîtresse — et la figure entière dessous, jusqu'au menton. L'ancienne coiffe
 * fermait l'ouverture à −0,42 rayon, donc au-dessus de l'œil mais SOUS le
 * sourcil : les deux brodeuses de la planche n'avaient plus de regard, seulement
 * un bonnet blanc. Le touron s'arrête ici à −0,78, et les deux rangs de
 * l'enroulement occupent le dessus du crâne, que la chevelure ne peut pas couvrir
 * (elle est peinte derrière).
 */
function coiffeLin(g: Graphics, k: Kit, r: number, seed: number, or = false): void {
  const forme = lisser(
    perturber(
      densifier(
        [
          pt(-r * 1.16, -r * 0.82),
          pt(-r * 1.06, -r * 1.5),
          pt(-r * 0.24, -r * 1.82),
          pt(r * 0.7, -r * 1.64),
          pt(r * 1.14, -r * 1.04),
          pt(r * 1.2, -r * 0.78),
          pt(r * 0.5, r * BORD_MINIMAL),
          pt(-r * 0.54, r * BORD_MINIMAL - r * 0.04),
        ],
        r * 0.34,
      ),
      r * 0.035,
      seed + 11,
    ),
    1,
  );
  poser(g, k, forme, { couleur: IVOIRE, matiere: 'tissu', matiereAlpha: 0.24, echelle: 0.5, seed });
  // le pan qui retombe sur l'épaule gauche : ce qui empêche le touron de lire rond
  const pan = lisser(
    perturber(
      densifier(
        [pt(-r * 1.08, -r * 1.02), pt(-r * 0.64, -r * 0.9), pt(-r * 0.78, r * 0.5), pt(-r * 1.34, r * 0.28)],
        r * 0.3,
      ),
      r * 0.035,
      seed + 15,
    ),
    1,
  );
  poser(g, k, pan, {
    couleur: assombrir(IVOIRE, 0.16),
    matiere: 'tissu',
    matiereAlpha: 0.24,
    echelle: 0.5,
    seed: seed + 3,
  });
  // les deux tours de l'enroulement, et le nœud sur la tempe droite
  for (let i = 0; i < 2; i += 1) {
    g.moveTo(-r * 1.0, -r * (1.0 + i * 0.34));
    g.quadraticCurveTo(0, -r * (1.28 + i * 0.4), r * 1.06, -r * (0.94 + i * 0.3));
    g.stroke({ color: ombreBleutee(IVOIRE, 0.6), width: r * 0.09, alpha: 0.5, cap: 'round' });
  }
  g.poly(flat(blob(r * 0.96, -r * 1.14, r * 0.24, r * 0.2, { seed: 9, points: 12, wobble: 0.24 }))).fill({
    color: eclaircir(IVOIRE, 0.1),
    alpha: 0.95,
  });
  if (or) {
    orfevrerie(g, [pt(-r * 1.06, -r * 0.94), pt(-r * 0.3, -r * 1.24), pt(r * 0.62, -r * 1.1), pt(r * 1.1, -r * 0.86)], {
      epaisseur: r * 0.14,
    });
    orfevrerie(g, [pt(-r * 1.0, -r * 1.44), pt(-r * 0.2, -r * 1.72), pt(r * 0.66, -r * 1.56)], {
      epaisseur: r * 0.1,
      alpha: 0.7,
    });
    g.poly(flat(blob(-r * 0.22, -r * 1.7, r * 0.16, r * 0.16, { seed: 5, points: 9, wobble: 0.24 }))).fill({
      color: LIGHT.rim,
      alpha: 0.95,
    });
  }
  // ombre du touron sur le front
  g.moveTo(-r * 0.82, -r * 0.86);
  g.quadraticCurveTo(0, r * (BORD_MINIMAL + 0.04), r * 0.82, -r * 0.84);
  g.stroke({ color: ombreBleutee(IVOIRE, 1), width: r * 0.18, alpha: 0.42, cap: 'round' });
}

/* ─────────────────────────── Armes de la faction ────────────────────────── */

/**
 * L'arbalète : un fût ÉPAIS et un arc d'acier large, ou elle n'existe pas.
 *
 * L'ancienne mesurait 0,1 L d'épaisseur de fût et son arc débordait de 0,12 L :
 * à l'écran, un bâtonnet et un accent circonflexe. Le rendu de référence donne
 * l'inverse — un bloc de bois massif, un arc qui fait presque toute la hauteur
 * du personnage, une corde tendue en V net. C'est une machine, elle doit peser.
 */
function arbalete(g: Graphics, k: Kit, L: number, seed: number, maitre: boolean): void {
  // fût horizontal, avec sa crosse épaissie à l'arrière
  const fut = lisser(
    perturber(
      densifier(
        [
          pt(-L * 0.4, -L * 0.075),
          pt(L * 0.5, -L * 0.06),
          pt(L * 0.53, L * 0.04),
          pt(-L * 0.36, L * 0.085),
          pt(-L * 0.44, L * 0.02),
        ],
        L * 0.14,
      ),
      L * 0.008,
      seed,
    ),
    1,
  );
  poser(g, k, fut, { couleur: CHENE, matiere: 'ecorce', matiereAlpha: 0.26, echelle: 0.3, seed });
  // veine claire le long du fût : sans elle, le bloc de bois est un aplat
  g.moveTo(-L * 0.38, -L * 0.03);
  g.lineTo(L * 0.48, -L * 0.02);
  g.stroke({ color: eclaircir(CHENE, 0.3), width: L * 0.022, alpha: 0.45, cap: 'round' });
  // arc d'acier, courbé, jamais symétrique parfait
  const arc: Poly = [];
  const dos: Poly = [];
  for (let i = 0; i <= 14; i += 1) {
    const t = i / 14;
    const y = (t - 0.5) * L * 1.62;
    const x = L * 0.46 + Math.cos((t - 0.5) * 2.2) * L * 0.2 - L * 0.17;
    const w = L * 0.042 * (1 - Math.abs(t - 0.5) * 1.05);
    arc.push(pt(x - w, y));
    dos.push(pt(x + w, y));
  }
  dos.reverse();
  poser(g, k, [...arc, ...dos], {
    couleur: maitre ? melanger(ACIER, LIGHT.rim, 0.22) : ACIER,
    matiere: 'metal',
    matiereAlpha: 0.24,
    echelle: 0.35,
    speculaire: { x: 0.3, y: 0.3, r: 0.08 },
    seed: seed + 1,
  });
  // corde tendue : un V franc de pointe à pointe, en passant par la noix
  g.moveTo(L * 0.31, -L * 0.79);
  g.lineTo(-L * 0.04, 0);
  g.lineTo(L * 0.31, L * 0.79);
  g.stroke({ color: melanger(IVOIRE, CHENE, 0.35), width: L * 0.026, alpha: 0.9 });
  // noix et détente
  g.poly(flat(blob(-L * 0.04, 0, L * 0.06, L * 0.05, { seed: 4, points: 9, wobble: 0.22 }))).fill({
    color: eclaircir(ACIER, 0.2),
    alpha: 0.9,
  });
  g.moveTo(-L * 0.12, L * 0.04);
  g.quadraticCurveTo(-L * 0.2, L * 0.14, -L * 0.1, L * 0.18);
  g.stroke({ color: assombrir(ACIER, 0.3), width: L * 0.028, alpha: 0.85, cap: 'round' });
  if (maitre) {
    // cranequin : couronne dentée et manivelle
    sous(g, -L * 0.22, -L * 0.02, (h) => {
      const roue = blob(0, 0, L * 0.12, L * 0.12, { seed: 6, points: 16, wobble: 0.16 });
      poser(h, k, roue, {
        couleur: melanger(ACIER, LIGHT.rim, 0.35),
        matiere: 'metal',
        matiereAlpha: 0.24,
        speculaire: { x: 0.3, y: 0.3, r: 0.16 },
      });
      for (let i = 0; i < 9; i += 1) {
        const a = (i / 9) * Math.PI * 2;
        h.moveTo(Math.cos(a) * L * 0.1, Math.sin(a) * L * 0.1);
        h.lineTo(Math.cos(a) * L * 0.15, Math.sin(a) * L * 0.15);
        h.stroke({ color: assombrir(ACIER, 0.34), width: L * 0.02, alpha: 0.8, cap: 'round' });
      }
      h.moveTo(0, 0);
      h.lineTo(-L * 0.16, -L * 0.12);
      h.stroke({ color: LIGHT.rim, width: L * 0.026, alpha: 0.85, cap: 'round' });
    });
    orfevrerie(g, [pt(-L * 0.3, -L * 0.03), pt(L * 0.44, -L * 0.04)], { epaisseur: L * 0.02, alpha: 0.7 });
  }
  // carreau engagé
  const carreau = fuseau(-L * 0.1, -L * 0.005, L * 0.46, -L * 0.02, L * 0.032, { seed: 8, taper: 0.4 });
  poser(g, k, carreau, { couleur: melanger(CHENE, IVOIRE, 0.3), matiere: 'grain', matiereAlpha: 0.14 });
}

/**
 * Pavois : grand bouclier de siège, blasonné.
 *
 * Il était peint en `melanger(CHENE, IVOIRE, 0.28)` sur la forme de base : à
 * l'écran, exactement la valeur du parchemin de la planche de contact, donc une
 * dalle beige indistincte du fond derrière l'épaule de l'arbalétrier. Un pavois
 * est une planche de bois PEINTE aux couleurs de la place : on le passe au
 * grenat sombre pour les deux formes et l'on garde l'écart de rang sur le
 * blason et la ferrure du bord.
 */
function pavois(g: Graphics, k: Kit, w: number, h: number, seed: number, blason: boolean): void {
  const bois = blason ? k.pal.primaire : melanger(k.pal.primaire, CHENE, 0.45);
  const forme = lisser(
    perturber(
      densifier(
        [pt(-w * 0.46, -h * 0.5), pt(0, -h * 0.56), pt(w * 0.46, -h * 0.48), pt(w * 0.42, h * 0.44), pt(0, h * 0.54), pt(-w * 0.42, h * 0.46)],
        h * 0.14,
      ),
      w * 0.014,
      seed,
    ),
    1,
  );
  poser(g, k, forme, {
    couleur: bois,
    matiere: blason ? 'tissu' : 'ecorce',
    matiereAlpha: 0.24,
    echelle: 0.5,
    seed,
  });
  // bordure ferrée : le pavois est cerclé, sinon il éclate au premier carreau
  contourVariable(g, forme, melanger(ACIER, CHENE, 0.4), {
    epaisseur: Math.max(1.4, w * 0.07),
    couleur: melanger(ACIER, CHENE, 0.4),
  });
  // arête centrale du pavois
  g.moveTo(0, -h * 0.5);
  g.lineTo(0, h * 0.5);
  g.stroke({ color: blason ? LIGHT.rim : eclaircir(bois, 0.32), width: w * 0.055, alpha: 0.8 });
  if (blason) {
    const br = w * 0.1;
    g.poly(
      flat(
        perturber(
          [
            pt(-br, -h * 0.3), pt(br, -h * 0.3), pt(br, -br), pt(w * 0.26, -br),
            pt(w * 0.26, br), pt(br, br), pt(br, h * 0.28), pt(-br, h * 0.28),
            pt(-br, br), pt(-w * 0.26, br), pt(-w * 0.26, -br), pt(-br, -br),
          ],
          w * 0.012,
          seed + 4,
        ),
      ),
    ).fill({ color: LIGHT.rim, alpha: 0.92 });
  }
  for (let i = 0; i < 4; i += 1) {
    const y = -h * 0.36 + i * h * 0.24;
    g.poly(flat(blob(-w * 0.32, y, w * 0.035, w * 0.035, { seed: i + 2, points: 8, wobble: 0.24 }))).fill({
      color: eclaircir(ACIER, 0.3),
      alpha: 0.85,
    });
  }
}

/* ───────────────────────── Rangs 1 et 2 — piétaille ─────────────────────── */

/**
 * Le Manant : **le haillon**.
 *
 * Ce qui le fait, dans le rendu de référence, n'est ni la fourche ni le
 * chapeau : c'est que tout ce qu'il porte est DÉCHIRÉ. Sa tunique se termine en
 * pointes irrégulières sur la cuisse, ses jambes sont emmaillotées de bandes de
 * toile enroulées jusqu'au genou, un chaperon de laine verte lui tombe sur les
 * épaules. Sur la planche de contact il n'avait rien de cela : un tronc lisse à
 * ourlet net, deux jambes de fuseau, et le seul indice de misère était une
 * rustine de six pixels sur la poitrine — invisible. Un manant qui n'a pas l'air
 * pauvre n'est pas un manant, c'est un piquier mal peint.
 *
 * On lui donne donc les trois couches du rendu : chaperon, basque en lambeaux,
 * molletières — et la fourche empoignée en diagonale, comme un outil qu'on n'a
 * pas appris à porter en arme.
 */
const manant: Fabrique = (k) => {
  const H = 92;
  const tunique = melanger(k.pal.sombre, 0xa08a5e, 0.4);
  const chaperon = melanger(CHENE, 0x4a5138, 0.55);
  const toile = melanger(IVOIRE, CHENE, 0.82);
  return creatureRig(
    { hauteur: H, empriseSol: H * 0.19, respiration: 'buste', graine: k.seed, teinteMort: k.pal.sombre },
    squeletteBipede({
      H,
      seed: k.seed,
      teint: TEINTS[1],
      tunique,
      jambeCouleur: melanger(k.pal.sombre, 0x6b5433, 0.55),
      chausse: null,
      ceinture: 0x4b3a22,
      posture: -0.9,
      largeur: 0.92,
      epaules: 0.84,
      ecart: 1.5,
      coude: 0.55,
      brasDRot: -0.5,
      brasGRot: 0.22,
      epaulement: { couleur: chaperon, largeur: H * 0.17 },
      basque: { couleur: assombrir(tunique, 0.2), dents: 1, hauteur: H * 0.15 },
      jambiere: { couleur: toile, hauteur: H * 0.13 },
      visage: { age: 0.45, sourcils: 0.2, barbe: 0.32, barbeCouleur: 0x6b5433 },
      cheveux: { couleur: 0x6b5433, longueur: 0.6, volume: 0.9 },
      coiffe: (g, kk) => chapeauPaille(g, kk, rayonTete(H), k.seed + 5),
      surTorse: (g, kk) => {
        // le chaperon proprement dit : une pèlerine courte à ourlet déchiqueté,
        // par-dessus l'épaulement, nouée au cou par un lacet de chanvre
        const pel: Poly = [
          pt(-H * 0.13, -H * 0.28),
          pt(0, -H * 0.31),
          pt(H * 0.13, -H * 0.27),
          pt(H * 0.11, -H * 0.19),
          pt(H * 0.05, -H * 0.15),
          pt(H * 0.02, -H * 0.2),
          pt(-H * 0.03, -H * 0.14),
          pt(-H * 0.08, -H * 0.19),
          pt(-H * 0.12, -H * 0.16),
        ];
        poser(g, kk, perturber(densifier(pel, H * 0.03), H * 0.004, 43), {
          couleur: chaperon,
          matiere: 'tissu',
          matiereAlpha: 0.24,
          echelle: 0.5,
          seed: 43,
        });
        g.moveTo(-H * 0.04, -H * 0.29);
        g.quadraticCurveTo(0, -H * 0.26, H * 0.04, -H * 0.29);
        g.stroke({ color: toile, width: H * 0.011, alpha: 0.85, cap: 'round' });
        // deux rustines cousues sur la tunique, aux valeurs franches
        for (const [px, py] of [
          [-H * 0.07, -H * 0.14],
          [H * 0.05, -H * 0.06],
        ] as const) {
          const patch = perturber(
            densifier([pt(px - H * 0.04, py - H * 0.02), pt(px + H * 0.04, py - H * 0.03), pt(px + H * 0.035, py + H * 0.03), pt(px - H * 0.035, py + H * 0.025)], 5),
            0.7,
            41 + px,
          );
          g.poly(flat(patch)).fill({ color: melanger(tunique, 0x8a7a52, 0.55), alpha: 0.75 });
          g.poly(flat(patch), true).stroke({ color: assombrir(tunique, 0.4), width: 0.9, alpha: 0.65 });
        }
      },
      arme: (g, kk) => {
        hampe(g, kk, pt(0, H * 0.14), pt(-H * 0.03, -H * 0.42), H * 0.026, 0x6b5433, 2);
        sous(g, -H * 0.03, -H * 0.42, (h) => {
          for (const dx of [-1, 0, 1]) {
            fer(h, kk, fuseau(dx * H * 0.028, 0, dx * H * 0.05, -H * 0.11, H * 0.017, { seed: dx + 4, taper: 0.6 }), ACIER);
          }
          fer(h, kk, perturber(densifier([pt(-H * 0.05, 0), pt(H * 0.05, 0), pt(H * 0.04, H * 0.026), pt(-H * 0.04, H * 0.026)], 5), 0.5, 9), assombrir(ACIER, 0.2));
        });
        // le poing du dessus : la fourche se tient à deux mains
        sous(g, -H * 0.016, -H * 0.19, (h) =>
          main(h, kk, { r: H * 0.032, teint: assombrir(TEINTS[1], 0.1), seed: 47 }),
        );
      },
      /* La fourche part en diagonale vers l'avant, comme dans le rendu : hampe
         couchée, dents en haut à droite. Verticale, elle passait devant la
         figure et coupait la tête en deux. */
      armeAncre: { rot: 0.92 },
    }),
    k,
    (r) => {
      clipsBipede(r, { foulee: 0.85, allonge: 0.75 });
      clipCapacite(r, 'levee');
    },
  );
};

const francSerf: Fabrique = (k) => {
  const H = 100;
  const jaque = melanger(CHENE, 0x7a6540, 0.4);
  return creatureRig(
    { hauteur: H, empriseSol: H * 0.19, respiration: 'buste', graine: k.seed + 1, teinteMort: k.pal.pierre },
    squeletteBipede({
      H,
      seed: k.seed + 10,
      teint: TEINTS[0],
      tunique: jaque,
      jambeCouleur: melanger(ARDOISE, CHENE, 0.5),
      chausse: assombrir(CHENE, 0.34),
      ceinture: 0x4b3a22,
      plastron: null,
      posture: 0.5,
      epaules: 1.06,
      ecart: 1.45,
      coude: 0.5,
      brasDRot: -0.46,
      brasGRot: 0.18,
      /* Le baudrier croisé et l'épaulement de jaque : c'est ce qui, dans le
         rendu, sépare l'affranchi du manant — il est SANGLÉ, il a un
         équipement, il n'a plus des loques cousues. */
      epaulement: { couleur: melanger(jaque, ARDOISE, 0.45), largeur: H * 0.16 },
      basque: { couleur: melanger(jaque, ARDOISE, 0.3), dents: 0.55, hauteur: H * 0.14 },
      jambiere: { couleur: assombrir(CHENE, 0.2), hauteur: H * 0.13 },
      visage: { sourcils: 0.5, age: 0.2, barbe: 0.2, barbeCouleur: 0x4a3a24 },
      cheveux: { couleur: 0x4a3a24, longueur: 0.4, volume: 0.85 },
      coiffe: (g, kk) => chapelDeFer(g, kk, rayonTete(H), k.seed + 6),
      surTorse: (g, kk) => {
        // brigandine : rangées de clous, la matière ajoutée du franc-serf
        for (let row = 0; row < 4; row += 1) {
          for (let col = 0; col < 4; col += 1) {
            const x = -H * 0.09 + col * H * 0.06;
            const y = -H * 0.25 + row * H * 0.055;
            g.poly(flat(blob(x, y, H * 0.011, H * 0.011, { seed: row * 5 + col, points: 7, wobble: 0.3 }))).fill({
              color: eclaircir(ACIER, 0.22),
              alpha: 0.8,
            });
          }
        }
        // les deux courroies en croix, avec leur boucle : deux valeurs franches
        // sur le jaque, la seule chose du torse qui se lise à petite taille
        for (const sens of [1, -1] as const) {
          g.moveTo(sens * H * 0.11, -H * 0.28);
          g.quadraticCurveTo(0, -H * 0.17, -sens * H * 0.1, -H * 0.05);
          g.stroke({ color: assombrir(CHENE, 0.24), width: H * 0.022, alpha: 0.9, cap: 'round' });
          g.moveTo(sens * H * 0.1, -H * 0.27);
          g.quadraticCurveTo(0, -H * 0.163, -sens * H * 0.095, -H * 0.045);
          g.stroke({ color: eclaircir(CHENE, 0.28), width: H * 0.006, alpha: 0.45, cap: 'round' });
        }
        poser(g, kk, blob(0, -H * 0.17, H * 0.019, H * 0.017, { seed: 6, points: 10, wobble: 0.22 }), {
          couleur: LIGHT.rim,
          matiere: 'metal',
          matiereAlpha: 0.24,
          speculaire: { x: 0.3, y: 0.26, r: 0.2 },
        });
        // charte roulée à la ceinture : sa fierté
        sous(g, H * 0.09, -H * 0.03, (h) => {
          poser(h, kk, blob(0, 0, H * 0.02, H * 0.05, { seed: 4, points: 12, wobble: 0.14 }), {
            couleur: 0xe8dcc0,
            matiere: 'parchemin',
            matiereAlpha: 0.3,
            echelle: 0.4,
          });
          h.moveTo(-H * 0.02, H * 0.02);
          h.lineTo(H * 0.02, H * 0.02);
          h.stroke({ color: k.pal.primaire, width: H * 0.008, alpha: 0.85 });
        });
      },
      arme: (g, kk) => {
        hampe(g, kk, pt(0, H * 0.2), pt(0, -H * 0.72), H * 0.024, CHENE, 5);
        sous(g, 0, -H * 0.72, (h) => fer(h, kk, pointeLance(H * 0.13, H * 0.05), ACIER));
        sous(g, 0, -H * 0.6, (h) => {
          h.moveTo(-H * 0.02, 0);
          h.lineTo(H * 0.02, 0);
          h.stroke({ color: LIGHT.rim, width: H * 0.012, alpha: 0.7 });
        });
        sous(g, -H * 0.008, -H * 0.24, (h) =>
          main(h, kk, { r: H * 0.031, teint: assombrir(TEINTS[0], 0.12), seed: 51 }),
        );
      },
      /* La pique reste haute — c'est sa silhouette — mais elle s'incline assez
         pour dégager la tête : verticale, la hampe passait devant le nez et le
         franc-serf n'avait plus de visage. */
      armeAncre: { rot: 0.5 },
    }),
    k,
    (r) => {
      clipsBipede(r, { foulee: 1, allonge: 0.9 });
      clipCapacite(r, 'levee');
    },
  );
};

/* ───────────────────────── Rang 2 — gabelle ─────────────────────────────── */

/**
 * Le Gabelou : **la mesure de laiton pendue à la ceinture**.
 *
 * Le rendu de référence l'annonce sans ambiguïté : au centre de l'image, sur la
 * hanche, un cylindre de laiton poli — l'étalon du grenier à sel — qui capte
 * toute la lumière et qu'on voit avant le visage. C'est son métier, tenu à la
 * ceinture. La planche de contact, elle, lui donnait un carré d'acier de quatre
 * pixels sur la hanche gauche, indiscernable d'une boucle : le commis du sel
 * n'avait aucune raison lisible d'être un commis du sel plutôt qu'un piquier de
 * plus. On lui rend donc sa mesure, à la bonne échelle et en laiton chaud, et
 * la besace de toile de l'autre côté qui l'équilibre.
 */
const gabelou: Fabrique = (k) => {
  const H = 98;
  const laiton = melanger(LIGHT.rim, 0xa87a2c, 0.42);
  return creatureRig(
    { hauteur: H, empriseSol: H * 0.2, respiration: 'buste', graine: k.seed + 2, teinteMort: k.pal.primaire },
    squeletteBipede({
      H,
      seed: k.seed + 20,
      teint: TEINTS[2],
      tunique: melanger(ARDOISE, 0x5d666e, 0.4),
      jambeCouleur: assombrir(ARDOISE, 0.2),
      chausse: assombrir(CHENE, 0.4),
      ceinture: melanger(CHENE, 0x2a3242, 0.4),
      posture: 0.2,
      ecart: 1.5,
      coude: 0.5,
      brasDRot: -0.5,
      brasGRot: 0.2,
      epaulement: { couleur: melanger(ARDOISE, 0x6d767e, 0.5), matiere: 'metal', largeur: H * 0.17 },
      basque: { couleur: melanger(ARDOISE, 0x4a5138, 0.4), dents: 0.45, hauteur: H * 0.15 },
      jambiere: { couleur: melanger(ARDOISE, 0x8f99a4, 0.35), hauteur: H * 0.14 },
      visage: { sourcils: 0.7, age: 0.35, barbe: 0.28, barbeCouleur: 0x3a2f1e },
      cheveux: { couleur: 0x3a2f1e, longueur: 0.5, volume: 0.9 },
      cape: { couleur: k.pal.primaire, w: H * 0.32, h: H * 0.3, dents: 0.35 },
      coiffe: (g, kk) => chapeauCire(g, kk, rayonTete(H), k.seed + 7, LIGHT.rim),
      surTorse: (g, kk) => {
        // rangées de clous de laiton sur la brigandine : la matière du métier
        for (let row = 0; row < 4; row += 1) {
          for (let col = 0; col < 3; col += 1) {
            g.poly(
              flat(
                blob(-H * 0.07 + col * H * 0.07, -H * 0.26 + row * H * 0.06, H * 0.009, H * 0.009, {
                  seed: row * 7 + col,
                  points: 7,
                  wobble: 0.3,
                }),
              ),
            ).fill({ color: laiton, alpha: 0.75 });
          }
        }
        /* La mesure de sel : un cylindre de laiton, cerclé en haut et en bas,
           accroché par un anneau. Il tombe SOUS la ceinture, devant la basque,
           là où le rendu le montre — et il est assez grand pour se voir. */
        sous(g, H * 0.055, H * 0.0, (h) => {
          h.moveTo(0, -H * 0.05);
          h.lineTo(0, -H * 0.02);
          h.stroke({ color: assombrir(laiton, 0.3), width: H * 0.008, alpha: 0.9 });
          const corps = perturber(
            densifier(
              [pt(-H * 0.028, -H * 0.02), pt(H * 0.028, -H * 0.022), pt(H * 0.024, H * 0.058), pt(-H * 0.026, H * 0.056)],
              H * 0.02,
            ),
            H * 0.003,
            13,
          );
          poser(h, kk, corps, {
            couleur: laiton,
            matiere: 'metal',
            matiereAlpha: 0.22,
            echelle: 0.35,
            speculaire: { x: 0.28, y: 0.2, r: 0.16 },
          });
          for (const y of [-H * 0.012, H * 0.046]) {
            h.moveTo(-H * 0.028, y);
            h.lineTo(H * 0.027, y - H * 0.001);
            h.stroke({ color: eclaircir(laiton, 0.35), width: H * 0.008, alpha: 0.8 });
          }
          // le sel qui reste au fond : un croissant clair, pas un aplat
          h.moveTo(-H * 0.02, -H * 0.014);
          h.quadraticCurveTo(0, -H * 0.026, H * 0.019, -H * 0.014);
          h.stroke({ color: IVOIRE, width: H * 0.009, alpha: 0.7, cap: 'round' });
        });
        // besace de toile à l'autre hanche, sanglée
        sous(g, -H * 0.095, -H * 0.02, (h) => {
          poser(h, kk, blob(0, 0, H * 0.038, H * 0.044, { seed: 6, points: 13, wobble: 0.2 }), {
            couleur: melanger(IVOIRE, CHENE, 0.35),
            matiere: 'tissu',
            matiereAlpha: 0.26,
            echelle: 0.4,
          });
          h.moveTo(-H * 0.026, -H * 0.032);
          h.quadraticCurveTo(0, -H * 0.054, H * 0.026, -H * 0.032);
          h.stroke({ color: CHENE, width: H * 0.01, alpha: 0.85 });
          h.moveTo(-H * 0.03, -H * 0.006);
          h.lineTo(H * 0.03, -H * 0.008);
          h.stroke({ color: assombrir(CHENE, 0.3), width: H * 0.011, alpha: 0.8 });
        });
      },
      arme: (g, kk) => {
        hampe(g, kk, pt(0, H * 0.2), pt(-H * 0.06, -H * 0.58), H * 0.023, CHENE, 3);
        sous(g, -H * 0.06, -H * 0.58, (h) => {
          fer(h, kk, pointeLance(H * 0.1, H * 0.04), ACIER);
          // crochet de gabelou : il retient plus qu'il ne tue
          fer(
            h,
            kk,
            lisser(
              perturber(
                densifier([pt(0, -H * 0.03), pt(H * 0.06, -H * 0.05), pt(H * 0.075, -H * 0.015), pt(H * 0.03, 0)], 4),
                0.5,
                17,
              ),
              1,
            ),
            assombrir(ACIER, 0.15),
          );
        });
        sous(g, -H * 0.014, -H * 0.2, (h) =>
          main(h, kk, { r: H * 0.031, teint: assombrir(TEINTS[2], 0.12), seed: 53 }),
        );
      },
      armeAncre: { rot: 0.72 },
    }),
    k,
    (r) => {
      clipsBipede(r, { foulee: 0.95, allonge: 0.9 });
      clipCapacite(r, 'levee');
    },
  );
};

/**
 * Le Prévôt du Sel : **le grand manteau évasé, bordé d'or**.
 *
 * Sur son rendu de référence, le prévôt est presque aussi LARGE que haut : un
 * manteau d'ardoise semé de fleurs de lys s'ouvre de part et d'autre en deux
 * pans galonnés d'or qui doublent sa surface, et la doublure grenat se retourne
 * à l'ourlet. C'est la seule créature de la Châtellenie à occuper le bas de son
 * cadre horizontalement — un officier qui BARRE le chemin, ce qui est
 * exactement sa capacité de jeu (`zone_of_control`).
 *
 * Sur la planche de contact il ne barrait rien : un cône grenat étroit, plus
 * mince que l'arbalétrier, coiffé d'un chapeau ciré identique à celui du
 * gabelou. Rien ne disait le grade. On lui donne donc le manteau à sa vraie
 * envergure, galonné, avec le col de fourrure au-dessus, et le trousseau de
 * clefs assez gros pour compter les clefs.
 */
const prevotDuSel: Fabrique = (k) => {
  const H = 106;
  const robeC = melanger(k.pal.primaire, 0x3a2430, 0.3);
  const manteau = melanger(ARDOISE, 0x2c3644, 0.4);
  return creatureRig(
    { hauteur: H, empriseSol: H * 0.23, respiration: 'buste', graine: k.seed + 3, teinteMort: k.pal.primaire },
    squeletteBipede({
      H,
      seed: k.seed + 30,
      teint: TEINTS[3],
      tunique: robeC,
      jambeCouleur: assombrir(ARDOISE, 0.24),
      chausse: assombrir(CHENE, 0.45),
      ceinture: LIGHT.rim,
      posture: 0.4,
      largeur: 1.12,
      epaules: 1.1,
      ecart: 1.35,
      coude: 0.42,
      brasDRot: -0.3,
      brasGRot: 0.12,
      epaulement: { couleur: manteau, largeur: H * 0.2 },
      basque: { couleur: manteau, hauteur: H * 0.17, largeur: H * 0.32, bord: LIGHT.rim },
      jambiere: { couleur: assombrir(CHENE, 0.3), hauteur: H * 0.13 },
      visage: { sourcils: 0.9, age: 0.9, barbe: 0.55, barbeCouleur: 0x8d8578 },
      cheveux: { couleur: 0x8d8578, longueur: 0.7, volume: 1 },
      robe: { couleur: robeC, haut: H * 0.22, bas: H * 0.36, hauteur: H * 0.46 },
      /* Le manteau : large de la moitié de sa hauteur, ourlet galonné. C'est ce
         qui donne au prévôt sa masse d'officier. */
      cape: { couleur: manteau, w: H * 0.44, h: H * 0.54, bord: LIGHT.rim },
      coiffe: (g, kk) => {
        chapeauCire(g, kk, rayonTete(H), k.seed + 8, k.pal.primaire);
        // col de fourrure : matière ajoutée de la forme améliorée
        sous(g, 0, H * 0.075, (h) => {
          poser(h, kk, blob(0, 0, H * 0.115, H * 0.045, { seed: 9, points: 18, wobble: 0.26 }), {
            couleur: melanger(CHENE, 0x9c8f78, 0.5),
            matiere: 'fourrure',
            matiereAlpha: 0.3,
            echelle: 0.35,
          });
        });
      },
      surTorse: (g, kk) => {
        /* Le trousseau : anneau, puis trois clefs à panneton, pendues devant la
           basque. Elles étaient dessinées à 0,013 H de large — un pixel et demi
           à l'écran, où l'on ne comptait rien. Doublées, l'anneau posé, on lit
           enfin « celui qui a les clefs du grenier ». */
        sous(g, H * 0.085, H * 0.005, (h) => {
          poser(h, kk, arcBande(0, 0, H * 0.022, H * 0.022, 0, 6.2, H * 0.009, 0), {
            couleur: LIGHT.rim,
            matiere: 'metal',
            matiereAlpha: 0.22,
            speculaire: { x: 0.3, y: 0.26, r: 0.16 },
          });
          for (let i = 0; i < 3; i += 1) {
            const a = -0.42 + i * 0.42;
            sous(h, Math.sin(a) * H * 0.024, H * 0.018 + Math.cos(a) * H * 0.016, (c) => {
              c.moveTo(0, 0);
              c.lineTo(Math.sin(a) * H * 0.02, H * 0.062);
              c.stroke({ color: LIGHT.rim, width: H * 0.013, alpha: 0.92, cap: 'round' });
              // panneton : deux dents, sinon c'est un clou
              c.moveTo(Math.sin(a) * H * 0.02, H * 0.046);
              c.lineTo(Math.sin(a) * H * 0.02 + H * 0.02, H * 0.048);
              c.stroke({ color: LIGHT.rim, width: H * 0.011, alpha: 0.9, cap: 'round' });
              c.moveTo(Math.sin(a) * H * 0.02, H * 0.062);
              c.lineTo(Math.sin(a) * H * 0.02 + H * 0.016, H * 0.064);
              c.stroke({ color: eclaircir(LIGHT.rim, 0.2), width: H * 0.009, alpha: 0.85, cap: 'round' });
            });
          }
        });
        // orfroi brodé sur le devant
        orfevrerie(g, [pt(-H * 0.03, -H * 0.29), pt(-H * 0.03, -H * 0.05)], { epaisseur: H * 0.012 });
        orfevrerie(g, [pt(H * 0.04, -H * 0.29), pt(H * 0.04, -H * 0.05)], { epaisseur: H * 0.012, alpha: 0.6 });
        // sceau du comte
        sous(g, -H * 0.02, -H * 0.19, (h) =>
          poser(h, kk, blob(0, 0, H * 0.028, H * 0.028, { seed: 11, points: 12, wobble: 0.18 }), {
            couleur: LIGHT.rim,
            matiere: 'metal',
            matiereAlpha: 0.24,
            speculaire: { x: 0.3, y: 0.26, r: 0.18 },
          }),
        );
      },
      arme: (g, kk) => {
        hampe(g, kk, pt(0, H * 0.2), pt(0, -H * 0.66), H * 0.028, melanger(CHENE, 0x2a3242, 0.35), 7);
        sous(g, 0, -H * 0.66, (h) => {
          poser(h, kk, blob(0, -H * 0.03, H * 0.035, H * 0.045, { seed: 13, points: 14, wobble: 0.18 }), {
            couleur: LIGHT.rim,
            matiere: 'metal',
            matiereAlpha: 0.24,
            speculaire: { x: 0.3, y: 0.24, r: 0.16 },
          });
          h.poly(flat(blob(0, -H * 0.03, H * 0.016, H * 0.02, { seed: 15, points: 10, wobble: 0.2 }))).fill({
            color: k.pal.primaire,
            alpha: 0.9,
          });
        });
        // ferrure à mi-hampe
        sous(g, 0, -H * 0.3, (h) =>
          ferrure(h, kk, perturber(densifier([pt(-H * 0.018, -H * 0.02), pt(H * 0.018, -H * 0.02), pt(H * 0.018, H * 0.02), pt(-H * 0.018, H * 0.02)], 4), 0.4, 19), {
            couleur: melanger(ACIER, LIGHT.rim, 0.3),
            rivets: 2,
          }),
        );
      },
      /* Le bourdon part en travers : c'est un officier qui BARRE le chemin, et
         c'est aussi sa capacité de jeu. À la verticale, la hampe passait pile
         devant le nez du prévôt et lui coupait la figure en deux. */
      armeAncre: { rot: 0.5 },
    }),
    k,
    (r) => {
      clipsBipede(r, { foulee: 0.8, allonge: 0.85, lourdeur: 1.15 });
      clipCapacite(r, 'levee');
    },
  );
};

/* ─────────────────────── Rang 3 — les Farges ────────────────────────────── */

/**
 * Les arbalétriers des Farges : **l'arbalète ÉPAULÉE, à hauteur d'œil**.
 *
 * Les deux rendus de référence donnent la même chose, et c'est la seule chose
 * qui compte pour ce rang : l'arbalète est tenue horizontale, la crosse contre
 * la joue, le bras avant tendu sous le fût, l'arc d'acier vertical au bout de la
 * ligne. Le tireur EST son geste ; on lit « il tire » avant de lire l'homme.
 *
 * Sur la planche de contact, l'arbalète pendait au ventre, pointe vers le bas à
 * gauche, à peu près là où un homme tiendrait un seau. Rien ne visait. Les deux
 * arbalétriers étaient donc deux piquiers de plus, distingués l'un de l'autre
 * par une plume rouge — alors qu'ils sont les seuls tireurs de la faction et que
 * c'est leur unique raison d'exister sur le champ.
 *
 * La pose : `brasGRot` tend le bras avant vers l'avant (rotation négative =
 * l'avant-bras part vers +x), `armeAncre.rot` annule exactement cette rotation
 * pour que le fût reste horizontal quoi qu'il arrive, et le bras arrière ramène
 * son poing à la détente. La crosse est reculée dans le dessin de l'arme pour
 * venir à l'épaule au lieu de partir devant.
 */
function arbaletrierPieces(k: Kit, H: number, maitre: boolean): PieceDef[] {
  /** Bras avant tendu : la ligne de visée part de là. */
  const BRAS_TENDU = -1.28;
  return squeletteBipede({
    H,
    seed: k.seed + (maitre ? 50 : 40),
    teint: TEINTS[maitre ? 3 : 0],
    tunique: melanger(ARDOISE, k.pal.primaire, maitre ? 0.42 : 0.2),
    jambeCouleur: melanger(CHENE, ARDOISE, 0.45),
    chausse: assombrir(CHENE, 0.4),
    ceinture: CHENE,
    plastron: maitre ? melanger(ACIER, LIGHT.rim, 0.16) : null,
    posture: 0.25,
    largeur: maitre ? 1.06 : 1,
    epaules: maitre ? 1.08 : 1,
    ecart: 1.7,
    coude: 0.34,
    brasGRot: BRAS_TENDU,
    brasDRot: -0.92,
    epaulement: {
      couleur: maitre ? melanger(ACIER, LIGHT.rim, 0.2) : melanger(ARDOISE, 0x6d767e, 0.4),
      matiere: 'metal',
      largeur: H * (maitre ? 0.19 : 0.17),
    },
    basque: {
      couleur: melanger(ARDOISE, CHENE, 0.35),
      /* Le maître a l'ourlet galonné, donc net : un galon d'or sur une guenille
         déchirée se lisait comme une rangée de dents. */
      dents: maitre ? 0 : 0.6,
      hauteur: H * 0.16,
      bord: maitre ? LIGHT.rim : null,
    },
    jambiere: { couleur: assombrir(CHENE, 0.16), hauteur: H * 0.15 },
    visage: { sourcils: 0.6, age: maitre ? 0.75 : 0.25, barbe: maitre ? 0.4 : 0, barbeCouleur: 0x6b6055 },
    cheveux: { couleur: maitre ? 0x6b6055 : 0x4a3a24, longueur: 0.4, volume: 0.85 },
    coiffe: (g, kk) => {
      chapelDeFer(g, kk, rayonTete(H), k.seed + (maitre ? 9 : 10), maitre);
      if (maitre) {
        // plume de maîtrise, plantée dans une douille d'or
        sous(g, H * 0.05, -H * 0.1, (h) => {
          const pl = fuseau(0, 0, H * 0.05, -H * 0.14, H * 0.028, { seed: 3, taper: 0.5 });
          poser(h, kk, pl, { couleur: k.pal.primaire, matiere: 'plumes', matiereAlpha: 0.3, echelle: 0.35 });
        });
      }
    },
    dos: (g, kk) =>
      sous(g, H * 0.02, H * 0.06, (h) => pavois(h, kk, H * 0.3, H * 0.42, k.seed + 21, maitre)),
    surTorse: (g, kk) => {
      // carquois de carreaux à la hanche, empennes en éventail
      sous(g, H * 0.1, -H * 0.04, (h) => {
        poser(h, kk, perturber(densifier([pt(-H * 0.026, -H * 0.03), pt(H * 0.026, -H * 0.034), pt(H * 0.022, H * 0.05), pt(-H * 0.024, H * 0.048)], 5), 0.5, 23), {
          couleur: assombrir(CHENE, 0.2),
          matiere: 'grain',
          matiereAlpha: 0.18,
        });
        const n = maitre ? 5 : 3;
        for (let i = 0; i < n; i += 1) {
          const a = -0.5 + (i / Math.max(1, n - 1)) * 1;
          h.moveTo(Math.sin(a) * H * 0.012, -H * 0.03);
          h.lineTo(Math.sin(a) * H * 0.05, -H * 0.075);
          h.stroke({ color: melanger(IVOIRE, CHENE, 0.3), width: H * 0.009, alpha: 0.9, cap: 'round' });
          h.poly(flat(fuseau(Math.sin(a) * H * 0.038, -H * 0.062, Math.sin(a) * H * 0.052, -H * 0.082, H * 0.016, { seed: i }))).fill({
            color: i % 2 ? IVOIRE : k.pal.primaire,
            alpha: 0.85,
          });
        }
      });
      if (maitre) {
        orfevrerie(g, [pt(-H * 0.08, -H * 0.24), pt(H * 0.06, -H * 0.27)], { epaisseur: H * 0.012 });
      }
    },
    /* La crosse est reculée de 0,10 H : le poing avant tient le fût vers son
       milieu, et le talon de la crosse arrive contre l'épaule. Le poing arrière
       est peint sur l'arme, à la détente, parce que c'est là qu'il doit être. */
    arme: (g, kk) => {
      sous(g, -H * 0.1, -H * 0.01, (h) => arbalete(h, kk, H * 0.32, k.seed + 25, maitre));
      sous(g, -H * 0.13, H * 0.012, (h) =>
        main(h, kk, { r: H * 0.031, teint: assombrir(TEINTS[maitre ? 3 : 0], 0.14), seed: 57 }),
      );
    },
    /* Annule exactement la rotation du bras porteur : le fût est horizontal,
       quelle que soit la pose du bras. */
    armeAncre: { rot: -BRAS_TENDU },
  });
}

const arbaletrier: Fabrique = (k) =>
  creatureRig(
    { hauteur: 100, empriseSol: 20, respiration: 'buste', graine: k.seed + 4, teinteMort: k.pal.pierre },
    arbaletrierPieces(k, 100, false),
    k,
    (r) => {
      clipsBipede(r, { tir: true });
      clipCapacite(r, 'levee');
    },
  );

const maitreArbaletrier: Fabrique = (k) =>
  creatureRig(
    { hauteur: 104, empriseSol: 21, respiration: 'buste', graine: k.seed + 5, teinteMort: k.pal.pierre },
    arbaletrierPieces(k, 104, true),
    k,
    (r) => {
      clipsBipede(r, { tir: true });
      clipCapacite(r, 'levee');
    },
  );

/* ────────────────────── Rang 4 — le fil d'or ────────────────────────────── */

/**
 * Le panneau brodé de la grenade, pendu à la ceinture par-dessus la jupe.
 *
 * C'est l'objet qui domine les deux rendus de référence du rang 4 : un pan
 * d'étoffe rectangulaire, galonné d'or sur ses quatre côtés, frangé en bas,
 * portant au centre une grenade ouverte brodée en fil d'or — et il pend DEVANT
 * la robe, du nombril au genou. La grenadière et la dame étaient reconnues à un
 * blob doré de trois pixels sur la poitrine ; c'était l'emblème d'un atelier de
 * broderie réduit à une tache. À cette taille, un emblème doit occuper le tiers
 * de la surface visible pour exister — et il l'occupe dans le rendu.
 */
function panneauGrenade(g: Graphics, k: Kit, H: number, w: number, h: number, maitresse: boolean): void {
  const fond = melanger(k.pal.primaire, 0x8c2030, 0.3);
  const bas: Poly = [];
  for (let i = 0; i <= 6; i += 1) {
    const t = i / 6;
    bas.push(pt(w * (0.5 - t), h + Math.sin(t * 6.4) * h * 0.03));
  }
  poser(
    g,
    k,
    lisser(perturber(densifier([pt(-w * 0.5, 0), pt(w * 0.5, 0), ...bas.slice().reverse()], h * 0.22), w * 0.012, 61), 1),
    { couleur: fond, matiere: 'tissu', matiereAlpha: 0.26, echelle: 0.5, seed: 61 },
  );
  orfevrerie(g, [pt(-w * 0.46, h * 0.06), pt(w * 0.46, h * 0.06)], { epaisseur: Math.max(1.1, h * 0.05) });
  orfevrerie(g, bas, { epaisseur: Math.max(1.1, h * 0.05) });
  orfevrerie(g, [pt(-w * 0.44, h * 0.06), pt(-w * 0.46, h * 0.94)], { epaisseur: Math.max(1, h * 0.04), alpha: 0.7 });
  orfevrerie(g, [pt(w * 0.44, h * 0.06), pt(w * 0.46, h * 0.94)], { epaisseur: Math.max(1, h * 0.04), alpha: 0.7 });
  // la grenade : un corps bombé, une couronne de sépales, des grains
  const cx = 0;
  const cy = h * 0.48;
  poser(g, k, blob(cx, cy, w * 0.26, h * 0.24, { seed: 7, points: 15, wobble: 0.14 }), {
    couleur: LIGHT.rim,
    matiere: 'tissu',
    matiereAlpha: 0.2,
    echelle: 0.3,
    speculaire: { x: 0.3, y: 0.26, r: 0.14 },
  });
  g.poly(
    flat(perturber([pt(cx - w * 0.08, cy - h * 0.2), pt(cx + w * 0.08, cy - h * 0.2), pt(cx, cy - h * 0.34)], 0.5, 5)),
  ).fill({ color: LIGHT.rim, alpha: 0.92 });
  for (let i = 0; i < 5; i += 1) {
    g.poly(
      flat(
        blob(cx - w * 0.15 + i * w * 0.075, cy + (i % 2 ? h * 0.04 : -h * 0.02), w * 0.035, h * 0.035, {
          seed: i + 3,
          points: 8,
          wobble: 0.28,
        }),
      ),
    ).fill({ color: fond, alpha: 0.9 });
  }
  if (maitresse) {
    // frange de fil d'or : la maîtresse d'atelier signe son ouvrage
    for (let i = 0; i < 7; i += 1) {
      const x = -w * 0.4 + (i / 6) * w * 0.8;
      g.moveTo(x, h * 0.96);
      g.lineTo(x + (i % 2 ? H * 0.004 : -H * 0.004), h + H * 0.028);
      g.stroke({ color: LIGHT.rim, width: H * 0.006, alpha: 0.85, cap: 'round' });
    }
  }
}

/**
 * La Grenadière d'Or : **les ourlets galonnés d'or, et le panneau de la
 * grenade pendu devant la jupe**.
 *
 * Son rendu de référence est une superposition d'étoffes dont CHAQUE bord est
 * souligné d'un galon d'or : surcot d'ardoise sur robe grenat, panneau brodé
 * par-dessus, et l'or court sur les six ourlets. Sur la planche de contact elle
 * était une cloche grenat unie, sans un galon, coiffée d'un bonnet blanc qui lui
 * mangeait la figure : une silhouette de nonne, pas une brodeuse. L'or est son
 * métier ; il devait se voir de loin, et il n'y en avait pas.
 */
const grenadiere: Fabrique = (k) => {
  const H = 96;
  const corsage = melanger(k.pal.primaire, 0x8c3a3f, 0.25);
  const surcot = melanger(ARDOISE, 0x3c4048, 0.35);
  return creatureRig(
    { hauteur: H, empriseSol: H * 0.24, respiration: 'buste', graine: k.seed + 6, teinteMort: k.pal.accent },
    squeletteBipede({
      H,
      seed: k.seed + 60,
      teint: TEINTS[4],
      tunique: corsage,
      jambeCouleur: melanger(ARDOISE, CHENE, 0.5),
      chausse: assombrir(CHENE, 0.4),
      ceinture: LIGHT.rim,
      posture: 0.6,
      largeur: 0.9,
      epaules: 0.86,
      ecart: 1.2,
      coude: 0.62,
      brasDRot: -0.62,
      brasGRot: 0.34,
      epaulement: { couleur: surcot, largeur: H * 0.15 },
      basque: { couleur: surcot, hauteur: H * 0.16, largeur: H * 0.3, bord: LIGHT.rim },
      jambiere: { couleur: assombrir(CHENE, 0.24), hauteur: H * 0.1 },
      visage: { sourcils: 0.15, age: 0.1 },
      cheveux: { couleur: 0x53381f, longueur: 1.2, volume: 1.05 },
      robe: { couleur: melanger(corsage, ARDOISE, 0.35), haut: H * 0.2, bas: H * 0.4, hauteur: H * 0.46 },
      coiffe: (g, kk) => coiffeLin(g, kk, rayonTete(H), k.seed + 11, false),
      surTorse: (g, kk) => {
        // le col galonné et la croix d'orfroi sur le corsage
        orfevrerie(g, [pt(-H * 0.09, -H * 0.26), pt(0, -H * 0.29), pt(H * 0.08, -H * 0.25)], { epaisseur: H * 0.013 });
        orfevrerie(g, [pt(-H * 0.06, -H * 0.24), pt(H * 0.05, -H * 0.1)], { epaisseur: H * 0.011, alpha: 0.7 });
        orfevrerie(g, [pt(H * 0.05, -H * 0.24), pt(-H * 0.06, -H * 0.1)], { epaisseur: H * 0.011, alpha: 0.7 });
        sous(g, -H * 0.005, H * 0.005, (h) => panneauGrenade(h, kk, H, H * 0.17, H * 0.24, false));
      },
      arme: (g, kk) => {
        // cercle à broder tenu devant : la silhouette la plus reconnaissable du rang
        const R = H * 0.13;
        const cercleExt = blob(0, 0, R, R * 0.98, { seed: 4, points: 26, wobble: 0.05 });
        poser(g, kk, cercleExt, {
          couleur: CHENE,
          matiere: 'ecorce',
          matiereAlpha: 0.24,
          echelle: 0.3,
        });
        const toile = blob(0, 0, R * 0.86, R * 0.84, { seed: 6, points: 22, wobble: 0.05 });
        poser(g, kk, toile, {
          couleur: IVOIRE,
          matiere: 'tissu',
          matiereAlpha: 0.3,
          echelle: 0.4,
          modele: 0.7,
          rim: false,
        });
        for (let i = 0; i < 5; i += 1) {
          const a = -1.2 + i * 0.55;
          g.moveTo(Math.cos(a) * R * 0.6, Math.sin(a) * R * 0.6);
          g.quadraticCurveTo(0, 0, -Math.cos(a) * R * 0.5, -Math.sin(a) * R * 0.55);
          g.stroke({ color: LIGHT.rim, width: R * 0.07, alpha: 0.75, cap: 'round' });
        }
        // aiguille et fil
        g.moveTo(R * 0.2, -R * 0.3);
        g.lineTo(R * 0.9, -R * 0.9);
        g.stroke({ color: eclaircir(ACIER, 0.4), width: R * 0.06, alpha: 0.9, cap: 'round' });
      },
      armeAncre: { rot: 0.1, y: H * 0.28, x: -H * 0.05 },
      mainDroite: (g, kk) =>
        sous(g, H * 0.03, H * 0.32, (h) => {
          // bobine de fil d'or
          poser(h, kk, blob(0, 0, H * 0.022, H * 0.03, { seed: 8, points: 12, wobble: 0.16 }), {
            couleur: LIGHT.rim,
            matiere: 'tissu',
            matiereAlpha: 0.26,
            echelle: 0.3,
            speculaire: { x: 0.3, y: 0.3, r: 0.16 },
          });
        }),
    }),
    k,
    (r) => {
      clipsBipede(r, { foulee: 0.85, allonge: 0.7 });
      clipCapacite(r, 'benediction');
    },
  );
};

/**
 * La Dame au Fil d'Or : **la bannière cramoisie chargée de la grenade d'or**.
 *
 * Le rendu de référence lui donne, derrière l'épaule, un grand pan de velours
 * cramoisi galonné et frangé où la grenade est brodée en pleine page : c'est la
 * chose qu'on voit d'abord, et c'est littéralement son métier — « elle ne brode
 * plus que trois choses : les serments, les linceuls et les étendards ». Sur la
 * planche de contact, son étendard mesurait 0,2 H de large et disparaissait
 * derrière la hampe : la maîtresse d'atelier n'était que la grenadière en plus
 * grand. On double la bannière, on y met la grenade, et on lui ajoute les
 * glands d'or de la ceinture que le rendu montre par paires.
 */
const dameFilDor: Fabrique = (k) => {
  const H = 106;
  const gown = melanger(k.pal.primaire, 0x5a2038, 0.28);
  const surcot = melanger(ARDOISE, 0x37333a, 0.4);
  return creatureRig(
    { hauteur: H, empriseSol: H * 0.26, respiration: 'buste', graine: k.seed + 7, teinteMort: LIGHT.rim },
    squeletteBipede({
      H,
      seed: k.seed + 70,
      teint: TEINTS[0],
      tunique: gown,
      jambeCouleur: melanger(ARDOISE, CHENE, 0.5),
      chausse: assombrir(CHENE, 0.42),
      ceinture: LIGHT.rim,
      posture: 0.9,
      largeur: 0.94,
      epaules: 0.9,
      ecart: 1.25,
      coude: 0.5,
      brasDRot: -0.5,
      brasGRot: 0.22,
      epaulement: { couleur: surcot, largeur: H * 0.17 },
      basque: { couleur: surcot, hauteur: H * 0.18, largeur: H * 0.32, bord: LIGHT.rim },
      jambiere: { couleur: assombrir(CHENE, 0.26), hauteur: H * 0.1 },
      visage: { sourcils: 0.3, age: 0.55 },
      cheveux: { couleur: 0x3f2c1a, longueur: 1.3, volume: 1.1 },
      robe: { couleur: gown, haut: H * 0.22, bas: H * 0.46, hauteur: H * 0.5 },
      cape: { couleur: melanger(gown, ARDOISE, 0.4), w: H * 0.4, h: H * 0.56, bord: LIGHT.rim },
      coiffe: (g, kk) => {
        coiffeLin(g, kk, rayonTete(H), k.seed + 12, true);
        // voile long, il vit dans le vent
        sous(g, H * 0.02, H * 0.02, (h) => {
          const v = lisser(
            perturber(
              densifier([pt(-H * 0.08, 0), pt(H * 0.09, 0), pt(H * 0.12, H * 0.2), pt(H * 0.02, H * 0.16), pt(-H * 0.09, H * 0.22)], H * 0.06),
              0.6,
              27,
            ),
            1,
          );
          poser(h, kk, v, { couleur: IVOIRE, matiere: 'tissu', matiereAlpha: 0.26, echelle: 0.5, modele: 0.8 });
        });
      },
      surTorse: (g, kk) => {
        // orfroi complet : la matière ajoutée par rapport à la Grenadière
        orfevrerie(g, [pt(-H * 0.1, -H * 0.28), pt(-H * 0.04, -H * 0.06)], { epaisseur: H * 0.013 });
        orfevrerie(g, [pt(H * 0.08, -H * 0.28), pt(H * 0.035, -H * 0.06)], { epaisseur: H * 0.013 });
        orfevrerie(g, [pt(-H * 0.1, -H * 0.28), pt(0, -H * 0.31), pt(H * 0.09, -H * 0.27)], { epaisseur: H * 0.013 });
        for (let i = 0; i < 3; i += 1) {
          const y = -H * 0.24 + i * H * 0.07;
          g.poly(flat(blob(-H * 0.005, y, H * 0.016, H * 0.018, { seed: i + 4, points: 11, wobble: 0.18 }))).fill({
            color: LIGHT.rim,
            alpha: 0.9,
          });
          g.poly(flat(blob(-H * 0.008, y - H * 0.004, H * 0.006, H * 0.006, { seed: i + 9, points: 7, wobble: 0.3 }))).fill({
            color: LIGHT.chaude,
            alpha: 0.6,
          });
        }
        // glands d'or par paires à la ceinture : le rendu en montre quatre,
        // deux devant et deux sur la hanche, et ils sonnent le rang
        for (const dx of [-H * 0.075, H * 0.06]) {
          sous(g, dx, H * 0.005, (h) => {
            h.moveTo(0, -H * 0.02);
            h.lineTo(0, H * 0.01);
            h.stroke({ color: LIGHT.rim, width: H * 0.007, alpha: 0.85 });
            poser(h, kk, blob(0, H * 0.028, H * 0.017, H * 0.026, { seed: 23 + dx, points: 12, wobble: 0.2 }), {
              couleur: LIGHT.rim,
              matiere: 'tissu',
              matiereAlpha: 0.24,
              echelle: 0.3,
              speculaire: { x: 0.3, y: 0.24, r: 0.16 },
            });
            for (let i = 0; i < 3; i += 1) {
              h.moveTo(-H * 0.012 + i * H * 0.012, H * 0.044);
              h.lineTo(-H * 0.014 + i * H * 0.013, H * 0.066);
              h.stroke({ color: eclaircir(LIGHT.rim, 0.15), width: H * 0.005, alpha: 0.8, cap: 'round' });
            }
          });
        }
        sous(g, -H * 0.005, H * 0.01, (h) => panneauGrenade(h, kk, H, H * 0.19, H * 0.27, true));
      },
      arme: (g, kk) => {
        hampe(g, kk, pt(0, H * 0.16), pt(0, -H * 0.66), H * 0.026, CHENE, 11);
        sous(g, 0, -H * 0.66, (h) => {
          poser(h, kk, blob(0, -H * 0.02, H * 0.028, H * 0.034, { seed: 5, points: 12, wobble: 0.2 }), {
            couleur: LIGHT.rim,
            matiere: 'metal',
            matiereAlpha: 0.22,
            speculaire: { x: 0.3, y: 0.26, r: 0.18 },
          });
          // fleuron : la hampe porte une pointe, sinon elle a l'air décapitée
          h.poly(flat(perturber([pt(-H * 0.012, -H * 0.04), pt(H * 0.012, -H * 0.04), pt(0, -H * 0.09)], 0.5, 9))).fill({
            color: LIGHT.rim,
            alpha: 0.92,
          });
        });
        /* La bannière : deux fois l'ancienne, portant la grenade en pleine page.
           C'est elle qu'on doit voir de l'autre bout de la vallée, pas la hampe. */
        sous(g, H * 0.02, -H * 0.8, (h) => {
          banniereTissu(h, kk, { w: H * 0.34, h: H * 0.3, couleur: k.pal.primaire, accent: LIGHT.rim, seed: 3 });
          const cx = H * 0.17;
          const cy = H * 0.15;
          poser(h, kk, blob(cx, cy, H * 0.05, H * 0.055, { seed: 11, points: 15, wobble: 0.14 }), {
            couleur: LIGHT.rim,
            matiere: 'tissu',
            matiereAlpha: 0.2,
            echelle: 0.3,
            speculaire: { x: 0.3, y: 0.24, r: 0.14 },
          });
          h.poly(
            flat(perturber([pt(cx - H * 0.014, cy - H * 0.05), pt(cx + H * 0.014, cy - H * 0.05), pt(cx, cy - H * 0.085)], 0.5, 13)),
          ).fill({ color: LIGHT.rim, alpha: 0.92 });
          for (let i = 0; i < 4; i += 1) {
            h.poly(
              flat(blob(cx - H * 0.026 + i * H * 0.017, cy + (i % 2 ? H * 0.01 : -H * 0.008), H * 0.008, H * 0.008, { seed: i + 5, points: 8, wobble: 0.3 })),
            ).fill({ color: k.pal.primaire, alpha: 0.9 });
          }
        });
      },
      armeAncre: { rot: 0.03 },
    }),
    k,
    (r) => {
      clipsBipede(r, { foulee: 0.8, allonge: 0.75 });
      clipCapacite(r, 'benediction');
      if (r.aJoint('arme')) r.joint('arme').ambiance = 0.8;
    },
  );
};

/* ──────────────────── Rang 5 — les sangliers cuirassés ──────────────────── */

/** Pente du dos du suidé : haut du garrot, bas de la croupe. */
const PENTE_SANGLIER = 0.2;

/**
 * La hure du sanglier : un COIN, un groin plat au bout, deux défenses relevées.
 *
 * **Ce qu'elle était.** Un ovale de 1,46 S sur 0,92 S, presque aussi haut que
 * long, avec un groin posé dessus et deux petites défenses de 0,3 S enroulées
 * dans le contour. Rendu à la vignette, la hure disparaissait dans la masse du
 * corps : les deux rangs cinq ne montraient qu'une caisse sur pattes.
 *
 * **Ce qu'elle est.** Une hure de suidé est un TRIANGLE : large et haut à la
 * nuque, se rétrécissant régulièrement jusqu'au disque du groin. On l'allonge à
 * 1,9 S, on lui donne l'arête frontale claire du côté du soleil, et surtout on
 * sort les DÉFENSES du contour — deux crocs d'ivoire qui remontent devant le
 * museau, celui du bas long et recourbé, celui du haut court. C'est la seule
 * chose qu'on lise à seize pixels, et c'est ce qui distingue un sanglier d'un
 * gros chien.
 */
function teteSanglier(g: Graphics, k: Kit, S: number, ferre: boolean, seed: number): void {
  const soie = melanger(CHENE, 0x2f2a22, 0.45);
  const groin = lisser(
    perturber(
      densifier(
        [
          pt(-S * 0.56, -S * 0.62), // nuque haute
          pt(-S * 0.02, -S * 0.56),
          pt(S * 0.62, -S * 0.36), // arête du chanfrein
          pt(S * 1.12, -S * 0.2),
          pt(S * 1.24, S * 0.06), // bout du groin
          pt(S * 1.02, S * 0.24),
          pt(S * 0.4, S * 0.34),
          pt(-S * 0.24, S * 0.44), // auge
          pt(-S * 0.62, S * 0.14),
        ],
        S * 0.2,
      ),
      S * 0.02,
      seed,
    ),
    1,
  );
  poser(g, k, groin, { couleur: soie, matiere: 'fourrure', matiereAlpha: 0.28, echelle: 0.4, seed });
  /* L'arête frontale, éclairée : du haut du crâne au groin. */
  poser(g, k, fuseau(-S * 0.24, -S * 0.52, S * 1.04, -S * 0.14, S * 0.22, { seed: seed + 21, taper: 0.5 }), {
    couleur: melanger(soie, LIGHT.chaude, 0.2),
    matiere: 'fourrure',
    matiereAlpha: 0.24,
    echelle: 0.34,
    modele: 0.75,
    rim: false,
  });
  // groin proprement dit : le disque cartilagineux, plus clair et plus lisse
  poser(g, k, blob(S * 1.1, S * 0.0, S * 0.19, S * 0.17, { seed: seed + 3, points: 13, wobble: 0.16 }), {
    couleur: melanger(soie, 0xb08e84, 0.5),
    matiere: 'grain',
    matiereAlpha: 0.18,
    speculaire: { x: 0.32, y: 0.28, r: 0.16 },
  });
  for (const dy of [-0.06, 0.06]) {
    g.poly(flat(blob(S * 1.16, dy * S, S * 0.035, S * 0.045, { seed: 9, points: 8, wobble: 0.24 }))).fill({
      color: assombrir(soie, 0.62),
      alpha: 0.85,
    });
  }
  // œil : petit, enfoncé, mauvais, haut et loin en arrière
  g.poly(flat(blob(S * 0.1, -S * 0.3, S * 0.11, S * 0.085, { seed: 19, points: 11, wobble: 0.2 }))).fill({
    color: ombreBleutee(soie, 0.9),
    alpha: 0.62,
  });
  g.poly(flat(blob(S * 0.12, -S * 0.29, S * 0.065, S * 0.05, { seed: 11, points: 9, wobble: 0.2 }))).fill({
    color: melanger(0x6e1f2a, 0x2a3242, 0.4),
    alpha: 0.95,
  });
  g.poly(flat(blob(S * 0.09, -S * 0.32, S * 0.026, S * 0.02, { seed: 13, points: 7, wobble: 0.26 }))).fill({
    color: LIGHT.chaude,
    alpha: 0.6,
  });
  // oreille : pavillon et conque, rejetée en arrière
  oreilleAnimale(g, k, {
    base: pt(-S * 0.26, -S * 0.52),
    pointe: pt(-S * 0.48, -S * 0.94),
    largeur: S * 0.26,
    couleur: assombrir(soie, 0.18),
    seed: seed + 5,
  });
  /*
   * Les DÉFENSES, hors du contour. Deux par côté visible : la grande du bas,
   * qui sort de la lèvre et remonte devant le chanfrein, et la petite du haut
   * qui l'accompagne. Elles font désormais 0,58 S — presque la moitié de la
   * hure — parce qu'à la vignette une défense de 0,3 S est un pixel d'ivoire.
   */
  corne(g, k, {
    cx: S * 0.86,
    cy: S * 0.26,
    rx: S * 0.5,
    ry: S * 0.58,
    a0: 1.35,
    a1: -0.55,
    ep: S * 0.15,
    couleur: ferre ? melanger(IVOIRE, LIGHT.rim, 0.4) : IVOIRE,
    seed: seed + 7,
  });
  corne(g, k, {
    cx: S * 0.94,
    cy: S * 0.02,
    rx: S * 0.3,
    ry: S * 0.34,
    a0: 1.3,
    a1: -0.3,
    ep: S * 0.1,
    couleur: ferre ? melanger(IVOIRE, LIGHT.rim, 0.25) : assombrir(IVOIRE, 0.12),
    seed: seed + 9,
  });
  if (ferre) {
    // chanfrein : plaque d'ardoise rivetée sur le front
    ferrure(
      g,
      k,
      lisser(
        perturber(
          densifier([pt(-S * 0.34, -S * 0.56), pt(S * 0.44, -S * 0.5), pt(S * 0.62, -S * 0.14), pt(S * 0.3, -S * 0.06), pt(-S * 0.26, -S * 0.2)], S * 0.2),
          S * 0.015,
          seed + 11,
        ),
        1,
      ),
      { couleur: melanger(ARDOISE, ACIER, 0.4), rivets: 4, seed },
    );
    // pointe frontale
    poser(g, k, fuseau(S * 0.1, -S * 0.5, S * 0.02, -S * 0.96, S * 0.13, { seed: seed + 13, taper: 0.6 }), {
      couleur: melanger(ACIER, LIGHT.rim, 0.25),
      matiere: 'metal',
      matiereAlpha: 0.24,
      speculaire: { x: 0.3, y: 0.2, r: 0.14 },
    });
    cicatrice(g, pt(-S * 0.1, -S * 0.34), pt(S * 0.16, -S * 0.12), soie, S * 0.05);
  }
}

function sanglierPieces(k: Kit, Hs: number, L: number, ferre: boolean): PieceDef[] {
  const soie = melanger(CHENE, 0x2f2a22, 0.45);
  return squeletteQuadrupede({
    Hs,
    L,
    robe: soie,
    ventre: melanger(soie, 0x6b5433, 0.4),
    matiere: 'fourrure',
    patteCouleur: assombrir(soie, 0.3),
    seed: k.seed + (ferre ? 90 : 80),
    /*
     * Encolure courte, épaisse, PENCHÉE VERS L'AVANT ET LE BAS. Elle était
     * tournée de −0,85 rad, ce qui pointait la hure vers le CIEL à cinquante
     * degrés : un sanglier qui hurle à la lune. Le suidé porte sa hure basse,
     * groin près du sol, épaules hautes — c'est la même ligne que la pente du
     * dos, et les deux ensemble font le coin.
     */
    cou: { longueur: Hs * 0.3, largeur: Hs * 0.52, angle: 0.5, avance: 0.7 },
    teteRot: 0.24,
    pente: PENTE_SANGLIER,
    queue: { longueur: L * 0.16, epaisseur: Hs * 0.09, courbe: 1.2 },
    tete: (g, kk) => teteSanglier(g, kk, Hs * 0.55, ferre, k.seed + 33),
    surTronc: (g, kk) => {
      /*
       * Le GARROT, d'abord. C'est la silhouette du sanglier : une bête haute de
       * l'épaule et basse de la croupe, un coin lancé en avant. Le tronc du
       * squelette quadrupède est une masse régulière — juste pour un loup, faux
       * pour un suidé —, et sans cette bosse les deux rangs cinq rendaient un
       * long parallélépipède sur quatre bâtons, ce que la planche de contact a
       * montré dès qu'elle a cessé de les afficher en timbre-poste.
       */
      const garrot = lisser(
        perturber(
          densifier(
            [
              pt(-L * 0.06, -Hs * 0.3),
              pt(L * 0.06, -Hs * 0.58),
              pt(L * 0.24, -Hs * 0.62),
              pt(L * 0.4, -Hs * 0.44),
              pt(L * 0.42, -Hs * 0.16),
              pt(L * 0.02, -Hs * 0.18),
            ],
            Hs * 0.16,
          ),
          Hs * 0.016,
          k.seed + 61,
        ),
        1,
      );
      poser(g, kk, garrot, {
        couleur: melanger(soie, 0x241f19, 0.2),
        matiere: 'fourrure',
        matiereAlpha: 0.3,
        echelle: 0.5,
        modele: 1.05,
      });

      /*
       * La barde ensuite, et elle couvre le FLANC.
       *
       * Elle ne courait que le long de l'échine, en plaques étroites et
       * bleutées : rendu à l'écran, cela faisait une rangée d'onglets bleus
       * posée sur un dos, là où le rendu de référence montre un caparaçon de
       * plaques larges, rivetées, d'un acier chaud qui a pris la mousse. Le
       * bleu venait de l'ardoise : on garde l'acier et on le réchauffe au chêne.
       */
      /*
       * La barde suit désormais la LIGNE DU DOS, qui descend vers la croupe
       * (`pente`). Elle était posée à hauteur constante : sur un dos droit cela
       * passait, sur un dos en pente les plaques arrière flottaient au-dessus de
       * l'échine et les avant s'enfonçaient dans l'épaule. `ligneDos` donne la
       * hauteur du dos en tout point ; toutes les pièces d'acier s'y accrochent.
       */
      const acierChaud = melanger(ACIER, CHENE, ferre ? 0.26 : 0.4);
      const ligneDos = (x: number): number => -Hs * 0.34 + PENTE_SANGLIER * Hs * (0.5 - x / L) * 1.2;
      for (let i = 0; i < 3; i += 1) {
        const x = -L * 0.2 + i * L * 0.2;
        const flanc = lisser(
          perturber(
            densifier(
              [
                pt(x - L * 0.1, ligneDos(x - L * 0.1) + Hs * (0.04 + i * 0.04)),
                pt(x + L * 0.1, ligneDos(x + L * 0.1) + Hs * (0.0 + i * 0.04)),
                pt(x + L * 0.09, Hs * (0.06 - i * 0.03)),
                pt(x - L * 0.09, Hs * (0.08 - i * 0.03)),
              ],
              Hs * 0.16,
            ),
            Hs * 0.014,
            i * 11 + 5,
          ),
          1,
        );
        ferrure(g, kk, flanc, { couleur: acierChaud, rivets: 4, seed: i * 5 + 1 });
      }

      // bardes rivetées le long de l'échine, par-dessus le caparaçon
      const n = ferre ? 5 : 4;
      for (let i = 0; i < n; i += 1) {
        const x = -L * 0.3 + (i / (n - 1)) * L * 0.62;
        const h0 = ligneDos(x);
        const plaque = lisser(
          perturber(
            densifier(
              [pt(x - L * 0.07, h0), pt(x + L * 0.07, h0 - Hs * 0.02), pt(x + L * 0.06, h0 + Hs * 0.28), pt(x - L * 0.06, h0 + Hs * 0.3)],
              Hs * 0.14,
            ),
            Hs * 0.012,
            i * 7 + 3,
          ),
          1,
        );
        ferrure(g, kk, plaque, {
          couleur: eclaircir(acierChaud, ferre ? 0.12 : 0),
          rivets: 2,
          seed: i * 3,
        });
        if (ferre) {
          // pointes de la dossière
          poser(g, kk, fuseau(x, h0, x - L * 0.01, h0 - Hs * 0.22, Hs * 0.09, { seed: i + 2, taper: 0.6 }), {
            couleur: melanger(ACIER, LIGHT.rim, 0.2),
            matiere: 'metal',
            matiereAlpha: 0.24,
            speculaire: { x: 0.3, y: 0.24, r: 0.12 },
          });
        }
      }
      // soies dressées entre les plaques
      for (let i = 0; i < 12; i += 1) {
        const x = -L * 0.34 + (i / 11) * L * 0.66;
        const h0 = ligneDos(x) + Hs * 0.02;
        g.moveTo(x, h0);
        g.quadraticCurveTo(x - L * 0.012, h0 - Hs * 0.12, x - L * 0.025, h0 - Hs * 0.18);
        g.stroke({
          color: i % 2 ? eclaircir(soie, 0.25) : ombreBleutee(soie, 0.5),
          width: Hs * 0.018,
          alpha: 0.65,
          cap: 'round',
        });
      }
      if (ferre) {
        cicatrice(g, pt(-L * 0.1, -Hs * 0.02), pt(L * 0.1, Hs * 0.14), soie, Hs * 0.035);
        cicatrice(g, pt(L * 0.18, -Hs * 0.14), pt(L * 0.3, Hs * 0.02), soie, Hs * 0.03);
      }
    },
  });
}

const sanglier: Fabrique = (k) =>
  creatureRig(
    { hauteur: 62, empriseSol: 46, respiration: 'tronc', graine: k.seed + 8, teinteMort: CHENE },
    sanglierPieces(k, 52, 96, false),
    k,
    (r) => {
      clipsQuadrupede(r, { foulee: 1.05, allonge: 1.35, lourdeur: 0.95 });
      clipCapacite(r, 'hurlement');
    },
  );

const verratGranit: Fabrique = (k) =>
  creatureRig(
    { hauteur: 70, empriseSol: 52, respiration: 'tronc', graine: k.seed + 9, teinteMort: ARDOISE },
    sanglierPieces(k, 58, 108, true),
    k,
    (r) => {
      clipsQuadrupede(r, { foulee: 1.1, allonge: 1.6, lourdeur: 1.1 });
      clipCapacite(r, 'hurlement');
    },
  );

/* ─────────────────── Rang 6 — la chevalerie du Forez ────────────────────── */

/**
 * La tête du cheval — le morceau qui décidait de la lecture des deux rangs six.
 *
 * **Ce qu'elle était.** Un heptagone lissé de 1,3 S de long sur 0,9 S de haut,
 * c'est-à-dire un GALET : ni chanfrein, ni ganache, ni encolure attachée. À la
 * vignette on lisait « un cheval avec quelque chose dessus », et encore : la
 * mesure a montré que ce galet tombait en x[−8..48] y[−161..−107], exactement
 * sous l'écu du cavalier (x[−13..27] y[−142..−93]) et peint AVANT lui. La tête
 * du cheval n'était pas seulement mal dessinée, elle était cachée derrière le
 * bouclier de l'homme qu'elle porte. C'est l'encolure qui l'y mettait, et c'est
 * elle qu'on redresse en premier (voir `monturePieces`).
 *
 * **Ce qu'elle est.** Un profil de cheval tient en quatre choses, dans cet
 * ordre d'importance à seize pixels : la LONGUEUR (deux fois plus long que
 * haut), le CHANFREIN (l'arête droite et claire du front au naseau, côté
 * soleil), la GANACHE (la joue lourde à l'arrière, dans l'ombre froide, qui
 * dit où s'attache l'encolure) et les OREILLES dressées à la nuque. Le naseau
 * en virgule et la bouche fendue font le reste. Le tout mesure 1,95 S sur
 * 1,15 S : c'est ce rapport-là, et non le détail, qui fait lire un cheval.
 */
function teteCheval(g: Graphics, k: Kit, S: number, robe: number, chanfrein: boolean, seed: number): void {
  /* La ganache d'abord, derrière tout : la joue déborde du crâne vers le bas et
     l'arrière, et c'est ce qui empêche la tête d'être un fuseau. */
  poser(g, k, blob(-S * 0.12, S * 0.06, S * 0.44, S * 0.42, { seed: seed + 11, points: 15, wobble: 0.18 }), {
    couleur: assombrir(robe, 0.16),
    matiere: 'fourrure',
    matiereAlpha: 0.26,
    echelle: 0.36,
    modele: 1.05,
    seed: seed + 2,
  });

  const forme = lisser(
    perturber(
      densifier(
        [
          pt(-S * 0.5, -S * 0.48), // nuque
          pt(-S * 0.14, -S * 0.6), // front
          pt(S * 0.32, -S * 0.55), // haut du chanfrein
          pt(S * 0.78, -S * 0.42), // chanfrein
          pt(S * 1.16, -S * 0.26), // montant du naseau
          pt(S * 1.34, S * 0.0), // bout du nez
          pt(S * 1.2, S * 0.18), // lèvre inférieure
          pt(S * 0.84, S * 0.2), // commissure
          pt(S * 0.34, S * 0.34), // auge
          pt(-S * 0.16, S * 0.46), // ganache
          pt(-S * 0.54, S * 0.16), // gorge
        ],
        S * 0.18,
      ),
      S * 0.016,
      seed,
    ),
    1,
  );
  poser(g, k, forme, { couleur: robe, matiere: 'fourrure', matiereAlpha: 0.24, echelle: 0.4, seed });

  /* Le chanfrein : l'arête claire du front au naseau, du côté du soleil. C'est
     la seule bande vraiment éclairée de la tête, et c'est elle qu'on lit de
     loin. */
  poser(g, k, fuseau(S * 0.06, -S * 0.5, S * 1.14, -S * 0.16, S * 0.2, { seed: seed + 13, taper: 0.5 }), {
    couleur: melanger(robe, LIGHT.chaude, 0.24),
    matiere: 'fourrure',
    matiereAlpha: 0.2,
    echelle: 0.34,
    modele: 0.75,
    rim: false,
  });
  /* L'ombre de l'auge, sous la joue : la valeur froide qui creuse la tête. */
  g.moveTo(-S * 0.3, S * 0.24);
  g.quadraticCurveTo(S * 0.3, S * 0.36, S * 0.86, S * 0.16);
  g.stroke({ color: ombreBleutee(robe, 0.7), width: S * 0.12, alpha: 0.45, cap: 'round' });

  // naseau en virgule, et sa lèvre
  g.poly(flat(blob(S * 1.12, -S * 0.06, S * 0.1, S * 0.08, { seed: 5, points: 11, wobble: 0.3 }))).fill({
    color: assombrir(robe, 0.62),
    alpha: 0.88,
  });
  g.moveTo(S * 0.9, S * 0.12);
  g.quadraticCurveTo(S * 1.1, S * 0.16, S * 1.26, S * 0.04);
  g.stroke({ color: ombreBleutee(robe, 0.9), width: S * 0.055, alpha: 0.8, cap: 'round' });

  // œil : creux orbital, prunelle, étincelle au nord-ouest
  g.poly(flat(blob(S * 0.14, -S * 0.3, S * 0.15, S * 0.12, { seed: 17, points: 12, wobble: 0.2 }))).fill({
    color: ombreBleutee(robe, 0.85),
    alpha: 0.7,
  });
  g.poly(flat(blob(S * 0.16, -S * 0.29, S * 0.085, S * 0.07, { seed: 7, points: 10, wobble: 0.2 }))).fill({
    color: melanger(0x2a3242, CHENE, 0.22),
    alpha: 0.95,
  });
  g.poly(flat(blob(S * 0.12, -S * 0.33, S * 0.03, S * 0.024, { seed: 9, points: 7, wobble: 0.26 }))).fill({
    color: LIGHT.chaude,
    alpha: 0.72,
  });

  // oreilles dressées à la nuque, pavillon et conque
  for (const [bx, by, tx, ty] of [
    [-0.34, -0.5, -0.5, -0.94],
    [-0.08, -0.58, -0.12, -1.0],
  ] as const) {
    oreilleAnimale(g, k, {
      base: pt(S * bx, S * by),
      pointe: pt(S * tx, S * ty),
      largeur: S * 0.22,
      couleur: assombrir(robe, 0.18),
      seed: seed + bx * 40,
    });
  }
  /* Le toupet : trois mèches entre les oreilles, retombant sur le front. Sans
     lui, la crinière s'arrête net à la nuque et la tête paraît rapportée. */
  criniereMeches(g, k, {
    a: pt(-S * 0.3, -S * 0.54),
    b: pt(-S * 0.02, -S * 0.6),
    nombre: 3,
    longueur: S * 0.42,
    largeur: S * 0.13,
    couleur: assombrir(robe, 0.34),
    inclinaison: -0.9,
    seed: seed + 23,
  });

  // bride : têtière, montant de mors et muserolle
  g.moveTo(-S * 0.24, -S * 0.5);
  g.quadraticCurveTo(-S * 0.34, -S * 0.1, -S * 0.24, S * 0.3);
  g.stroke({ color: assombrir(CHENE, 0.3), width: S * 0.055, alpha: 0.85, cap: 'round' });
  g.moveTo(-S * 0.2, -S * 0.42);
  g.quadraticCurveTo(S * 0.3, -S * 0.2, S * 0.82, S * 0.02);
  g.stroke({ color: assombrir(CHENE, 0.3), width: S * 0.05, alpha: 0.85, cap: 'round' });
  g.moveTo(S * 0.74, -S * 0.4);
  g.quadraticCurveTo(S * 0.86, -S * 0.1, S * 0.78, S * 0.16);
  g.stroke({ color: assombrir(CHENE, 0.34), width: S * 0.045, alpha: 0.8, cap: 'round' });
  if (chanfrein) {
    ferrure(
      g,
      k,
      lisser(
        perturber(
          densifier(
            [pt(-S * 0.08, -S * 0.58), pt(S * 0.44, -S * 0.52), pt(S * 1.06, -S * 0.24), pt(S * 0.98, -S * 0.04), pt(S * 0.36, -S * 0.22), pt(-S * 0.1, -S * 0.34)],
            S * 0.18,
          ),
          S * 0.014,
          seed + 3,
        ),
        1,
      ),
      { couleur: melanger(ACIER, LIGHT.rim, 0.2), rivets: 3, seed },
    );
  }
}

function monturePieces(k: Kit, banneret: boolean): PieceDef[] {
  const Hs = banneret ? 84 : 80;
  const L = banneret ? 116 : 110;
  const robeCheval = banneret ? melanger(CHENE, 0x3d3128, 0.5) : melanger(CHENE, 0x7a5f3c, 0.35);
  const capa = k.pal.primaire;
  const teint = TEINTS[banneret ? 3 : 1];
  const pieces: PieceDef[] = [];

  pieces.push({ nom: 'corps', x: 0, y: -Hs, ordreMort: 7, dessin: () => {} });

  const fanon = (g: Graphics, kk: Kit, len: number, w: number, poil: number): void => {
    poser(g, kk, blob(0, len * 0.86, w * 0.62, w * 0.5, { seed: 4, points: 12, wobble: 0.3 }), {
      couleur: eclaircir(poil, 0.3),
      matiere: 'fourrure',
      matiereAlpha: 0.3,
      echelle: 0.3,
      modele: 0.8,
    });
  };

  const jambe = (nom: string, x: number, len: number, w: number, cote: number): PieceDef => ({
    nom,
    parent: 'corps',
    x,
    y: Hs * 0.06,
    lumiere: cote > 0 ? -0.6 : 0.6,
    ordreMort: cote > 0 ? 1 : 4,
    dessin: (g, kk) => {
      membre(g, kk, pt(0, 0), pt(cote * 3, len), w, {
        couleur: cote > 0 ? assombrir(robeCheval, 0.2) : robeCheval,
        matiere: 'fourrure',
        matiereAlpha: 0.22,
        echelle: 0.4,
        seed: k.seed + x,
      });
      sous(g, cote * 4, len * 0.99, (h) =>
        pied(h, kk, { l: Hs * 0.14, h: Hs * 0.055, couleur: melanger(ARDOISE, CHENE, 0.4), seed: k.seed + len }),
      );
      fanon(g, kk, len, w, robeCheval);
    },
  });

  pieces.push(jambe('patte_ad', L * 0.31, Hs * 0.9, Hs * 0.14, 1));
  pieces.push(jambe('patte_pd', -L * 0.3, Hs * 0.88, Hs * 0.16, 1));

  pieces.push({
    nom: 'queue',
    parent: 'corps',
    x: -L * 0.46,
    y: -Hs * 0.16,
    rot: 2.4,
    lumiere: -0.3,
    ambiance: 1.7,
    periode: 3.6,
    ordreMort: 2,
    dessin: (g, kk) =>
      dessinerQueue(g, kk, {
        longueur: L * 0.42,
        epaisseur: Hs * 0.2,
        couleur: assombrir(robeCheval, 0.24),
        courbe: 0.5,
        matiere: 'fourrure',
        seed: k.seed + 5,
      }),
  });

  pieces.push({
    nom: 'tronc',
    parent: 'corps',
    x: 0,
    y: 0,
    ordreMort: 8,
    dessin: (g, kk) => {
      const corps = lisser(
        perturber(
          densifier(
            [
              pt(-L * 0.48, -Hs * 0.16),
              pt(-L * 0.2, -Hs * 0.36),
              pt(L * 0.24, -Hs * 0.34),
              pt(L * 0.46, -Hs * 0.1),
              pt(L * 0.4, Hs * 0.14),
              pt(0, Hs * 0.24),
              pt(-L * 0.4, Hs * 0.12),
            ],
            Hs * 0.16,
          ),
          Hs * 0.012,
          k.seed + 61,
        ),
        1,
      );
      poser(g, kk, corps, { couleur: robeCheval, matiere: 'fourrure', matiereAlpha: 0.24, echelle: 0.4 });
      // caparaçon aux couleurs de la Châtellenie
      const cap = lisser(
        perturber(
          densifier(
            [pt(-L * 0.36, -Hs * 0.18), pt(L * 0.3, -Hs * 0.2), pt(L * 0.26, Hs * 0.3), pt(L * 0.05, Hs * 0.22), pt(-L * 0.14, Hs * 0.34), pt(-L * 0.34, Hs * 0.2)],
            Hs * 0.16,
          ),
          Hs * 0.014,
          k.seed + 63,
        ),
        1,
      );
      poser(g, kk, cap, { couleur: capa, matiere: 'tissu', matiereAlpha: 0.24, echelle: 0.55 });
      if (banneret) {
        orfevrerie(g, [pt(-L * 0.34, Hs * 0.18), pt(-L * 0.12, Hs * 0.3), pt(L * 0.06, Hs * 0.2), pt(L * 0.26, Hs * 0.26)], {
          epaisseur: 2,
        });
        for (let i = 0; i < 3; i += 1) {
          const x = -L * 0.2 + i * L * 0.2;
          g.poly(flat(blob(x, Hs * 0.02, Hs * 0.05, Hs * 0.055, { seed: i + 3, points: 12, wobble: 0.18 }))).fill({
            color: LIGHT.rim,
            alpha: 0.85,
          });
        }
      }
      // sangle et selle
      g.moveTo(-L * 0.05, -Hs * 0.34);
      g.quadraticCurveTo(-L * 0.02, 0, -L * 0.04, Hs * 0.26);
      g.stroke({ color: assombrir(CHENE, 0.35), width: Hs * 0.05, alpha: 0.8 });
      poser(g, kk, blob(-L * 0.04, -Hs * 0.36, L * 0.12, Hs * 0.07, { seed: 7, points: 14, wobble: 0.18 }), {
        couleur: assombrir(CHENE, 0.2),
        matiere: 'grain',
        matiereAlpha: 0.2,
      });
    },
  });

  /*
   * ── l'encolure, et la place de la tête ──
   *
   * L'encolure partait tout droit vers le haut de son repère, articulation
   * tournée de −0,9 rad pour la coucher. Une rotation négative emmène le sommet
   * du fût vers l'ARRIÈRE : mesurée, l'encolure s'attachait en x = +40 et
   * retombait en x = 0, si bien que la tête du cheval se posait au-dessus du
   * MILIEU DU DOS — c'est-à-dire sous l'écu du cavalier, et peinte avant lui,
   * donc invisible. C'est la vraie raison de « la tête du cheval est un galet » :
   * on n'en voyait qu'un bout de joue dépassant du bouclier.
   *
   * On tourne donc l'articulation dans l'AUTRE sens : le fût monte vers l'avant,
   * la nuque passe devant le poitrail, et la tête sort franchement du gabarit du
   * cavalier. Le port de tête (le nez qui pique un peu vers le bas, comme un
   * cheval de guerre rassemblé) est repris par la rotation propre de `tete`.
   *
   * Le fût lui-même n'est plus un fuseau symétrique mais un polygone : encolure
   * large au garrot, CRÊTE convexe au-dessus, gorge creuse en dessous. Un
   * fuseau ne peut pas faire cela, et c'est ce galbe qui distingue une encolure
   * de cheval d'un tuyau.
   */
  const couL = Hs * 0.42;
  const couW = Hs * 0.3;
  pieces.push({
    nom: 'cou',
    parent: 'corps',
    x: L * 0.4,
    y: -Hs * 0.3,
    rot: 0.52,
    lumiere: 0.4,
    ordreMort: 6,
    dessin: (g, kk) => {
      const fut = lisser(
        perturber(
          densifier(
            [
              pt(couW * 0.62, Hs * 0.08), // attache basse, côté poitrail
              pt(couW * 0.34, -couL * 0.5), // gorge creuse
              pt(couW * 0.2, -couL * 1.0), // auge, sous la nuque
              pt(-couW * 0.48, -couL * 1.02), // nuque
              pt(-couW * 0.95, -couL * 0.44), // crête convexe
              pt(-couW * 0.86, Hs * 0.04), // garrot
            ],
            couW * 0.24,
          ),
          couW * 0.02,
          k.seed + 65,
        ),
        1,
      );
      poser(g, kk, fut, {
        couleur: robeCheval,
        matiere: 'fourrure',
        matiereAlpha: 0.22,
        echelle: 0.4,
        seed: k.seed + 65,
      });
      /* La gouttière jugulaire : l'ombre froide qui sépare l'encolure de
         l'épaule. Sans elle, cou et poitrail se fondent en une seule masse. */
      g.moveTo(couW * 0.5, Hs * 0.04);
      g.quadraticCurveTo(couW * 0.36, -couL * 0.5, couW * 0.2, -couL * 0.94);
      g.stroke({ color: ombreBleutee(robeCheval, 0.8), width: couW * 0.16, alpha: 0.4, cap: 'round' });
    },
  });

  pieces.push({
    nom: 'criniere',
    parent: 'cou',
    x: 0,
    y: 0,
    lumiere: -0.2,
    ambiance: 1.4,
    periode: 2.8,
    ordreMort: 5,
    dessin: (g, kk) => {
      /* Des MÈCHES le long de la crête, jamais l'aplat qui y était : un
         polygone sombre d'un seul ton collé au cou, que la loi n°1 refuse. */
      criniereMeches(g, kk, {
        a: pt(-couW * 0.8, -couL * 0.04),
        b: pt(-couW * 0.44, -couL * 0.98),
        nombre: banneret ? 8 : 7,
        longueur: couW * 0.72,
        largeur: couW * 0.24,
        couleur: assombrir(robeCheval, 0.34),
        inclinaison: 0.34,
        seed: k.seed + 67,
      });
    },
  });

  pieces.push({
    nom: 'tete',
    parent: 'cou',
    x: couW * 0.06,
    y: -couL * 1.0,
    rot: -0.22,
    lumiere: 0.6,
    ordreMort: 10,
    dessin: (g, kk) => teteCheval(g, kk, Hs * 0.42, robeCheval, banneret, k.seed + 69),
  });

  /* ── le cavalier ──
   *
   * **Le cavalier en PLATES : épaulière, heaume à plumail, écu chargé.**
   *
   * Le rendu de référence du Chevalier du Forez montre un homme entièrement
   * harnaché : deux épaulières lamellées qui débordent largement du torse, un
   * heaume à visière surmonté d'un plumail qui monte aussi haut que la tête, un
   * écu en amande bordé d'or tenu bien EN AVANT du corps, et la lance couchée
   * sous l'aisselle. Sur la planche de contact, le cavalier était un piquet
   * bleu-gris de trente pixels sur la croupe : l'écu était poussé derrière le
   * buste par l'ordre de dessin, donc invisible ; les épaulières faisaient huit
   * pixels ; et le plumail n'existait que sur le banneret. On avait deux formes
   * de rang six où le CHEVAL portait toute la lecture et où l'homme dessus
   * n'était qu'une tache.
   *
   * Trois corrections, dans cet ordre d'importance : l'écu passe DEVANT (il est
   * empilé après le buste), il double de taille ; les épaulières deviennent des
   * lames débordantes ; et le chevalier reçoit son plumail, ivoire et grenat,
   * pour que la tête existe contre le ciel.
   */

  pieces.push({ nom: 'cavalier', parent: 'corps', x: -L * 0.04, y: -Hs * 0.42, ordreMort: 9, dessin: () => {} });

  const HB = Hs * 0.92;
  pieces.push({
    nom: 'bras_d',
    parent: 'cavalier',
    x: HB * 0.08,
    y: -HB * 0.3,
    rot: 0.4,
    lumiere: -0.8,
    ordreMort: 3,
    dessin: (g, kk) => {
      membre(g, kk, pt(0, 0), pt(HB * 0.06, HB * 0.26), HB * 0.075, {
        couleur: assombrir(ACIER, 0.24),
        matiere: 'metal',
        matiereAlpha: 0.22,
        echelle: 0.4,
        seed: k.seed + 71,
      });
    },
  });

  pieces.push({
    nom: 'buste',
    parent: 'cavalier',
    x: 0,
    y: 0,
    ordreMort: 9,
    dessin: (g, kk) => {
      // jambes du cavalier, repliées de part et d'autre de la selle, genou marqué
      for (const cote of [1, -1] as const) {
        sous(g, cote * HB * 0.05, HB * 0.02, (h) => {
          membre(h, kk, pt(0, 0), pt(cote * HB * 0.12, HB * 0.24), HB * 0.1, {
            couleur: cote > 0 ? assombrir(ARDOISE, 0.2) : ARDOISE,
            matiere: 'metal',
            matiereAlpha: 0.2,
            echelle: 0.4,
            seed: k.seed + cote,
          });
          membre(h, kk, pt(cote * HB * 0.12, HB * 0.22), pt(cote * HB * 0.18, HB * 0.44), HB * 0.075, {
            couleur: cote > 0 ? assombrir(ARDOISE, 0.28) : assombrir(ARDOISE, 0.08),
            matiere: 'metal',
            matiereAlpha: 0.2,
            echelle: 0.4,
            seed: k.seed + cote * 3,
          });
          // genouillère : une écaille de plates, avec son point de lumière
          poser(h, kk, blob(cote * HB * 0.13, HB * 0.23, HB * 0.05, HB * 0.042, { seed: 7 + cote, points: 12, wobble: 0.2 }), {
            couleur: melanger(ACIER, ARDOISE, 0.2),
            matiere: 'metal',
            matiereAlpha: 0.24,
            speculaire: { x: 0.3, y: 0.24, r: 0.16 },
          });
          sous(h, cote * HB * 0.2, HB * 0.46, (c) =>
            pied(c, kk, { l: HB * 0.14, h: HB * 0.05, couleur: assombrir(ARDOISE, 0.38), seed: 3 }),
          );
          // étrier : l'anneau sous la botte, qui dit que l'homme est en selle
          if (cote < 0) {
            sous(h, cote * HB * 0.2, HB * 0.5, (c) =>
              poser(c, kk, arcBande(0, 0, HB * 0.05, HB * 0.04, 0.2, 2.94, HB * 0.02, 0), {
                couleur: melanger(ACIER, LIGHT.rim, banneret ? 0.3 : 0.1),
                matiere: 'metal',
                matiereAlpha: 0.24,
                speculaire: { x: 0.3, y: 0.26, r: 0.14 },
              }),
            );
          }
        });
      }
      const t = lisser(
        perturber(
          densifier(
            [pt(-HB * 0.15, -HB * 0.36), pt(HB * 0.16, -HB * 0.35), pt(HB * 0.14, -HB * 0.02), pt(-HB * 0.13, 0)],
            HB * 0.12,
          ),
          HB * 0.012,
          k.seed + 75,
        ),
        1,
      );
      poser(g, kk, t, {
        couleur: melanger(ACIER, ARDOISE, 0.45),
        matiere: 'metal',
        matiereAlpha: 0.24,
        echelle: 0.4,
        speculaire: { x: 0.26, y: 0.24, r: 0.1 },
      });
      // surcot grenat
      const sc = lisser(
        perturber(
          densifier([pt(-HB * 0.12, -HB * 0.3), pt(HB * 0.12, -HB * 0.29), pt(HB * 0.1, HB * 0.02), pt(-HB * 0.1, HB * 0.03)], HB * 0.12),
          HB * 0.01,
          k.seed + 77,
        ),
        1,
      );
      poser(g, kk, sc, { couleur: k.pal.primaire, matiere: 'tissu', matiereAlpha: 0.24, echelle: 0.5, modele: 0.85 });
      if (banneret) {
        orfevrerie(g, [pt(-HB * 0.11, -HB * 0.28), pt(0, -HB * 0.32), pt(HB * 0.11, -HB * 0.27)], { epaisseur: 1.8 });
        orfevrerie(g, [pt(0, -HB * 0.3), pt(0, HB * 0.01)], { epaisseur: 1.6, alpha: 0.7 });
      }
      /* Épaulières lamellées : trois lames par épaule, débordant de moitié
         au-delà du torse. À huit pixels de large elles ne faisaient rien ; c'est
         leur DÉBORDEMENT qui donne au cavalier sa carrure de plates, et c'est ce
         que montre le rendu. */
      for (const cote of [1, -1] as const) {
        for (let i = 0; i < 3; i += 1) {
          const lame = lisser(
            perturber(
              densifier(
                [
                  pt(cote * HB * 0.06, -HB * (0.33 - i * 0.055)),
                  pt(cote * HB * (0.24 + i * 0.02), -HB * (0.31 - i * 0.05)),
                  pt(cote * HB * (0.22 + i * 0.02), -HB * (0.25 - i * 0.05)),
                  pt(cote * HB * 0.05, -HB * (0.27 - i * 0.055)),
                ],
                HB * 0.04,
              ),
              HB * 0.006,
              k.seed + 83 + i * 3 + cote,
            ),
            1,
          );
          poser(g, kk, lame, {
            couleur:
              cote > 0
                ? assombrir(ACIER, 0.2 + i * 0.05)
                : melanger(ACIER, LIGHT.rim, (banneret ? 0.28 : 0.06) + i * 0.03),
            matiere: 'metal',
            matiereAlpha: 0.24,
            echelle: 0.4,
            speculaire: { x: 0.3, y: 0.24, r: 0.13 },
            seed: k.seed + i,
          });
        }
      }
    },
  });

  /* L'écu passe DEVANT le buste : c'est le seul changement qui compte, et il est
     purement d'ordre d'empilement. Poussé avant `buste`, il disparaissait
     derrière le torse et le cavalier n'avait pas d'armes parlantes. */
  pieces.push({
    nom: 'bouclier',
    parent: 'bras_d',
    x: HB * 0.16,
    y: HB * 0.2,
    rot: -0.2,
    lumiere: -0.7,
    ordreMort: 3,
    dessin: (g, kk) =>
      ecu(g, kk, {
        w: HB * 0.42,
        h: HB * 0.54,
        couleur: k.pal.primaire,
        bord: banneret ? LIGHT.rim : melanger(ACIER, LIGHT.rim, 0.3),
        meuble: banneret ? 'borne' : 'croix',
        seed: k.seed + 73,
      }),
  });

  pieces.push({
    nom: 'tete_cavalier',
    parent: 'cavalier',
    x: 0,
    y: -HB * 0.46,
    lumiere: 0.5,
    ordreMort: 10,
    dessin: (g, kk) => {
      const r = HB * 0.11;
      // heaume fermé : la Châtellenie ne montre pas ses visages en bataille
      const heaume = lisser(
        perturber(
          densifier(
            [pt(-r * 0.96, -r * 0.4), pt(-r * 0.7, -r * 1.12), pt(r * 0.24, -r * 1.26), pt(r * 0.96, -r * 0.72), pt(r * 1.02, r * 0.32), pt(r * 0.34, r * 0.86), pt(-r * 0.66, r * 0.56)],
            r * 0.34,
          ),
          r * 0.03,
          k.seed + 79,
        ),
        1,
      );
      poser(g, kk, heaume, {
        couleur: melanger(ACIER, ARDOISE, 0.3),
        matiere: 'metal',
        matiereAlpha: 0.24,
        echelle: 0.4,
        speculaire: { x: 0.28, y: 0.2, r: 0.11 },
      });
      // fente de vue et ventail
      g.moveTo(-r * 0.6, -r * 0.16);
      g.lineTo(r * 0.86, -r * 0.24);
      g.stroke({ color: ombreBleutee(ARDOISE, 1), width: r * 0.16, alpha: 0.9, cap: 'round' });
      for (let i = 0; i < 4; i += 1) {
        g.moveTo(r * (0.1 + i * 0.16), r * 0.16);
        g.lineTo(r * (0.24 + i * 0.16), r * 0.44);
        g.stroke({ color: ombreBleutee(ARDOISE, 0.8), width: r * 0.07, alpha: 0.6, cap: 'round' });
      }
      if (banneret) {
        orfevrerie(g, [pt(-r * 0.8, -r * 0.5), pt(r * 0.2, -r * 1.16), pt(r * 0.9, -r * 0.6)], { epaisseur: r * 0.13 });
      }
      /* Le plumail, sur les DEUX cavaliers. Le rendu du chevalier de base en
         porte un aussi haut que son heaume, et sans lui la tête du cavalier
         n'est qu'un galet gris qui se perd dans la croupe du cheval : elle a
         besoin de quelque chose qui monte contre le ciel. Le banneret le garde
         plus haut et plus fourni, l'écart de rang tient là. */
      sous(g, -r * 0.1, -r * 1.2, (h) => {
        const n = banneret ? 4 : 3;
        for (let i = 0; i < n; i += 1) {
          poser(
            h,
            kk,
            fuseau(
              i * r * 0.14 - r * 0.14,
              0,
              i * r * 0.26 - r * 0.46,
              -r * ((banneret ? 1.3 : 1.05) + i * 0.26),
              r * 0.34,
              { seed: i, taper: 0.5 },
            ),
            {
              couleur: i % 2 ? IVOIRE : k.pal.primaire,
              matiere: 'plumes',
              matiereAlpha: 0.3,
              echelle: 0.3,
            },
          );
        }
        // douille du cimier : le plumail est planté, il ne pousse pas
        poser(h, kk, blob(-r * 0.02, r * 0.05, r * 0.2, r * 0.12, { seed: 21, points: 11, wobble: 0.2 }), {
          couleur: banneret ? LIGHT.rim : melanger(ACIER, LIGHT.rim, 0.25),
          matiere: 'metal',
          matiereAlpha: 0.24,
          speculaire: { x: 0.3, y: 0.24, r: 0.18 },
        });
      });
    },
  });

  pieces.push({
    nom: 'bras_g',
    parent: 'cavalier',
    x: -HB * 0.07,
    y: -HB * 0.28,
    rot: banneret ? -0.15 : 1.15,
    lumiere: 0.8,
    ordreMort: 5,
    dessin: (g, kk) => {
      membre(g, kk, pt(0, 0), pt(0, HB * 0.28), HB * 0.08, {
        couleur: melanger(ACIER, ARDOISE, 0.2),
        matiere: 'metal',
        matiereAlpha: 0.22,
        echelle: 0.4,
        seed: k.seed + 81,
      });
      sous(g, 0, HB * 0.3, (h) => main(h, kk, { r: HB * 0.045, teint, seed: 5 }));
    },
  });

  pieces.push({
    nom: 'arme',
    parent: 'bras_g',
    x: 0,
    y: HB * 0.3,
    rot: banneret ? 0.06 : -0.28,
    lumiere: 0.2,
    ordreMort: 0,
    dessin: (g, kk) => {
      if (banneret) {
        hampe(g, kk, pt(0, HB * 0.2), pt(-HB * 0.04, -HB * 1.35), HB * 0.035, CHENE, 13);
        sous(g, -HB * 0.04, -HB * 1.35, (h) => {
          poser(h, kk, blob(0, -HB * 0.03, HB * 0.04, HB * 0.05, { seed: 6, points: 12, wobble: 0.2 }), {
            couleur: LIGHT.rim,
            matiere: 'metal',
            matiereAlpha: 0.24,
            speculaire: { x: 0.3, y: 0.24, r: 0.16 },
          });
        });
        sous(g, -HB * 0.03, -HB * 1.3, (h) =>
          banniereTissu(h, kk, { w: HB * 0.5, h: HB * 0.46, couleur: k.pal.primaire, accent: LIGHT.rim, seed: 2 }),
        );
      } else {
        // lance couchée : la longue diagonale qui signe le rang 6
        hampe(g, kk, pt(-HB * 0.3, HB * 0.1), pt(HB * 1.5, -HB * 0.2), HB * 0.038, CHENE, 15);
        sous(g, HB * 1.5, -HB * 0.2, (h) =>
          fer(h, kk, pivoterPointe(pointeLance(HB * 0.22, HB * 0.09)), melanger(ACIER, LIGHT.rim, 0.1)),
        );
        // rondelle de garde
        sous(g, -HB * 0.05, HB * 0.04, (h) =>
          poser(h, kk, blob(0, 0, HB * 0.075, HB * 0.075, { seed: 9, points: 14, wobble: 0.16 }), {
            couleur: melanger(ACIER, ARDOISE, 0.3),
            matiere: 'metal',
            matiereAlpha: 0.24,
            speculaire: { x: 0.3, y: 0.26, r: 0.14 },
          }),
        );
        // pennon
        sous(g, HB * 1.05, -HB * 0.14, (h) =>
          banniereTissu(h, kk, { w: HB * 0.34, h: HB * 0.16, couleur: k.pal.primaire, accent: LIGHT.rim, seed: 4 }),
        );
      }
    },
  });

  pieces.push(jambe('patte_ag', L * 0.26, Hs * 0.94, Hs * 0.15, -1));
  pieces.push(jambe('patte_pg', -L * 0.35, Hs * 0.92, Hs * 0.17, -1));

  return pieces;
}

/** Oriente la pointe de lance vers l'avant (la fabrique la dessine vers le haut). */
function pivoterPointe(poly: Poly): Poly {
  return poly.map((q) => pt(-q.y, q.x));
}

const chevalier: Fabrique = (k) =>
  creatureRig(
    { hauteur: 130, empriseSol: 58, respiration: 'tronc', graine: k.seed + 10, teinteMort: ARDOISE },
    monturePieces(k, false),
    k,
    (r) => {
      clipsMonture(r, { foulee: 1.05, allonge: 1.5 });
      clipCapacite(r, 'levee');
    },
  );

const banneret: Fabrique = (k) =>
  creatureRig(
    { hauteur: 140, empriseSol: 60, respiration: 'tronc', graine: k.seed + 11, teinteMort: LIGHT.rim },
    monturePieces(k, true),
    k,
    (r) => {
      clipsMonture(r, { foulee: 1, allonge: 1.4 });
      clipCapacite(r, 'levee');
      if (r.aJoint('arme')) {
        r.joint('arme').ambiance = 1.2;
        r.joint('arme').periode = 3.2;
      }
    },
  );

/* ───────────────────── Rang 7 — les griffons de Pamole ──────────────────── */

function teteAigle(g: Graphics, k: Kit, S: number, couronne: boolean, seed: number): void {
  /*
   * La collerette : grise et brune sur le griffon de Pamole, blanc et or sur le
   * couronné. Elle était ivoire sur les deux, et c'est ce qui achevait de faire
   * lire ces deux bêtes comme des coquillages — le rendu de référence donne un
   * griffon NOIR ET OR, tête grise, et un couronné à la collerette blanchie
   * cerclée d'or.
   */
  const plume = couronne
    ? melanger(IVOIRE, LIGHT.chaude, 0.26)
    : melanger(ARDOISE, 0x8f8a7c, 0.42);
  const forme = lisser(
    perturber(
      densifier(
        [pt(-S * 0.5, -S * 0.34), pt(-S * 0.1, -S * 0.62), pt(S * 0.42, -S * 0.5), pt(S * 0.6, -S * 0.1), pt(S * 0.34, S * 0.34), pt(-S * 0.22, S * 0.42), pt(-S * 0.56, S * 0.1)],
        S * 0.22,
      ),
      S * 0.018,
      seed,
    ),
    1,
  );
  poser(g, k, forme, { couleur: plume, matiere: 'plumes', matiereAlpha: 0.26, echelle: 0.45, seed });
  /*
   * LE BEC CROCHU — le trait qui doit faire dire « griffon » à la vignette.
   *
   * Il était un pentagone doré collé au bord de la tête : long de 0,64 S, sans
   * crochet marqué, du même or que la collerette du couronné, et l'on ne
   * distinguait pas la mandibule de la joue. Sur la planche, les deux rangs sept
   * rendaient un oiseau sombre à tache jaune.
   *
   * Un bec de rapace se lit à trois choses : le CULMEN, l'arête bombée qui court
   * de la cire à la pointe ; le CROCHET, qui redescend franchement sous la
   * mandibule inférieure ; et la ligne de commissure, sombre, qui sépare les
   * deux mandibules. On l'allonge à 0,95 S, on le sort du contour de la tête, et
   * on lui donne un dessous plus sombre — un bec d'un seul ton est une tache.
   */
  const becClair = melanger(LIGHT.rim, LIGHT.chaude, 0.3);
  const bec = lisser(
    perturber(
      densifier(
        [
          pt(S * 0.3, -S * 0.3), // cire, à la racine
          pt(S * 0.78, -S * 0.24), // culmen
          pt(S * 1.18, -S * 0.02), // pointe amorcée
          pt(S * 1.12, S * 0.3), // crochet, qui redescend
          pt(S * 0.9, S * 0.24),
          pt(S * 0.86, S * 0.02), // tomium
          pt(S * 0.34, S * 0.0),
        ],
        S * 0.12,
      ),
      S * 0.01,
      seed + 3,
    ),
    1,
  );
  poser(g, k, bec, {
    couleur: becClair,
    matiere: 'metal',
    matiereAlpha: 0.2,
    echelle: 0.4,
    speculaire: { x: 0.3, y: 0.22, r: 0.1 },
  });
  // mandibule inférieure, plus sombre : c'est elle qui creuse le bec
  poser(
    g,
    k,
    lisser(
      perturber(densifier([pt(S * 0.34, S * 0.02), pt(S * 0.94, S * 0.14), pt(S * 0.86, S * 0.3), pt(S * 0.32, S * 0.22)], S * 0.1), S * 0.008, seed + 5),
      1,
    ),
    {
      couleur: assombrir(becClair, 0.4),
      matiere: 'metal',
      matiereAlpha: 0.2,
      echelle: 0.35,
      modele: 0.8,
      rim: false,
    },
  );
  // commissure : la fente sombre entre les deux mandibules
  g.moveTo(S * 0.3, S * 0.02);
  g.quadraticCurveTo(S * 0.66, S * 0.08, S * 0.98, S * 0.16);
  g.stroke({ color: ombreBleutee(becClair, 1), width: S * 0.05, alpha: 0.8, cap: 'round' });
  // cire et narine
  g.poly(flat(blob(S * 0.44, -S * 0.22, S * 0.06, S * 0.045, { seed: 5, points: 8, wobble: 0.24 }))).fill({
    color: assombrir(becClair, 0.45),
    alpha: 0.85,
  });
  // œil, jaune froid et fixe
  g.poly(flat(blob(S * 0.16, -S * 0.24, S * 0.13, S * 0.115, { seed: 7, points: 12, wobble: 0.16 }))).fill({
    color: melanger(0xe8c65a, IVOIRE, 0.2),
    alpha: 0.95,
  });
  g.poly(flat(blob(S * 0.18, -S * 0.24, S * 0.055, S * 0.06, { seed: 9, points: 9, wobble: 0.2 }))).fill({
    color: melanger(0x241c14, 0x2a3242, 0.4),
    alpha: 0.95,
  });
  g.poly(flat(blob(S * 0.14, -S * 0.28, S * 0.025, S * 0.02, { seed: 11, points: 7, wobble: 0.3 }))).fill({
    color: LIGHT.chaude,
    alpha: 0.7,
  });
  // arcade sourcilière saillante
  g.moveTo(-S * 0.06, -S * 0.42);
  g.quadraticCurveTo(S * 0.24, -S * 0.44, S * 0.46, -S * 0.28);
  g.stroke({ color: assombrir(plume, 0.42), width: S * 0.09, alpha: 0.8, cap: 'round' });
  // aigrettes de nuque
  for (let i = 0; i < 4; i += 1) {
    const t = i / 3;
    poser(g, k, fuseau(-S * 0.36, -S * 0.3 + t * S * 0.4, -S * (0.66 + t * 0.2), -S * 0.44 + t * S * 0.5, S * 0.16, { seed: i, taper: 0.55 }), {
      couleur: i % 2 ? assombrir(plume, 0.18) : plume,
      matiere: 'plumes',
      matiereAlpha: 0.26,
      echelle: 0.35,
      rim: i < 2,
    });
  }
  if (couronne) {
    // collier d'or refait par trois comtes
    sous(g, -S * 0.1, S * 0.36, (h) => {
      const c = lisser(perturber(densifier([pt(-S * 0.4, -S * 0.06), pt(S * 0.34, -S * 0.1), pt(S * 0.3, S * 0.1), pt(-S * 0.38, S * 0.14)], S * 0.14), S * 0.012, 31), 1);
      poser(h, k, c, {
        couleur: LIGHT.rim,
        matiere: 'metal',
        matiereAlpha: 0.24,
        echelle: 0.35,
        speculaire: { x: 0.28, y: 0.28, r: 0.1 },
      });
      for (let i = 0; i < 3; i += 1) {
        h.poly(flat(blob(-S * 0.22 + i * S * 0.22, S * 0.02, S * 0.055, S * 0.055, { seed: i + 5, points: 10, wobble: 0.2 }))).fill({
          color: k.pal.primaire,
          alpha: 0.9,
        });
      }
    });
    // crête blanchie du vieux mâle
    for (let i = 0; i < 3; i += 1) {
      poser(g, k, fuseau(-S * 0.1 + i * S * 0.12, -S * 0.56, -S * 0.26 + i * S * 0.18, -S * (0.94 + i * 0.1), S * 0.14, { seed: i + 7, taper: 0.6 }), {
        couleur: melanger(IVOIRE, LIGHT.chaude, 0.4),
        matiere: 'plumes',
        matiereAlpha: 0.24,
        echelle: 0.3,
      });
    }
  }
}

function griffonPieces(k: Kit, couronne: boolean): PieceDef[] {
  const S = couronne ? 1.14 : 1;
  /*
   * Noir et or, comme le rendu de référence — et non ivoire.
   *
   * Les deux griffons étaient les seules bêtes de la Châtellenie peintes en
   * ivoire, ailes comprises : sur la planche de contact ils rendaient deux
   * coquillages pâles, là où la référence donne un fauve ardoise aux rémiges
   * ourlées d'or. La faute n'était pas dans la géométrie mais dans la teinte, et
   * c'est elle qui coûtait le plus : un rang sept doit être la pièce qu'on
   * regarde en premier.
   *
   * Le couronné garde l'ardoise mais reçoit l'or sur les membres — pattes
   * écaillées d'or du rendu — pour rester distinct de sa forme de base à la
   * silhouette près.
   */
  const plume = couronne
    ? melanger(ARDOISE, 0x24211f, 0.4)
    : melanger(ARDOISE, 0x1f1d1b, 0.52);
  /* Le fauve doit se DÉTACHER de l'aile : sur le premier essai, robe et rémiges
     étaient toutes deux presque noires et l'arrière-train de lion disparaissait
     dans l'éventail — la référence, elle, oppose une aile ardoise à un corps
     brun fauve, et c'est ce contraste qui fait lire la bête composite. */
  const pelage = couronne
    ? melanger(0x8a6a1e, ARDOISE, 0.3)
    : melanger(CHENE, 0x7d5a24, 0.52);
  return squeletteVolant({
    altitude: 74 * S,
    corpsL: 78 * S,
    corpsH: 50 * S,
    robe: pelage,
    ventre: eclaircir(pelage, 0.22),
    matiere: 'fourrure',
    aile: {
      envergure: 104 * S,
      corde: 56 * S,
      couleur: plume,
      plume: true,
      doigts: 5,
      /*
       * À l'épaule et RELEVÉES.
       *
       * La rotation était négative, et le mesuré l'a montrée pour ce qu'elle
       * était : l'aile descendait jusqu'à y = +11, c'est-à-dire SOUS le ventre
       * de la bête, en balayant tout l'arrière-train. Une aile déployée monte.
       * Le signe inversé lève la pointe au-dessus de la croupe et laisse voir
       * le lion, ce que la ligne précédente promettait sans le faire.
       */
      pose: { x: 0.16, y: -0.52, rot: 0.52 },
    },
    seed: k.seed + (couronne ? 110 : 100),
    /* La tête DEVANT le poitrail : sans `avance`, l'encolure la ramenait
       au-dessus du dos, sous l'aile, et le bec n'existait plus. */
    cou: { longueur: 32 * S, largeur: 26 * S, angle: -0.42, avance: 0.62 },
    teteRot: 0.12,
    tete: (g, kk) => teteAigle(g, kk, 28 * S, couronne, k.seed + 41),
    surTronc: (g, kk) => {
      // avant-train emplumé, arrière-train de lion : la jonction est visible
      const jonction = lisser(
        perturber(
          densifier([pt(-4 * S, -26 * S), pt(30 * S, -22 * S), pt(34 * S, 16 * S), pt(-2 * S, 22 * S)], 12 * S),
          1.4,
          k.seed + 43,
        ),
        1,
      );
      poser(g, kk, jonction, { couleur: plume, matiere: 'plumes', matiereAlpha: 0.26, echelle: 0.5, modele: 0.9 });
      for (let i = 0; i < 5; i += 1) {
        const y = -20 * S + i * 10 * S;
        g.moveTo(-2 * S, y);
        g.quadraticCurveTo(12 * S, y + 4 * S, 30 * S, y - 2 * S);
        g.stroke({ color: assombrir(plume, 0.28), width: 1.4, alpha: 0.45 });
      }
      if (couronne) {
        orfevrerie(g, [pt(-10 * S, -14 * S), pt(14 * S, -20 * S), pt(30 * S, -12 * S)], { epaisseur: 2.2 });
        cicatrice(g, pt(-24 * S, -8 * S), pt(-6 * S, 8 * S), pelage, 2);
      }
    },
    queue: (g, kk) => {
      dessinerQueue(g, kk, {
        longueur: 52 * S,
        epaisseur: 14 * S,
        couleur: pelage,
        courbe: 0.8,
        matiere: 'fourrure',
        seed: k.seed + 45,
      });
      sous(g, 50 * S, 6 * S, (h) =>
        poser(h, kk, blob(0, 0, 9 * S, 11 * S, { seed: 5, points: 14, wobble: 0.3 }), {
          couleur: couronne ? melanger(pelage, LIGHT.rim, 0.3) : assombrir(pelage, 0.2),
          matiere: 'fourrure',
          matiereAlpha: 0.3,
          echelle: 0.3,
        }),
      );
    },
    serres: (g, kk) => {
      membre(g, kk, pt(0, 0), pt(2 * S, 22 * S), 11 * S, {
        couleur: melanger(LIGHT.rim, pelage, 0.45),
        matiere: 'ecailles',
        matiereAlpha: 0.24,
        echelle: 0.35,
        seed: k.seed + 47,
      });
      sous(g, 2 * S, 22 * S, (h) => {
        for (let i = 0; i < 3; i += 1) {
          const a = -0.6 + i * 0.6;
          poser(h, kk, fuseau(0, 0, Math.sin(a) * 11 * S, Math.cos(a) * 9 * S, 5 * S, { seed: i, taper: 0.7 }), {
            couleur: couronne ? melanger(LIGHT.rim, IVOIRE, 0.3) : melanger(IVOIRE, ARDOISE, 0.35),
            matiere: 'metal',
            matiereAlpha: 0.2,
            echelle: 0.3,
            speculaire: { x: 0.3, y: 0.3, r: 0.14 },
          });
        }
      });
    },
  });
}

const griffon: Fabrique = (k) =>
  creatureRig(
    { hauteur: 118, empriseSol: 44, respiration: 'tronc', graine: k.seed + 12, teinteMort: LIGHT.rim },
    griffonPieces(k, false),
    k,
    (r) => {
      clipsVolant(r, { foulee: 1, allonge: 1.3 });
      clipCapacite(r, 'guet');
      if (r.aJoint('queue')) r.joint('queue').ambiance = 1.8;
    },
  );

const griffonCouronne: Fabrique = (k) =>
  creatureRig(
    { hauteur: 132, empriseSol: 50, respiration: 'tronc', graine: k.seed + 13, teinteMort: LIGHT.rim },
    griffonPieces(k, true),
    k,
    (r) => {
      clipsVolant(r, { foulee: 1.1, allonge: 1.45 });
      clipCapacite(r, 'guet');
      if (r.aJoint('queue')) r.joint('queue').ambiance = 2;
      // le griffon couronné ne se pose jamais tout à fait
      r.definirClip(
        'attente',
        clip(3.1, true, [
          p('corps', 'y', [[0, 0], [0.5, -4.2], [1, 0]]),
          p('aile_g', 'rot', [[0, -0.1], [0.5, 0.22], [1, -0.1]]),
          p('aile_d', 'rot', [[0, 0.1], [0.5, -0.22], [1, 0.1]]),
          p('tete', 'rot', [[0, 0], [0.24, -0.1], [0.62, 0.07], [1, 0]]),
          p('queue', 'rot', [[0, 0], [0.4, 0.14], [0.82, -0.1], [1, 0]]),
        ]),
      );
    },
  );

/* ───────────────────────────── Table du rang ────────────────────────────── */

export const FABRIQUES_GRANIT: Readonly<Record<string, Fabrique>> = {
  granit_t1: manant,
  granit_t1_up: francSerf,
  granit_t2: gabelou,
  granit_t2_up: prevotDuSel,
  granit_t3: arbaletrier,
  granit_t3_up: maitreArbaletrier,
  granit_t4: grenadiere,
  granit_t4_up: dameFilDor,
  granit_t5: sanglier,
  granit_t5_up: verratGranit,
  granit_t6: chevalier,
  granit_t6_up: banneret,
  granit_t7: griffon,
  granit_t7_up: griffonCouronne,
};
