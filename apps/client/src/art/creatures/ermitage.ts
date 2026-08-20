/**
 * Les quatorze formes de l'Ermitage des Bois Noirs.
 *
 * Palette de faction : vert profond `#1B3A2B`, vert sauge `#7C8F6B`, cuivre
 * patiné `#4E8977`, bleu brume `#9FB4C2`, pierre claire `#CFC6B4`, mousse
 * sombre `#2F3B2E`.
 *
 * Règle de silhouette, à 64 px et en négatif :
 *   Pèlerin        — capuche ouverte, grande cape en loques, coquille, bourdon
 *   Pénitent Blanc — cagoule en cône à pointe retombée, lin en lambeaux, croix
 *   Hulotte        — disque facial rond, ailes courtes et larges
 *   Oraculaire     — aigrettes dressées, nimbe de brume
 *   Loup           — ligne basse, échine longue, queue touffue
 *   Loup des Brumes— même ligne, arrière-train qui se défait en brume
 *   Veneur         — arc BANDÉ : un D profond, corde en V tirée à la joue
 *   Garde-Futaie   — même geste, arc plus lourd, manteau de feuilles galonné
 *   Cerf           — ramure haute et ouverte
 *   Cerf Miraculeux— ramure double portant la lampe froide
 *   Colosse        — blocs empilés, aucune articulation lisible
 *   Colosse Pamole — même masse, faille lumineuse et bloc levé
 *   Vouivre        — long S ailé, escarboucle à la tempe
 *   Vouivre Cour.  — même S, couronne enchâssée et collerette
 */
import type { Graphics } from 'pixi.js';
import { LIGHT, assombrir, eclaircir, melanger, ombreBleutee } from '../palette.js';
import type { Poly } from '../shading.js';
import {
  arcBande,
  blob,
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
  brumeAccrochee,
  capuche,
  cicatrice,
  clipCapacite,
  clipsBipede,
  clipsMonolithe,
  clipsQuadrupede,
  clipsSerpent,
  clipsVolant,
  corne,
  creatureRig,
  fer,
  hampe,
  lueurFroide,
  membre,
  mousse,
  oreilleAnimale,
  orfevrerie,
  poser,
  queue as dessinerQueue,
  rayonTete,
  sous,
  squeletteBipede,
  squeletteQuadrupede,
  squeletteVolant,
} from './archetypes.js';



const VERT_PROFOND = 0x1b3a2b;
const SAUGE = 0x7c8f6b;
const CUIVRE = 0x4e8977;
const BRUME = 0x9fb4c2;
const PIERRE_CLAIRE = 0xcfc6b4;
const MOUSSE = 0x2f3b2e;
const BOIS = 0x6b5433;

/* ─────────────────────── Rang 1 — la route de l'Hermitage ───────────────── */

function bourdon(g: Graphics, k: Kit, H: number, gourde: boolean, seed: number): void {
  hampe(g, k, pt(0, H * 0.22), pt(-H * 0.02, -H * 0.78), H * 0.026, BOIS, seed);
  // pommeau usé par trente ans de main
  sous(g, -H * 0.02, -H * 0.78, (h) =>
    poser(h, k, blob(0, 0, H * 0.028, H * 0.032, { seed: seed + 3, points: 13, wobble: 0.2 }), {
      couleur: eclaircir(BOIS, 0.3),
      matiere: 'ecorce',
      matiereAlpha: 0.26,
      echelle: 0.3,
      speculaire: { x: 0.3, y: 0.26, r: 0.14 },
    }),
  );
  if (gourde) {
    sous(g, H * 0.03, -H * 0.5, (h) => {
      poser(h, k, blob(0, 0, H * 0.034, H * 0.042, { seed: seed + 5, points: 14, wobble: 0.18 }), {
        couleur: melanger(BOIS, PIERRE_CLAIRE, 0.35),
        matiere: 'grain',
        matiereAlpha: 0.2,
      });
      h.moveTo(-H * 0.03, -H * 0.02);
      h.quadraticCurveTo(0, -H * 0.05, H * 0.028, -H * 0.02);
      h.stroke({ color: assombrir(BOIS, 0.3), width: H * 0.009, alpha: 0.85 });
    });
  }
  // coquille pendue au bourdon, à sa vraie taille cette fois
  sous(g, -H * 0.032, -H * 0.6, (h) => {
    h.moveTo(0, 0);
    h.lineTo(-H * 0.01, H * 0.03);
    h.stroke({ color: assombrir(BOIS, 0.3), width: H * 0.008, alpha: 0.85 });
    sous(h, -H * 0.012, H * 0.038, (c) => coquille(c, k, H * 0.03, seed + 7));
  });
}

/**
 * La coquille Saint-Jacques : le signe des chemins.
 *
 * Elle est cousue sur la besace ET pendue au bourdon dans le rendu de référence
 * du Pèlerin, et c'est à elle qu'on reconnaît un pèlerin plutôt qu'un vagabond
 * avec un bâton. Il en existait déjà une sur la hampe, de 0,022 H de rayon —
 * deux pixels, indistincts d'un nœud du bois. On la double et on lui donne ses
 * côtes rayonnantes, qui sont la seule chose qui la fait lire comme coquille.
 */
function coquille(g: Graphics, k: Kit, R: number, seed: number): void {
  const nacre = melanger(PIERRE_CLAIRE, 0xf0e8d4, 0.45);
  const eventail: Poly = [pt(0, R * 0.42)];
  for (let i = 0; i <= 8; i += 1) {
    const a = -Math.PI * 0.94 + (i / 8) * Math.PI * 0.88;
    const dent = i % 2 ? 1 : 0.86;
    eventail.push(pt(Math.cos(a) * R * 1.06 * dent, R * 0.36 + Math.sin(a) * R * 1.14 * dent));
  }
  poser(g, k, lisser(perturber(densifier(eventail, R * 0.3), R * 0.03, seed), 0), {
    couleur: nacre,
    matiere: 'grain',
    matiereAlpha: 0.16,
    echelle: 0.3,
    speculaire: { x: 0.3, y: 0.34, r: 0.14 },
    seed,
  });
  for (let i = 0; i < 5; i += 1) {
    const a = -Math.PI * 0.86 + (i / 4) * Math.PI * 0.72;
    g.moveTo(0, R * 0.34);
    g.lineTo(Math.cos(a) * R * 0.94, R * 0.34 + Math.sin(a) * R * 1.0);
    g.stroke({ color: ombreBleutee(nacre, 0.7), width: R * 0.12, alpha: 0.55, cap: 'round' });
  }
  // charnière : le point sombre qui ferme l'éventail
  g.poly(flat(blob(0, R * 0.36, R * 0.2, R * 0.14, { seed: seed + 3, points: 9, wobble: 0.24 }))).fill({
    color: assombrir(nacre, 0.4),
    alpha: 0.7,
  });
}

/**
 * Le Pèlerin : **la coquille, et la grande cape en loques qui traîne derrière**.
 *
 * Son rendu de référence est fait de deux choses : un manteau vert-de-gris
 * énorme, mangé aux mites, dont l'ourlet part en langues déchiquetées derrière
 * lui — il occupe la moitié de l'image —, et la coquille, cousue sur la besace,
 * pendue au bourdon. Tout le reste est de la marche.
 *
 * La planche de contact en donnait l'exact contraire : un cône de bure étroit,
 * sans cape du tout, une capuche qui effaçait la figure et une coquille de deux
 * pixels sur la hampe. On ne pouvait pas dire s'il montait à l'Hermitage ou s'il
 * gardait des chèvres.
 */
const pelerin: Fabrique = (k) => {
  const H = 94;
  const bure = melanger(BOIS, MOUSSE, 0.4);
  const manteau = melanger(VERT_PROFOND, SAUGE, 0.34);
  return creatureRig(
    { hauteur: H, empriseSol: H * 0.21, respiration: 'buste', graine: k.seed + 20, teinteMort: SAUGE },
    squeletteBipede({
      H,
      seed: k.seed + 200,
      teint: TEINTS[2],
      tunique: bure,
      jambeCouleur: melanger(bure, MOUSSE, 0.4),
      chausse: assombrir(BOIS, 0.38),
      ceinture: melanger(BOIS, 0x9c8f6a, 0.4),
      posture: -0.6,
      largeur: 0.95,
      epaules: 0.9,
      ecart: 1.5,
      coude: 0.6,
      brasDRot: -0.62,
      brasGRot: 0.26,
      epaulement: { couleur: manteau, largeur: H * 0.18 },
      basque: { couleur: melanger(bure, 0x9c8f6a, 0.35), dents: 0.9, hauteur: H * 0.15 },
      jambiere: { couleur: melanger(BOIS, PIERRE_CLAIRE, 0.3), hauteur: H * 0.13 },
      /* Le manteau du chemin : large, et déchiré à fond — c'est le vêtement de
         qui marche depuis trop longtemps, et la moitié de sa silhouette. */
      cape: { couleur: manteau, w: H * 0.46, h: H * 0.56, dents: 1 },
      visage: { age: 0.6, sourcils: 0.25, barbe: 0.5, barbeCouleur: 0x6f665a },
      cheveux: { couleur: 0x8d8578, longueur: 0.7, volume: 0.95 },
      robe: { couleur: bure, haut: H * 0.2, bas: H * 0.3, hauteur: H * 0.42, dents: 0.5 },
      coiffe: (g, kk) => capuche(g, kk, { r: rayonTete(H), couleur: assombrir(bure, 0.18), pointe: 0.25, ouverture: 0.6, seed: 3 }),
      dos: (g, kk) =>
        sous(g, H * 0.05, H * 0.02, (h) => {
          // rouleau de couverture sanglé au ballot : le rendu le montre en haut
          poser(h, kk, blob(0, 0, H * 0.075, H * 0.085, { seed: 9, points: 15, wobble: 0.2 }), {
            couleur: melanger(BOIS, PIERRE_CLAIRE, 0.28),
            matiere: 'tissu',
            matiereAlpha: 0.26,
            echelle: 0.5,
          });
          poser(h, kk, blob(H * 0.005, -H * 0.075, H * 0.062, H * 0.03, { seed: 15, points: 14, wobble: 0.22 }), {
            couleur: melanger(BOIS, 0x9c8f6a, 0.5),
            matiere: 'tissu',
            matiereAlpha: 0.3,
            echelle: 0.4,
          });
          h.moveTo(-H * 0.06, -H * 0.05);
          h.quadraticCurveTo(0, -H * 0.11, H * 0.06, -H * 0.04);
          h.stroke({ color: assombrir(BOIS, 0.34), width: H * 0.012, alpha: 0.8 });
        }),
      surTorse: (g, kk) => {
        // la besace, et la coquille cousue dessus : le signe, à sa vraie taille
        sous(g, -H * 0.085, H * 0.01, (h) => {
          poser(h, kk, blob(0, H * 0.02, H * 0.05, H * 0.048, { seed: 17, points: 14, wobble: 0.2 }), {
            couleur: melanger(BOIS, 0x8a7550, 0.4),
            matiere: 'grain',
            matiereAlpha: 0.22,
            echelle: 0.4,
          });
          h.moveTo(-H * 0.036, -H * 0.02);
          h.quadraticCurveTo(0, -H * 0.05, H * 0.036, -H * 0.018);
          h.stroke({ color: assombrir(BOIS, 0.3), width: H * 0.012, alpha: 0.85 });
          sous(h, 0, H * 0.012, (c) => coquille(c, kk, H * 0.032, 19));
        });
        // la courroie de la besace, en travers de la poitrine
        g.moveTo(H * 0.1, -H * 0.27);
        g.quadraticCurveTo(0, -H * 0.16, -H * 0.09, -H * 0.03);
        g.stroke({ color: assombrir(BOIS, 0.26), width: H * 0.022, alpha: 0.88, cap: 'round' });
      },
      arme: (g, kk) => bourdon(g, kk, H, true, 11),
      /* Le bourdon planté en avant : dans le rendu il porte le poids du marcheur
         et barre l'image en diagonale. Vertical, il n'était qu'un manche. */
      armeAncre: { rot: 0.62 },
    }),
    k,
    (r) => {
      clipsBipede(r, { foulee: 0.9, allonge: 0.7 });
      clipCapacite(r, 'benediction');
    },
  );
};

/**
 * Le Pénitent Blanc : **le lin en lambeaux et les pieds nus**.
 *
 * On garde la cagoule pointue : elle est juste — les confréries de pénitents
 * blancs du Midi et du Massif la portent —, et c'est la silhouette qu'on ne
 * confond avec rien à soixante-quatre pixels. Ce qui était faux, c'est TOUT LE
 * RESTE : le rendu de référence montre un vêtement dont chaque ourlet est
 * déchiqueté, mangé, effiloché, une croix rouge sur l'épaule, un cordage tressé
 * qui pend jusqu'au genou, et deux pieds nus dans la poussière. La planche de
 * contact, elle, donnait un cône de lin parfaitement lisse, ourlet net, du
 * sommet du capuchon jusqu'au sol : un fantôme de conte, pas un homme qui a
 * marché pieds nus jusqu'à ce que la source recoule.
 *
 * On lui rend donc les lambeaux — basque à dents pleines, ourlet de robe
 * déchiré —, la croix rouge, le cordage, et les pieds nus visibles sous
 * l'ourlet.
 */
