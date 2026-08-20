/**
 * Les quatorze formes de l'Ermitage des Bois Noirs.
 *
 * Palette de faction : vert profond `#1B3A2B`, vert sauge `#7C8F6B`, cuivre
 * patiné `#4E8977`, bleu brume `#9FB4C2`, pierre claire `#CFC6B4`, mousse
 * sombre `#2F3B2E`.
 *
 * Règle de silhouette, à 64 px et en négatif :
 *   Pèlerin        — CHAPEAU à larges bords, cape en loques, coquille au bourdon
 *   Pénitent Blanc — cagoule en pointe à ouverture NOIRE, mantelet bleui, croix
 *   Hulotte        — disque facial rond, ailes courtes et larges
 *   Oraculaire     — aigrettes dressées, nimbe de brume
 *   Loup           — museau long tenu BAS, oreilles dressées, queue en fouet
 *   Loup des Brumes— même ligne, arrière-train qui se défait en brume
 *   Veneur         — arc BANDÉ : un D profond, corde en V tirée à la joue
 *   Garde-Futaie   — même geste, arc plus lourd, manteau de feuilles galonné
 *   Cerf           — ramure haute et ouverte SUR une poitrine profonde
 *   Cerf Miraculeux— ramure double portant la lampe froide
 *   Colosse        — carrure de dalles, tête enfoncée, bras aux genoux
 *   Colosse Pamole — même masse, faille lumineuse et bloc levé
 *   Vouivre        — col en S dressé, GRANDE aile déployée, gueule ouverte
 *   Vouivre Cour.  — même S, couronne enchâssée et collerette
 */