const penitentBlanc: Fabrique = (k) => {
  const H = 102;
  /* Le lin sali par la route. Il valait 0,55 de blanc pur : à l'écran, un drap
     de lit sortant de l'armoire, alors que le rendu de référence montre une
     étoffe tachée, jaunie, portée depuis des années. Un pénitent qui marche
     pieds nus depuis que la source s'est tarie n'a pas de linge propre. */
  const lin = melanger(PIERRE_CLAIRE, 0xe6dcc2, 0.42);
  const cordage = melanger(BOIS, PIERRE_CLAIRE, 0.5);
  return creatureRig(
    { hauteur: H, empriseSol: H * 0.22, respiration: 'buste', graine: k.seed + 21, teinteMort: PIERRE_CLAIRE },
    squeletteBipede({
      H,
      seed: k.seed + 210,
      teint: TEINTS[1],
      tunique: lin,
      jambeCouleur: lin,
      chausse: null,
      ceinture: null,
      posture: 0.7,
      largeur: 0.92,
      epaules: 0.88,
      ecart: 1.4,
      coude: 0.58,
      brasDRot: -0.56,
      brasGRot: 0.24,
      manche: lin,
      epaulement: { couleur: assombrir(lin, 0.1), largeur: H * 0.17 },
      /* L'ourlet mangé : `dents: 1` déchire la basque à fond, et c'est le seul
         détail du pénitent qui doit se voir avant la cagoule. */
      basque: { couleur: assombrir(lin, 0.06), dents: 1, hauteur: H * 0.17, largeur: H * 0.3 },
      visage: null,
      cheveux: null,
      /* L'ourlet de la robe part en langues jusqu'au mollet : le rendu de
         référence n'a pas dix centimètres d'étoffe intacte, et l'ourlet net
         était ce qui restait de plus faux sur le pénitent. */
      robe: { couleur: lin, haut: H * 0.21, bas: H * 0.34, hauteur: H * 0.5, dents: 0.85 },
      coiffe: (g, kk) => {
        const r = rayonTete(H);
        /*
         * La cagoule reste — elle est juste et c'est la silhouette du rang —
         * mais elle devient de l'ÉTOFFE et non un cône de géométrie. Le cône
         * régulier, parfaitement rectiligne du bord jusqu'à la pointe, ne
         * ressemblait à rien de cousu : la pointe RETOMBE ici sur le côté, sous
         * son propre poids, le bord inférieur porte un bourrelet roulé, et le
         * lin est sali. Trois écarts à la géométrie, et l'on passe d'une forme
         * abstraite à un capuchon qu'un homme a mis ce matin.
         */
        const cagoule = lisser(
          perturber(
            densifier(
              [
                pt(-r * 1.1, r * 0.92),
                pt(-r * 0.92, -r * 0.62),
                pt(-r * 0.46, -r * 1.66),
                pt(-r * 0.28, -r * 2.12),
                pt(-r * 0.62, -r * 2.34),
                pt(-r * 0.34, -r * 2.5),
                pt(r * 0.22, -r * 2.24),
                pt(r * 0.5, -r * 1.62),
                pt(r * 1.0, -r * 0.44),
                pt(r * 1.16, r * 0.98),
                pt(0, r * 0.74),
              ],
              r * 0.34,
            ),
            r * 0.05,
            7,
          ),
          1,
        );
        poser(g, kk, cagoule, { couleur: lin, matiere: 'tissu', matiereAlpha: 0.26, echelle: 0.55 });
        // bourrelet roulé du bord inférieur : le lin est ourlé, pas coupé net
        g.moveTo(-r * 1.06, r * 0.78);
        g.quadraticCurveTo(0, r * 1.06, r * 1.12, r * 0.84);
        g.stroke({ color: ombreBleutee(lin, 0.8), width: r * 0.16, alpha: 0.5, cap: 'round' });
        // deux fentes d'yeux, rien d'autre
        for (const dx of [-0.38, 0.3]) {
          g.poly(flat(blob(dx * r, -r * 0.22, r * 0.24, r * 0.09, { seed: dx * 10 + 3, points: 10, wobble: 0.2 }))).fill({
            color: ombreBleutee(lin, 1),
            alpha: 0.9,
          });
        }
        // le pli de la pointe retombée, et la couture qui court jusqu'au bord
        g.moveTo(-r * 0.42, -r * 2.3);
        g.quadraticCurveTo(-r * 0.18, -r * 1.5, -r * 0.5, r * 0.6);
        g.stroke({ color: ombreBleutee(lin, 0.6), width: r * 0.08, alpha: 0.45 });
        g.moveTo(-r * 0.56, -r * 2.36);
        g.quadraticCurveTo(-r * 0.16, -r * 2.2, -r * 0.24, -r * 2.02);
        g.stroke({ color: ombreBleutee(lin, 0.9), width: r * 0.11, alpha: 0.5, cap: 'round' });
      },
      surTorse: (g, kk) => {
        /* La croix rouge sur l'épaule gauche : la marque de la confrérie. C'est
           le seul rouge autorisé sur tout ce blanc, et c'est précisément pour
           cela qu'il porte — sans lui, le pénitent est un drap. */
        sous(g, -H * 0.022, -H * 0.225, (h) => {
          const br = H * 0.011;
          const croix: Poly = [
            pt(-br, -H * 0.035), pt(br, -H * 0.035), pt(br, -br), pt(H * 0.032, -br),
            pt(H * 0.032, br), pt(br, br), pt(br, H * 0.035), pt(-br, H * 0.035),
            pt(-br, br), pt(-H * 0.032, br), pt(-H * 0.032, -br), pt(-br, -br),
          ];
          poser(h, kk, perturber(croix, H * 0.0025, 23), {
            couleur: melanger(0x8c2030, 0x6e1f2a, 0.4),
            matiere: 'tissu',
            matiereAlpha: 0.24,
            echelle: 0.3,
            modele: 0.8,
          });
        });
        // le cordage tressé, trois nœuds, et deux brins qui pendent au genou
        g.moveTo(-H * 0.1, -H * 0.06);
        g.quadraticCurveTo(0, -H * 0.015, H * 0.1, -H * 0.07);
        g.stroke({ color: cordage, width: H * 0.018, alpha: 0.92, cap: 'round' });
        for (let i = 0; i < 3; i += 1) {
          g.poly(flat(blob(-H * 0.04 + i * H * 0.04, -H * 0.035 + i * H * 0.006, H * 0.013, H * 0.012, { seed: i + 2, points: 9, wobble: 0.26 }))).fill({
            color: assombrir(cordage, 0.14),
            alpha: 0.94,
          });
        }
        for (const [dx, len] of [
          [-H * 0.028, H * 0.19],
          [H * 0.012, H * 0.15],
        ] as const) {
          g.moveTo(dx, -H * 0.03);
          g.quadraticCurveTo(dx - H * 0.012, -H * 0.03 + len * 0.6, dx + H * 0.008, -H * 0.03 + len);
          g.stroke({ color: cordage, width: H * 0.011, alpha: 0.85, cap: 'round' });
          g.poly(flat(blob(dx + H * 0.008, -H * 0.028 + len, H * 0.011, H * 0.014, { seed: dx * 100 + 5, points: 10, wobble: 0.26 }))).fill({
            color: assombrir(cordage, 0.12),
            alpha: 0.9,
          });
        }
        // traces de route sur la bure : le vœu dure depuis longtemps
        for (let i = 0; i < 4; i += 1) {
          g.moveTo(-H * 0.08 + i * H * 0.05, -H * 0.24);
          g.quadraticCurveTo(-H * 0.07 + i * H * 0.05, -H * 0.16, -H * 0.09 + i * H * 0.05, -H * 0.08);
          g.stroke({ color: ombreBleutee(lin, 0.4), width: H * 0.008, alpha: 0.3 });
        }
      },
      arme: (g, kk) => {
        // croix de bois portée à deux mains, pas une arme
        hampe(g, kk, pt(0, H * 0.16), pt(0, -H * 0.56), H * 0.03, BOIS, 13);
        sous(g, 0, -H * 0.36, (h) =>
          hampe(h, kk, pt(-H * 0.11, 0), pt(H * 0.11, -H * 0.01), H * 0.026, BOIS, 17),
        );
        sous(g, 0, -H * 0.37, (h) => {
          h.poly(flat(blob(0, 0, H * 0.018, H * 0.018, { seed: 5, points: 10, wobble: 0.22 }))).fill({
            color: melanger(CUIVRE, LIGHT.rim, 0.35),
            alpha: 0.9,
          });
        });
        sous(g, -H * 0.008, -H * 0.18, (h) =>
          poser(h, kk, blob(0, 0, H * 0.03, H * 0.033, { seed: 27, points: 11, wobble: 0.24 }), {
            couleur: assombrir(TEINTS[1], 0.12),
            matiere: 'grain',
            matiereAlpha: 0.1,
            modele: 0.8,
          }),
        );
      },
      /* La croix penche en avant, comme une charge qu'on porte et non un
         totem qu'on brandit : verticale et centrée, elle sciait la cagoule. */
      armeAncre: { rot: 0.44 },
    }),
    k,
    (r) => {
      clipsBipede(r, { foulee: 0.85, allonge: 0.7 });
      clipCapacite(r, 'benediction');
    },
  );
};

/* ───────────────────────── Rang 2 — les chouettes ───────────────────────── */

function teteChouette(g: Graphics, k: Kit, S: number, oraculaire: boolean, seed: number): void {
  const plume = oraculaire ? melanger(PIERRE_CLAIRE, BRUME, 0.4) : melanger(BOIS, SAUGE, 0.4);
  // disque facial : presque rond, donc soigneusement perturbé
  const disque = blob(0, 0, S * 0.95, S * 0.88, { seed: seed + 1, points: 26, wobble: 0.09 });
  poser(g, k, disque, { couleur: plume, matiere: 'plumes', matiereAlpha: 0.28, echelle: 0.4, seed });
  const interne = blob(0, S * 0.03, S * 0.72, S * 0.66, { seed: seed + 3, points: 22, wobble: 0.1 });
  poser(g, k, interne, {
    couleur: eclaircir(plume, 0.24),
    matiere: 'plumes',
    matiereAlpha: 0.24,
    echelle: 0.35,
    modele: 0.6,
    rim: false,
  });
  // les deux yeux, énormes, fixes
  for (const dx of [-0.36, 0.34]) {
    const oeil = blob(dx * S, -S * 0.08, S * 0.3, S * 0.29, { seed: dx * 20 + 5, points: 14, wobble: 0.12 });
    poser(g, k, oeil, {
      couleur: oraculaire ? melanger(0xf3edd2, LIGHT.chaude, 0.3) : 0xd8a13c,
      matiere: 'grain',
      matiereAlpha: 0.14,
      modele: 0.7,
      rim: false,
    });
    g.poly(flat(blob(dx * S + S * 0.03, -S * 0.07, S * 0.15, S * 0.16, { seed: dx * 30 + 7, points: 11, wobble: 0.16 }))).fill({
      color: oraculaire ? melanger(0x2a3242, BRUME, 0.2) : 0x241c14,
      alpha: 0.95,
    });
    g.poly(flat(blob(dx * S - S * 0.05, -S * 0.14, S * 0.06, S * 0.05, { seed: dx * 40 + 9, points: 8, wobble: 0.26 }))).fill({
      color: LIGHT.chaude,
      alpha: 0.75,
    });
  }
  // bec court entre les yeux
  poser(g, k, fuseau(0, -S * 0.02, 0, S * 0.34, S * 0.2, { seed: seed + 11, taper: 0.6 }), {
    couleur: melanger(PIERRE_CLAIRE, BOIS, 0.35),
    matiere: 'metal',
    matiereAlpha: 0.18,
    echelle: 0.3,
    speculaire: { x: 0.3, y: 0.3, r: 0.12 },
  });
  // stries du disque facial
  for (let i = 0; i < 7; i += 1) {
    const a = -2.7 + i * 0.75;
    g.moveTo(Math.cos(a) * S * 0.4, Math.sin(a) * S * 0.36);
    g.lineTo(Math.cos(a) * S * 0.9, Math.sin(a) * S * 0.82);
    g.stroke({ color: assombrir(plume, 0.28), width: S * 0.05, alpha: 0.42 });
  }
  if (oraculaire) {
    // aigrettes dressées, l'ajout de matière du rang amélioré
    for (const dx of [-0.5, 0.44]) {
      poser(g, k, fuseau(dx * S, -S * 0.72, dx * S * 1.5, -S * 1.7, S * 0.28, { seed: dx * 12 + 3, taper: 0.62 }), {
        couleur: assombrir(plume, 0.2),
        matiere: 'plumes',
        matiereAlpha: 0.26,
        echelle: 0.3,
      });
    }
    brumeAccrochee(g, { x: 0, y: -S * 0.3, w: S * 3.4, h: S * 2.2, couleur: BRUME, seed: seed + 21, densite: 7 });
    // nimbe : quatre marques d'augure, jamais un cercle parfait
    for (let i = 0; i < 5; i += 1) {
      const a = -2.5 + i * 0.62;
      g.poly(flat(blob(Math.cos(a) * S * 1.35, Math.sin(a) * S * 1.2 - S * 0.2, S * 0.075, S * 0.075, { seed: i + 13, points: 8, wobble: 0.3 }))).fill({
        color: LIGHT.rim,
        alpha: 0.36 + (i % 2) * 0.14,
      });
    }
  }
}

function chouettePieces(k: Kit, oraculaire: boolean): PieceDef[] {
  const S = oraculaire ? 1.16 : 1;
  const plume = oraculaire ? melanger(PIERRE_CLAIRE, BRUME, 0.35) : melanger(BOIS, SAUGE, 0.35);
  return squeletteVolant({
    altitude: 60 * S,
    corpsL: 40 * S,
    corpsH: 40 * S,
    robe: plume,
    ventre: eclaircir(plume, 0.3),
    matiere: 'plumes',
    aile: { envergure: 68 * S, corde: 42 * S, couleur: plume, plume: true, doigts: 5 },
    seed: k.seed + (oraculaire ? 230 : 220),
    cou: { longueur: 8 * S, largeur: 22 * S, angle: -1.2 },
    tete: (g, kk) => teteChouette(g, kk, 20 * S, oraculaire, k.seed + 51),
    surTronc: (g, kk) => {
      // mouchetures du plastron
      for (let i = 0; i < 14; i += 1) {
        const x = -14 * S + (i % 5) * 7 * S;
        const y = -10 * S + Math.floor(i / 5) * 9 * S;
        g.poly(flat(blob(x, y, 1.6 * S, 2.2 * S, { seed: i * 3 + 1, points: 8, wobble: 0.3 }))).fill({
          color: i % 3 === 0 ? eclaircir(plume, 0.35) : assombrir(plume, 0.3),
          alpha: 0.5,
        });
      }
      if (oraculaire) {
        // anneau d'argent des prieures à la patte
        sous(g, 6 * S, 14 * S, (h) =>
          poser(h, kk, blob(0, 0, 4 * S, 3 * S, { seed: 7, points: 12, wobble: 0.2 }), {
            couleur: melanger(BRUME, PIERRE_CLAIRE, 0.5),
            matiere: 'metal',
            matiereAlpha: 0.24,
            speculaire: { x: 0.3, y: 0.28, r: 0.18 },
          }),
        );
      }
    },
    queue: (g, kk) => {
      for (let i = 0; i < 5; i += 1) {
        const a = -0.4 + i * 0.2;
        poser(g, kk, fuseau(0, 0, -Math.cos(a) * 30 * S, Math.sin(a) * 16 * S, 9 * S, { seed: i + 2, taper: 0.5 }), {
          couleur: i % 2 ? assombrir(plume, 0.22) : plume,
          matiere: 'plumes',
          matiereAlpha: 0.26,
          echelle: 0.35,
          rim: i < 2,
        });
      }
    },
    serres: (g, kk) => {
      membre(g, kk, pt(0, 0), pt(0, 12 * S), 6 * S, {
        couleur: melanger(LIGHT.rim, plume, 0.5),
        matiere: 'ecailles',
        matiereAlpha: 0.22,
        echelle: 0.3,
        seed: k.seed + 53,
      });
      sous(g, 0, 12 * S, (h) => {
        for (let i = 0; i < 3; i += 1) {
          const a = -0.7 + i * 0.7;
          poser(h, kk, fuseau(0, 0, Math.sin(a) * 7 * S, Math.cos(a) * 6 * S, 3 * S, { seed: i, taper: 0.7 }), {
            couleur: melanger(PIERRE_CLAIRE, MOUSSE, 0.4),
            matiere: 'metal',
            matiereAlpha: 0.2,
            echelle: 0.25,
          });
        }
      });
    },
  });
}

const hulotte: Fabrique = (k) =>
  creatureRig(
    { hauteur: 88, empriseSol: 26, respiration: 'tronc', graine: k.seed + 22, teinteMort: SAUGE },
    chouettePieces(k, false),
    k,
    (r) => {
      clipsVolant(r, { foulee: 1.15, allonge: 1 });
      clipCapacite(r, 'guet');
    },
  );

const chouetteOraculaire: Fabrique = (k) =>
  creatureRig(
    { hauteur: 98, empriseSol: 30, respiration: 'tronc', graine: k.seed + 23, teinteMort: BRUME },
    chouettePieces(k, true),
    k,
    (r) => {
      clipsVolant(r, { foulee: 1.05, allonge: 1 });
      clipCapacite(r, 'guet');
      // l'oraculaire ne cligne pas et ne se pose pas
      r.definirClip(
        'attente',
        clip(2.9, true, [
          p('corps', 'y', [[0, 0], [0.5, -3.4], [1, 0]]),
          p('aile_g', 'rot', [[0, -0.06], [0.5, 0.18], [1, -0.06]]),
          p('aile_d', 'rot', [[0, 0.06], [0.5, -0.18], [1, 0.06]]),
          p('tete', 'rot', [[0, 0], [0.18, -0.42], [0.42, -0.4], [0.62, 0.36], [0.86, 0.34], [1, 0]]),
        ]),
      );
    },
  );

/* ────────────────────────── Rang 3 — les loups ──────────────────────────── */

function teteLoup(g: Graphics, k: Kit, S: number, brumes: boolean, seed: number): void {
  const poil = brumes ? melanger(BRUME, MOUSSE, 0.45) : melanger(MOUSSE, 0x4b4f42, 0.5);
  const forme = lisser(
    perturber(
      densifier(
        [pt(-S * 0.5, -S * 0.4), pt(-S * 0.1, -S * 0.56), pt(S * 0.5, -S * 0.32), pt(S * 1.0, -S * 0.06), pt(S * 0.96, S * 0.2), pt(S * 0.3, S * 0.34), pt(-S * 0.3, S * 0.42), pt(-S * 0.58, S * 0.06)],
        S * 0.2,
      ),
      S * 0.018,
      seed,
    ),
    1,
  );
  poser(g, k, forme, { couleur: poil, matiere: 'fourrure', matiereAlpha: 0.28, echelle: 0.38, seed });
  // museau plus clair
  poser(g, k, lisser(perturber(densifier([pt(S * 0.32, -S * 0.2), pt(S * 0.98, -S * 0.04), pt(S * 0.92, S * 0.18), pt(S * 0.3, S * 0.24)], S * 0.16), S * 0.014, seed + 3), 1), {
    couleur: brumes ? eclaircir(poil, 0.35) : eclaircir(poil, 0.18),
    matiere: 'fourrure',
    matiereAlpha: 0.26,
    echelle: 0.32,
    modele: 0.7,
    rim: false,
  });
  g.poly(flat(blob(S * 0.98, -S * 0.02, S * 0.08, S * 0.06, { seed: seed + 5, points: 9, wobble: 0.22 }))).fill({
    color: assombrir(poil, 0.6),
    alpha: 0.88,
  });
  // œil oblique
  g.poly(flat(blob(S * 0.24, -S * 0.24, S * 0.1, S * 0.055, { seed: seed + 7, points: 10, wobble: 0.2 }))).fill({
    color: brumes ? melanger(BRUME, 0xe8dcc0, 0.5) : 0xc09a3c,
    alpha: 0.95,
  });
  g.poly(flat(blob(S * 0.26, -S * 0.24, S * 0.04, S * 0.038, { seed: seed + 9, points: 8, wobble: 0.24 }))).fill({
    color: 0x241c14,
    alpha: 0.95,
  });
  // oreilles dressées
  for (const [dx, dy] of [
    [-0.18, -0.42],
    [0.02, -0.5],
  ] as const) {
    poser(g, k, fuseau(S * dx, S * dy, S * (dx - 0.14), S * (dy - 0.5), S * 0.24, { seed: seed + dx * 30, taper: 0.6 }), {
      couleur: assombrir(poil, 0.2),
      matiere: 'fourrure',
      matiereAlpha: 0.3,
      echelle: 0.3,
    });
  }
  if (brumes) {
    // givre au museau
    for (let i = 0; i < 5; i += 1) {
      g.poly(flat(blob(S * (0.6 + i * 0.09), S * (0.05 + (i % 2) * 0.08), S * 0.035, S * 0.03, { seed: i + 21, points: 7, wobble: 0.32 }))).fill({
        color: melanger(BRUME, LIGHT.chaude, 0.35),
        alpha: 0.5,
      });
    }
    brumeAccrochee(g, { x: -S * 0.2, y: 0, w: S * 2.6, h: S * 1.6, couleur: BRUME, seed: seed + 31, densite: 6 });
  }
}

function loupPieces(k: Kit, brumes: boolean): PieceDef[] {
  const poil = brumes ? melanger(BRUME, MOUSSE, 0.42) : melanger(MOUSSE, 0x4b4f42, 0.5);
  const Hs = brumes ? 54 : 50;
  const L = brumes ? 100 : 94;
  return squeletteQuadrupede({
    Hs,
    L,
    robe: poil,
    ventre: eclaircir(poil, 0.28),
    matiere: 'fourrure',
    patteCouleur: assombrir(poil, 0.24),
    seed: k.seed + (brumes ? 250 : 240),
    cou: { longueur: Hs * 0.3, largeur: Hs * 0.42, angle: -0.55 },
    queue: { longueur: L * 0.46, epaisseur: Hs * 0.3, courbe: 0.75 },
    tete: (g, kk) => teteLoup(g, kk, Hs * 0.5, brumes, k.seed + 61),
    machoire: (g, kk) => {
      const S = Hs * 0.5;
      sous(g, S * 0.34, S * 0.2, (h) => {
        poser(h, kk, lisser(perturber(densifier([pt(0, -S * 0.04), pt(S * 0.6, S * 0.02), pt(S * 0.55, S * 0.18), pt(-S * 0.02, S * 0.16)], S * 0.14), S * 0.012, 5), 1), {
          couleur: assombrir(poil, 0.3),
          matiere: 'fourrure',
          matiereAlpha: 0.24,
          echelle: 0.3,
        });
        for (let i = 0; i < 3; i += 1) {
          h.poly(flat(fuseau(S * (0.14 + i * 0.16), 0, S * (0.14 + i * 0.16), -S * 0.16, S * 0.08, { seed: i }))).fill({
            color: melanger(PIERRE_CLAIRE, LIGHT.chaude, 0.3),
            alpha: 0.9,
          });
        }
      });
    },
    surTronc: (g, kk) => {
      /*
       * Les POILS HÉRISSÉS, sur toute l'échine.
       *
       * La collerette ne couvrait qu'un empan à l'épaule — six touffes sur un
       * cinquième du dos — et le reste de la ligne dorsale était une masse lisse.
       * Vu sur la planche de contact une fois les bêtes affichées à taille
       * lisible, cela rendait une planche posée sur quatre bâtons. Or c'est
       * exactement là que le rendu de référence met la silhouette du loup : une
       * crête de poils dressés qui court de la queue à la nuque, la plus haute au
       * garrot, ourlée de lumière chaude. C'est elle qui fait la bête qui gronde
       * plutôt que le chien qui passe.
       *
       * Le profil de hauteur est une cloche : basse sur la croupe, maximale au
       * garrot, retombant sur la nuque. Les touffes alternent clair et sombre, et
       * une sur deux prend le liseré — sans cette alternance, dix-huit fuseaux du
       * même ton refont une masse lisse, et l'on n'aurait rien gagné.
       */
      const n = brumes ? 18 : 15;
      for (let i = 0; i < n; i += 1) {
        const t = i / (n - 1);
        const x = L * (-0.42 + t * 0.76);
        /* Cloche centrée au garrot, à peu près aux trois quarts de l'échine. */
        const cloche = Math.sin(Math.PI * Math.min(1, Math.max(0, (t + 0.18) / 1.18)));
        /* Une CRINIÈRE, pas une crête de lézard : mesurée sur capture, la
           première version montait à la moitié de la hauteur du garrot et
           rendait un dos d'iguane. On l'abaisse, on l'élargit, et les touffes se
           recouvrent — c'est le recouvrement qui fait le poil. */
        const haut = Hs * (0.3 + 0.16 * cloche * cloche);
        poser(g, kk, fuseau(x, -Hs * 0.26, x - L * 0.02, -haut, Hs * (0.15 + 0.07 * cloche), { seed: i + 3, taper: 0.72 }), {
          couleur: i % 2 ? eclaircir(poil, 0.24) : assombrir(poil, 0.24),
          matiere: 'fourrure',
          matiereAlpha: 0.3,
          echelle: 0.3,
          rim: i % 2 === 0,
        });
      }
      // ligne dorsale sombre
      g.moveTo(-L * 0.4, -Hs * 0.28);
      g.quadraticCurveTo(0, -Hs * 0.4, L * 0.34, -Hs * 0.3);
      g.stroke({ color: assombrir(poil, 0.42), width: Hs * 0.1, alpha: 0.45 });
      if (brumes) {
        brumeAccrochee(g, { x: -L * 0.3, y: Hs * 0.02, w: L * 0.7, h: Hs * 0.8, couleur: BRUME, seed: 41, densite: 10 });
        cicatrice(g, pt(L * 0.06, -Hs * 0.12), pt(L * 0.2, Hs * 0.04), poil, 1.6);
      }
    },
  });
}

const loup: Fabrique = (k) =>
  creatureRig(
    { hauteur: 62, empriseSol: 42, respiration: 'tronc', graine: k.seed + 24, teinteMort: MOUSSE },
    loupPieces(k, false),
    k,
    (r) => {
      clipsQuadrupede(r, { foulee: 1.2, allonge: 1.2, lourdeur: 0.82 });
      clipCapacite(r, 'hurlement');
    },
  );