import type { Graphics } from 'pixi.js';
import { LIGHT, assombrir, eclaircir, melanger, ombreBleutee } from '../palette.js';
import type { Poly, Pt } from '../shading.js';
import {
  arcBande,
  blob,
  densifier,
  flat,
  fuseau,
  lisser,
  perturber,
  pt,
  ruban,
} from '../shading.js';
import { hash2 } from '../noise.js';
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
  pointeLance,
  poser,
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
  /*
   * La coquille pend au POMMEAU, et elle est deux fois plus grande.
   *
   * Elle était accrochée à mi-hampe, avec un rayon de 0,03 H — trois pixels sur
   * un pèlerin de quatre-vingt-quatorze, posés au milieu d'un bâton brun de la
   * même valeur qu'elle. Invisible, donc : sur la planche de contact le pèlerin
   * n'avait pas de coquille, il avait un bâton. Le rendu de référence la met au
   * SOMMET du bourdon, pendue à sa lanière, là où elle se détache sur le ciel —
   * c'est le seul endroit d'une silhouette d'homme où un objet de dix pixels a
   * du fond libre autour de lui. Le signe des chemins doit se voir de loin ;
   * c'est même toute sa raison d'être.
   */
  sous(g, -H * 0.048, -H * 0.735, (h) => {
    h.moveTo(0, 0);
    h.lineTo(-H * 0.014, H * 0.038);
    h.stroke({ color: assombrir(BOIS, 0.3), width: H * 0.009, alpha: 0.85 });
    sous(h, -H * 0.018, H * 0.052, (c) => coquille(c, k, H * 0.055, seed + 7));
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
      /*
       * Capuche PUIS chapeau : le rendu de référence montre les deux, et c'est
       * le chapeau qui fait le pèlerin.
       *
       * Il n'y avait que la capuche, et l'Ermitage comptait alors trois
       * silhouettes encapuchonnées sur ses quatorze — pèlerin, pénitent,
       * veneur — que la vignette ne séparait pas. Le bord large est la coiffe la
       * plus reconnaissable qui existe à soixante-quatre pixels : une barre
       * horizontale au-dessus des épaules, que rien d'autre dans le jeu ne
       * porte. Il oppose aussi le rang un de base à son amélioration — bord plat
       * contre cagoule en pointe —, ce qui était précisément ce qui manquait à
       * la paire.
       */
      coiffe: (g, kk) => {
        const r = rayonTete(H);
        capuche(g, kk, { r, couleur: assombrir(bure, 0.18), pointe: 0.25, ouverture: 0.6, seed: 3 });
        const feutre = melanger(BOIS, MOUSSE, 0.52);
        // le bord : une ellipse aplatie, relevée devant, tombante derrière
        poser(
          g,
          kk,
          lisser(
            perturber(
              densifier(
                [
                  pt(-r * 2.0, -r * 0.5),
                  pt(-r * 0.6, -r * 0.86),
                  pt(r * 1.0, -r * 0.78),
                  pt(r * 2.05, -r * 0.34),
                  pt(r * 1.5, -r * 0.06),
                  pt(-r * 0.2, r * 0.06),
                  pt(-r * 1.6, -r * 0.16),
                ],
                r * 0.4,
              ),
              r * 0.05,
              21,
            ),
            1,
          ),
          { couleur: feutre, matiere: 'tissu', matiereAlpha: 0.24, echelle: 0.5, modele: 1, seed: 21 },
        );
        // la calotte, posée dessus : sans elle le bord flotte comme un plateau
        poser(
          g,
          kk,
          lisser(perturber(densifier([pt(-r * 0.96, -r * 0.6), pt(-r * 0.6, -r * 1.5), pt(r * 0.3, -r * 1.66), pt(r * 1.06, -r * 1.2), pt(r * 1.1, -r * 0.5)], r * 0.38), r * 0.04, 23), 1),
          { couleur: eclaircir(feutre, 0.12), matiere: 'tissu', matiereAlpha: 0.24, echelle: 0.5, modele: 1, seed: 23 },
        );
        // le cordon du chapeau, et l'ombre que le bord jette sur le visage
        g.moveTo(-r * 0.9, -r * 0.7);
        g.quadraticCurveTo(r * 0.2, -r * 0.5, r * 1.02, -r * 0.66);
        g.stroke({ color: assombrir(feutre, 0.42), width: r * 0.14, alpha: 0.7, cap: 'round' });
      },
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
 *
 * ─── Ce qu'il restait, et c'était le pire : IL N'AVAIT QU'UNE VALEUR ───
 *
 * Sur la planche, le Pénitent est une forme blanche sans détail, et il est plus
 * pauvre que le Pèlerin dont il est censé être l'amélioration : le Pèlerin a une
 * cape, un ballot au dos, une besace, un visage ; le Pénitent n'a rien de tout
 * cela. Le diagnostic complet tient en trois lignes, et aucune n'est une
 * question d'ornement.
 *
 *  1. **Un blanc pur sur un fond clair ne se lit pas.** Toutes ses pièces — la
 *     robe, la basque, l'épaulement, la manche, la cagoule — étaient tirées du
 *     MÊME lin à moins de dix pour cent d'écart. Une silhouette qui ne porte
 *     qu'une valeur n'a pas de volume : c'est une découpe de papier, et la loi
 *     n°1 l'interdit à l'échelle d'une surface autant qu'à celle d'une figure.
 *  2. **Il avait perdu sa cape et son dos**, les deux masses qui donnent au
 *     Pèlerin sa carrure et sa profondeur. Le rendu de référence les lui donne
 *     toutes les deux : un mantelet aux épaules, et le rouleau de couverture
 *     sanglé au ballot.
 *  3. **Ses attributs étaient à l'échelle du détail, pas de la vignette** : la
 *     croix rouge faisait 0,064 H de large, le cordage 0,018 H d'épaisseur, les
 *     deux fentes d'yeux 0,024 H — soit deux pixels chacune.
 *
 * On lui donne donc trois valeurs franches — le lin clair du corps, le mantelet
 * bleuté des épaules, et le NOIR de l'ouverture de cagoule —, la cape et le dos
 * qui lui manquaient, et des attributs de la taille de ce qu'ils doivent dire.
 */
/**
 * LES TROIS VALEURS DU PÉNITENT BLANC.
 *
 * Elles sont hissées ici, et exportées, parce qu'elles sont le correctif
 * lui-même : la figure n'en portait qu'une, et une figure d'une seule valeur
 * n'a pas de volume. Une garde d'`ermitage.test.ts` mesure leur écartement, et
 * c'est la seule façon d'éprouver du CONTRASTE sans rendre de pixels.
 *
 *  `lin`   — le corps de la robe et la cagoule : le lin sali par la route. Il
 *            valait 0,55 de blanc pur, soit un drap sortant de l'armoire.
 *  `bure`  — le mantelet, les manches, l'épaulement et le ballot : le même lin
 *            poussé vers le bleu de brume et rabattu d'un cran. Mesuré, le lin
 *            est à 0,82 de luminance et le parchemin de la case à 0,86 ; un
 *            mantelet à 0,75 ne se voyait pas, à 0,59 il coupe la figure en deux.
 *  `creux` — l'intérieur de la cagoule, seule valeur franchement sombre de la
 *            figure : c'est le point où le regard se pose, et c'est ce qui rend
 *            l'absence de visage LISIBLE au lieu de la rendre invisible.
 */
export const VALEURS_PENITENT = (() => {
  const lin = melanger(PIERRE_CLAIRE, 0xe6dcc2, 0.42);
  return {
    lin,
    bure: assombrir(melanger(lin, BRUME, 0.55), 0.3),
    creux: assombrir(melanger(BRUME, MOUSSE, 0.4), 0.66),
  } as const;
})();

const penitentBlanc: Fabrique = (k) => {
  const H = 102;
  const { lin, bure, creux } = VALEURS_PENITENT;
  /* Le cordage cesse d'être du lin : à 0,5 de pierre claire il valait la robe à
     six pour cent près, et un cordage qui ne tranche pas sur ce qu'il ceint
     n'est pas un cordage. On le ramène au chanvre. */
  const cordage = melanger(BOIS, PIERRE_CLAIRE, 0.22);
  return creatureRig(
    { hauteur: H, empriseSol: H * 0.22, respiration: 'buste', graine: k.seed + 21, teinteMort: PIERRE_CLAIRE },
    squeletteBipede({
      H,
      seed: k.seed + 210,
      teint: TEINTS[1],
      tunique: lin,
      /* La jambe passe au lin bleui : elle n'apparaît que par les DÉCHIRURES de
         l'ourlet, et une jambe de la couleur exacte de la robe rendait ces
         déchirures invisibles — l'ourlet en langues, qui est le premier
         correctif du pénitent, ne se voyait donc pas. */
      jambeCouleur: bure,
      chausse: null,
      ceinture: null,
      posture: 0.7,
      largeur: 0.92,
      epaules: 0.88,
      ecart: 1.4,
      coude: 0.58,
      brasDRot: -0.56,
      brasGRot: 0.24,
      manche: bure,
      epaulement: { couleur: bure, largeur: H * 0.2 },
      /*
       * LE MANTELET, qui lui manquait. Il fait la carrure, il pose une deuxième
       * valeur en travers de la poitrine, et il déchire son ourlet comme tout ce
       * que porte cet homme. Le Pèlerin a le sien en vert de faction ; celui-ci
       * l'a en lin bleui, ce qui les oppose sans les séparer.
       */
      cape: { couleur: bure, w: H * 0.4, h: H * 0.44, dents: 1 },
      /* L'ourlet mangé : `dents: 1` déchire la basque à fond, et c'est le seul
         détail du pénitent qui doit se voir avant la cagoule. */
      basque: { couleur: assombrir(lin, 0.2), dents: 1, hauteur: H * 0.17, largeur: H * 0.3 },
      visage: null,
      cheveux: null,
      /* L'ourlet de la robe part en langues jusqu'au mollet : le rendu de
         référence n'a pas dix centimètres d'étoffe intacte, et l'ourlet net
         était ce qui restait de plus faux sur le pénitent. */
      /* La robe RACCOURCIT de six centièmes de H : son ourlet tombait à deux
         pixels du sol et couvrait les pieds nus, qui sont pourtant l'attribut
         que le vœu impose. Un pénitent déchaussé dont on ne voit pas les pieds
         est un pénitent chaussé. */
      robe: { couleur: lin, haut: H * 0.21, bas: H * 0.37, hauteur: H * 0.4, dents: 0.85 },
      /* Le DOS : le rouleau de couverture sanglé, celui du Pèlerin en plus
         maigre. C'est la masse qui manquait derrière l'épaule et qui empêche la
         silhouette d'être un triangle plein. */
      dos: (g, kk) =>
        sous(g, H * 0.055, H * 0.03, (h) => {
          poser(h, kk, blob(0, 0, H * 0.062, H * 0.075, { seed: 9, points: 15, wobble: 0.22 }), {
            couleur: assombrir(bure, 0.12),
            matiere: 'tissu',
            matiereAlpha: 0.28,
            echelle: 0.5,
          });
          poser(h, kk, blob(H * 0.004, -H * 0.068, H * 0.055, H * 0.027, { seed: 15, points: 14, wobble: 0.22 }), {
            couleur: bure,
            matiere: 'tissu',
            matiereAlpha: 0.3,
            echelle: 0.4,
          });
          h.moveTo(-H * 0.05, -H * 0.045);
          h.quadraticCurveTo(0, -H * 0.1, H * 0.05, -H * 0.035);
          h.stroke({ color: assombrir(cordage, 0.2), width: H * 0.013, alpha: 0.85 });
        }),
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
        /*
         * L'OUVERTURE, et c'est la pièce qui manquait le plus.
         *
         * Le visage est volontairement absent — les confréries ferment leur
         * cagoule — mais un visage absent doit se VOIR absent : il faut un trou
         * noir à la place, pas rien. Le pénitent n'avait que deux fentes de
         * 0,024 H, soit deux pixels et demi sur une figure de cent deux, si bien
         * que sa tête était un cône de lin uni et qu'on ne savait même pas de
         * quel côté il regardait. L'ouverture est ici une amande sombre de la
         * moitié du rayon de tête : elle donne à la figure son unique note
         * franche, elle dit l'orientation, et elle fait du capuchon un capuchon
         * plutôt qu'un chapeau de sorcier.
         */
        poser(
          g,
          kk,
          lisser(perturber(densifier([pt(-r * 0.5, -r * 0.5), pt(r * 0.42, -r * 0.42), pt(r * 0.58, r * 0.16), pt(-r * 0.06, r * 0.4), pt(-r * 0.6, r * 0.1)], r * 0.3), r * 0.035, 29), 1),
          { couleur: creux, matiere: 'tissu', matiereAlpha: 0.2, echelle: 0.4, modele: 0.5, rim: false },
        );
        /* Deux points de lumière au fond de l'ouverture : un trou noir est un
           trou, deux étincelles en font un regard qu'on ne voit pas. */
        for (const dx of [-0.24, 0.24]) {
          g.poly(flat(blob(dx * r, -r * 0.1, r * 0.1, r * 0.062, { seed: dx * 10 + 3, points: 9, wobble: 0.24 }))).fill({
            color: melanger(BRUME, LIGHT.chaude, 0.4),
            alpha: 0.5,
          });
        }
        // bourrelet roulé du bord inférieur : le lin est ourlé, pas coupé net
        g.moveTo(-r * 1.06, r * 0.78);
        g.quadraticCurveTo(0, r * 1.06, r * 1.12, r * 0.84);
        g.stroke({ color: ombreBleutee(lin, 0.9), width: r * 0.2, alpha: 0.62, cap: 'round' });
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
        /* Elle est passée de 0,064 H de large à 0,105, et de l'épaule au
           MILIEU de la poitrine : sur l'épaule, à moitié cachée par le bras et
           par le mantelet neuf, il n'en restait rien. */
        sous(g, -H * 0.012, -H * 0.2, (h) => {
          const br = H * 0.018;
          const croix: Poly = [
            pt(-br, -H * 0.055), pt(br, -H * 0.055), pt(br, -br), pt(H * 0.052, -br),
            pt(H * 0.052, br), pt(br, br), pt(br, H * 0.055), pt(-br, H * 0.055),
            pt(-br, br), pt(-H * 0.052, br), pt(-H * 0.052, -br), pt(-br, -br),
          ];
          poser(h, kk, perturber(croix, H * 0.003, 23), {
            couleur: melanger(0x8c2030, 0x6e1f2a, 0.4),
            matiere: 'tissu',
            matiereAlpha: 0.24,
            echelle: 0.3,
            modele: 0.8,
          });
        });
        // le cordage tressé, trois nœuds, et deux brins qui pendent au genou
        g.moveTo(-H * 0.105, -H * 0.062);
        g.quadraticCurveTo(0, -H * 0.012, H * 0.105, -H * 0.072);
        g.stroke({ color: cordage, width: H * 0.032, alpha: 0.95, cap: 'round' });
        g.moveTo(-H * 0.1, -H * 0.05);
        g.quadraticCurveTo(0, -H * 0.002, H * 0.1, -H * 0.06);
        g.stroke({ color: assombrir(cordage, 0.28), width: H * 0.016, alpha: 0.7, cap: 'round' });
        for (let i = 0; i < 3; i += 1) {
          g.poly(flat(blob(-H * 0.045 + i * H * 0.045, -H * 0.033 + i * H * 0.006, H * 0.019, H * 0.018, { seed: i + 2, points: 9, wobble: 0.26 }))).fill({
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
          g.stroke({ color: cordage, width: H * 0.018, alpha: 0.9, cap: 'round' });
          g.poly(flat(blob(dx + H * 0.008, -H * 0.028 + len, H * 0.017, H * 0.021, { seed: dx * 100 + 5, points: 10, wobble: 0.26 }))).fill({
            color: assombrir(cordage, 0.12),
            alpha: 0.9,
          });
        }
        /*
         * LES PLIS DE LA ROBE, peints depuis le torse.
         *
         * `robe()` en trace bien quatre, mais à `max(0,9 ; largeurHaut × 0,028)`
         * de large : sur ce pénitent cela fait 0,9 pixel à 42 % d'opacité, donc
         * rien. La grande masse basse de la figure — plus de la moitié de sa
         * surface — restait un aplat, ce que la loi n°1 interdit et ce que la
         * planche montrait. On repeint donc les plis à l'échelle de la vignette,
         * depuis le torse qui est dessiné APRÈS la robe : trois creux bleutés du
         * côté de l'ombre, une arête chaude du côté du soleil, et l'ombre de
         * l'ourlet au bas. Le soleil étant au nord-ouest, les creux sont à
         * droite de l'axe et l'arête à gauche.
         */
        for (const [x0, y0, x1, y1, w, sombre] of [
          [-H * 0.05, -H * 0.05, -H * 0.1, H * 0.34, H * 0.05, false],
          [H * 0.015, -H * 0.06, H * 0.035, H * 0.36, H * 0.055, true],
          [H * 0.075, -H * 0.04, H * 0.125, H * 0.3, H * 0.045, true],
        ] as const) {
          g.poly(flat(fuseau(x0, y0, x1, y1, w, { seed: x0 * 100 + 3, taper: 0.5 }))).fill({
            color: sombre ? ombreBleutee(lin, 0.72) : eclaircir(lin, 0.5),
            alpha: sombre ? 0.34 : 0.3,
          });
        }
        /* L'ombre de l'ourlet : la robe se creuse au sol, et c'est ce que le
           pénitent n'avait pas — le bas de sa silhouette flottait. */
        g.poly(
          flat(
            lisser(
              perturber(
                [pt(-H * 0.15, H * 0.3), pt(H * 0.15, H * 0.29), pt(H * 0.16, H * 0.42), pt(-H * 0.16, H * 0.43)],
                H * 0.006,
                31,
              ),
              1,
            ),
          ),
        ).fill({ color: ombreBleutee(lin, 0.85), alpha: 0.26 });
        // traces de route sur la bure : le vœu dure depuis longtemps
        for (let i = 0; i < 4; i += 1) {
          g.moveTo(-H * 0.08 + i * H * 0.05, -H * 0.24);
          g.quadraticCurveTo(-H * 0.07 + i * H * 0.05, -H * 0.16, -H * 0.09 + i * H * 0.05, -H * 0.08);
          g.stroke({ color: ombreBleutee(lin, 0.72), width: H * 0.011, alpha: 0.42 });
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

/**
 * La tête du loup : **un MUSEAU, deux OREILLES, et rien d'autre à retenir**.
 *
 * ─── Ce que l'ancienne coûtait, vu sur la planche de contact ───
 *
 * Les deux loups y lisaient comme des chiens verts, et le propriétaire l'a dit
 * en ces termes. La faute était entière dans la tête, et elle tenait en deux
 * mesures.
 *
 *  1. **Il n'y avait pas de museau.** Le crâne allait de −0,58 S à +1,00 S,
 *     donc 1,58 S de long pour 0,98 S de haut : un rapport de 1,6, celui d'un
 *     ourson. La zone dite « museau plus clair » couvrait de 0,30 à 0,98 S,
 *     soit 0,68 de long pour 0,44 de haut — un rapport de 1,5, c'est-à-dire un
 *     GROIN, pas un chanfrein. Un loup a le museau long, droit, sec, nettement
 *     plus étroit que le crâne : c'est la seule chose qui le distingue d'un
 *     chien de ferme à trente pixels, et elle manquait.
 *  2. **Les oreilles étaient deux moignons couchés en arrière.** Base à
 *     −0,42 S, pointe à −0,76 S : 0,34 S de haut, et la pointe reculait de
 *     0,10 S derrière sa base. À l'écran, deux bosses sombres sur le sommet du
 *     crâne, indiscernables du poil. Le commentaire qui les défendait disait
 *     « à peine plus hautes que le crâne » — c'est faux d'un canidé sauvage :
 *     l'oreille d'un loup fait les deux tiers de la hauteur de sa tête, elle est
 *     DRESSÉE et elle porte en avant. C'est la découpe la plus reconnaissable
 *     de la bête sur le ciel.
 *
 * On tient donc, et dans cet ordre de lecture : le chanfrein long et bas, la
 * truffe noire au bout, les deux oreilles dressées, l'œil bridé sous son
 * masque, et la collerette de joue. Le reste est du poil.
 */
function teteLoup(g: Graphics, k: Kit, S: number, brumes: boolean, seed: number): void {
  const poil = brumes ? melanger(BRUME, MOUSSE, 0.45) : melanger(MOUSSE, 0x4b4f42, 0.5);
  /*
   * LES OREILLES D'ABORD : elles sont derrière le crâne, et c'est ce
   * recouvrement qui les fait tenir sur la tête au lieu d'y être plantées.
   * Deux tiers de la hauteur du crâne, dressées, la proche portant en avant.
   */
  for (const [bx, by, tx, ty, s] of [
    [-0.34, -0.44, -0.46, -1.1, -1],
    [-0.04, -0.54, 0.08, -1.24, 1],
  ] as const) {
    oreilleAnimale(g, k, {
      base: pt(S * bx, S * by),
      pointe: pt(S * tx, S * ty),
      largeur: S * 0.36,
      couleur: s > 0 ? assombrir(poil, 0.12) : assombrir(poil, 0.3),
      conque: melanger(ombreBleutee(poil, 0.8), brumes ? BRUME : BOIS, 0.28),
      seed: seed + (s > 0 ? 30 : 60),
    });
  }
  /* Le CRÂNE : boîte courte et large, qui s'arrête net à l'arcade. */
  const crane = lisser(
    perturber(
      densifier(
        [pt(-S * 0.62, -S * 0.12), pt(-S * 0.5, -S * 0.5), pt(-S * 0.08, -S * 0.62), pt(S * 0.34, -S * 0.5), pt(S * 0.44, -S * 0.14), pt(S * 0.36, S * 0.26), pt(-S * 0.08, S * 0.44), pt(-S * 0.56, S * 0.3)],
        S * 0.2,
      ),
      S * 0.018,
      seed,
    ),
    1,
  );
  poser(g, k, crane, { couleur: poil, matiere: 'fourrure', matiereAlpha: 0.28, echelle: 0.38, seed });
  /*
   * LE CHANFREIN : 1,26 S de long pour 0,40 S de haut à la base et 0,20 au
   * bout — un rapport de trois, contre un et demi pour l'ancien groin. Il part
   * du milieu du crâne et il descend légèrement : un loup en chasse porte le
   * nez plus bas que l'œil.
   */
  poser(
    g,
    k,
    lisser(
      perturber(
        densifier(
          [pt(S * 0.2, -S * 0.36), pt(S * 0.84, -S * 0.32), pt(S * 1.3, -S * 0.16), pt(S * 1.32, S * 0.08), pt(S * 0.9, S * 0.18), pt(S * 0.22, S * 0.26)],
          S * 0.16,
        ),
        S * 0.012,
        seed + 3,
      ),
      1,
    ),
    {
      couleur: brumes ? eclaircir(poil, 0.3) : eclaircir(poil, 0.14),
      matiere: 'fourrure',
      matiereAlpha: 0.26,
      echelle: 0.32,
      modele: 0.9,
      seed: seed + 3,
    },
  );
  /* L'arête du chanfrein, en pleine lumière : deux valeurs sur le même os, et
     le museau cesse d'être un tube. */
  g.moveTo(S * 0.26, -S * 0.3);
  g.quadraticCurveTo(S * 0.8, -S * 0.36, S * 1.24, -S * 0.14);
  g.stroke({ color: eclaircir(poil, 0.42), width: S * 0.09, alpha: 0.5, cap: 'round' });
  /* La ligne des BABINES, du coin de la gueule à la truffe : c'est elle qui
     ferme le museau par le bas et qui dit où mord la bête. */
  g.moveTo(S * 0.3, S * 0.2);
  g.quadraticCurveTo(S * 0.82, S * 0.18, S * 1.26, 0);
  g.stroke({ color: assombrir(poil, 0.55), width: S * 0.075, alpha: 0.68, cap: 'round' });
  /* La TRUFFE : la seule vraie valeur sombre de la bête, et le point qui
     termine la silhouette. Elle déborde le bout du chanfrein. */
  g.poly(flat(blob(S * 1.3, -S * 0.14, S * 0.145, S * 0.115, { seed: seed + 5, points: 11, wobble: 0.2 }))).fill({
    color: assombrir(poil, 0.78),
    alpha: 0.92,
  });
  g.poly(flat(blob(S * 1.27, -S * 0.18, S * 0.05, S * 0.04, { seed: seed + 6, points: 7, wobble: 0.3 }))).fill({
    color: LIGHT.chaude,
    alpha: 0.42,
  });
  /* Les deux CANINES, pendues à la lèvre supérieure : le loup gronde. Deux
     suffisent — à trente pixels, une denture entière n'est qu'une tache. */
  for (const [cx, cl] of [
    [0.58, 0.15],
    [0.94, 0.11],
  ] as const) {
    g.poly(flat(fuseau(S * cx, S * 0.12, S * (cx - 0.02), S * (0.12 + cl), S * 0.08, { seed: cx * 20 }))).fill({
      color: melanger(PIERRE_CLAIRE, LIGHT.chaude, 0.32),
      alpha: 0.92,
    });
  }
  /* Le MASQUE : la bande sombre qui descend de l'œil au coin de la gueule.
     C'est ce qui, chez tous les canidés, sépare le crâne du chanfrein. */
  poser(g, k, fuseau(S * 0.2, -S * 0.34, S * 0.38, S * 0.2, S * 0.24, { seed: seed + 11, taper: 0.6 }), {
    couleur: assombrir(poil, 0.34),
    matiere: 'fourrure',
    matiereAlpha: 0.24,
    echelle: 0.28,
    modele: 0.7,
    rim: false,
    contour: false,
  });
  // œil oblique, bridé sous une arcade sombre
  g.poly(flat(blob(S * 0.14, -S * 0.36, S * 0.115, S * 0.06, { seed: seed + 7, points: 10, wobble: 0.2 }))).fill({
    color: brumes ? melanger(BRUME, 0xe8dcc0, 0.5) : 0xc09a3c,
    alpha: 0.95,
  });
  g.poly(flat(blob(S * 0.17, -S * 0.36, S * 0.045, S * 0.042, { seed: seed + 9, points: 8, wobble: 0.24 }))).fill({
    color: 0x241c14,
    alpha: 0.95,
  });
  g.moveTo(-S * 0.02, -S * 0.48);
  g.quadraticCurveTo(S * 0.16, -S * 0.5, S * 0.3, -S * 0.4);
  g.stroke({ color: assombrir(poil, 0.5), width: S * 0.08, alpha: 0.6, cap: 'round' });
  /* La COLLERETTE DE JOUE : quatre mèches qui partent sous l'oreille et
     retombent derrière la mâchoire. Sans elles la tête se rabouterait net sur
     l'encolure, et c'est le raccord qui trahit un assemblage. */
  for (let i = 0; i < 4; i += 1) {
    const t = i / 3;
    const bx = -S * (0.1 + t * 0.34);
    const by = -S * (0.16 - t * 0.3);
    poser(g, k, fuseau(bx, by, bx - S * (0.3 + t * 0.16), by + S * (0.44 + t * 0.1), S * 0.24, { seed: seed + 41 + i * 3, taper: 0.7 }), {
      couleur: i % 2 ? eclaircir(poil, 0.16) : assombrir(poil, 0.2),
      matiere: 'fourrure',
      matiereAlpha: 0.3,
      echelle: 0.28,
      modele: 0.9,
      rim: i % 2 === 0,
      contour: false,
    });
  }
  if (brumes) {
    // givre au museau
    for (let i = 0; i < 5; i += 1) {
      g.poly(flat(blob(S * (0.7 + i * 0.11), S * (0.02 + (i % 2) * 0.08), S * 0.035, S * 0.03, { seed: i + 21, points: 7, wobble: 0.32 }))).fill({
        color: melanger(BRUME, LIGHT.chaude, 0.35),
        alpha: 0.5,
      });
    }
    brumeAccrochee(g, { x: -S * 0.2, y: 0, w: S * 2.6, h: S * 1.6, couleur: BRUME, seed: seed + 31, densite: 6 });
  }
}

/**
 * Le FOUET du loup : une queue de POIL, basse et fournie.
 *
 * La queue partagée du squelette est un fuseau lissé d'un seul ton qui s'affine
 * régulièrement de la base à la pointe. C'est juste pour un cerf, dont la queue
 * est un moignon, et pour un sanglier, dont elle est une cordelette ; c'est faux
 * pour un canidé, chez qui la queue est le troisième volume de la bête après le
 * tronc et la tête. Sur la planche de contact elle rendait un cône lisse — le
 * mot qui vient est « corne » — accroché à la croupe.
 *
 * Deux choses la font. D'abord un PROFIL EN BROSSE : l'épaisseur suit une
 * cloche, mince à l'attache, maximale au tiers, effilée au bout ; c'est ce
 * renflement qui dit le poil, un fuseau qui s'amincit régulièrement dit l'os.
 * Ensuite les MÈCHES, sept fuseaux posés en travers, alternés de valeur, sans
 * contour — le même moyen qu'à l'échine, pour la même raison : un bord tracé
 * ferait une écaille.
 *
 * NOTE : `queue()` d'`archetypes.ts` gagnerait à recevoir cette option ; elle
 * reste ici tant que le fichier partagé est tenu par un autre chantier.
 */
function queueLoup(L: number, Hs: number, poil: number, brumes: boolean, seed: number): PieceDef {
  const Lq = L * 0.52;
  return {
    nom: 'queue',
    parent: 'corps',
    x: -L * 0.46,
    y: -Hs * 0.14,
    /* Basse : trente degrés sous l'horizontale. Un loup en chasse ne porte pas
       sa queue en trompette — c'est le port du chien, et c'était le nôtre. */
    rot: 2.62,
    lumiere: -0.3,
    ambiance: 1.6,
    periode: 3.8,
    ordreMort: 2,
    dessin: (g, kk) => {
      const chemin: Poly = [
        pt(0, 0),
        pt(Lq * 0.3, -Lq * 0.04),
        pt(Lq * 0.6, Lq * 0.03),
        pt(Lq * 0.86, Lq * 0.14),
        pt(Lq, Lq * 0.26),
      ];
      poser(
        g,
        kk,
        ruban(chemin, (t) => Hs * (0.1 + 0.5 * Math.sin(Math.PI * Math.pow(t, 0.62))), {
          seed: seed + 3,
          pas: 5,
          lissage: 2,
        }),
        {
          couleur: poil,
          matiere: 'fourrure',
          matiereAlpha: 0.3,
          echelle: 0.34,
          seed,
        },
      );
      /*
       * Les mèches débordent l'axe des DEUX CÔTÉS, et de peu.
       *
       * Posées toutes du même côté et longues d'une fois l'épaisseur, elles
       * faisaient sept dents de peigne dressées sur le dos de la queue — un
       * râteau, mesuré à l'export et confirmé à l'œil. Une queue de loup n'a pas
       * de dents : elle a un bord flou, et un bord flou se peint avec des mèches
       * COURTES qui dépassent d'un quart, alternées de part et d'autre.
       */
      for (let i = 0; i < 9; i += 1) {
        const t = 0.06 + i * 0.108;
        const j = Math.min(chemin.length - 2, Math.floor(t * (chemin.length - 1)));
        const u = t * (chemin.length - 1) - j;
        const bx = chemin[j].x + (chemin[j + 1].x - chemin[j].x) * u;
        const by = chemin[j].y + (chemin[j + 1].y - chemin[j].y) * u;
        const demi = Hs * (0.05 + 0.25 * Math.sin(Math.PI * Math.pow(t, 0.62)));
        const cote = i % 2 ? 1 : -1;
        poser(
          g,
          kk,
          fuseau(bx - demi * 0.25, by - cote * demi * 0.35, bx + demi * 0.5, by + cote * demi * 1.1, Hs * 0.18, {
            seed: seed + i * 5,
            taper: 0.7,
          }),
          {
            couleur: i % 2 ? eclaircir(poil, 0.12) : assombrir(poil, 0.14),
            matiere: 'fourrure',
            matiereAlpha: 0.3,
            echelle: 0.28,
            modele: 0.9,
            rim: i % 3 === 0,
            contour: false,
          },
        );
      }
      /* Le bout NOIR : tous les loups d'Europe le portent, et c'est le point
         qui ferme la silhouette du côté de la croupe. */
      poser(g, kk, fuseau(Lq * 0.82, Lq * 0.1, Lq * 1.04, Lq * 0.3, Hs * 0.3, { seed: seed + 61, taper: 0.8 }), {
        couleur: assombrir(poil, brumes ? 0.4 : 0.58),
        matiere: 'fourrure',
        matiereAlpha: 0.28,
        echelle: 0.28,
        modele: 0.9,
        contour: false,
      });
    },
  };
}

function loupPieces(k: Kit, brumes: boolean): PieceDef[] {
  const poil = brumes ? melanger(BRUME, MOUSSE, 0.42) : melanger(MOUSSE, 0x4b4f42, 0.5);
  const Hs = brumes ? 54 : 50;
  const L = brumes ? 100 : 94;
  const pieces = squeletteQuadrupede({
    Hs,
    L,
    robe: poil,
    ventre: eclaircir(poil, 0.28),
    matiere: 'fourrure',
    patteCouleur: assombrir(poil, 0.24),
    seed: k.seed + (brumes ? 250 : 240),
    /*
     * LA LIGNE DU LOUP : garrot haut, tête basse et poussée en avant.
     *
     * L'encolure était tournée de −0,55 sans `avance`, ce qui posait le crâne
     * en x = +26 pour un poitrail à +47 — au-dessus des omoplates, nez au ciel.
     * D'où la dalle grise à tête que montrait la planche. Un loup qui chasse
     * porte la tête DEVANT et EN DESSOUS de son garrot, au bout d'une encolure
     * courte et épaisse : c'est la seule ligne qui le distingue d'un chien, et
     * elle se lit à trente pixels.
     */
    /*
     * La tête descend encore, et le museau se remet à l'horizontale.
     *
     * L'angle valait 0,55 : mesuré, l'ancre de tête tombait alors à 5,8 unités
     * SOUS l'attache d'encolure pour un garrot qui est 22 plus haut — la tête
     * était donc portée à mi-hauteur du garrot, ce qui est un port de chien
     * attentif, pas de loup en chasse. À 0,88 elle vient à l'aplomb de
     * l'attache, soit une dizaine d'unités sous la ligne du dos, et le museau
     * pointe vers le sol devant elle.
     *
     * L'encolure passe de 0,32 à 0,38 Hs en même temps, et ce n'est pas un
     * réglage d'esthétique : coucher l'encolure raccourcit sa portée en x, et le
     * test d'anatomie de `art.test.ts` exige que l'ancre de tête dépasse le
     * poitrail. Sans l'allonge, la correction du port de tête ferait rougir la
     * garde qui l'a rendue nécessaire.
     *
     * `teteRot` compense la nouvelle inclinaison : 0,88 − 0,58 = 0,30 radian,
     * soit dix-sept degrés de piqué. Un chanfrein plus incliné donne un chien
     * qui flaire, moins un chien qui écoute.
     */
    cou: { longueur: Hs * 0.38, largeur: Hs * 0.52, angle: 0.88, avance: 0.9 },
    teteRot: -0.58,
    /* Garrot plus haut que la croupe, poitrail profond, flanc creusé : le
       canidé est un coureur, pas un tonneau. La pente passe de 0,05 à 0,10 :
       le rendu de référence montre une avant-main nettement plus haute que la
       croupe, et c'est cette ligne de dos qui, avec la tête basse, fait la
       posture de chasse. */
    pente: 0.1,
    poitrail: 0.24,
    flanc: 0.18,
    /* Canon épais et patte large : un loup marche sur des pieds, pas sur des
       échasses. À 0,42 de canon et 0,17 de pied il rendait un lévrier monté sur
       piquets, et le rapport jambe/corps d'un canidé ne pardonne pas. */
    patte: { canon: 0.66, jarret: 0.17, pied: 0.26 },
    /* La queue est écrite ici, plus bas : `queueLoup` lui donne son fouet de
       poils, que la queue partagée du squelette ne sait pas faire. */
    queue: null,
    tete: (g, kk) => teteLoup(g, kk, Hs * 0.5, brumes, k.seed + 61),
    /*
     * La MANDIBULE suit le nouveau chanfrein : elle courait de 0,34 à 0,94 S
     * quand le museau s'arrêtait à 1,00 ; il va maintenant à 1,52, et une
     * mâchoire qui s'arrête aux deux tiers du museau donne une bête à la lèvre
     * fendue. Trois crocs suffisent — à trente pixels, une denture complète
     * n'est qu'une tache blanche, et c'est ce que montrait la planche.
     */
    machoire: (g, kk) => {
      const S = Hs * 0.5;
      sous(g, S * 0.26, S * 0.14, (h) => {
        poser(h, kk, lisser(perturber(densifier([pt(0, -S * 0.04), pt(S * 0.56, -S * 0.02), pt(S * 0.9, S * 0.02), pt(S * 0.84, S * 0.16), pt(S * 0.5, S * 0.2), pt(-S * 0.02, S * 0.18)], S * 0.14), S * 0.012, 5), 1), {
          couleur: assombrir(poil, 0.3),
          matiere: 'fourrure',
          matiereAlpha: 0.24,
          echelle: 0.3,
        });
        /* Le liséré clair de la lèvre inférieure, et rien de plus.
           Trois crocs étaient dessinés ICI, dans le repère de la mandibule,
           mais leur pointe montait à −0,15 S alors que la mâchoire ne commence
           qu'à −0,04 : ils dépassaient donc dans le chanfrein, PAR-DESSUS lui
           puisque la mandibule est peinte après la tête. Résultat mesuré à
           l'export : trois gouttes blanches posées au milieu du museau, qu'on
           lisait comme de la bave. Les crocs sont désormais accrochés à la
           lèvre supérieure, dans `teteLoup`, d'où ils pendent. */
        h.moveTo(S * 0.06, -S * 0.02);
        h.quadraticCurveTo(S * 0.5, -S * 0.04, S * 0.86, S * 0.02);
        h.stroke({ color: eclaircir(poil, 0.34), width: S * 0.05, alpha: 0.5, cap: 'round' });
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
      /*
       * La crête s'accroche désormais à la LIGNE DU DOS, et non à une hauteur
       * fixe. Le tronc partagé a pris son garrot : à x = +0,24 L le dos monte à
       * −0,494 Hs quand les touffes culminaient à −0,46 Hs. Elles étaient donc
       * ENFOUIES dans le tronc sur toute l'épaule — la correction du dos aurait
       * effacé celle du poil, ce qui est la façon la plus discrète de perdre un
       * correctif déjà mesuré.
       */
      const dos = (t: number): number => -Hs * (0.31 + 0.13 * t);
      const n = brumes ? 12 : 10;
      for (let i = 0; i < n; i += 1) {
        const t = i / (n - 1);
        const x = L * (-0.42 + t * 0.76);
        /* Cloche centrée au garrot, à peu près aux trois quarts de l'échine. */
        const cloche = Math.sin(Math.PI * Math.min(1, Math.max(0, (t + 0.18) / 1.18)));
        /* Une CRINIÈRE, pas une crête de lézard : mesurée deux fois sur
           capture. Dix-huit fuseaux hauts et étroits, c'était un dos de
           stégosaure — une rangée de plaques régulières, et le regard compte les
           plaques au lieu de lire une échine. Dix touffes larges et basses se
           RECOUVRENT, et c'est le recouvrement qui fait le poil. */
        /*
         * Un DÉSORDRE mesuré sur chaque touffe : hauteur ±35 %, pied décalé,
         * inclinaison variable. Dix touffes calculées par la même formule
         * donnaient dix pointes rigoureusement égales et régulièrement
         * espacées — vu sur la planche, cela ne rend pas du poil hérissé mais
         * une crête de reptile, et le regard se met à compter les pointes.
         * Le bruit est déterministe : même graine, même hérissement.
         */
        const jitter = hash2(i, 7, 613);
        const jitter2 = hash2(i, 11, 947);
        const pied0 = dos(t) + Hs * 0.1;
        const haut = dos(t) - Hs * (0.02 + 0.09 * cloche * cloche) * (0.65 + 0.7 * jitter);
        poser(g, kk, fuseau(x + L * 0.008 * (jitter2 - 0.5), pied0, x - L * (0.02 + 0.03 * jitter2), haut, Hs * (0.26 + 0.1 * cloche) * (0.85 + 0.3 * jitter2), { seed: i + 3, taper: 0.72 }), {
          couleur: i % 2 ? eclaircir(poil, 0.16) : assombrir(poil, 0.16),
          matiere: 'fourrure',
          matiereAlpha: 0.3,
          echelle: 0.3,
          /* Un liseré sur deux touffes mettait bout à bout un FIL D'OR continu
             le long de l'échine — un câble, pas une lumière. Une sur trois le
             casse en éclats, ce que fait la lumière sur du poil. */
          rim: i % 3 === 0,
          /* Sans contour : cernée, chaque touffe se lisait comme une PLAQUE, et
             dix plaques alignées font un tatou. Le poil n'a pas de bord — il a
             une valeur, et c'est tout ce qu'on lui laisse. */
          contour: false,
        });
      }
      // ligne dorsale sombre, sur la même ligne de dos
      g.moveTo(-L * 0.4, dos(0.03));
      g.quadraticCurveTo(0, dos(0.55) - Hs * 0.02, L * 0.34, dos(1));
      g.stroke({ color: assombrir(poil, 0.42), width: Hs * 0.1, alpha: 0.45 });
      /*
       * La COLLERETTE du poitrail : le manchon de poils longs qui va de la
       * gorge au coude et qui double la largeur de l'avant-main. Un loup se
       * reconnaît par là autant que par son échine — c'est le triangle sombre
       * sous la tête basse, et c'est ce qui empêchait le poitrail neuf de se
       * lire comme une simple bosse.
       */
      for (let i = 0; i < 6; i += 1) {
        const t = i / 5;
        const y0 = -Hs * (0.34 - t * 0.3);
        poser(
          g,
          kk,
          fuseau(L * 0.34, y0, L * (0.5 + t * 0.06), y0 + Hs * (0.1 + t * 0.12), Hs * (0.2 - t * 0.05), {
            seed: i + 31,
            taper: 0.66,
          }),
          {
            couleur: i % 2 ? eclaircir(poil, 0.2) : assombrir(poil, 0.18),
            matiere: 'fourrure',
            matiereAlpha: 0.3,
            echelle: 0.3,
            modele: 0.95,
            rim: i % 2 === 1,
          },
        );
      }
      if (brumes) {
        brumeAccrochee(g, { x: -L * 0.3, y: Hs * 0.02, w: L * 0.7, h: Hs * 0.8, couleur: BRUME, seed: 41, densite: 10 });
        cicatrice(g, pt(L * 0.06, -Hs * 0.12), pt(L * 0.2, Hs * 0.04), poil, 1.6);
      }
    },
  });
  /* La queue se glisse à la place exacte que le squelette lui réservait : juste
     avant le tronc, donc DERRIÈRE lui à l'écran. Poussée en fin de liste, elle
     passerait par-dessus la croupe. */
  pieces.splice(
    pieces.findIndex((p) => p.nom === 'tronc'),
    0,
    queueLoup(L, Hs, poil, brumes, k.seed + (brumes ? 251 : 241)),
  );
  return pieces;
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
  /*
   * La ramure descend de 1,05 S à 0,84 S.
   *
   * Ce n'est pas une reculade sur ce qui marchait : c'est une mesure de place.
   * La boîte du cerf faisait 309 de haut pour un TRONC de 55, et la planche
   * échelonne chaque bête pour remplir sa case — le corps ne recevait donc que
   * dix-huit pour cent de la hauteur disponible, et le propriétaire y voyait
   * une planche parce qu'il n'en restait littéralement pas assez de pixels
   * pour y lire une poitrine. La ramure montait à quatre-vingt-dix unités
   * au-dessus du garrot pour une hauteur au garrot de 136, soit deux tiers :
   * un cerf en porte quarante à cinquante pour cent. On lui rend sa mesure, et
   * les vingt-quatre unités récupérées reviennent au corps.
   */
  sous(g, -S * 0.06, -S * 0.5, (h) => ramure(h, k, S * 0.84, miraculeux, seed + 21));
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
       `avance` ; sans elle la ramure retombait sur la croupe. `avance` passe de
       0,42 à 0,6 : la tête tombait encore en x = +47 pour un poitrail à +53,
       donc six unités DERRIÈRE la poitrine. */
    cou: { longueur: Hs * 0.52, largeur: Hs * 0.3, angle: -0.05, avance: 0.6 },
    teteRot: -0.16,
    /*
     * Le cervidé : poitrail profond, flanc très creusé, garrot un rien plus haut
     * que la croupe. C'est ce qui manquait — « une planche sur quatre
     * baguettes » —, et c'est ce qui, avec la ramure, doit se lire à la
     * vignette. Les membres sont FINS : un canon de trois dixièmes de la cuisse,
     * un jarret franchement replié, et un sabot fendu au bout.
     */
    pente: 0.04,
    poitrail: 0.26,
    flanc: 0.24,
    patte: { canon: 0.34, jarret: 0.17, pied: 0.1, sabot: true },
    queue: { longueur: L * 0.12, epaisseur: Hs * 0.1, courbe: 0.8 },
    tete: (g, kk) => teteCerf(g, kk, Hs * 0.38, miraculeux, k.seed + 71),
    surTronc: (g, kk) => {
      /*
       * Le MIROIR : la tache claire de la croupe, sous la queue. C'est la seule
       * marque qu'un cervidé porte en grand, la seule qu'on voit de loin dans un
       * sous-bois, et elle ferme l'arrière-main que le flanc creusé vient
       * d'ouvrir.
       */
      poser(
        g,
        kk,
        lisser(
          perturber(
            densifier(
              [pt(-L * 0.46, -Hs * 0.26), pt(-L * 0.3, -Hs * 0.3), pt(-L * 0.26, Hs * 0.02), pt(-L * 0.44, Hs * 0.1)],
              Hs * 0.14,
            ),
            Hs * 0.012,
            17,
          ),
          1,
        ),
        {
          couleur: melanger(eclaircir(poil, 0.3), PIERRE_CLAIRE, 0.24),
          matiere: 'fourrure',
          matiereAlpha: 0.22,
          echelle: 0.32,
          modele: 0.7,
          rim: false,
          contour: false,
        },
      );
      /* Le POITRAIL : la masse de la poitrine entre les antérieurs, prise dans
         la lumière. Sans elle, le creux du flanc ne se lit pas — il faut deux
         valeurs pour qu'un vide se voie, et celle-ci est la pleine. */
      poser(g, kk, blob(L * 0.34, Hs * 0.06, L * 0.13, Hs * 0.24, { seed: 19, points: 15, wobble: 0.18 }), {
        couleur: melanger(poil, LIGHT.chaude, 0.16),
        matiere: 'fourrure',
        matiereAlpha: 0.24,
        echelle: 0.34,
        modele: 0.9,
        rim: false,
      });
      // mouchetures de faon conservées à l'âge adulte, semées sur le flanc seul
      for (let i = 0; i < 10; i += 1) {
        const x = -L * 0.2 + (i % 5) * L * 0.1;
        const y = -Hs * 0.24 + Math.floor(i / 5) * Hs * 0.15;
        g.poly(flat(blob(x, y, Hs * 0.032, Hs * 0.026, { seed: i * 3 + 2, points: 9, wobble: 0.3 }))).fill({
          color: eclaircir(poil, 0.42),
          alpha: 0.32,
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
        /*
         * L'eau des sept vallons : TROIS filets courts sur le flanc, et non six
         * verticales du dos au ventre. Les six barres claires traversaient la
         * bête de part en part et rendaient une GRILLE — une cage thoracique
         * peinte à l'extérieur —, ce qu'on voit sans erreur possible sur la
         * planche de contact. Un ruissellement se lit à ce qu'il s'interrompt.
         */
        for (let i = 0; i < 3; i += 1) {
          const x = -L * 0.06 + i * L * 0.13;
          g.moveTo(x, -Hs * 0.3);
          g.quadraticCurveTo(x + 2, -Hs * 0.18, x - 1, -Hs * 0.06);
          g.stroke({ color: melanger(BRUME, LIGHT.chaude, 0.28), width: Hs * 0.02, alpha: 0.3, cap: 'round' });
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
   * Le nombre de RANGS suit la taille du bloc, et ne vaut plus trois quoi qu'il
   * arrive. Trois rangs de deux pierres dans un bras de vingt-cinq pixels de
   * large font des pierres de huit pixels : du GRAVIER, et c'est ce que la
   * planche montrait — un tas de galets. Une pierre de taille doit rester
   * grande devant le membre qui la porte, sinon la maçonnerie se lit comme un
   * grain de matière et la silhouette perd ses arêtes.
   */
  const RANGS = Math.max(1, Math.min(3, Math.round(h / 22)));

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

  /* Le damier : un à trois rangs selon la taille, deux ou trois pierres par
     rang, décalés d'un demi-pas comme un mur de moellons. */
  for (let r = 0; r < RANGS; r += 1) {
    const par = RANGS > 1 && r === 1 ? 3 : 2;
    const decale = RANGS > 1 && r === 1 ? 0 : 0.5;
    for (let i = 0; i < par; i += 1) {
      const u = (i + decale) / par;
      const cx = -w * 0.42 + u * w * 0.84;
      const cy = -h * 0.4 + ((r + 0.5) / RANGS) * h * 0.82;
      const pw = (w * 0.9) / par;
      const ph = (h * 0.86) / RANGS;
      /*
       * Une pierre TAILLÉE, et non un caillou.
       *
       * L'ancienne face était un polygone de cinq ou six côtés dont le rayon
       * variait de 0,34 à 0,54 : à un dixième près, un pentagone régulier. Vu
       * à trois fois la taille de la vignette, chaque pierre était donc un
       * galet, et le colosse restait un tas de galets malgré ses épaules, ses
       * poings et sa mâchoire. Ce qui fait la pierre de taille, ce n'est pas
       * le nombre de côtés : c'est que les côtés soient de LONGUEURS TRÈS
       * INÉGALES, avec une face large tournée vers la lumière et deux ou trois
       * arêtes courtes qui la referment.
       *
       * On tire donc les rayons entre 0,26 et 0,66 — un rapport de deux et
       * demi contre un rapport de un et demi — et l'on force la face du
       * nord-ouest à être la plus large des quatre.
       */
      const n = 5 + ((seed + r * 7 + i * 3) % 2);
      const face: Poly = [];
      for (let s = 0; s < n; s += 1) {
        const a = (s / n) * Math.PI * 2 + (r + i) * 0.7;
        const brut = 0.24 + (((seed + s * 13 + r * 5 + i) % 11) / 11) * 0.26;
        /* La face tournée vers le soleil (nord-ouest) est allongée : c'est
           elle qui prend la lumière, et une face large est ce qui distingue
           une pierre équarrie d'un galet roulé. */
        const versSoleil = Math.max(0, -Math.cos(a) * 0.5 - Math.sin(a) * 0.5);
        /*
         * Allonger vers le soleil sans GROSSIR : le facteur est centré pour que
         * le rayon moyen ne bouge pas. La première version multipliait par
         * 1 + 0,42·versSoleil, ce qui enflait chaque pierre de sept pour cent
         * en moyenne — assez pour que les deux jambes du colosse se touchent.
         * `art.test.ts` l'a dit tout de suite : « jour entre les jambes :
         * −0,77 attendu > 2 ». Le jour entre les jambes est le trapèze qui fait
         * le colosse et il se lit en négatif ; on ne l'échange pas contre une
         * facette.
         *
         * Ce qui borne la silhouette n'est pas le rayon MOYEN mais le rayon
         * MAXIMAL : les bornes sont donc calées pour que le plus grand rayon
         * reste celui d'avant (0,55 contre 0,54), pendant que le rapport entre
         * le plus petit et le plus grand passe de 1,6 à 2,1. C'est ce rapport,
         * et lui seul, qui transforme un pentagone presque régulier — un galet
         * — en une pierre équarrie.
         */
        const rr = brut * (0.94 + versSoleil * 0.16);
        face.push(pt(cx + Math.cos(a) * pw * rr * 1.25, cy + Math.sin(a) * ph * rr * 1.3));
      }
      /*
       * LE GROUPEMENT DE VALEURS, qui manquait entièrement.
       *
       * Chaque pierre recevait le même ton à six pour cent près : le membre
       * entier rendait donc un aplat gris, et aucune arête ne se lisait à la
       * vignette. Or c'est exactement ce que la loi de lumière unique demande
       * — les pierres du haut à gauche d'un membre sont au soleil, celles du
       * bas à droite sont dans l'ombre de la masse — et c'est ce qui, dans
       * n'importe quel golem de pierre bien peint, fait qu'on voit un VOLUME
       * et non une texture.
       *
       * L'écart va donc de −0,30 à +0,34, soit un rapport de valeur d'environ
       * deux, au lieu de ±0,06. Le damier de ton d'origine est conservé
       * par-dessus, mais réduit : il désordonne, il ne structure plus.
       */
      const u2 = i / (par - 1);
      const v2 = RANGS === 1 ? 0.5 : r / (RANGS - 1);
      /* +1 en haut à gauche, −1 en bas à droite. */
      const jour = (0.5 - u2) + (0.5 - v2);
      const base = jour > 0 ? eclaircir(c, jour * 0.68) : assombrir(c, -jour * 0.6);
      const ton = (r + i) % 2 ? eclaircir(base, 0.07) : assombrir(base, 0.06);
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

/**
 * Le colosse : un HOMME DE PIERRE, et c'était un cairn.
 *
 * ─── Ce que l'ancien assemblage coûtait, mesuré sur la planche de contact ───
 *
 * Le propriétaire l'a nommé « un tas de galets empilés, sans tête, sans bras,
 * sans posture », et les boîtes le disent au pixel près. Le buste tenait de
 * x = −35 à +34 ; le bras de x = −45 à −5, soit TRENTE de ses quarante unités
 * DERRIÈRE le buste : les trois quarts du bras étaient dans la masse du tronc,
 * il ne dépassait que de dix unités et se lisait comme une colonne de plus dans
 * l'empilement. La tête faisait 33 de large pour un buste de 69 et se posait
 * juste au-dessus, du même ton, de la même maçonnerie : le rang du haut du
 * cairn. Les deux jambes allaient de −30 à +2 et de −4 à +29 — elles se
 * TOUCHAIENT, un seul bloc. Et l'ensemble flottait treize pixels au-dessus de
 * son ombre, parce que le pied s'arrêtait à −0,11 H quand le sol est à zéro.
 *
 * Un géant de pierre ne se reconnaît pas à sa maçonnerie — celle-là était
 * bonne — mais à quatre choses, et ce sont quatre écarts, pas quatre dessins :
 *
 *  1. **la carrure** : deux bosses d'épaules qui débordent franchement le
 *     torse, 0,60 H contre 0,40 H de poitrine et 0,30 H de reins. C'est le
 *     trapèze qui fait le colosse, et il se lit en négatif ;
 *  2. **la tête basse, enfoncée ENTRE les bosses** : elle ne dépasse plus par
 *     le haut d'une masse, elle occupe le creux laissé entre les deux épaules,
 *     que rien ne vient combler. Un sourcil de pierre, deux orbites creuses et
 *     une mâchoire suffisent à la faire lire ;
 *  3. **les bras longs et lourds, HORS du tronc** : ils pendent à ±0,25 H,
 *     c'est-à-dire entièrement à l'extérieur du buste, et finissent par un
 *     POING plus large que l'avant-bras, aux genoux ;
 *  4. **les jambes trapues et écartées** : un vide de lumière de 0,10 H entre
 *     elles, et un pied posé au sol — au sol, pas treize pixels au-dessus.
 */
function colossePieces(k: Kit, pamole: boolean): PieceDef[] {
  const H = pamole ? 150 : 132;
  const c = pamole ? melanger(0x4a4e52, 0x6a6255, 0.28) : melanger(0x4a4e52, PIERRE_CLAIRE, 0.14);
  /** Du bassin au sol. Le pied doit y arriver : l'ombre est peinte en y = 0. */
  const SOL = H * 0.42;
  const pieces: PieceDef[] = [];

  pieces.push({ nom: 'bassin', x: 0, y: -SOL, ordreMort: 6, dessin: () => {} });

  for (const cote of [1, -1] as const) {
    pieces.push({
      nom: cote > 0 ? 'jambe_d' : 'jambe_g',
      parent: 'bassin',
      /* ±0,135 H pour des blocs de 0,20 H : il reste 0,10 H de jour entre les
         deux jambes. C'est ce jour, et lui seul, qui dit qu'il y a deux jambes. */
      x: cote * H * 0.135,
      y: 0,
      lumiere: cote > 0 ? -0.7 : 0.7,
      ordreMort: cote > 0 ? 1 : 3,
      dessin: (g, kk) => {
        // cuisse
        blocPierre(g, kk, H * 0.21, H * 0.24, k.seed + cote * 7, {
          couleur: cote > 0 ? assombrir(c, 0.16) : c,
          lichen: pamole ? 5 : 8,
        });
        // tibia, plus étroit : une jambe de pierre s'affine vers la cheville
        sous(g, -cote * H * 0.008, H * 0.24, (h) =>
          blocPierre(h, kk, H * 0.18, H * 0.21, k.seed + cote * 11, {
            couleur: cote > 0 ? assombrir(c, 0.24) : assombrir(c, 0.08),
            lichen: pamole ? 4 : 7,
          }),
        );
        /* Le pied : une DALLE large et plate, posée au sol. Sans elle le
           colosse finit en pointe et flotte. */
        sous(g, cote * H * 0.026, SOL - H * 0.048, (h) =>
          blocPierre(h, kk, H * 0.25, H * 0.1, k.seed + cote * 23, {
            couleur: cote > 0 ? assombrir(c, 0.3) : assombrir(c, 0.14),
            lichen: pamole ? 3 : 6,
          }),
        );
      },
    });
  }

  pieces.push({ nom: 'torse', parent: 'bassin', x: 0, y: 0, ordreMort: 7, dessin: () => {} });

  /** Un bras : humérus, avant-bras, puis un poing de dalle. */
  const brasDePierre = (g: Graphics, kk: Kit, cote: 1 | -1, graine: number): void => {
    /*
     * Le bras porte sa propre VALEUR, franchement écartée de celle du buste :
     * le bras d'ombre part à 0,34 d'assombrissement, le bras de lumière à 0,22
     * d'éclaircissement. Un écart de 0,18 ne suffisait pas — bras, épaule et
     * poitrine se peignaient dans le même gris, la même maçonnerie, et les
     * trois masses se refermaient en une seule bande horizontale : c'est ce que
     * la seconde capture montrait, un mur de moellons de trois rangs. Une
     * silhouette se détache par contraste de valeur (loi n°6), et deux membres
     * d'un même corps n'y échappent pas.
     */
    const ton = (d: number): number =>
      cote > 0 ? assombrir(c, 0.34 + d) : eclaircir(melanger(c, LIGHT.chaude, 0.06), 0.22 - d * 0.5);
    /* Le CREUX D'AISSELLE : une ombre franche entre le bras et le flanc, posée
       avant le membre. Sans elle, deux pierres voisines de même ton se
       raboutent et le bras rentre dans le tronc. */
    g.poly(
      flat(blob(-cote * H * 0.075, H * 0.02, H * 0.055, H * 0.135, { seed: graine + 91, points: 14, wobble: 0.18 })),
    ).fill({ color: ombreBleutee(c, 1), alpha: 0.78 });
    blocPierre(g, kk, H * 0.17, H * 0.2, graine, { couleur: ton(0), lichen: 5 });
    sous(g, cote * H * 0.012, H * 0.23, (h) =>
      blocPierre(h, kk, H * 0.155, H * 0.24, graine + 4, { couleur: ton(0.06), lichen: 4 }),
    );
    /* Le POING, plus large que l'avant-bras qui le porte : c'est le seul
       renflement de toute la silhouette, et c'est ce qui dit que le colosse
       frappe. Trois arêtes de phalanges par-dessus, côté lumière.
       Il pend SOUS le buste — 0,09 H plus bas —, sans quoi le poing s'aligne
       sur la hanche et le bras se referme dans le bloc du tronc. */
    sous(g, cote * H * 0.022, H * 0.44, (h) => {
      blocPierre(h, kk, H * 0.205, H * 0.17, graine + 8, { couleur: ton(0.1), lichen: 3 });
      for (let i = 0; i < 3; i += 1) {
        const x = -H * 0.06 + i * H * 0.06;
        h.moveTo(x, -H * 0.045);
        h.lineTo(x + H * 0.012, H * 0.05);
        h.stroke({
          color: i % 2 ? ombreBleutee(c, 0.9) : melanger(PIERRE_CLAIRE, LIGHT.chaude, 0.3),
          width: H * 0.009,
          alpha: 0.5,
          cap: 'round',
        });
      }
    });
  };

  pieces.push({
    nom: 'bras_d',
    parent: 'torse',
    /*
     * ±0,30 H, et non 0,25.
     *
     * À 0,25 le bras pendait bien hors du buste — mais de DEUX UNITÉS ET DEMIE,
     * un pixel sept à l'échelle où la planche affiche la bête. Bras, épaule et
     * poitrine se refermaient donc en une seule masse carrée : le colosse
     * restait un mur de moellons, corrigé dans la géométrie et pas à l'œil. À
     * 0,30 H contre 0,132 H de demi-reins, il reste dix unités de fond entre le
     * bras et la taille — six pixels, et le bras existe.
     */
    x: H * 0.3,
    y: -H * 0.33,
    rot: 0.07,
    lumiere: -0.8,
    ordreMort: 2,
    dessin: (g, kk) => brasDePierre(g, kk, 1, k.seed + 13),
  });

  pieces.push({
    nom: 'buste',
    parent: 'torse',
    x: 0,
    y: 0,
    ordreMort: 8,
    dessin: (g, kk) => {
      /* Les reins, étroits et SOMBRES : c'est la taille du trapèze, et c'est
         aussi la seule fenêtre où le fond passe entre le bras et le tronc. */
      blocPierre(g, kk, H * 0.24, H * 0.21, k.seed + 23, {
        couleur: assombrir(c, 0.2),
        lichen: pamole ? 6 : 11,
      });
      /* La cage, plus large que les reins mais NETTEMENT plus étroite que les
         épaules : à 0,41 H contre 0,60 H de carrure, les bosses ne débordaient
         plus assez pour se voir, et le haut du corps redevenait un rectangle. */
      sous(g, 0, -H * 0.2, (h) =>
        blocPierre(h, kk, H * 0.35, H * 0.25, k.seed + 29, {
          couleur: eclaircir(c, 0.14),
          faille: pamole,
          lichen: pamole ? 7 : 12,
        }),
      );
      if (pamole) {
        // la ligne de faille qui l'a détaché du flanc de la Pierre Pamole
        lueurFroide(g, -H * 0.04, -H * 0.18, H * 0.05, melanger(CUIVRE, LIGHT.chaude, 0.35), 0.85);
      }
    },
  });

  pieces.push({
    nom: 'tete',
    parent: 'torse',
    x: -H * 0.008,
    /* Enfoncée : le bas du crâne passe DERRIÈRE la ligne des épaules, qui
       viennent se peindre par-dessus. Il ne dépasse qu'un front et une
       mâchoire, et c'est exactement ce qu'on veut voir d'un colosse. */
    y: -H * 0.455,
    lumiere: 0.6,
    ordreMort: 10,
    dessin: (g, kk) => {
      /*
       * Le crâne passe de 0,175 H à 0,21 H et s'éclaircit de 0,14 à 0,3.
       *
       * À la première reprise il ne rendait plus qu'une bosse de quinze pixels,
       * du même gris que la carrure : la tête existait dans la géométrie et pas
       * à l'écran. Une tête de colosse doit être PETITE devant les épaules — ce
       * qui fait la brute — mais elle doit être la pièce la plus CLAIRE du
       * corps, sinon elle rentre dans le tas.
       */
      const T = H * 0.21;
      blocPierre(g, kk, T, T * 0.9, k.seed + 31, {
        couleur: eclaircir(melanger(c, LIGHT.chaude, 0.08), 0.3),
        lichen: pamole ? 4 : 7,
      });
      /* Le SOURCIL : une dalle en surplomb, la seule arête franche du visage.
         Sous elle, deux orbites vraiment creuses — pas deux points. C'est le
         même moyen que le creux orbital d'un humain : deux valeurs, et un
         caillou devient une tête. */
      poser(
        g,
        kk,
        perturber(
          [pt(-T * 0.46, -T * 0.2), pt(T * 0.46, -T * 0.24), pt(T * 0.42, -T * 0.02), pt(-T * 0.44, T * 0.02)],
          T * 0.03,
          k.seed + 33,
        ),
        {
          couleur: eclaircir(c, 0.26),
          matiere: 'granit',
          matiereAlpha: 0.3,
          echelle: 0.4,
          modele: 1.2,
        },
      );
      for (const dx of [-0.22, 0.16]) {
        g.poly(flat(blob(dx * T, T * 0.14, T * 0.15, T * 0.11, { seed: dx * 100 + 3, points: 11, wobble: 0.24 }))).fill({
          color: ombreBleutee(c, 1),
          alpha: 0.92,
        });
        if (pamole) {
          g.poly(flat(blob(dx * T, T * 0.14, T * 0.07, T * 0.055, { seed: dx * 100 + 5, points: 8, wobble: 0.3 }))).fill({
            color: melanger(CUIVRE, LIGHT.chaude, 0.5),
            alpha: 0.85,
          });
        }
      }
      // la mâchoire : un bloc plus étroit, en retrait, qui ferme le crâne
      sous(g, T * 0.02, T * 0.42, (h) =>
        blocPierre(h, kk, T * 0.78, T * 0.34, k.seed + 35, { couleur: assombrir(c, 0.1) }),
      );
      if (!pamole) mousse(g, { x: 0, y: -T * 0.36, w: T * 0.9, h: T * 0.4, seed: 37, densite: 7, couleur: SAUGE });
    },
  });

  /*
   * LES ÉPAULES, et elles se peignent APRÈS la tête.
   *
   * Deux bosses distinctes, pas une barre : le creux qu'elles laissent au
   * milieu est ce dans quoi la tête est enfoncée. Une barre pleine aurait
   * mangé le crâne ; deux bosses le CADRENT, et c'est cette découpe en trois
   * temps — masse, creux, masse — qu'on lit encore à trente pixels.
   */
  pieces.push({
    nom: 'epaules',
    parent: 'torse',
    x: 0,
    y: -H * 0.37,
    lumiere: 0.5,
    ordreMort: 9,
    dessin: (g, kk) => {
      /* L'ombre de la nuque, d'abord : c'est elle qui creuse le col entre les
         deux bosses et qui détache la tête du fond de pierre. */
      g.poly(flat(blob(0, H * 0.012, H * 0.105, H * 0.05, { seed: 71, points: 14, wobble: 0.2 }))).fill({
        color: ombreBleutee(c, 1),
        alpha: 0.7,
      });
      for (const cote of [1, -1] as const) {
        sous(g, cote * H * 0.245, 0, (h) =>
          blocPierre(h, kk, H * 0.25, H * 0.16, k.seed + 61 + cote * 5, {
            couleur: cote > 0 ? assombrir(c, 0.26) : eclaircir(c, 0.18),
            lichen: pamole ? 4 : 7,
          }),
        );
      }
    },
  });

  pieces.push({
    nom: 'bras_g',
    parent: 'torse',
    x: -H * 0.3,
    y: -H * 0.35,
    rot: -0.06,
    lumiere: 0.9,
    ordreMort: 4,
    dessin: (g, kk) => brasDePierre(g, kk, -1, k.seed + 41),
  });

  if (pamole) {
    // le bloc de la taille d'un veau, tenu prêt dans le poing gauche
    pieces.push({
      nom: 'arme',
      parent: 'bras_g',
      x: -H * 0.05,
      y: H * 0.52,
      lumiere: 0.5,
      ordreMort: 0,
      dessin: (g, kk) => {
        blocPierre(g, kk, H * 0.22, H * 0.2, k.seed + 53, { couleur: melanger(c, PIERRE_CLAIRE, 0.2), lichen: 6 });
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
  /*
   * La GUEULE, peinte AVANT le crâne : un creux sombre et chaud dans lequel la
   * mandibule décrochée vient s'ouvrir. Sans elle, une mâchoire abaissée ne
   * montre que du fond de case entre les deux mâchoires, et la tête se lit
   * fendue en deux au lieu d'ouverte.
   */
  poser(
    g,
    k,
    lisser(
      perturber(
        densifier(
          [pt(S * 0.16, -S * 0.1), pt(S * 1.08, -S * 0.06), pt(S * 1.0, S * 0.36), pt(S * 0.12, S * 0.3)],
          S * 0.18,
        ),
        S * 0.014,
        seed + 61,
      ),
      1,
    ),
    {
      couleur: assombrir(melanger(0x8c2230, MOUSSE, 0.4), 0.34),
      matiere: 'grain',
      matiereAlpha: 0.14,
      echelle: 0.3,
      modele: 0.6,
      rim: false,
    },
  );
  /* Le museau porte plus loin : 1,26 S contre 1,10. Une tête de vouivre est un
     coin, et c'est la longueur du coin qui la distingue à la vignette du bout
     rond d'un anneau. */
  const forme = lisser(
    perturber(
      densifier(
        [pt(-S * 0.52, -S * 0.34), pt(-S * 0.06, -S * 0.58), pt(S * 0.6, -S * 0.44), pt(S * 1.26, -S * 0.1), pt(S * 1.14, S * 0.1), pt(S * 0.3, S * 0.24), pt(-S * 0.36, S * 0.3), pt(-S * 0.6, S * 0.02)],
        S * 0.2,
      ),
      S * 0.016,
      seed,
    ),
    1,
  );
  poser(g, k, forme, { couleur: ecaille, matiere: 'ecailles', matiereAlpha: 0.3, echelle: 0.36, seed });
  // naseau et fente
  g.poly(flat(blob(S * 1.12, -S * 0.14, S * 0.07, S * 0.05, { seed: seed + 3, points: 9, wobble: 0.24 }))).fill({
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
  /*
   * La CRÊTE de la nuque : quatre lames couchées vers l'arrière, qui prolongent
   * celle du col et bouclent la silhouette de la tête.
   *
   * Les deux cornes seules laissaient une nuque ronde, et une tête ronde au bout
   * d'un col n'est qu'un bouton. Les lames alternent clair et sombre, une sur
   * deux prend le liseré, et aucune n'est cernée : c'est la règle déjà éprouvée
   * sur l'échine du loup et sur la frange des anneaux — un contour par lame
   * rendrait une rangée de plaques, jamais une crête.
   */
  for (let i = 0; i < 4; i += 1) {
    const t = i / 3;
    const bx = -S * (0.18 + t * 0.4);
    const by = -S * (0.42 - t * 0.24);
    poser(g, k, fuseau(bx, by, bx - S * (0.42 + t * 0.2), by - S * (0.44 - t * 0.18), S * (0.24 - t * 0.05), { seed: seed + 71 + i * 3, taper: 0.56 }), {
      couleur: i % 2 ? melanger(ecaille, couronnee ? LIGHT.rim : SAUGE, 0.3) : assombrir(ecaille, 0.2),
      matiere: 'ecailles',
      matiereAlpha: 0.24,
      echelle: 0.28,
      modele: 0.9,
      rim: i % 2 === 0,
      contour: false,
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

/**
 * La vouivre : un SERPENT AILÉ dressé, et c'était une masse verte couchée.
 *
 * ─── Ce que l'ancien assemblage coûtait, mesuré sur la planche de contact ───
 *
 * Trois défauts, et le premier explique les deux autres.
 *
 *  1. **L'encolure penchait en arrière.** Elle partait tout droit dans son
 *     repère et l'articulation était tournée de −0,95 rad pour la coucher : or
 *     une rotation emporte le sommet du fût vers l'ARRIÈRE. Mesuré, la tête
 *     retombait en x = −2 pour une attache en x = +30 — au-dessus du MILIEU du
 *     corps. C'est le défaut déjà nommé au cerf, et il vivait encore ici parce
 *     que la vouivre n'emprunte aucun squelette : ses pièces sont écrites à la
 *     main. Une vouivre sans col dressé n'est pas une vouivre.
 *  2. **Il y avait TROIS ailes, dont deux du même nom.** `aile_g` était poussée
 *     deux fois — une petite au fond, une grande devant —, et `assembler`
 *     indexe par nom : celle du fond n'était jamais animée, elle restait figée
 *     pendant que sa jumelle battait. C'est exactement la faute des pattes
 *     doublées du quadrupède, un fichier plus loin. Deux ailes, deux noms.
 *  3. **L'aile proche mesurait 104 × 64 pour un anneau de 52 × 34** : deux fois
 *     le corps. Elle l'avalait, et la planche rendait une cape verte à tête.
 *
 * On tient donc, dans cet ordre : le col en **S** — la base creuse vers
 * l'arrière, le sommet bombe vers l'avant et jette la tête devant le poitrail —,
 * la membrane tendue sur ses doigts, la queue longue finissant en **pointe de
 * lance**, et l'escarboucle au front. Le S est le trait ; tout le reste le sert.
 *
 * ─── Le quatrième défaut : elle n'avait pas la PRÉSENCE d'un rang sept ───
 *
 * Ces trois corrections faites, la vouivre restait, sur la planche, un petit
 * dragon vert lové qui occupait la moitié de sa case pendant que le Griffon de
 * Pamole remplissait la sienne. Quatre causes, mesurées à l'export de géométrie,
 * et pas une seule qui relève du détail :
 *
 *  1. **Cinquante et un pixels de vide sous la bête.** Le corps était perché à
 *     84 unités du sol pour une masse qui n'en descend que 19 : la case de la
 *     planche met la boîte ENTIÈRE à l'échelle, ombre comprise, et la moitié de
 *     l'image était du blanc entre le serpent et son ombre. Le corps descend
 *     désormais à 44 et les anneaux posent au sol.
 *  2. **L'aile mesurait 84 × 50 pour un corps de 236 de large.** Corrigée dans
 *     `aileVouivre` : 146 × 88, plus l'or du bord d'attaque et les franges.
 *  3. **Le corps était un chapelet de galets pâles d'égale importance.** Les
 *     longueurs décroissent maintenant plus lentement que les écarts, si bien
 *     que le recouvrement augmente vers la queue ; et la bande ventrale, qui
 *     égalisait tout, se retire des anneaux du fond pour aller là où le rendu de
 *     référence la met : en colonne sur le col dressé.
 *  4. **La queue et l'aile visaient le même coin.** Le fouet montait à soixante
 *     degrés vers le haut-gauche, où la membrane doit s'ouvrir ; il reste bas et
 *     ferme la masse par en dessous.
 *
 * Taux de remplissage de la boîte, avant et après : 41 % et 59 %. Le griffon,
 * qui sert d'étalon, est à 41 %.
 */
function vouivrePieces(k: Kit, couronnee: boolean): PieceDef[] {
  const S = couronnee ? 1.12 : 1;
  const ecaille = couronnee ? melanger(VERT_PROFOND, CUIVRE, 0.32) : melanger(VERT_PROFOND, MOUSSE, 0.28);
  /* Le ventre du serpent : pâle et CHAUD, tiré vers l'ocre plutôt que vers le
     cuivre patiné. Le cuivre est un vert-bleu ; un ventre peint avec lui vire au
     turquoise et se lit comme une pièce étrangère collée sous la bête. */
  const ventre = melanger(melanger(CUIVRE, 0xc08a3e, 0.5), PIERRE_CLAIRE, 0.3);
  /*
   * L'ALTITUDE DU CORPS, et c'est le premier gain de la vignette.
   *
   * Elle valait 84 quand la masse des anneaux ne descend qu'à 19 unités sous le
   * centre du corps : mesuré sur la boîte du rig, l'encre s'arrêtait à y = −51
   * pendant que l'ombre portée, elle, est peinte au sol. Il y avait donc
   * cinquante et un pixels de vide entre le serpent et son ombre, et la case de
   * la planche — qui met à l'échelle la boîte ENTIÈRE, ombre comprise — en
   * consacrait près de la moitié à du blanc. C'est la moitié de la « présence de
   * rang sept » qui manquait, et aucune quantité de dessin ne l'aurait rendue.
   * Un serpent lové POSE ses anneaux sur le sol.
   */
  const A = 44 * S;
  const pieces: PieceDef[] = [];

  pieces.push({ nom: 'corps', x: 0, y: -A, ordreMort: 7, dessin: () => {} });

  /*
   * L'aile LOINTAINE. Plus petite, plus sombre, plus haute : elle recule
   * derrière la nuque et ne dispute rien au serpent. C'est elle qui portait le
   * nom `aile_g` en double ; elle s'appelle désormais `aile_d`, le nom que
   * `clipsSerpent` anime en opposition de phase avec l'autre.
   */
  pieces.push({
    nom: 'aile_d',
    parent: 'corps',
    x: -6 * S,
    y: -34 * S,
    rot: 1.42,
    lumiere: -1.2,
    ambiance: 1.3,
    ordreMort: 1,
    dessin: (g, kk) => aileVouivre(g, kk, 104 * S, 60 * S, assombrir(ecaille, 0.46), couronnee, -1, 9, 1.42),
  });

  /*
   * LES ANNEAUX : ils se RESSERRENT et ils se RECOUVRENT.
   *
   * Ils étaient quatre masses de 54, 52, 44 et 34 de long, espacées de 30, 40 et
   * 30 : l'écart suivait la taille, si bien qu'aucun anneau n'en couvrait
   * vraiment un autre et que la décroissance ne se voyait pas. Vu à la vignette,
   * cela faisait un chapelet de galets d'égale importance — le mot « chenille »
   * était mérité. Un serpent lové fait l'inverse : chaque tour est nettement plus
   * court que le précédent, et il en cache le tiers.
   *
   * On tient donc deux suites décroissantes de raisons différentes : les
   * longueurs à 0,84 par cran, les écarts à 0,74. Comme l'écart tombe plus vite
   * que la taille, le recouvrement augmente vers la queue, ce qu'on lit comme un
   * enroulement. Et la chaîne reste BASSE : elle tournait de 1,08 radian au
   * total et montait en diagonale vers le coin haut-gauche — exactement là où
   * l'aile neuve doit s'ouvrir. Les deux se disputaient la même moitié d'image.
   */
  /** Somme des rotations de la chaîne d'anneaux : la queue s'en déduit. */
  const ROT_ANNEAUX = 0.1 + 0.2 + 0.32;

  pieces.push({
    nom: 'anneau1',
    parent: 'corps',
    x: -32 * S,
    y: 6 * S,
    rot: 0.1,
    lumiere: -0.2,
    ordreMort: 4,
    dessin: (g, kk) => anneau(g, kk, 50 * S, 33 * S, ecaille, ventre, couronnee, 11, 0.26),
  });
  pieces.push({
    nom: 'anneau2',
    parent: 'anneau1',
    x: -26 * S,
    y: 4 * S,
    rot: 0.2,
    lumiere: -0.3,
    ordreMort: 3,
    dessin: (g, kk) => anneau(g, kk, 42 * S, 27 * S, assombrir(ecaille, 0.12), ventre, couronnee, 13, 0.13),
  });
  pieces.push({
    nom: 'anneau3',
    parent: 'anneau2',
    x: -20 * S,
    y: 2 * S,
    rot: 0.32,
    lumiere: -0.4,
    ordreMort: 2,
    dessin: (g, kk) => anneau(g, kk, 35 * S, 21 * S, assombrir(ecaille, 0.24), ventre, couronnee, 17, 0),
  });
  pieces.push({
    nom: 'queue',
    parent: 'anneau3',
    x: -11 * S,
    y: 0,
    /*
     * Le fouet repart vers l'ARRIÈRE, à peine relevé : la rotation cumulée vaut
     * π + 0,42, on retire donc ce que la chaîne d'anneaux a déjà tourné.
     *
     * Elle était tracée vers +x pendant que la chaîne courait vers −x : la queue
     * rebroussait chemin sous le ventre, et il n'en restait à l'écran qu'un
     * petit crochet — tout ce que la planche montrait d'une queue de vouivre.
     *
     * Puis elle est montée à soixante degrés, ce qui l'a fait entrer en conflit
     * avec l'aile : les deux pointaient vers le coin haut-gauche et la
     * silhouette se pliait en un V étroit. Le fouet reste donc bas et long, où
     * il ferme la masse des anneaux par le bas, et laisse tout le ciel à la
     * membrane. C'est la composition du rendu de référence, à la lettre.
     */
    rot: Math.PI + 0.68 - ROT_ANNEAUX,
    lumiere: -0.4,
    ambiance: 2,
    periode: 4.2,
    ordreMort: 1,
    dessin: (g, kk) => {
      const L = 54 * S;
      /* Le fouet : un ruban qui s'affine sans jamais casser, et non une suite
         de tronçons. */
      const chemin: Poly = [
        pt(0, 0),
        pt(L * 0.3, -L * 0.04),
        pt(L * 0.6, -L * 0.02),
        pt(L * 0.84, L * 0.08),
        pt(L, L * 0.2),
      ];
      poser(g, kk, ruban(chemin, (t) => 15 * S * (1 - t * 0.86), { seed: 19, pas: 5 }), {
        couleur: assombrir(ecaille, 0.26),
        matiere: 'ecailles',
        matiereAlpha: 0.26,
        echelle: 0.32,
        seed: 19,
      });
      /* La POINTE : un fer de lance, pas une fourche. La vouivre du Forez finit
         en dard, et c'est le bout de la silhouette qu'on lit en dernier. */
      sous(g, L * 0.98, L * 0.19, (h) => {
        poser(h, kk, pivoterPointeVouivre(pointeLance(L * 0.3, L * 0.15)), {
          /* Un dard, pas une nageoire : le mélange de cuivre patiné passait au
             bleu-vert clair et rendait une queue de poisson. On garde l'écaille
             et on lui donne son fil d'or. */
          couleur: melanger(ecaille, LIGHT.rim, 0.26),
          matiere: 'ecailles',
          matiereAlpha: 0.24,
          echelle: 0.3,
          modele: 1.1,
          speculaire: { x: 0.3, y: 0.28, r: 0.1 },
        });
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
      anneau(g, kk, 56 * S, 38 * S, ecaille, ventre, couronnee, 23, 0.44);
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

  /*
   * LE COL EN S — le trait de la bête.
   *
   * L'articulation ne tourne plus : le S est écrit dans le repère du col, si
   * bien que le sommet ne peut plus partir en arrière. La ligne médiane creuse
   * d'abord vers l'ARRIÈRE (x négatif, la gorge se retire au-dessus des
   * épaules), puis bombe vers l'AVANT et jette la tête très en avant du
   * poitrail. Le ruban va de 26 unités d'épaisseur à l'attache à 12 à la nuque.
   */
  const COL: Poly = [
    pt(0, 0),
    pt(-11 * S, -18 * S),
    pt(-14 * S, -40 * S),
    pt(-2 * S, -58 * S),
    pt(15 * S, -68 * S),
    /* Le dernier point REMONTE : sans lui la médiane tourne toujours dans le
       même sens et ce n'est pas un S mais un C — mesuré, les quatre produits
       vectoriels de la ligne étaient tous positifs. C'est ce redressement final
       qui jette la tête haute et donne au col sa double courbure. */
    pt(28 * S, -82 * S),
  ];

  pieces.push({
    nom: 'cou',
    parent: 'corps',
    x: 26 * S,
    y: -16 * S,
    rot: 0,
    lumiere: 0.4,
    ordreMort: 6,
    dessin: (g, kk) => {
      poser(g, kk, ruban(COL, (t) => (26 - 14 * t) * S, { seed: 29, pas: 5, lissage: 2 }), {
        couleur: ecaille,
        matiere: 'ecailles',
        matiereAlpha: 0.28,
        echelle: 0.34,
        seed: 29,
      });
      /*
       * LA GORGE PÂLE, et c'est la deuxième valeur de la bête.
       *
       * Elle n'existait qu'en cinq traits de 2,6 unités posés en travers du col
       * — invisibles à la vignette, et le col rendait un tube vert uni. Or les
       * deux rendus de référence donnent à la vouivre exactement deux masses de
       * valeur : le dos vert-noir, et une COLONNE de plaques ventrales
       * ocre-fauve qui court tout le long du S dressé. C'est le contraste le plus
       * fort de l'image, et c'est ce qui fait lire un serpent — les couleuvres
       * du Forez sont bâties ainsi.
       *
       * On le peint donc comme une pièce, et non comme un trait : un second
       * ruban, décalé sur la face avant du col, large de la moitié de son
       * épaisseur, avec ses rainures en chevron. Le clair retiré aux anneaux du
       * fond revient ici, là où le rendu de référence le met.
       */
      const CHEMIN_GORGE = decalerChemin(COL, (t) => (26 - 14 * t) * S * 0.26);
      poser(g, kk, ruban(CHEMIN_GORGE, (t) => (26 - 14 * t) * S * 0.46, { seed: 31, pas: 5, lissage: 2 }), {
        couleur: ventre,
        matiere: 'ecailles',
        matiereAlpha: 0.24,
        echelle: 0.3,
        modele: 0.8,
        rim: false,
        contour: false,
        seed: 31,
      });
      /* Les plaques de la gorge : elles suivent le S, côté ventre, et c'est ce
         qui dit qu'un col se plie au lieu de se pencher. */
      for (let i = 1; i < COL.length; i += 1) {
        const a = COL[i - 1];
        const b = COL[i];
        const mx = (a.x + b.x) / 2;
        const my = (a.y + b.y) / 2;
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const n = Math.hypot(dx, dy) || 1;
        const t = (i - 0.5) / (COL.length - 1);
        const ep = (26 - 14 * t) * S;
        /* Le chevron creuse la plaque : il part du bord avant de la gorge et
           rentre vers l'axe du col. */
        const cx = mx - (dy / n) * ep * 0.26;
        const cy = my + (dx / n) * ep * 0.26;
        g.moveTo(cx - (dy / n) * ep * 0.24, cy + (dx / n) * ep * 0.24);
        g.quadraticCurveTo(cx - (dx / n) * ep * 0.12, cy - (dy / n) * ep * 0.12, cx + (dy / n) * ep * 0.24, cy - (dx / n) * ep * 0.24);
        g.stroke({ color: ombreBleutee(ventre, 0.62), width: 2.4 * S, alpha: 0.5, cap: 'round' });
      }
      /* La crête du col : elle court sur le dos du S et le rend lisible même en
         négatif, comme l'échine rend le loup lisible. */
      for (let i = 0; i < 5; i += 1) {
        const t = 0.16 + i * 0.19;
        const j = Math.min(COL.length - 2, Math.floor(t * (COL.length - 1)));
        const u = t * (COL.length - 1) - j;
        const px = COL[j].x + (COL[j + 1].x - COL[j].x) * u;
        const py = COL[j].y + (COL[j + 1].y - COL[j].y) * u;
        const dx = COL[j + 1].x - COL[j].x;
        const dy = COL[j + 1].y - COL[j].y;
        const n = Math.hypot(dx, dy) || 1;
        const h = (10 - i) * S;
        poser(g, kk, fuseau(px, py, px - (dy / n) * (11 * S + h), py + (dx / n) * (11 * S + h), 6.5 * S, { seed: i + 41, taper: 0.6 }), {
          couleur: i % 2 ? melanger(ecaille, LIGHT.rim, 0.22) : assombrir(ecaille, 0.18),
          matiere: 'ecailles',
          matiereAlpha: 0.22,
          echelle: 0.28,
          modele: 0.85,
          rim: i % 2 === 0,
        });
      }
    },
  });

  pieces.push({
    nom: 'tete',
    parent: 'cou',
    x: 28 * S,
    y: -82 * S,
    rot: 0.22,
    lumiere: 0.6,
    ordreMort: 10,
    dessin: (g, kk) => teteVouivre(g, kk, 31 * S, couronnee, 31),
  });

  pieces.push({
    nom: 'machoire',
    parent: 'tete',
    x: 7 * S,
    y: 5 * S,
    /*
     * LA GUEULE OUVERTE, au repos.
     *
     * Les deux rendus de référence montrent la même chose et c'est le trait de
     * tête le plus fort de la bête : la mâchoire décrochée, la langue dehors, la
     * denture visible. Fermée, la tête de la vouivre est une amande verte de
     * quinze pixels qu'on ne distingue pas de la pointe d'un anneau ; ouverte,
     * elle porte un angle et un intérieur sombre, et c'est ce contraste-là qui
     * survit à la réduction.
     *
     * La rotation est posée sur la POSE DE REPOS de l'articulation, pas dans le
     * dessin : les pistes de `clipsSerpent` ajoutent leur valeur au repos
     * (`j.rotation = j.repos.rot + v`), si bien que la morsure de l'attaque et
     * le souffle de la capacité continuent de refermer puis rouvrir la gueule
     * exactement comme avant, un cran plus bas.
     */
    rot: 0.34,
    lumiere: -0.2,
    ordreMort: 10,
    dessin: (g, kk) => {
      const Sc = 31 * S;
      poser(g, kk, lisser(perturber(densifier([pt(-Sc * 0.3, 0), pt(Sc * 1.0, Sc * 0.06), pt(Sc * 0.9, Sc * 0.28), pt(-Sc * 0.28, Sc * 0.26)], Sc * 0.16), Sc * 0.014, 7), 1), {
        couleur: assombrir(ecaille, 0.26),
        matiere: 'ecailles',
        matiereAlpha: 0.26,
        echelle: 0.3,
      });
      /* La LANGUE : le seul rouge de la bête avec l'escarboucle, et le repère
         qui dit « gueule » plutôt que « fente ». Elle sort par-dessus la
         mandibule et se recourbe. */
      poser(
        g,
        kk,
        ruban(
          [pt(Sc * 0.24, Sc * 0.02), pt(Sc * 0.66, -Sc * 0.04), pt(Sc * 1.02, -Sc * 0.02), pt(Sc * 1.26, -Sc * 0.16)],
          (t) => Sc * 0.15 * (1 - t * 0.7),
          { seed: 43, pas: 4 },
        ),
        {
          couleur: melanger(0x8c2230, BOIS, 0.28),
          matiere: 'grain',
          matiereAlpha: 0.16,
          echelle: 0.3,
          modele: 0.9,
          contour: false,
        },
      );
      for (let i = 0; i < 4; i += 1) {
        g.poly(flat(fuseau(Sc * (0.06 + i * 0.22), Sc * 0.02, Sc * (0.06 + i * 0.22), -Sc * 0.22, Sc * 0.085, { seed: i }))).fill({
          color: melanger(PIERRE_CLAIRE, LIGHT.chaude, 0.3),
          alpha: 0.92,
        });
      }
    },
  });

  /*
   * L'aile PROCHE : 150 × 90.
   *
   * Elle a valu 104 × 64 — elle avalait le serpent —, puis 84 × 50, et c'est
   * cette deuxième valeur qui a rendu la vouivre petite. Le raisonnement d'alors
   * était juste sur un point et faux sur l'autre : une aile ne doit pas COUVRIR
   * la bête, mais elle doit la DÉPASSER. Le Griffon de Pamole, deux cases plus
   * loin sur la planche, tient toute sa vignette parce que son envergure sort du
   * gabarit de son corps ; la vouivre repliait la sienne derrière sa nuque et
   * lisait comme un rang trois.
   *
   * Cent cinquante d'envergure pour un serpent long de deux cent trente : le
   * bout du grand doigt monte au-dessus de la tête et s'en va chercher le coin
   * haut-gauche de la case, que la queue a justement libéré. Le S se lit
   * toujours en premier — la membrane s'ouvre DERRIÈRE lui, à contre-jour.
   */
  pieces.push({
    nom: 'aile_g',
    parent: 'corps',
    /* Accrochée HAUT sur l'épaule et ouverte vers l'arrière : posée au milieu
       du flanc, elle retombait sur les anneaux et il ne restait du serpent
       qu'une bosse sous une bâche. La membrane travaille au-dessus du corps,
       jamais devant. */
    x: 2 * S,
    y: -26 * S,
    /* Bord d'attaque relevé vers l'ARRIÈRE et le HAUT : la membrane retombe
       alors dans le creux entre le col et la queue, qui était vide, au lieu de
       s'étaler sur les anneaux. C'est la composition autant que l'anatomie. */
    rot: 1.05,
    lumiere: 0.9,
    ordreMort: 5,
    dessin: (g, kk) => aileVouivre(g, kk, 146 * S, 88 * S, ecaille, couronnee, -1, 5, 1.05),
  });

  return pieces;
}

/** Retourne la pointe de lance vers l'arrière : `pointeLance` pointe vers −y. */
function pivoterPointeVouivre(poly: Poly): Poly {
  return poly.map((q) => pt(-q.y, q.x));
}

/**
 * Décale une ligne médiane OUVERTE le long de sa normale droite.
 *
 * `ruban` sait poser de l'épaisseur autour d'un chemin, mais pas peindre une
 * bande le long d'un de ses bords : il fallait donc une seconde médiane,
 * parallèle à la première. C'est ce qui donne à la vouivre sa colonne de
 * plaques ventrales sur le col dressé — la bande claire qui court sur la face
 * AVANT du S, pas au milieu.
 *
 * `decalage(t)` est compté positif vers la droite du sens de parcours ; sur un
 * col qui monte, la droite est la gorge.
 *
 * NOTE : cette fonction a vocation à remonter dans `archetypes.ts` auprès de
 * `ruban` une fois le chantier des vouivres et celui du granit refermés — deux
 * agents y travaillent en parallèle et le fichier ne doit pas bouger sous eux.
 */
function decalerChemin(chemin: Poly, decalage: (t: number) => number): Poly {
  const n = chemin.length;
  if (n < 2) return chemin;
  return chemin.map((q, i) => {
    const a = chemin[Math.max(0, i - 1)];
    const b = chemin[Math.min(n - 1, i + 1)];
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const len = Math.hypot(dx, dy) || 1;
    const d = decalage(i / (n - 1));
    return pt(q.x - (dy / len) * d, q.y + (dx / len) * d);
  });
}

/**
 * Anneau du corps de la vouivre : dos écailleux, ventre à plaques claires.
 *
 * `ventreForce` dose la bande ventrale, de 1 sous le poitrail à 0 sous la
 * queue. **Pourquoi la doser plutôt que la poser partout.** Elle l'était, à
 * pleine valeur sur les quatre anneaux et sur le tronc : la planche de contact
 * rendait alors cinq galets pâles enfilés en rang, tous de la même taille,
 * tous du même clair — une chenille, et le mot est celui qui vient. Un serpent
 * lové ne montre son ventre que là où il se DRESSE ; les anneaux du fond
 * tournent leur dos au regard, et le rendu de référence les peint sombres,
 * ourlés d'or, sans une plaque claire. Diminuer la bande vers l'arrière fait
 * donc deux choses d'un coup : elle rend la profondeur, et elle rend la
 * décroissance visible, puisque le clair ne vient plus égaliser toutes les
 * masses.
 */
function anneau(
  g: Graphics,
  k: Kit,
  L: number,
  h: number,
  dos: number,
  ventre: number,
  couronnee: boolean,
  seed: number,
  ventreForce = 1,
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
  /* Trois ailerons par anneau, larges et bas — et non cinq hauts et étroits.
     Quatre anneaux plus la queue en font une vingtaine à l'écran : à cinq par
     anneau, cernés chacun, ils rendaient un buisson d'épines le long du dos, ce
     que montrait la capture. Trois qui se RECOUVRENT font une frange. */
  const AILERONS = 3;
  for (let i = 0; i < AILERONS; i += 1) {
    const t = i / (AILERONS - 1);
    const x = -L * 0.32 + t * L * 0.64;
    /* Les plus hauts au milieu de l'anneau : une frange, pas une scie. */
    const haut = h * (0.44 + 0.24 * Math.sin(t * Math.PI));
    poser(g, k, fuseau(x, -h * 0.34, x - L * 0.05, -haut, h * 0.28, { seed: seed + i * 5, taper: 0.44 }), {
      couleur: i % 2 ? melanger(dos, LIGHT.rim, 0.22) : assombrir(dos, 0.16),
      matiere: 'ecailles',
      matiereAlpha: 0.22,
      echelle: 0.3,
      modele: 0.85,
      rim: i % 2 === 0,
      contour: false,
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

  /*
   * Le VENTRE : une seule bande continue, et les plaques dites au trait.
   *
   * Cinq polygones clairs cousus côte à côte sous chaque anneau, cerclés chacun
   * du contour de la loi n°6 : mis bout à bout sur quatre anneaux et une queue,
   * cela faisait vingt-cinq jetons turquoise enfilés sous la bête — un collier
   * de perles, ou une chenille. Mesuré deux fois sur capture, et ni la teinte ni
   * le contour ne suffisaient à le défaire, parce que le défaut n'était pas là :
   * il était dans le DÉCOUPAGE. Un ventre de couleuvre est une bande d'un seul
   * tenant, et les plaques ne s'y lisent qu'aux rainures qui les séparent.
   */
  if (ventreForce > 0.02) {
    /* La bande se retire vers le haut à mesure que la force baisse : à 0,15 il
       n'en reste qu'un liséré clair au bas du flanc, ce que montre un anneau vu
       de dos. */
    const hb = 0.06 + 0.4 * ventreForce;
    const bande = lisser(
      perturber(
        densifier(
          [
            pt(-L * 0.4, h * (0.5 - hb)),
            pt(0, h * (0.46 - hb)),
            pt(L * 0.4, h * (0.52 - hb)),
            pt(L * 0.38, h * 0.44),
            pt(0, h * 0.52),
            pt(-L * 0.38, h * 0.42),
          ],
          h * 0.18,
        ),
        h * 0.012,
        seed + 3,
      ),
      1,
    );
    poser(g, k, bande, {
      couleur: melanger(dos, ventre, 0.35 + 0.65 * ventreForce),
      matiere: 'ecailles',
      matiereAlpha: 0.22,
      echelle: 0.3,
      modele: 0.7,
      rim: false,
      contour: false,
    });
    for (let i = 1; i < 5; i += 1) {
      const x = -L * 0.3 + (i / 5) * L * 0.6;
      g.moveTo(x, h * (0.52 - hb));
      g.quadraticCurveTo(x + L * 0.01, h * 0.3, x - L * 0.005, h * 0.46);
      g.stroke({
        color: ombreBleutee(ventre, 0.6),
        width: Math.max(0.8, h * 0.03),
        alpha: 0.42 * (0.4 + 0.6 * ventreForce),
        cap: 'round',
      });
    }
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

/**
 * Aile de CHAUVE-SOURIS : une membrane tendue sur des doigts, et non une palme.
 *
 * ─── Ce que l'ancienne coûtait, vu sur la capture ───
 *
 * C'était un unique polygone plein, sur lequel on posait quatre fuseaux à peine
 * plus sombres que lui (0,24 d'écart) et quatre taches chaudes à 14 %
 * d'opacité. À l'écran, la seule chose lisible était la MASSE : une bâche verte
 * accrochée au serpent, sans un doigt visible, sans un feston franc — et comme
 * elle mesurait davantage que le corps, c'était tout ce qu'on voyait de la
 * bête. `ailePlumee` a déjà eu ce diagnostic et cette correction : une aile ne
 * se lit pas à sa surface, elle se lit à sa CHARPENTE.
 *
 * On construit donc dans l'ordre inverse de l'ancien :
 *
 *  1. les **quatre travées de membrane** d'abord, une par intervalle entre deux
 *     doigts, chacune franchement creusée en arc de cercle rentrant. C'est ce
 *     creux — le feston — qui dit « peau tendue » ; posé en découpe sur un
 *     polygone unique, il se perdait dans le lissage ;
 *  2. les **doigts** ensuite, par-dessus les jointures, en os clair : quatre
 *     rayons qui partent tous du poignet et s'ouvrent en éventail ;
 *  3. le **bras d'aile** — humérus et avant-bras — le long du bord d'attaque,
 *     plus épais, qui donne à l'aile son point d'accroche ;
 *  4. la **griffe du pouce** au poignet, courte et claire : le détail qui
 *     achève la lecture « chauve-souris » plutôt que « voile ».
 *
 * Les travées alternent deux valeurs et sont plus claires que les doigts : sans
 * cet écart la charpente ne ressort pas.
 *
 * ─── Le deuxième défaut, celui du RANG ───
 *
 * La charpente une fois juste, il restait qu'à côté du Griffon de Pamole — qui
 * remplit sa vignette d'une envergure franche — la vouivre montrait deux
 * timbres-postes accrochés à sa nuque : 84 × 50 pour un corps de 236 de large.
 * Une aile qui ne dépasse pas la bête ne se lit pas comme une aile ; elle se lit
 * comme une nageoire dorsale. L'envergure est donc portée à 150 × 90, l'éventail
 * s'ouvre plus large, et trois pièces neuves achèvent la lecture à la vignette :
 * une **griffe** au bout de chaque doigt, le **fil d'or du bord d'attaque** de
 * l'épaule au grand doigt, et les **franges de mousse** pendues au bord de fuite.
 */
function aileVouivre(
  g: Graphics,
  k: Kit,
  E: number,
  C: number,
  couleur: number,
  couronnee: boolean,
  sens: 1 | -1,
  seed: number,
  /**
   * Rotation de l'articulation qui porte l'aile, en radians. Elle ne sert qu'aux
   * franges : elles doivent tomber vers le BAS DU MONDE, et l'aile ne le connaît
   * pas depuis son propre repère. Sans elle, les mèches du bord de fuite
   * partaient perpendiculairement à la membrane et flottaient, détachées, au
   * coin haut-gauche de la case — mesuré à l'export de géométrie.
   */
  rotJoint = 0,
): void {
  const DOIGTS = 4;
  /** Le poignet : d'où part l'éventail des doigts, aux deux cinquièmes du bras. */
  const px = sens * E * 0.42;
  const py = -C * 0.16;
  /**
   * Pointe du doigt `i`, en coordonnées polaires depuis le POIGNET : c'est la
   * seule écriture qui garantisse un éventail. Décrit en cartésien, l'éventail
   * se referme dès qu'on touche une constante — au premier essai les quatre
   * pointes tenaient dans 0,43 C de hauteur pour 0,50 E de largeur, et l'aile
   * rendait une lame, pas une membrane. Le doigt 0 tombe presque à la
   * verticale contre le corps, le doigt 3 prolonge le bras : entre les deux,
   * l'ouverture.
   *
   * L'éventail s'ouvre plus large qu'avant — 1,75 à 0,34 radian au lieu de
   * 1,83 à 0,38, et des rayons de 1,00 à 1,30 C au lieu de 1,05 à 1,25. Ce
   * n'est pas un réglage de confort : c'est ce qui, joint à l'envergure du
   * rang sept, fait que la membrane SORT du gabarit du serpent au lieu de se
   * ranger derrière lui.
   */
  const ANGLES = [1.75, 1.3, 0.86, 0.34] as const;
  const RAYONS = [1.0, 1.14, 1.24, 1.3] as const;
  const bout = (i: number): Pt =>
    pt(px + sens * Math.cos(ANGLES[i]) * C * RAYONS[i], py + Math.sin(ANGLES[i]) * C * RAYONS[i]);
  /** Attache de la membrane au corps, sous l'aisselle de l'aile. */
  const flanc = pt(0, C * 0.5);

  const membrane = melanger(couleur, LIGHT.chaude, 0.14);
  const os = melanger(assombrir(couleur, 0.34), PIERRE_CLAIRE, 0.18);

  /* 1 — les travées, du corps vers le bout de l'aile. */
  for (let i = 0; i <= DOIGTS; i += 1) {
    const a = i === 0 ? flanc : bout(i - 1);
    const b = i === DOIGTS ? pt(px + sens * E * 0.08, py - C * 0.08) : bout(i);
    /* Le feston : le milieu de la corde rentre vers le poignet d'un tiers de sa
       longueur. C'est l'arc creux d'une peau tendue entre deux baguettes. */
    const mx = (a.x + b.x) / 2;
    const my = (a.y + b.y) / 2;
    const creux = 0.4;
    const travee: Poly = lisser(
      perturber(
        [
          pt(px, py),
          a,
          pt(a.x + (mx - a.x) * 0.5 + (px - mx) * creux * 0.6, a.y + (my - a.y) * 0.5 + (py - my) * creux * 0.6),
          pt(mx + (px - mx) * creux, my + (py - my) * creux),
          pt(b.x + (mx - b.x) * 0.5 + (px - mx) * creux * 0.6, b.y + (my - b.y) * 0.5 + (py - my) * creux * 0.6),
          b,
        ],
        C * 0.012,
        seed + i * 7,
      ),
      1,
    );
    poser(g, k, travee, {
      couleur: i % 2 ? membrane : assombrir(membrane, 0.14),
      matiere: 'ecailles',
      matiereAlpha: 0.2,
      echelle: 0.5,
      modele: 0.95,
      rim: i % 2 === 1,
      seed: seed + i,
    });
  }

  /* 2 — les doigts, en os clair, par-dessus les jointures. */
  for (let i = 0; i < DOIGTS; i += 1) {
    const b = bout(i);
    poser(g, k, fuseau(px, py, b.x, b.y, C * (0.1 - i * 0.008), { seed: seed + i * 3 + 1, taper: 0.78 }), {
      couleur: i % 2 ? os : assombrir(os, 0.14),
      matiere: 'granit',
      matiereAlpha: 0.18,
      echelle: 0.3,
      modele: 1,
      rim: true,
    });
    /*
     * La GRIFFE au bout de chaque doigt, et non plus une perle d'or sur la
     * seule couronnée. Le bord de fuite d'une aile de vouivre est une suite de
     * pointes, pas un feston lisse : ce sont ces quatre dards qui donnent à la
     * silhouette ses angles et qui la distinguent, en négatif, du plumage arrondi
     * du Griffon de Pamole, l'autre rang sept de la planche.
     */
    const versExt = pt(b.x - px, b.y - py);
    const nExt = Math.hypot(versExt.x, versExt.y) || 1;
    poser(
      g,
      k,
      fuseau(
        b.x - (versExt.x / nExt) * C * 0.1,
        b.y - (versExt.y / nExt) * C * 0.1,
        b.x + (versExt.x / nExt) * C * 0.13,
        b.y + (versExt.y / nExt) * C * 0.13,
        C * 0.062,
        { seed: seed + i * 7 + 3, taper: 0.9 },
      ),
      {
        couleur: melanger(PIERRE_CLAIRE, couronnee ? LIGHT.rim : MOUSSE, 0.3),
        matiere: 'granit',
        matiereAlpha: 0.16,
        echelle: 0.26,
        modele: 1,
        contour: false,
      },
    );
  }

  /* 3 — le bras de l'aile, le long du bord d'attaque. */
  poser(g, k, fuseau(0, C * 0.1, px, py, C * 0.24, { seed: seed + 31, taper: 0.4 }), {
    couleur: assombrir(couleur, 0.22),
    matiere: 'ecailles',
    matiereAlpha: 0.24,
    echelle: 0.34,
    modele: 1,
  });
  /*
   * Le fil d'or du BORD D'ATTAQUE : de l'épaule au poignet, puis jusqu'au bout
   * du grand doigt. C'est la ligne la plus longue de la bête, et la seule
   * lumière franche que la vignette lui donne à lire. Sans elle, la membrane
   * neuve n'était qu'une masse sombre de plus.
   */
  {
    const b3 = bout(DOIGTS - 1);
    g.moveTo(0, C * 0.1);
    g.quadraticCurveTo(px * 0.62, py - C * 0.12, px, py);
    g.lineTo(b3.x, b3.y);
    g.stroke({
      color: melanger(LIGHT.rim, LIGHT.chaude, couronnee ? 0.42 : 0.2),
      width: Math.max(1, C * 0.045),
      alpha: 0.72,
      cap: 'round',
      join: 'round',
    });
  }

  /*
   * Les FRANGES de mousse, pendues au bord de fuite.
   *
   * Les deux rendus de référence de la vouivre les montrent partout — des
   * mèches vertes qui s'égouttent de l'aile, du menton, de la crête : c'est une
   * bête de rivière, elle sort de la Durolle et elle en rapporte l'herbe. À la
   * vignette elles font davantage que du détail : elles cassent le bord de fuite
   * en dents molles et empêchent la membrane de se lire comme une bâche coupée
   * aux ciseaux.
   */
  /** Le bas du monde, ramené dans le repère de l'aile. */
  const basX = Math.sin(rotJoint);
  const basY = Math.cos(rotJoint);
  for (let i = 0; i < 5; i += 1) {
    /* Seulement sur la MOITIÉ BASSE du bord de fuite : au-delà, l'arête tourne
       vers le ciel et une mèche qui y pend traverse la membrane. */
    const t = 0.05 + i * 0.115;
    const j = Math.min(DOIGTS - 1, Math.floor(t * DOIGTS));
    const a = j === 0 ? flanc : bout(j - 1);
    const b = bout(j);
    const u = t * DOIGTS - j;
    /* La mèche s'accroche au FESTON, pas à la corde : la travée creuse vers le
       poignet d'un tiers de sa longueur, et une mèche posée sur la corde partait
       donc d'un point situé hors de la membrane — cinq gouttes détachées,
       flottant à côté de l'aile, relevées à l'export de géométrie. */
    const cx = a.x + (b.x - a.x) * u;
    const cy = a.y + (b.y - a.y) * u;
    const rentre = 0.4 * Math.sin(Math.PI * u) + 0.06;
    const bx = cx + (px - cx) * rentre;
    const by = cy + (py - cy) * rentre;
    const l = C * (0.16 + 0.1 * Math.sin(i * 1.7 + seed));
    poser(g, k, fuseau(bx, by, bx + basX * l, by + basY * l, C * 0.07, { seed: seed + i * 11, taper: 0.82 }), {
      couleur: i % 2 ? melanger(MOUSSE, SAUGE, 0.5) : melanger(MOUSSE, couleur, 0.4),
      matiere: 'fourrure',
      matiereAlpha: 0.28,
      echelle: 0.26,
      modele: 0.8,
      rim: i % 2 === 0,
      contour: false,
    });
  }

  /* 4 — la griffe du pouce, au poignet. */
  poser(
    g,
    k,
    fuseau(px, py, px + sens * C * 0.1, py - C * 0.3, C * 0.075, { seed: seed + 37, taper: 0.86 }),
    {
      couleur: melanger(PIERRE_CLAIRE, couronnee ? LIGHT.rim : MOUSSE, 0.34),
      matiere: 'granit',
      matiereAlpha: 0.18,
      echelle: 0.28,
      modele: 1,
      speculaire: { x: 0.3, y: 0.26, r: 0.12 },
    },
  );
}

const vouivre: Fabrique = (k) =>
  creatureRig(
    /* Hauteur et emprise recalées sur la bête POSÉE : le corps descend
       désormais au sol, l'ombre n'a plus à couvrir le vide qu'il y avait
       dessous. Mesuré, la boîte du rig passe de 304 × 292 à 324 × 337 pour une
       encre qui passe de 236 × 151 à 270 × 233 — le taux de remplissage double
       presque, de 41 % à 58 %, et c'est cela qu'on voit dans la case. */
    { hauteur: 104, empriseSol: 62, respiration: 'tronc', graine: k.seed + 32, teinteMort: CUIVRE },
    vouivrePieces(k, false),
    k,
    (r) => {
      clipsSerpent(r, { allonge: 1.3 });
      clipCapacite(r, 'souffle');
    },
  );

const vouivreCouronnee: Fabrique = (k) =>
  creatureRig(
    { hauteur: 116, empriseSol: 70, respiration: 'tronc', graine: k.seed + 33, teinteMort: LIGHT.rim },
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