const loupDesBrumes: Fabrique = (k) =>
  creatureRig(
    { hauteur: 66, empriseSol: 44, respiration: 'tronc', graine: k.seed + 25, teinteMort: BRUME },
    loupPieces(k, true),
    k,
    (r) => {
      clipsQuadrupede(r, { foulee: 1.25, allonge: 1.3, lourdeur: 0.8 });
      clipCapacite(r, 'hurlement');
      if (r.aJoint('queue')) r.joint('queue').ambiance = 2.2;
    },
  );

/* ─────────────────────── Rang 4 — les veneurs ───────────────────────────── */

/**
 * L'arc BANDÉ : un grand D dont la corde est tirée jusqu'à la joue.
 *
 * **Ce que l'ancien arc coûtait, vu sur la planche de contact.** Il était dessiné
 * comme une baguette presque droite — la courbure valait 0,11 L pour une hauteur
 * de L, soit onze pour cent, invisible — avec la corde peinte en LIGNE DROITE
 * de pointe à pointe, superposée au bois. À l'écran, les deux veneurs de
 * l'Ermitage tenaient donc un bâton vertical devant eux, et la flèche
 * horizontale ressemblait à une brochette. Rien ne disait l'archer, et l'archer
 * est tout ce qu'ils sont : les deux seuls tireurs de la faction.
 *
 * Les deux rendus de référence montrent la même chose et c'est la forme la plus
 * lisible du jeu : le bois se creuse en un **D** profond, la corde forme un **V**
 * dont la pointe est ramenée en arrière jusqu'au visage, et la flèche part de
 * cette pointe. Trois traits, aucune ambiguïté possible.
 *
 * On construit donc : le bois en arc de cercle (0,42 L de flèche, quatre fois
 * l'ancienne), les deux poupées recourbées à l'envers comme sur un arc de
 * chasse, puis la corde en deux segments passant par le point d'armement — qui
 * est en ARRIÈRE du bois, ce que l'ancienne corde droite ne pouvait pas dire.
 */
function arcLong(g: Graphics, k: Kit, L: number, garde: boolean, seed: number): void {
  const bois = garde ? melanger(BOIS, MOUSSE, 0.4) : melanger(BOIS, PIERRE_CLAIRE, 0.22);
  /** Creux du D, vers l'avant (+x) : c'est lui qui fait lire l'arc. */
  const fleche = L * (garde ? 0.46 : 0.42);
  /** Où la corde est tirée : en arrière du bois, à hauteur de joue. */
  const armement = pt(-L * 0.3, -L * 0.04);
  const ventre: Poly = [];
  const dosArc: Poly = [];
  for (let i = 0; i <= 18; i += 1) {
    const t = i / 18;
    const y = (t - 0.5) * L;
    const x = Math.cos((t - 0.5) * Math.PI) * fleche;
    const w = L * (garde ? 0.03 : 0.026) * (1 - Math.abs(t - 0.5) * 0.85);
    ventre.push(pt(x - w, y));
    dosArc.push(pt(x + w, y));
  }
  dosArc.reverse();
  poser(g, k, [...ventre, ...dosArc], {
    couleur: bois,
    matiere: 'ecorce',
    matiereAlpha: 0.28,
    echelle: 0.28,
    seed,
  });
  // les deux poupées, recourbées vers l'extérieur : la signature de l'if de futaie
  for (const s of [-1, 1] as const) {
    poser(g, k, arcBande(0, s * L * 0.5, L * 0.09, L * 0.09, s > 0 ? -1.5 : 1.5, s > 0 ? -0.1 : 0.1, L * 0.05, 0.5), {
      couleur: assombrir(bois, 0.16),
      matiere: 'ecorce',
      matiereAlpha: 0.26,
      echelle: 0.25,
      seed: seed + s,
    });
  }
  // poignée gainée, au creux du D
  poser(g, k, blob(fleche * 0.98, 0, L * 0.036, L * 0.1, { seed: seed + 3, points: 13, wobble: 0.16 }), {
    couleur: assombrir(BOIS, 0.32),
    matiere: 'grain',
    matiereAlpha: 0.2,
  });
  /* La corde : deux segments jusqu'au point d'armement. Le V est la moitié de
     l'information ; une droite de pointe à pointe n'en donnait aucune. */
  for (const dy of [-1, 1] as const) {
    g.moveTo(L * 0.02, dy * L * 0.55);
    g.lineTo(armement.x, armement.y);
    g.stroke({ color: melanger(PIERRE_CLAIRE, BOIS, 0.34), width: L * 0.016, alpha: 0.9, cap: 'round' });
  }
  // la flèche : de l'armement à travers la poignée, empennée en arrière
  const fl = fuseau(armement.x, armement.y, fleche + L * 0.24, armement.y - L * 0.02, L * 0.026, {
    seed: seed + 5,
    taper: 0.35,
  });
  poser(g, k, fl, { couleur: melanger(BOIS, PIERRE_CLAIRE, 0.4), matiere: 'grain', matiereAlpha: 0.16 });
  for (const dy of [-1, 1] as const) {
    g.poly(
      flat(fuseau(armement.x + L * 0.02, armement.y, armement.x - L * 0.06, armement.y + dy * L * 0.05, L * 0.026, { seed: seed + dy, taper: 0.5 })),
    ).fill({ color: dy > 0 ? melanger(PIERRE_CLAIRE, BOIS, 0.3) : melanger(SAUGE, PIERRE_CLAIRE, 0.35), alpha: 0.9 });
  }
  sous(g, fleche + L * 0.24, armement.y - L * 0.02, (h) =>
    fer(
      h,
      k,
      lisser(perturber(densifier([pt(0, -L * 0.035), pt(L * 0.11, 0), pt(0, L * 0.035), pt(L * 0.02, 0)], L * 0.03), 0.4, 9), 1),
      garde ? melanger(CUIVRE, 0x8f99a4, 0.4) : 0x8f99a4,
    ),
  );
  if (garde) {
    // barbelures : la flèche du garde-futaie ne ressort pas
    sous(g, fleche + L * 0.26, armement.y - L * 0.02, (h) => {
      for (const dy of [-1, 1]) {
        h.poly(flat(fuseau(0, 0, -L * 0.06, dy * L * 0.05, L * 0.018, { seed: dy + 3, taper: 0.6 }))).fill({
          color: melanger(CUIVRE, 0x8f99a4, 0.4),
          alpha: 0.9,
        });
      }
    });
    // damasquinure sur le dos de l'arc : la marque du prieuré
    orfevrerie(
      g,
      [pt(fleche * 0.72, -L * 0.32), pt(fleche * 1.0, 0), pt(fleche * 0.72, L * 0.32)],
      { epaisseur: L * 0.012, alpha: 0.55 },
    );
  }
}

/**
 * Les veneurs : **le bras tendu qui porte l'arc bandé**.
 *
 * L'arc, aussi bien dessiné soit-il, ne dit rien s'il pend au bout d'un bras
 * collé au corps. Les deux rendus de référence tiennent la même pose exacte : le
 * bras d'arc TENDU à l'horizontale devant soi, l'autre replié, la corde à la
 * joue. `brasGRot` tend le bras porteur, `armeAncre.rot` annule cette rotation
 * pour que l'arc reste vertical, et le manteau de feuilles part derrière comme
 * dans le rendu — c'est la même mécanique que pour l'arbalète des Farges, parce
 * que c'est le même problème : un tireur est un geste avant d'être un homme.
 */
function veneurPieces(k: Kit, garde: boolean): PieceDef[] {
  const H = garde ? 106 : 100;
  const manteau = garde ? melanger(VERT_PROFOND, MOUSSE, 0.45) : melanger(VERT_PROFOND, SAUGE, 0.28);
  /** Bras d'arc tendu vers l'avant. */
  const BRAS_TENDU = -1.32;
  return squeletteBipede({
    H,
    seed: k.seed + (garde ? 270 : 260),
    teint: TEINTS[garde ? 3 : 0],
    tunique: manteau,
    jambeCouleur: melanger(BOIS, MOUSSE, 0.45),
    brasCouleur: garde ? melanger(BOIS, MOUSSE, 0.35) : TEINTS[0],
    manche: melanger(manteau, SAUGE, 0.3),
    chausse: assombrir(BOIS, 0.4),
    ceinture: BOIS,
    posture: 0.35,
    largeur: garde ? 1.06 : 0.98,
    epaules: garde ? 1.06 : 0.96,
    ecart: 1.75,
    coude: 0.3,
    brasGRot: BRAS_TENDU,
    brasDRot: -0.86,
    epaulement: { couleur: melanger(manteau, SAUGE, 0.42), largeur: H * (garde ? 0.2 : 0.18) },
    /* La cotte de feuilles : ourlet déchiqueté à fond, c'est le camouflage de
       futaie du rendu — des feuilles cousues bord à bord, pas un ourlet net. */
    basque: {
      couleur: melanger(manteau, MOUSSE, 0.3),
      dents: 1,
      hauteur: H * 0.17,
      largeur: H * 0.3,
      bord: garde ? LIGHT.rim : null,
    },
    jambiere: { couleur: melanger(BOIS, MOUSSE, 0.25), hauteur: H * 0.15 },
    visage: { sourcils: 0.5, age: garde ? 0.7 : 0.2, barbe: garde ? 0.42 : 0.15, barbeCouleur: 0x5d5142 },
    cheveux: { couleur: garde ? 0x5d5142 : 0x3f2c1a, longueur: 0.5, volume: 0.9 },
    cape: {
      couleur: manteau,
      w: H * (garde ? 0.44 : 0.38),
      h: H * (garde ? 0.56 : 0.46),
      dents: 1,
      bord: garde ? LIGHT.rim : null,
    },
    coiffe: (g, kk) => {
      capuche(g, kk, { r: rayonTete(H), couleur: assombrir(manteau, 0.16), pointe: 0.4, ouverture: 0.5, seed: 5 });
      // feuilles cousues sur la capuche : camouflage de futaie
      const r = rayonTete(H);
      for (let i = 0; i < (garde ? 7 : 4); i += 1) {
        const a = -2.5 + i * 0.5;
        const x = Math.cos(a) * r * 1.05;
        const y = Math.sin(a) * r * 1.05 - r * 0.3;
        g.poly(flat(fuseau(x, y, x + Math.cos(a) * r * 0.5, y + Math.sin(a) * r * 0.5, r * 0.28, { seed: i, taper: 0.5 }))).fill({
          color: i % 2 ? melanger(SAUGE, MOUSSE, 0.4) : melanger(SAUGE, LIGHT.rim, 0.25),
          alpha: 0.82,
        });
      }
      if (garde) mousse(g, { x: -r * 0.3, y: -r * 0.9, w: r * 2, h: r * 1.4, seed: 7, densite: 9, couleur: SAUGE });
    },
    dos: (g, kk) =>
      sous(g, H * 0.05, H * 0.02, (h) => {
        // carquois oblique, flèches empennées de plumes de hulotte
        poser(h, kk, lisser(perturber(densifier([pt(-H * 0.028, -H * 0.09), pt(H * 0.03, -H * 0.11), pt(H * 0.022, H * 0.07), pt(-H * 0.03, H * 0.08)], H * 0.05), 0.5, 11), 1), {
          couleur: assombrir(BOIS, 0.24),
          matiere: 'grain',
          matiereAlpha: 0.2,
        });
        const n = garde ? 6 : 4;
        for (let i = 0; i < n; i += 1) {
          const a = -0.55 + (i / Math.max(1, n - 1)) * 1.1;
          h.moveTo(Math.sin(a) * H * 0.012, -H * 0.09);
          h.lineTo(Math.sin(a) * H * 0.055, -H * 0.16);
          h.stroke({ color: melanger(BOIS, PIERRE_CLAIRE, 0.3), width: H * 0.008, alpha: 0.9, cap: 'round' });
          h.poly(flat(fuseau(Math.sin(a) * H * 0.042, -H * 0.14, Math.sin(a) * H * 0.058, -H * 0.175, H * 0.015, { seed: i }))).fill({
            color: i % 2 ? melanger(PIERRE_CLAIRE, BOIS, 0.3) : melanger(SAUGE, PIERRE_CLAIRE, 0.4),
            alpha: 0.88,
          });
        }
      }),
    surTorse: (g, kk) => {
      if (garde) {
        // cor de veneur en bandoulière : matière ajoutée
        sous(g, -H * 0.02, -H * 0.1, (h) => {
          const c = arcBande(0, 0, H * 0.055, H * 0.05, 0.4, 3.4, H * 0.028, 0.6);
          poser(h, kk, c, {
            couleur: melanger(CUIVRE, LIGHT.rim, 0.3),
            matiere: 'metal',
            matiereAlpha: 0.24,
            echelle: 0.3,
            speculaire: { x: 0.3, y: 0.26, r: 0.1 },
          });
        });
        // brassards d'écorce
        sous(g, -H * 0.1, -H * 0.16, (h) =>
          poser(h, kk, blob(0, 0, H * 0.026, H * 0.034, { seed: 13, points: 12, wobble: 0.2 }), {
            couleur: melanger(BOIS, MOUSSE, 0.5),
            matiere: 'ecorce',
            matiereAlpha: 0.3,
            echelle: 0.28,
          }),
        );
        // tabard du prieuré, une feuille brodée
        g.poly(flat(fuseau(0, -H * 0.1, 0, -H * 0.24, H * 0.055, { seed: 3 }))).fill({
          color: melanger(CUIVRE, LIGHT.rim, 0.2),
          alpha: 0.8,
        });
        mousse(g, { x: -H * 0.02, y: -H * 0.16, w: H * 0.22, h: H * 0.24, seed: 17, densite: 10, couleur: SAUGE });
      } else {
        // simple baudrier de chanvre
        g.moveTo(-H * 0.09, -H * 0.26);
        g.quadraticCurveTo(0, -H * 0.16, H * 0.09, -H * 0.06);
        g.stroke({ color: melanger(BOIS, PIERRE_CLAIRE, 0.3), width: H * 0.018, alpha: 0.8, cap: 'round' });
      }
    },
    arme: (g, kk) => sous(g, 0, -H * 0.02, (h) => arcLong(h, kk, H * (garde ? 0.86 : 0.8), garde, 19)),
    /* Annule la rotation du bras tendu : l'arc reste vertical, le D toujours
       lisible, quelle que soit la pose du bras. */
    armeAncre: { rot: -BRAS_TENDU },
  });
}

const veneur: Fabrique = (k) =>
  creatureRig(
    { hauteur: 100, empriseSol: 20, respiration: 'buste', graine: k.seed + 26, teinteMort: VERT_PROFOND },
    veneurPieces(k, false),
    k,
    (r) => {
      clipsBipede(r, { tir: true });
      clipCapacite(r, 'levee');
    },
  );

const gardeFutaie: Fabrique = (k) =>
  creatureRig(
    { hauteur: 106, empriseSol: 22, respiration: 'buste', graine: k.seed + 27, teinteMort: MOUSSE },
    veneurPieces(k, true),
    k,
    (r) => {
      clipsBipede(r, { tir: true });
      clipCapacite(r, 'levee');
    },
  );

/* ─────────────────────── Rang 5 — les cerfs des sources ─────────────────── */

/**
 * La RAMURE — le seul trait qui doive faire dire « cerf » à la vignette.
 *
 * **Ce qu'elle était, et pourquoi elle ratait.** Deux merrains en arc de
 * cercle, l'un ouvert vers l'avant, l'autre vers l'arrière, symétriques par
 * rapport à l'axe du crâne : c'est une ramure vue DE FACE, posée sur une tête
 * vue DE PROFIL. Les deux lectures se contredisent, et ce qui reste à seize
 * pixels est un râteau de jardin — mot pour mot ce que montre la planche, avec
 * en prime les deux merrains couchés vers la croupe parce que l'encolure elle
 * aussi partait à l'envers. Mesuré : la boîte tête + ramure du cerf tenait en
 * x[−87..46], c'est-à-dire trente-sept unités DERRIÈRE la fesse de la bête.
 *
 * **Ce qu'elle est.** De profil, une ramure de cerf se lit ainsi : le MERRAIN
 * monte de la meule, au-dessus de l'œil, et part en arrière au-dessus de
 * l'encolure ; les ANDOUILLERS s'en détachent vers l'AVANT et le haut, de plus
 * en plus courts ; l'andouiller de massacre passe seul devant le front ; la
 * couronne se refourche au sommet. Les deux bois ne se superposent pas tout à
 * fait : le lointain, plus sombre et décalé, double la silhouette — c'est ce
 * dédoublement qui dit « bois » plutôt que « branche ».
 */
function ramure(g: Graphics, k: Kit, S: number, miraculeux: boolean, seed: number): void {
  const bois = miraculeux ? melanger(PIERRE_CLAIRE, CUIVRE, 0.3) : melanger(BOIS, PIERRE_CLAIRE, 0.35);
  /** Le merrain, de la meule au sommet : monte, puis part en arrière. */
  const MERRAIN = [pt(0.06, 0.04), pt(0.08, -0.72), pt(-0.24, -1.32), pt(-0.6, -1.72)];
  /** Andouillers : [x,y de départ sur le merrain, x,y de pointe], vers l'avant. */
  const ANDOUILLERS: readonly (readonly [number, number, number, number])[] = [
    [0.06, -0.06, 0.78, -0.46], // massacre, devant le front
    [0.07, -0.5, 0.74, -1.02], // chevillure
    [0.02, -0.98, 0.5, -1.56], // trochure
    [-0.24, -1.32, 0.08, -1.98], // couronne, montant
    [-0.42, -1.54, -0.34, -2.1], // couronne, fourche haute
    [-0.6, -1.72, -0.98, -2.02], // époi arrière
  ];

  /* Le bois LOINTAIN d'abord : décalé, réduit, assombri. */
  for (const loin of [true, false]) {
    const dx = loin ? -0.2 : 0;
    const dy = loin ? 0.1 : 0;
    const ech = loin ? 0.9 : 1;
    const ton = loin ? ombreBleutee(bois, 0.55) : bois;
    const P = (q: readonly [number, number] | { x: number; y: number }): { x: number; y: number } => {
      const qx = Array.isArray(q) ? q[0] : (q as { x: number }).x;
      const qy = Array.isArray(q) ? q[1] : (q as { y: number }).y;
      return pt(S * (qx * ech + dx), S * (qy * ech + dy));
    };
    for (let i = 0; i < MERRAIN.length - 1; i += 1) {
      const a = P(MERRAIN[i]);
      const b = P(MERRAIN[i + 1]);
      poser(g, k, fuseau(a.x, a.y, b.x, b.y, S * (0.22 - i * 0.04) * ech, { seed: seed + i * 3 + (loin ? 40 : 0), taper: 0.3 }), {
        couleur: i % 2 ? eclaircir(ton, 0.12) : ton,
        matiere: 'ecorce',
        matiereAlpha: 0.26,
        echelle: 0.3,
        rim: !loin,
        seed: seed + i,
      });
    }
    const n = miraculeux ? ANDOUILLERS.length : ANDOUILLERS.length - 1;
    for (let i = 0; i < n; i += 1) {
      const [bx0, by0, tx0, ty0] = ANDOUILLERS[i];
      const a = P([bx0, by0] as const);
      const b = P([tx0, ty0] as const);
      poser(g, k, fuseau(a.x, a.y, b.x, b.y, S * (0.15 - i * 0.012) * ech, { seed: seed + i * 7 + (loin ? 60 : 0), taper: 0.66 }), {
        couleur: i % 2 ? eclaircir(ton, 0.2) : ton,
        matiere: 'ecorce',
        matiereAlpha: 0.24,
        echelle: 0.28,
        rim: !loin,
      });
      if (loin) continue;
      if (!miraculeux && i < 3) {
        // gouttes d'eau claire des sept vallons, suspendues sous la pointe
        g.poly(flat(blob(b.x, b.y + S * 0.1, S * 0.06, S * 0.08, { seed: i * 3 + 5, points: 10, wobble: 0.22 }))).fill({
          color: melanger(BRUME, LIGHT.chaude, 0.3),
          alpha: 0.66,
        });
      }
      /* Un peu de mousse sur le bois : la ramure du cerf des sources en porte,
         et c'est ce qui la rattache au pays plutôt qu'à un trophée. */
      g.poly(
        flat(
          blob(a.x + (b.x - a.x) * 0.36, a.y + (b.y - a.y) * 0.36, S * 0.05, S * 0.04, {
            seed: i * 5 + 3,
            points: 9,
            wobble: 0.34,
          }),
        ),
      ).fill({ color: melanger(SAUGE, MOUSSE, 0.4 + (i % 2) * 0.2), alpha: 0.6 });
    }
  }
  /* Les MEULES : les deux bourrelets d'où sortent les bois. Sans elles, la
     ramure a l'air posée sur le crâne au lieu d'en sortir. */
  for (const [mx, my, r] of [
    [0.06, 0.06, 0.19],
    [-0.14, 0.14, 0.15],
  ] as const) {
    poser(g, k, blob(S * mx, S * my, S * r, S * r * 0.78, { seed: seed + 71, points: 11, wobble: 0.24 }), {
      couleur: assombrir(bois, 0.2),
      matiere: 'ecorce',
      matiereAlpha: 0.3,
      echelle: 0.26,
      modele: 1.1,
    });
  }
  if (miraculeux) {
    lueurFroide(g, 0, -S * 0.85, S * 0.42, melanger(BRUME, CUIVRE, 0.35), 1);
    for (let i = 0; i < 6; i += 1) {
      const a = -2.6 + i * 0.55;
      g.poly(flat(blob(Math.cos(a) * S * 0.95, -S * 0.85 + Math.sin(a) * S * 0.7, S * 0.055, S * 0.06, { seed: i + 11, points: 8, wobble: 0.3 }))).fill({
        color: melanger(BRUME, LIGHT.chaude, 0.5),
        alpha: 0.4 + (i % 2) * 0.2,
      });
    }
  }
}

function teteCerf(g: Graphics, k: Kit, S: number, miraculeux: boolean, seed: number): void {
  const poil = miraculeux ? melanger(PIERRE_CLAIRE, SAUGE, 0.42) : melanger(BOIS, SAUGE, 0.35);
  /*
   * Une tête de cervidé est LONGUE : mufle étroit, front large, ganache
   * marquée. Celle-ci tenait en 1,44 S sur 0,94 S — presque ronde —, et sous la
   * ramure on ne lisait qu'une bosse. On l'allonge à 1,86 S et on lui met la
   * ganache derrière, comme au cheval : c'est le même animal de fond.
   */
  poser(g, k, blob(-S * 0.1, S * 0.04, S * 0.4, S * 0.36, { seed: seed + 41, points: 14, wobble: 0.2 }), {
    couleur: assombrir(poil, 0.16),
    matiere: 'fourrure',
    matiereAlpha: 0.26,
    echelle: 0.32,
    modele: 1.05,
  });
  const forme = lisser(
    perturber(
      densifier(
        [
          pt(-S * 0.5, -S * 0.42),
          pt(-S * 0.04, -S * 0.6),
          pt(S * 0.5, -S * 0.46),
          pt(S * 1.0, -S * 0.26),
          pt(S * 1.3, -S * 0.02),
          pt(S * 1.18, S * 0.18),
          pt(S * 0.66, S * 0.22),
          pt(S * 0.16, S * 0.36),
          pt(-S * 0.44, S * 0.2),
        ],
        S * 0.18,
      ),
      S * 0.016,
      seed,
    ),
    1,
  );
  poser(g, k, forme, { couleur: poil, matiere: 'fourrure', matiereAlpha: 0.26, echelle: 0.36, seed });
  /* Le chanfrein clair, du front au mufle : la bande éclairée du côté soleil. */
  poser(g, k, fuseau(-S * 0.02, -S * 0.48, S * 1.1, -S * 0.14, S * 0.17, { seed: seed + 43, taper: 0.5 }), {
    couleur: melanger(poil, LIGHT.chaude, 0.22),
    matiere: 'fourrure',
    matiereAlpha: 0.2,
    echelle: 0.3,
    modele: 0.75,
    rim: false,
  });
  // mufle noir humide, et la fente des lèvres
  g.poly(flat(blob(S * 1.14, -S * 0.04, S * 0.11, S * 0.1, { seed: seed + 3, points: 12, wobble: 0.2 }))).fill({
    color: assombrir(poil, 0.66),
    alpha: 0.9,
  });
  g.moveTo(S * 0.86, S * 0.12);
  g.quadraticCurveTo(S * 1.06, S * 0.16, S * 1.2, S * 0.06);
  g.stroke({ color: ombreBleutee(poil, 0.9), width: S * 0.05, alpha: 0.75, cap: 'round' });
  // grand œil doux, cerné de clair
  g.poly(flat(blob(S * 0.26, -S * 0.24, S * 0.13, S * 0.1, { seed: seed + 5, points: 12, wobble: 0.18 }))).fill({
    color: melanger(PIERRE_CLAIRE, poil, 0.4),
    alpha: 0.8,
  });
  g.poly(flat(blob(S * 0.27, -S * 0.24, S * 0.075, S * 0.07, { seed: seed + 7, points: 10, wobble: 0.2 }))).fill({
    color: miraculeux ? melanger(BRUME, 0x241c14, 0.35) : 0x241c14,
    alpha: 0.95,
  });
  g.poly(flat(blob(S * 0.23, -S * 0.28, S * 0.03, S * 0.026, { seed: seed + 9, points: 7, wobble: 0.3 }))).fill({
    color: LIGHT.chaude,
    alpha: 0.7,
  });
  /* Les oreilles, larges et pivotées vers l'arrière — un cervidé les porte
     grandes. Pavillon et conque, comme le cheval. */
  for (const [bx, by, tx, ty] of [
    [-0.3, -0.36, -0.74, -0.6],
    [-0.16, -0.5, -0.5, -0.86],
  ] as const) {
    oreilleAnimale(g, k, {
      base: pt(S * bx, S * by),
      pointe: pt(S * tx, S * ty),
      largeur: S * 0.3,
      couleur: assombrir(poil, 0.2),
      seed: seed + bx * 20,
    });
  }
  sous(g, -S * 0.06, -S * 0.5, (h) => ramure(h, k, S * 1.05, miraculeux, seed + 21));
}

function cerfPieces(k: Kit, miraculeux: boolean): PieceDef[] {
  const poil = miraculeux ? melanger(PIERRE_CLAIRE, SAUGE, 0.38) : melanger(BOIS, SAUGE, 0.3);
  const Hs = miraculeux ? 84 : 78;
  const L = miraculeux ? 104 : 98;
  return squeletteQuadrupede({
    Hs,
    L,
    robe: poil,
    ventre: eclaircir(poil, 0.3),
    matiere: 'fourrure',
    patteCouleur: assombrir(poil, 0.26),
    seed: k.seed + (miraculeux ? 290 : 280),
    /* Encolure haute et PORTÉE EN AVANT : un cerf tient sa tête devant son
       poitrail, pas au-dessus de ses omoplates. C'est ce que corrigeait
       `avance` ; sans elle la ramure retombait sur la croupe. */
    cou: { longueur: Hs * 0.52, largeur: Hs * 0.26, angle: -0.14, avance: 0.42 },
    teteRot: -0.2,
    queue: { longueur: L * 0.12, epaisseur: Hs * 0.1, courbe: 0.8 },
    tete: (g, kk) => teteCerf(g, kk, Hs * 0.38, miraculeux, k.seed + 71),
    surTronc: (g) => {
      // mouchetures de faon conservées à l'âge adulte
      for (let i = 0; i < 12; i += 1) {
        const x = -L * 0.32 + (i % 6) * L * 0.11;
        const y = -Hs * 0.24 + Math.floor(i / 6) * Hs * 0.16;
        g.poly(flat(blob(x, y, Hs * 0.035, Hs * 0.028, { seed: i * 3 + 2, points: 9, wobble: 0.3 }))).fill({
          color: eclaircir(poil, 0.42),
          alpha: 0.34,
        });
      }
      if (miraculeux) {
        mousse(g, { x: -L * 0.1, y: -Hs * 0.24, w: L * 0.5, h: Hs * 0.3, seed: 23, densite: 14, couleur: SAUGE });
        for (let i = 0; i < 5; i += 1) {
          g.poly(flat(blob(-L * 0.16 + i * L * 0.1, -Hs * 0.3, Hs * 0.028, Hs * 0.03, { seed: i + 31, points: 8, wobble: 0.3 }))).fill({
            color: melanger(PIERRE_CLAIRE, LIGHT.chaude, 0.4),
            alpha: 0.6,
          });
        }
      } else {
        // l'eau des sept vallons ruisselle le long de l'échine
        for (let i = 0; i < 6; i += 1) {
          const x = -L * 0.24 + i * L * 0.1;
          g.moveTo(x, -Hs * 0.32);
          g.quadraticCurveTo(x + 2, -Hs * 0.1, x - 1, Hs * 0.1);
          g.stroke({ color: melanger(BRUME, LIGHT.chaude, 0.28), width: Hs * 0.022, alpha: 0.35, cap: 'round' });
        }
      }
    },
  });
}

const cerf: Fabrique = (k) =>
  creatureRig(
    { hauteur: 116, empriseSol: 44, respiration: 'tronc', graine: k.seed + 28, teinteMort: SAUGE },
    cerfPieces(k, false),
    k,
    (r) => {
      clipsQuadrupede(r, { foulee: 1, allonge: 1.1, lourdeur: 0.95 });
      clipCapacite(r, 'benediction');
      r.definirClip(
        'capacite',
        clip(1.7, false, [
          p('cou', 'rot', [[0, 0], [0.34, 0.62, 'doux'], [0.72, 0.58], [1, 0, 'doux']]),
          p('tete', 'rot', [[0, 0], [0.34, 0.3], [0.72, 0.28], [1, 0]]),
          p('corps', 'y', [[0, 0], [0.34, 2.4], [0.72, 2.2], [1, 0]]),
        ]),
      );
    },
  );

const cerfMiraculeux: Fabrique = (k) =>
  creatureRig(
    { hauteur: 128, empriseSol: 48, respiration: 'tronc', graine: k.seed + 29, teinteMort: BRUME },
    cerfPieces(k, true),
    k,
    (r) => {
      clipsQuadrupede(r, { foulee: 0.95, allonge: 1.1, lourdeur: 1 });
      clipCapacite(r, 'benediction');
      r.definirClip(
        'capacite',
        clip(1.9, false, [
          p('cou', 'rot', [[0, 0], [0.3, -0.42, 'doux'], [0.74, -0.4], [1, 0, 'doux']]),
          p('tete', 'rot', [[0, 0], [0.3, -0.24], [0.74, -0.22], [1, 0]]),
          p('corps', 'y', [[0, 0], [0.3, -2.6], [0.74, -2.4], [1, 0]]),
        ]),
      );
    },
  );

/* ───────────────────── Rang 6 — les colosses de pierre ──────────────────── */

function blocPierre(
  g: Graphics,
  k: Kit,
  w: number,
  h: number,
  seed: number,
  o: { couleur?: number; faille?: boolean; lichen?: number } = {},
): void {
  const c = o.couleur ?? melanger(0x4a4e52, PIERRE_CLAIRE, 0.16);

  /*
   * Un ASSEMBLAGE de pierres taillées, pas une masse arrondie.
   *
   * Ce bloc dessinait un seul polygone lissé, traversé de trois traits. Rendu à
   * l'écran, un colosse en était fait de sept ou huit fois — et il rendait un
   * bonhomme de galets gris, ce que la planche de contact a montré sans appel
   * dès qu'elle a cessé d'afficher les bêtes en timbre-poste. Le rendu de
   * référence dit autre chose : chaque membre y est un empilement de pierres
   * ANGULEUSES, à faces plates, séparées par des joints sombres, et c'est cette
   * maçonnerie qui fait le golem plutôt que le tas.
   *
   * On pose donc l'ombre de la masse entière — pour que la silhouette reste
   * lue d'un coup —, puis on la remplit d'un damier de pierres décalées, chacune
   * anguleuse, chacune de son ton. Le joint sombre n'est pas dessiné : il est ce
   * qui reste du fond entre deux pierres qu'on rentre d'un poil.
   */
  const masse = lisser(
    perturber(
      densifier(
        [
          pt(-w * 0.5, -h * 0.44),
          pt(-w * 0.14, -h * 0.54),
          pt(w * 0.36, -h * 0.48),
          pt(w * 0.54, -h * 0.1),
          pt(w * 0.44, h * 0.38),
          pt(w * 0.02, h * 0.54),
          pt(-w * 0.44, h * 0.42),
          pt(-w * 0.56, h * 0.02),
        ],
        Math.min(w, h) * 0.24,
      ),
      Math.min(w, h) * 0.03,
      seed,
    ),
    0,
  );
  poser(g, k, masse, {
    couleur: ombreBleutee(c, 0.62),
    matiere: 'granit',
    matiereAlpha: 0.34,
    echelle: 0.5,
    modele: 0.6,
    rim: false,
    seed,
  });

  /* Le damier : trois rangs, deux ou trois pierres par rang, décalés d'un
     demi-pas comme un mur de moellons. */
  const RANGS = 3;
  for (let r = 0; r < RANGS; r += 1) {
    const par = r === 1 ? 3 : 2;
    const decale = r === 1 ? 0 : 0.5;
    for (let i = 0; i < par; i += 1) {
      const u = (i + decale) / par;
      const cx = -w * 0.42 + u * w * 0.84;
      const cy = -h * 0.4 + ((r + 0.5) / RANGS) * h * 0.82;
      const pw = (w * 0.9) / par;
      const ph = (h * 0.86) / RANGS;
      /* Cinq à six côtés, sans lissage : c'est l'angle qui fait la pierre. */
      const n = 5 + ((seed + r * 7 + i * 3) % 2);
      const face: Poly = [];
      for (let s = 0; s < n; s += 1) {
        const a = (s / n) * Math.PI * 2 + (r + i) * 0.7;
        /* Rayon irrégulier, mais jamais lissé : on garde les arêtes vives. */
        const rr = 0.34 + (((seed + s * 13 + r * 5 + i) % 7) / 7) * 0.2;
        face.push(pt(cx + Math.cos(a) * pw * rr * 1.25, cy + Math.sin(a) * ph * rr * 1.3));
      }
      const ton = melanger(
        (r + i) % 2 ? eclaircir(c, 0.16) : assombrir(c, 0.14),
        r === 0 ? eclaircir(c, 0.22) : c,
        0.4,
      );
      poser(g, k, perturber(face, Math.min(pw, ph) * 0.03, seed + r * 11 + i * 5), {
        couleur: ton,
        matiere: 'granit',
        matiereAlpha: 0.32,
        echelle: 0.42,
        modele: 1.15,
        rim: r === 0,
        seed: seed + r * 3 + i,
      });
      /* Un plan de clivage éclairé par pierre : sans lui, une face plate de
         granit ressemble à un galet. */
      g.moveTo(cx - pw * 0.34, cy - ph * 0.12);
      g.lineTo(cx + pw * 0.3, cy - ph * 0.3);
      g.stroke({
        color: eclaircir(ton, 0.34),
        width: Math.min(pw, ph) * 0.06,
        alpha: 0.34,
        cap: 'round',
      });
    }
  }
  if (o.faille) {
    const fx: Poly = [];
    for (let i = 0; i <= 6; i += 1) {
      const t = i / 6;
      fx.push(pt(-w * 0.3 + t * w * 0.62 + Math.sin(t * 9) * w * 0.05, -h * 0.44 + t * h * 0.9));
    }
    g.moveTo(fx[0].x, fx[0].y);
    for (let i = 1; i < fx.length; i += 1) g.lineTo(fx[i].x, fx[i].y);
    g.stroke({ color: ombreBleutee(c, 1), width: Math.min(w, h) * 0.07, alpha: 0.8, cap: 'round' });
    g.moveTo(fx[0].x, fx[0].y);
    for (let i = 1; i < fx.length; i += 1) g.lineTo(fx[i].x, fx[i].y);
    g.stroke({ color: melanger(CUIVRE, LIGHT.chaude, 0.4), width: Math.min(w, h) * 0.028, alpha: 0.72, cap: 'round' });
    // veines de quartz
    for (let i = 0; i < 2; i += 1) {
      g.moveTo(-w * 0.4 + i * w * 0.5, h * 0.3);
      g.quadraticCurveTo(0, h * 0.05, w * 0.3 - i * w * 0.4, -h * 0.34);
      g.stroke({ color: melanger(PIERRE_CLAIRE, LIGHT.chaude, 0.4), width: Math.min(w, h) * 0.024, alpha: 0.45 });
    }
  }
  if (o.lichen) mousse(g, { x: -w * 0.1, y: -h * 0.2, w: w * 0.9, h: h * 0.8, seed: seed + 5, densite: o.lichen, couleur: SAUGE });
}

function colossePieces(k: Kit, pamole: boolean): PieceDef[] {
  const H = pamole ? 150 : 132;
  const c = pamole ? melanger(0x4a4e52, 0x6a6255, 0.28) : melanger(0x4a4e52, PIERRE_CLAIRE, 0.14);
  const pieces: PieceDef[] = [];

  pieces.push({ nom: 'bassin', x: 0, y: -H * 0.42, ordreMort: 6, dessin: () => {} });

  for (const cote of [1, -1] as const) {
    pieces.push({
      nom: cote > 0 ? 'jambe_d' : 'jambe_g',
      parent: 'bassin',
      x: cote * H * 0.1,
      y: 0,
      lumiere: cote > 0 ? -0.7 : 0.7,
      ordreMort: cote > 0 ? 1 : 3,
      dessin: (g, kk) => {
        blocPierre(g, kk, H * 0.19, H * 0.24, k.seed + cote * 7, {
          couleur: cote > 0 ? assombrir(c, 0.16) : c,
          lichen: pamole ? 6 : 9,
        });
        sous(g, 0, H * 0.2, (h) =>
          blocPierre(h, kk, H * 0.21, H * 0.22, k.seed + cote * 11, {
            couleur: cote > 0 ? assombrir(c, 0.22) : assombrir(c, 0.06),
            lichen: pamole ? 5 : 8,
          }),
        );
      },
    });
  }

  pieces.push({ nom: 'torse', parent: 'bassin', x: 0, y: 0, ordreMort: 7, dessin: () => {} });

  pieces.push({
    nom: 'bras_d',
    parent: 'torse',
    x: H * 0.19,
    y: -H * 0.3,
    rot: 0.18,
    lumiere: -0.8,
    ordreMort: 2,
    dessin: (g, kk) => {
      blocPierre(g, kk, H * 0.15, H * 0.2, k.seed + 13, { couleur: assombrir(c, 0.18), lichen: 5 });
      sous(g, H * 0.01, H * 0.19, (h) =>
        blocPierre(h, kk, H * 0.16, H * 0.19, k.seed + 17, { couleur: assombrir(c, 0.26), lichen: 4 }),
      );
      sous(g, H * 0.02, H * 0.36, (h) =>
        blocPierre(h, kk, H * 0.15, H * 0.13, k.seed + 19, { couleur: assombrir(c, 0.3), lichen: 3 }),
      );
    },
  });

  pieces.push({
    nom: 'buste',
    parent: 'torse',
    x: 0,
    y: 0,
    ordreMort: 8,
    dessin: (g, kk) => {
      blocPierre(g, kk, H * 0.42, H * 0.3, k.seed + 23, { couleur: c, faille: pamole, lichen: pamole ? 8 : 14 });
      sous(g, 0, -H * 0.24, (h) =>
        blocPierre(h, kk, H * 0.46, H * 0.22, k.seed + 29, {
          couleur: eclaircir(c, 0.08),
          faille: pamole,
          lichen: pamole ? 7 : 12,
        }),
      );
      if (pamole) {
        // la ligne de faille qui l'a détaché du flanc de la Pierre Pamole
        lueurFroide(g, -H * 0.04, -H * 0.16, H * 0.05, melanger(CUIVRE, LIGHT.chaude, 0.35), 0.85);
      }
    },
  });

  pieces.push({
    nom: 'tete',
    parent: 'torse',
    x: -H * 0.01,
    y: -H * 0.42,
    lumiere: 0.6,
    ordreMort: 10,
    dessin: (g, kk) => {
      blocPierre(g, kk, H * 0.2, H * 0.17, k.seed + 31, { couleur: eclaircir(c, 0.12), lichen: pamole ? 5 : 9 });
      // deux creux d'ombre en guise d'yeux, et rien d'autre
      for (const dx of [-0.05, 0.04]) {
        g.poly(flat(blob(dx * H, -H * 0.01, H * 0.022, H * 0.016, { seed: dx * 100 + 3, points: 10, wobble: 0.24 }))).fill({
          color: ombreBleutee(c, 1),
          alpha: 0.9,
        });
        if (pamole) {
          g.poly(flat(blob(dx * H, -H * 0.01, H * 0.011, H * 0.009, { seed: dx * 100 + 5, points: 8, wobble: 0.3 }))).fill({
            color: melanger(CUIVRE, LIGHT.chaude, 0.5),
            alpha: 0.8,
          });
        }
      }
      if (!pamole) mousse(g, { x: 0, y: -H * 0.06, w: H * 0.18, h: H * 0.1, seed: 37, densite: 8, couleur: SAUGE });
    },
  });

  pieces.push({
    nom: 'bras_g',
    parent: 'torse',
    x: -H * 0.19,
    y: -H * 0.32,
    rot: -0.14,
    lumiere: 0.9,
    ordreMort: 4,
    dessin: (g, kk) => {
      blocPierre(g, kk, H * 0.16, H * 0.21, k.seed + 41, { couleur: eclaircir(c, 0.06), lichen: 6 });
      sous(g, -H * 0.01, H * 0.2, (h) =>
        blocPierre(h, kk, H * 0.17, H * 0.2, k.seed + 43, { couleur: c, lichen: 5 }),
      );
      sous(g, -H * 0.02, H * 0.38, (h) =>
        blocPierre(h, kk, H * 0.16, H * 0.14, k.seed + 47, { couleur: assombrir(c, 0.1), lichen: 4 }),
      );
    },
  });

  if (pamole) {
    // le bloc de la taille d'un veau, tenu prêt
    pieces.push({
      nom: 'arme',
      parent: 'bras_g',
      x: -H * 0.03,
      y: H * 0.5,
      lumiere: 0.5,
      ordreMort: 0,
      dessin: (g, kk) => {
        blocPierre(g, kk, H * 0.2, H * 0.18, k.seed + 53, { couleur: melanger(c, PIERRE_CLAIRE, 0.2), lichen: 6 });
        mousse(g, { x: 0, y: 0, w: H * 0.16, h: H * 0.14, seed: 59, densite: 7, couleur: MOUSSE });
      },
    });
  }

  return pieces;
}

const colosse: Fabrique = (k) =>
  creatureRig(
    { hauteur: 132, empriseSol: 40, respiration: 'buste', graine: k.seed + 30, teinteMort: 0x4a4e52 },
    colossePieces(k, false),
    k,
    (r) => {
      clipsMonolithe(r, { allonge: 1 });
      clipCapacite(r, 'levee');
    },
  );

const colossePamole: Fabrique = (k) =>
  creatureRig(
    { hauteur: 150, empriseSol: 46, respiration: 'buste', graine: k.seed + 31, teinteMort: 0x4a4e52 },
    colossePieces(k, true),
    k,
    (r) => {
      clipsMonolithe(r, { allonge: 1.2 });
      clipCapacite(r, 'jet');
    },
  );

/* ─────────────────────── Rang 7 — les vouivres ──────────────────────────── */

function teteVouivre(g: Graphics, k: Kit, S: number, couronnee: boolean, seed: number): void {
  const ecaille = couronnee ? melanger(VERT_PROFOND, CUIVRE, 0.36) : melanger(VERT_PROFOND, MOUSSE, 0.3);
  const forme = lisser(
    perturber(
      densifier(
        [pt(-S * 0.52, -S * 0.34), pt(-S * 0.06, -S * 0.56), pt(S * 0.6, -S * 0.4), pt(S * 1.1, -S * 0.08), pt(S * 1.02, S * 0.16), pt(S * 0.3, S * 0.3), pt(-S * 0.36, S * 0.3), pt(-S * 0.6, S * 0.02)],
        S * 0.2,
      ),
      S * 0.016,
      seed,
    ),
    1,
  );
  poser(g, k, forme, { couleur: ecaille, matiere: 'ecailles', matiereAlpha: 0.3, echelle: 0.36, seed });
  // naseau et fente
  g.poly(flat(blob(S * 1.0, -S * 0.12, S * 0.07, S * 0.05, { seed: seed + 3, points: 9, wobble: 0.24 }))).fill({
    color: ombreBleutee(ecaille, 1),
    alpha: 0.85,
  });
  // œil de reptile
  g.poly(flat(blob(S * 0.32, -S * 0.24, S * 0.16, S * 0.11, { seed: seed + 5, points: 12, wobble: 0.18 }))).fill({
    color: melanger(0xd8a13c, LIGHT.chaude, 0.2),
    alpha: 0.95,
  });
  g.poly(flat(blob(S * 0.33, -S * 0.24, S * 0.04, S * 0.09, { seed: seed + 7, points: 9, wobble: 0.2 }))).fill({
    color: 0x241c14,
    alpha: 0.96,
  });
  g.poly(flat(blob(S * 0.27, -S * 0.28, S * 0.035, S * 0.028, { seed: seed + 9, points: 7, wobble: 0.3 }))).fill({
    color: LIGHT.chaude,
    alpha: 0.72,
  });
  // arcade et cornes
  for (const [dx, dy, len] of [
    [-0.2, -0.4, 0.9],
    [0.04, -0.5, 1.15],
  ] as const) {
    corne(g, k, {
      cx: S * dx,
      cy: S * dy,
      rx: S * 0.6 * len,
      ry: S * 0.5 * len,
      a0: -0.4,
      a1: -2.4,
      ep: S * 0.19,
      couleur: couronnee ? melanger(PIERRE_CLAIRE, LIGHT.rim, 0.4) : melanger(PIERRE_CLAIRE, MOUSSE, 0.35),
      seed: seed + dx * 40,
    });
  }
  // barbillons
  for (let i = 0; i < 2; i += 1) {
    poser(g, k, fuseau(-S * 0.1 + i * S * 0.24, S * 0.24, -S * 0.36 + i * S * 0.3, S * 0.72, S * 0.1, { seed: i + 3, taper: 0.66 }), {
      couleur: assombrir(ecaille, 0.2),
      matiere: 'ecailles',
      matiereAlpha: 0.24,
      echelle: 0.3,
    });
  }
  if (!couronnee) {
    /*
     * L'ESCARBOUCLE, brute, sertie dans l'écaille du front.
     *
     * L'en-tête de ce fichier annonce depuis toujours « escarboucle à la tempe »
     * pour la vouivre de base, et elle n'en avait pas : le rubis n'était dessiné
     * que sur la forme couronnée. Or c'est le signe même de la bête dans la
     * légende d'Auvergne — la vouivre porte une pierre rouge qu'elle dépose pour
     * boire, et c'est ce moment-là qu'on guette pour la lui voler. Le rendu de
     * référence la met bien au front, et sans elle un long serpent vert reste un
     * long serpent vert. Brute et sans monture, pour laisser à la couronnée son
     * sertissage d'or et ses rayons.
     */
    sous(g, S * 0.2, -S * 0.44, (h) => {
      const pierre = blob(0, 0, S * 0.17, S * 0.15, { seed: 23, points: 11, wobble: 0.26 });
      poser(h, k, pierre, {
        couleur: 0x8c2230,
        matiere: 'ecailles',
        matiereAlpha: 0.18,
        echelle: 0.26,
        modele: 1.2,
        speculaire: { x: 0.32, y: 0.3, r: 0.12 },
      });
      lueurFroide(h, 0, 0, S * 0.12, 0x8c2230, 0.7);
      /* Deux facettes claires : une pierre sans facette est une tache. */
      h.poly(flat(fuseau(-S * 0.1, -S * 0.06, S * 0.06, S * 0.08, S * 0.05, { seed: 5, taper: 0.6 }))).fill({
        color: eclaircir(0xc0405a, 0.4),
        alpha: 0.7,
      });
    });
  }
  if (couronnee) {
    // l'escarboucle enchâssée dans l'os du front : la couronne
    sous(g, S * 0.18, -S * 0.5, (h) => {
      const serti = blob(0, 0, S * 0.26, S * 0.24, { seed: 11, points: 14, wobble: 0.2 });
      poser(h, k, serti, {
        couleur: LIGHT.rim,
        matiere: 'metal',
        matiereAlpha: 0.24,
        echelle: 0.3,
        speculaire: { x: 0.3, y: 0.26, r: 0.14 },
      });
      lueurFroide(h, 0, 0, S * 0.16, 0x8c2230, 1);
      for (let i = 0; i < 5; i += 1) {
        const a = -2.6 + i * 0.62;
        h.poly(flat(fuseau(Math.cos(a) * S * 0.2, Math.sin(a) * S * 0.18, Math.cos(a) * S * 0.42, Math.sin(a) * S * 0.4, S * 0.09, { seed: i, taper: 0.7 }))).fill({
          color: LIGHT.rim,
          alpha: 0.85,
        });
      }
    });
    // collerette de plis
    for (let i = 0; i < 5; i += 1) {
      const a = -2.2 + i * 0.42;
      poser(g, k, fuseau(-S * 0.4, S * 0.05, -S * 0.4 + Math.cos(a) * S * 0.55, S * 0.05 + Math.sin(a) * S * 0.55, S * 0.16, { seed: i + 7, taper: 0.6 }), {
        couleur: i % 2 ? melanger(ecaille, CUIVRE, 0.35) : assombrir(ecaille, 0.16),
        matiere: 'ecailles',
        matiereAlpha: 0.26,
        echelle: 0.3,
      });
    }
  } else {
    // escarboucle simplement posée sur la tempe, non sertie
    sous(g, S * 0.1, -S * 0.42, (h) => {
      lueurFroide(h, 0, 0, S * 0.14, 0x8c2230, 0.9);
    });
  }
}

function vouivrePieces(k: Kit, couronnee: boolean): PieceDef[] {
  const S = couronnee ? 1.12 : 1;
  const ecaille = couronnee ? melanger(VERT_PROFOND, CUIVRE, 0.32) : melanger(VERT_PROFOND, MOUSSE, 0.28);
  const ventre = melanger(CUIVRE, PIERRE_CLAIRE, 0.35);
  const A = 84 * S;
  const pieces: PieceDef[] = [];

  pieces.push({ nom: 'corps', x: 0, y: -A, ordreMort: 7, dessin: () => {} });

  /*
   * Les ailes, RELEVÉES et sombres — et il y en a deux.
   *
   * L'aile unique était posée au milieu du corps, large de quatre-vingt-seize
   * unités contre quarante pour le plus gros anneau, et peinte d'un mélange de
   * BRUME qui la rendait plus claire que la bête. Résultat vu sur la planche :
   * une cape turquoise avec une tête au bout, et pas un anneau visible. Or ce
   * qui fait la vouivre, c'est le serpent — les anneaux d'abord, les ailes
   * ensuite. On les relève donc derrière la nuque, on les assombrit pour
   * qu'elles reculent, et l'on en met deux comme le rendu de référence : la
   * lointaine plus haute, plus petite et plus sombre.
   */
  pieces.push({
    nom: 'aile_g',
    parent: 'corps',
    x: -2 * S,
    y: -46 * S,
    rot: -0.95,
    lumiere: -1.2,
    ambiance: 1.3,
    ordreMort: 1,
    dessin: (g, kk) => aileVouivre(g, kk, 58 * S, 36 * S, assombrir(ecaille, 0.48), couronnee, -1, 9),
  });

  pieces.push({
    nom: 'aile_d',
    parent: 'corps',
    x: 12 * S,
    y: -32 * S,
    rot: -0.5,
    lumiere: -0.8,
    ordreMort: 2,
    dessin: (g, kk) => aileVouivre(g, kk, 76 * S, 46 * S, assombrir(ecaille, 0.26), couronnee, -1, 3),
  });

  // les anneaux du corps, en S vers l'arrière
  pieces.push({
    nom: 'anneau1',
    parent: 'corps',
    x: -34 * S,
    y: 8 * S,
    rot: 0.16,
    lumiere: -0.2,
    ordreMort: 4,
    dessin: (g, kk) => anneau(g, kk, 54 * S, 34 * S, ecaille, ventre, couronnee, 11),
  });
  pieces.push({
    nom: 'anneau2',
    parent: 'anneau1',
    x: -44 * S,
    y: 8 * S,
    rot: 0.24,
    lumiere: -0.3,
    ordreMort: 3,
    dessin: (g, kk) => anneau(g, kk, 46 * S, 28 * S, assombrir(ecaille, 0.1), ventre, couronnee, 13),
  });
  pieces.push({
    nom: 'anneau3',
    parent: 'anneau2',
    x: -36 * S,
    y: 5 * S,
    rot: 0.28,
    lumiere: -0.4,
    ordreMort: 2,
    dessin: (g, kk) => anneau(g, kk, 38 * S, 22 * S, assombrir(ecaille, 0.2), ventre, couronnee, 17),
  });
  pieces.push({
    nom: 'queue',
    parent: 'anneau3',
    x: -22 * S,
    y: 2 * S,
    rot: 0.3,
    lumiere: -0.4,
    ambiance: 2,
    periode: 4.2,
    ordreMort: 1,
    dessin: (g, kk) => {
      dessinerQueue(g, kk, {
        longueur: 54 * S,
        epaisseur: 14 * S,
        couleur: assombrir(ecaille, 0.26),
        courbe: -0.6,
        matiere: 'ecailles',
        seed: 19,
      });
      sous(g, 52 * S, 8 * S, (h) => {
        for (const dy of [-1, 1]) {
          poser(h, kk, fuseau(0, 0, 16 * S, dy * 12 * S, 8 * S, { seed: dy + 2, taper: 0.7 }), {
            couleur: melanger(ecaille, CUIVRE, 0.4),
            matiere: 'ecailles',
            matiereAlpha: 0.26,
            echelle: 0.3,
          });
        }
      });
    },
  });

  pieces.push({
    nom: 'tronc',
    parent: 'corps',
    x: 0,
    y: 0,
    ordreMort: 8,
    dessin: (g, kk) => {
      anneau(g, kk, 52 * S, 34 * S, ecaille, ventre, couronnee, 23);
      // crête dorsale
      for (let i = 0; i < 6; i += 1) {
        const x = -22 * S + i * 9 * S;
        poser(g, kk, fuseau(x, -16 * S, x - 3 * S, -(26 + i * 1.5) * S, 7 * S, { seed: i + 5, taper: 0.65 }), {
          couleur: i % 2 ? melanger(ecaille, CUIVRE, 0.4) : assombrir(ecaille, 0.14),
          matiere: 'ecailles',
          matiereAlpha: 0.24,
          echelle: 0.28,
        });
      }
      if (couronnee) {
        orfevrerie(g, [pt(-20 * S, -4 * S), pt(0, -10 * S), pt(22 * S, -2 * S)], { epaisseur: 2.2 });
      }
    },
  });

  pieces.push({
    nom: 'cou',
    parent: 'corps',
    x: 30 * S,
    y: -14 * S,
    rot: -0.95,
    lumiere: 0.4,
    ordreMort: 6,
    dessin: (g, kk) => {
      membre(g, kk, pt(0, 0), pt(6 * S, -46 * S), 22 * S, {
        couleur: ecaille,
        matiere: 'ecailles',
        matiereAlpha: 0.28,
        echelle: 0.34,
        taper: 0.34,
        seed: 29,
      });
      for (let i = 0; i < 4; i += 1) {
        const y = -8 * S - i * 10 * S;
        g.moveTo(-9 * S, y);
        g.quadraticCurveTo(0, y + 3 * S, 9 * S, y - 1 * S);
        g.stroke({ color: melanger(ventre, LIGHT.chaude, 0.2), width: 2.4, alpha: 0.4 });
      }
    },
  });

  pieces.push({
    nom: 'tete',
    parent: 'cou',
    x: 6 * S,
    y: -44 * S,
    lumiere: 0.6,
    ordreMort: 10,
    dessin: (g, kk) => teteVouivre(g, kk, 26 * S, couronnee, 31),
  });

  pieces.push({
    nom: 'machoire',
    parent: 'tete',
    x: 8 * S,
    y: 4 * S,
    lumiere: -0.2,
    ordreMort: 10,
    dessin: (g, kk) => {
      const Sc = 26 * S;
      poser(g, kk, lisser(perturber(densifier([pt(-Sc * 0.3, 0), pt(Sc * 0.9, Sc * 0.06), pt(Sc * 0.82, Sc * 0.26), pt(-Sc * 0.28, Sc * 0.24)], Sc * 0.16), Sc * 0.014, 7), 1), {
        couleur: assombrir(ecaille, 0.26),
        matiere: 'ecailles',
        matiereAlpha: 0.26,
        echelle: 0.3,
      });
      for (let i = 0; i < 4; i += 1) {
        g.poly(flat(fuseau(Sc * (0.06 + i * 0.2), Sc * 0.02, Sc * (0.06 + i * 0.2), -Sc * 0.2, Sc * 0.08, { seed: i }))).fill({
          color: melanger(PIERRE_CLAIRE, LIGHT.chaude, 0.3),
          alpha: 0.92,
        });
      }
    },
  });

  pieces.push({
    nom: 'aile_g',
    parent: 'corps',
    x: -4 * S,
    y: -18 * S,
    rot: -0.28,
    lumiere: 0.9,
    ordreMort: 5,
    dessin: (g, kk) => aileVouivre(g, kk, 104 * S, 64 * S, ecaille, couronnee, -1, 5),
  });

  return pieces;
}

/** Anneau du corps de la vouivre : dos écailleux, ventre à plaques claires. */
function anneau(
  g: Graphics,
  k: Kit,
  L: number,
  h: number,
  dos: number,
  ventre: number,
  couronnee: boolean,
  seed: number,
): void {
  const forme = lisser(
    perturber(
      densifier(
        [pt(-L * 0.5, -h * 0.1), pt(-L * 0.2, -h * 0.5), pt(L * 0.24, -h * 0.52), pt(L * 0.5, -h * 0.1), pt(L * 0.44, h * 0.42), pt(0, h * 0.54), pt(-L * 0.44, h * 0.4)],
        h * 0.2,
      ),
      h * 0.02,
      seed,
    ),
    1,
  );
  poser(g, k, forme, { couleur: dos, matiere: 'ecailles', matiereAlpha: 0.3, echelle: 0.34, seed });

  /*
   * La CRÊTE DORSALE, ourlée d'or. C'est ce qui fait la vouivre.
   *
   * Le corps était un ovale lisse portant cinq plaques ventrales : sur la
   * planche de contact, les deux rangs sept de l'Ermitage rendaient deux taches
   * turquoise. Le rendu de référence, lui, est reconnaissable à deux choses
   * avant toute autre — les anneaux d'un serpent, qui étaient déjà là, et la
   * frange d'ailerons qui court sur l'échine, ourlée d'or, la même que celle des
   * ailes. Sans elle, un anneau de vouivre et un anneau de ver de terre se
   * ressemblent.
   */
  const AILERONS = 5;
  for (let i = 0; i < AILERONS; i += 1) {
    const t = i / (AILERONS - 1);
    const x = -L * 0.36 + t * L * 0.72;
    /* Les plus hauts au milieu de l'anneau : une frange, pas une scie. */
    const haut = h * (0.5 + 0.34 * Math.sin(t * Math.PI));
    poser(g, k, fuseau(x, -h * 0.34, x - L * 0.05, -haut, h * 0.17, { seed: seed + i * 5, taper: 0.44 }), {
      couleur: i % 2 ? melanger(dos, LIGHT.rim, 0.22) : assombrir(dos, 0.16),
      matiere: 'ecailles',
      matiereAlpha: 0.22,
      echelle: 0.3,
      modele: 0.85,
      rim: i % 2 === 0,
    });
  }

  /* Rangs d'écailles imbriquées sur le dos : trois arcs suffisent à dire que la
     peau est écaillée, là où la matière seule ne le disait qu'en gros plan. */
  for (let r = 0; r < 3; r += 1) {
    const y = -h * (0.3 - r * 0.14);
    for (let i = 0; i < 4; i += 1) {
      const x = -L * 0.32 + (i + (r % 2) * 0.5) * L * 0.2;
      g.moveTo(x - L * 0.08, y);
      g.quadraticCurveTo(x, y - h * 0.1, x + L * 0.08, y);
      g.stroke({
        color: r % 2 ? eclaircir(dos, 0.26) : ombreBleutee(dos, 0.5),
        width: h * 0.025,
        alpha: 0.4,
        cap: 'round',
      });
    }
  }

  // plaques ventrales
  const n = 5;
  for (let i = 0; i < n; i += 1) {
    const x = -L * 0.34 + (i / (n - 1)) * L * 0.68;
    const pl = lisser(
      perturber(densifier([pt(x - L * 0.07, h * 0.1), pt(x + L * 0.07, h * 0.08), pt(x + L * 0.06, h * 0.46), pt(x - L * 0.06, h * 0.48)], h * 0.16), h * 0.012, seed + i),
      1,
    );
    poser(g, k, pl, {
      couleur: i % 2 ? ventre : eclaircir(ventre, 0.14),
      matiere: 'ecailles',
      matiereAlpha: 0.2,
      echelle: 0.3,
      modele: 0.7,
      rim: false,
    });
  }
  if (couronnee) {
    for (let i = 0; i < 3; i += 1) {
      g.poly(flat(blob(-L * 0.2 + i * L * 0.2, -h * 0.2, h * 0.07, h * 0.07, { seed: i + 9, points: 10, wobble: 0.24 }))).fill({
        color: LIGHT.rim,
        alpha: 0.72,
      });
    }
  }
}

/** Aile membraneuse de vouivre : longs doigts, membrane translucide. */
function aileVouivre(
  g: Graphics,
  k: Kit,
  E: number,
  C: number,
  couleur: number,
  couronnee: boolean,
  sens: 1 | -1,
  seed: number,
): void {
  const doigts = 4;
  const bordAttaque: Poly = [];
  for (let i = 0; i <= 8; i += 1) {
    const t = i / 8;
    bordAttaque.push(pt(sens * E * t, -C * 0.2 * Math.sin(t * Math.PI * 0.85) - C * 0.05));
  }
  const bordFuite: Poly = [];
  for (let i = 8; i >= 0; i -= 1) {
    const t = i / 8;
    const feston = Math.abs(Math.sin(t * Math.PI * doigts)) * C * 0.19;
    bordFuite.push(pt(sens * E * t, C * (0.26 + 0.74 * Math.sin(t * Math.PI * 0.72)) - feston));
  }
  const forme = lisser(perturber([...bordAttaque, ...bordFuite], C * 0.012, seed), 1);
  /* Sans mélange de BRUME : la membrane doit rester plus sombre que l'écaille,
     sans quoi elle prend le devant de la bête et l'on ne voit plus le serpent. */
  poser(g, k, forme, {
    couleur: couleur,
    matiere: 'ecailles',
    matiereAlpha: 0.22,
    echelle: 0.55,
    modele: 0.9,
    seed,
  });
  for (let i = 1; i <= doigts; i += 1) {
    const t = i / (doigts + 0.2);
    const bras = fuseau(
      sens * E * 0.05,
      -C * 0.08,
      sens * E * t,
      C * (0.26 + 0.72 * Math.sin(t * Math.PI * 0.72)),
      C * 0.075,
      { seed: i + seed, taper: 0.7 },
    );
    poser(g, k, bras, {
      couleur: assombrir(couleur, 0.24),
      matiere: 'ecailles',
      matiereAlpha: 0.2,
      echelle: 0.3,
      rim: i > 2,
    });
    if (couronnee) {
      g.poly(flat(blob(sens * E * t, C * (0.26 + 0.72 * Math.sin(t * Math.PI * 0.72)), C * 0.03, C * 0.03, { seed: i + 3, points: 9, wobble: 0.26 }))).fill({
        color: LIGHT.rim,
        alpha: 0.75,
      });
    }
  }
  // membrane éclairée par transparence entre les doigts
  for (let i = 0; i < doigts; i += 1) {
    const t = (i + 0.5) / (doigts + 0.2);
    g.poly(
      flat(
        blob(sens * E * t * 0.72, C * 0.3 * Math.sin(t * Math.PI * 0.8), E * 0.07, C * 0.16, {
          seed: i + 21,
          points: 12,
          wobble: 0.25,
        }),
      ),
    ).fill({ color: melanger(couleur, LIGHT.chaude, 0.35), alpha: 0.14 });
  }
}

const vouivre: Fabrique = (k) =>
  creatureRig(
    { hauteur: 128, empriseSol: 54, respiration: 'tronc', graine: k.seed + 32, teinteMort: CUIVRE },
    vouivrePieces(k, false),
    k,
    (r) => {
      clipsSerpent(r, { allonge: 1.3 });
      clipCapacite(r, 'souffle');
    },
  );

const vouivreCouronnee: Fabrique = (k) =>
  creatureRig(
    { hauteur: 142, empriseSol: 58, respiration: 'tronc', graine: k.seed + 33, teinteMort: LIGHT.rim },
    vouivrePieces(k, true),
    k,
    (r) => {
      clipsSerpent(r, { allonge: 1.45 });
      clipCapacite(r, 'souffle');
      if (r.aJoint('queue')) r.joint('queue').ambiance = 2.4;
    },
  );

/* ───────────────────────────── Table du rang ────────────────────────────── */

export const FABRIQUES_ERMITAGE: Readonly<Record<string, Fabrique>> = {
  ermitage_t1: pelerin,
  ermitage_t1_up: penitentBlanc,
  ermitage_t2: hulotte,
  ermitage_t2_up: chouetteOraculaire,
  ermitage_t3: loup,
  ermitage_t3_up: loupDesBrumes,
  ermitage_t4: veneur,
  ermitage_t4_up: gardeFutaie,
  ermitage_t5: cerf,
  ermitage_t5_up: cerfMiraculeux,
  ermitage_t6: colosse,
  ermitage_t6_up: colossePamole,
  ermitage_t7: vouivre,
  ermitage_t7_up: vouivreCouronnee,
};
