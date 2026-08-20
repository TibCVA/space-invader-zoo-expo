/**
 * Les quatorze formes de la Châtellenie de Granit.
 *
 * Palette de faction : grenat `#6E1F2A`, or ancien `#C9A227`, ardoise `#414A52`,
 * ivoire `#EDE3CE`, brun de chêne `#5A4128`, ocre `#C08A3E`.
 *
 * Règle de silhouette : à 64 px, chaque forme doit se reconnaître en noir.
 *   Manant        — dos rond, chapeau de paille très large, fourche courte
 *   Franc-Serf    — vertical, pique haute, chapel de fer à bord
 *   Gabelou       — cape courte, bâton en diagonale, chapeau ciré
 *   Prévôt du Sel — masse basse, bourdon planté, trousseau de clefs
 *   Arbalétrier   — barre horizontale de l'arbalète, pavois dans le dos
 *   Maître-Arb.   — pavois blasonné plus haut, cranequin, carquois en éventail
 *   Grenadière    — jupe en cloche, cercle à broder tenu devant
 *   Dame au Fil   — robe à traîne, hampe brodée, coiffe haute
 *   Sanglier      — masse horizontale basse, groin et défenses
 *   Verrat        — même masse, chanfrein ferré et dossière à pointes
 *   Chevalier     — cheval + lance couchée en longue diagonale
 *   Banneret      — cheval + grande bannière verticale
 *   Griffon       — arc d'ailes déployées, bec crochu
 *   Griffon Cour. — ailes plus larges, collier d'or, crête blanche
 */
import type { Graphics } from 'pixi.js';
import { LIGHT, assombrir, eclaircir, melanger, ombreBleutee } from '../palette.js';
import type { Poly } from '../shading.js';
import { blob, densifier, flat, fuseau, lisser, perturber, pt } from '../shading.js';
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
  ecu,
  fer,
  ferrure,
  hampe,
  main,
  membre,
  orfevrerie,
  pied,
  pointeLance,
  poser,
  queue as dessinerQueue,
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

function chapeauPaille(g: Graphics, k: Kit, r: number, seed: number): void {
  const paille = 0xc9a86a;
  const bord: Poly = lisser(
    perturber(
      densifier(
        [
          pt(-r * 2.25, -r * 0.44),
          pt(-r * 1.1, -r * 0.8),
          pt(0, -r * 0.9),
          pt(r * 1.15, -r * 0.76),
          pt(r * 2.3, -r * 0.38),
          pt(r * 1.5, -r * 0.08),
          pt(0, r * 0.06),
          pt(-r * 1.55, -r * 0.1),
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
      densifier([pt(-r * 0.95, -r * 0.54), pt(-r * 0.5, -r * 1.3), pt(r * 0.34, -r * 1.38), pt(r * 0.95, -r * 0.64)], r * 0.3),
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
  for (let i = 0; i < 5; i += 1) {
    const t = -2.2 + i * 0.42;
    g.moveTo(Math.cos(t) * r * 0.9, -r * 0.7 + Math.sin(t) * r * 0.2);
    g.quadraticCurveTo(Math.cos(t) * r * 1.6, -r * 0.6, Math.cos(t) * r * 2.05, -r * 0.3);
    g.stroke({ color: ombreBleutee(paille, 0.5), width: r * 0.06, alpha: 0.4 });
  }
}

/** Chapel de fer : calotte bombée et bord rabattu, riveté. */
function chapelDeFer(g: Graphics, k: Kit, r: number, seed: number, dore = false): void {
  const bord = lisser(
    perturber(
      densifier(
        [pt(-r * 1.6, -r * 0.62), pt(0, -r * 0.86), pt(r * 1.62, -r * 0.58), pt(r * 1.2, -r * 0.32), pt(0, -r * 0.2), pt(-r * 1.24, -r * 0.34)],
        r * 0.34,
      ),
      r * 0.03,
      seed + 2,
    ),
    1,
  );
  const calotte = lisser(
    perturber(
      densifier([pt(-r * 1.02, -r * 0.6), pt(-r * 0.62, -r * 1.3), pt(0, -r * 1.5), pt(r * 0.66, -r * 1.28), pt(r * 1.04, -r * 0.58)], r * 0.28),
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
  g.moveTo(0, -r * 1.48);
  g.lineTo(0, -r * 0.6);
  g.stroke({ color: eclaircir(ACIER, 0.4), width: r * 0.08, alpha: 0.6, cap: 'round' });
  for (const dx of [-0.72, 0.7]) {
    g.poly(flat(blob(dx * r, -r * 0.72, r * 0.09, r * 0.09, { seed: 3, points: 8, wobble: 0.24 }))).fill({
      color: dore ? LIGHT.rim : eclaircir(ACIER, 0.3),
      alpha: 0.85,
    });
  }
  if (dore) {
    orfevrerie(g, [pt(-r * 1.5, -r * 0.5), pt(0, -r * 0.74), pt(r * 1.52, -r * 0.46)], { epaisseur: r * 0.11 });
  }
}

/** Chapeau ciré du gabelou : bord souple, cordon, cocarde de la gabelle. */
function chapeauCire(g: Graphics, k: Kit, r: number, seed: number, cocarde: number): void {
  const noirci = melanger(CHENE, 0x2a3242, 0.6);
  const bord = lisser(
    perturber(
      densifier(
        [pt(-r * 1.75, -r * 0.52), pt(-r * 0.8, -r * 0.9), pt(r * 0.9, -r * 0.82), pt(r * 1.8, -r * 0.38), pt(r * 0.9, -r * 0.12), pt(-r * 0.9, -r * 0.16)],
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
      densifier([pt(-r * 0.92, -r * 0.6), pt(-r * 0.78, -r * 1.42), pt(r * 0.5, -r * 1.5), pt(r * 0.94, -r * 0.62)], r * 0.28),
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
  g.moveTo(-r * 0.94, -r * 0.72);
  g.lineTo(r * 0.96, -r * 0.7);
  g.stroke({ color: 0x6e1f2a, width: r * 0.16, alpha: 0.85, cap: 'round' });
  g.poly(flat(blob(-r * 0.82, -r * 0.78, r * 0.2, r * 0.2, { seed: 7, points: 10, wobble: 0.26 }))).fill({
    color: cocarde,
    alpha: 0.95,
  });
}

/** Coiffe de lin des brodeuses : bandeau, voile court, épingle d'or. */
function coiffeLin(g: Graphics, k: Kit, r: number, seed: number, or = false): void {
  const forme = lisser(
    perturber(
      densifier(
        [
          pt(-r * 1.12, -r * 0.2),
          pt(-r * 1.0, -r * 1.06),
          pt(-r * 0.2, -r * 1.34),
          pt(r * 0.68, -r * 1.16),
          pt(r * 1.1, -r * 0.42),
          pt(r * 1.18, r * 0.62),
          pt(r * 0.6, r * 0.5),
          pt(r * 0.5, -r * 0.3),
          pt(-r * 0.52, -r * 0.42),
          pt(-r * 0.68, r * 0.56),
          pt(-r * 1.2, r * 0.7),
        ],
        r * 0.34,
      ),
      r * 0.035,
      seed + 11,
    ),
    1,
  );
  poser(g, k, forme, { couleur: IVOIRE, matiere: 'tissu', matiereAlpha: 0.24, echelle: 0.5, seed });
  if (or) {
    orfevrerie(g, [pt(-r * 1.02, -r * 0.5), pt(-r * 0.3, -r * 1.16), pt(r * 0.6, -r * 1.0), pt(r * 1.04, -r * 0.44)], {
      epaisseur: r * 0.12,
    });
    g.poly(flat(blob(-r * 0.2, -r * 1.2, r * 0.14, r * 0.14, { seed: 5, points: 9, wobble: 0.24 }))).fill({
      color: LIGHT.rim,
      alpha: 0.95,
    });
  }
}

/* ─────────────────────────── Armes de la faction ────────────────────────── */

function arbalete(g: Graphics, k: Kit, L: number, seed: number, maitre: boolean): void {
  // fût horizontal
  const fut = lisser(
    perturber(
      densifier([pt(-L * 0.34, -L * 0.05), pt(L * 0.5, -L * 0.055), pt(L * 0.52, L * 0.03), pt(-L * 0.36, L * 0.045)], L * 0.14),
      L * 0.008,
      seed,
    ),
    1,
  );
  poser(g, k, fut, { couleur: CHENE, matiere: 'ecorce', matiereAlpha: 0.26, echelle: 0.3, seed });
  // arc d'acier, courbé, jamais symétrique parfait
  const arc: Poly = [];
  const dos: Poly = [];
  for (let i = 0; i <= 12; i += 1) {
    const t = i / 12;
    const y = (t - 0.5) * L * 1.18;
    const x = L * 0.42 + Math.cos((t - 0.5) * 2.1) * L * 0.12 - L * 0.1;
    const w = L * 0.03 * (1 - Math.abs(t - 0.5) * 1.1);
    arc.push(pt(x - w, y));
    dos.push(pt(x + w, y));
  }
  dos.reverse();
  poser(g, k, [...arc, ...dos], {
    couleur: maitre ? melanger(ACIER, LIGHT.rim, 0.2) : ACIER,
    matiere: 'metal',
    matiereAlpha: 0.24,
    echelle: 0.35,
    speculaire: { x: 0.3, y: 0.3, r: 0.06 },
    seed: seed + 1,
  });
  // corde
  g.moveTo(L * 0.32, -L * 0.58);
  g.quadraticCurveTo(-L * 0.06, 0, L * 0.32, L * 0.58);
  g.stroke({ color: melanger(IVOIRE, CHENE, 0.4), width: L * 0.022, alpha: 0.85 });
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

/** Pavois : grand bouclier de siège, blasonné. */
function pavois(g: Graphics, k: Kit, w: number, h: number, seed: number, blason: boolean): void {
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
    couleur: blason ? k.pal.primaire : melanger(CHENE, IVOIRE, 0.28),
    matiere: blason ? 'tissu' : 'ecorce',
    matiereAlpha: 0.24,
    echelle: 0.5,
    seed,
  });
  // arête centrale du pavois
  g.moveTo(0, -h * 0.5);
  g.lineTo(0, h * 0.5);
  g.stroke({ color: blason ? LIGHT.rim : assombrir(CHENE, 0.34), width: w * 0.055, alpha: 0.75 });
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

const manant: Fabrique = (k) => {
  const H = 92;
  const tunique = melanger(k.pal.sombre, 0xa08a5e, 0.4);
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
      visage: { age: 0.45, sourcils: 0.2, barbe: 0.32, barbeCouleur: 0x6b5433 },
      cheveux: { couleur: 0x6b5433, longueur: 0.6, volume: 0.9 },
      coiffe: (g, kk) => chapeauPaille(g, kk, H * 0.086, k.seed + 5),
      surTorse: (g) => {
        const patch = perturber(
          densifier([pt(-H * 0.1, -H * 0.17), pt(-H * 0.02, -H * 0.19), pt(-H * 0.01, -H * 0.08), pt(-H * 0.11, -H * 0.06)], 5),
          0.6,
          41,
        );
        g.poly(flat(patch)).fill({ color: melanger(tunique, 0x8a7a52, 0.5), alpha: 0.7 });
        g.poly(flat(patch), true).stroke({ color: assombrir(tunique, 0.34), width: 0.9, alpha: 0.6 });
      },
      arme: (g, kk) => {
        hampe(g, kk, pt(0, H * 0.12), pt(-H * 0.03, -H * 0.4), H * 0.026, 0x6b5433, 2);
        sous(g, -H * 0.03, -H * 0.4, (h) => {
          for (const dx of [-1, 0, 1]) {
            fer(h, kk, fuseau(dx * H * 0.028, 0, dx * H * 0.05, -H * 0.1, H * 0.017, { seed: dx + 4, taper: 0.6 }), ACIER);
          }
          fer(h, kk, perturber(densifier([pt(-H * 0.05, 0), pt(H * 0.05, 0), pt(H * 0.04, H * 0.026), pt(-H * 0.04, H * 0.026)], 5), 0.5, 9), assombrir(ACIER, 0.2));
        });
      },
      armeAncre: { rot: 0.4 },
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
      visage: { sourcils: 0.5, age: 0.2 },
      cheveux: { couleur: 0x4a3a24, longueur: 0.4, volume: 0.85 },
      coiffe: (g, kk) => chapelDeFer(g, kk, H * 0.086, k.seed + 6),
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
        hampe(g, kk, pt(0, H * 0.18), pt(0, -H * 0.72), H * 0.024, CHENE, 5);
        sous(g, 0, -H * 0.72, (h) => fer(h, kk, pointeLance(H * 0.13, H * 0.05), ACIER));
        sous(g, 0, -H * 0.6, (h) => {
          h.moveTo(-H * 0.02, 0);
          h.lineTo(H * 0.02, 0);
          h.stroke({ color: LIGHT.rim, width: H * 0.012, alpha: 0.7 });
        });
      },
      armeAncre: { rot: 0.05 },
    }),
    k,
    (r) => {
      clipsBipede(r, { foulee: 1, allonge: 0.9 });
      clipCapacite(r, 'levee');
    },
  );
};

/* ───────────────────────── Rang 2 — gabelle ─────────────────────────────── */

const gabelou: Fabrique = (k) => {
  const H = 98;
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
      visage: { sourcils: 0.7, age: 0.35, barbe: 0.18, barbeCouleur: 0x3a2f1e },
      cheveux: { couleur: 0x3a2f1e, longueur: 0.5, volume: 0.9 },
      cape: { couleur: k.pal.primaire, w: H * 0.32, h: H * 0.3 },
      coiffe: (g, kk) => chapeauCire(g, kk, H * 0.086, k.seed + 7, LIGHT.rim),
      surTorse: (g, kk) => {
        // bourse à sel et mesure de fer-blanc
        sous(g, H * 0.085, -H * 0.02, (h) => {
          poser(h, kk, blob(0, 0, H * 0.036, H * 0.042, { seed: 6, points: 13, wobble: 0.2 }), {
            couleur: melanger(IVOIRE, CHENE, 0.35),
            matiere: 'tissu',
            matiereAlpha: 0.26,
            echelle: 0.4,
          });
          h.moveTo(-H * 0.024, -H * 0.03);
          h.quadraticCurveTo(0, -H * 0.05, H * 0.024, -H * 0.03);
          h.stroke({ color: CHENE, width: H * 0.009, alpha: 0.8 });
        });
        sous(g, -H * 0.085, -H * 0.04, (h) =>
          poser(h, kk, perturber(densifier([pt(-H * 0.022, -H * 0.028), pt(H * 0.022, -H * 0.03), pt(H * 0.019, H * 0.028), pt(-H * 0.02, H * 0.026)], 4), 0.5, 12), {
            couleur: ACIER,
            matiere: 'metal',
            matiereAlpha: 0.24,
            speculaire: { x: 0.3, y: 0.26, r: 0.14 },
          }),
        );
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
      },
      armeAncre: { rot: 0.55 },
    }),
    k,
    (r) => {
      clipsBipede(r, { foulee: 0.95, allonge: 0.9 });
      clipCapacite(r, 'levee');
    },
  );
};

const prevotDuSel: Fabrique = (k) => {
  const H = 106;
  const robeC = melanger(k.pal.primaire, 0x3a2430, 0.3);
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
      visage: { sourcils: 0.9, age: 0.9, barbe: 0.55, barbeCouleur: 0x8d8578 },
      cheveux: { couleur: 0x8d8578, longueur: 0.7, volume: 1 },
      robe: { couleur: robeC, haut: H * 0.22, bas: H * 0.36, hauteur: H * 0.46 },
      coiffe: (g, kk) => {
        chapeauCire(g, kk, H * 0.086, k.seed + 8, k.pal.primaire);
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
        // trousseau de clefs : trois clefs d'or pendues à la ceinture
        sous(g, H * 0.075, -H * 0.02, (h) => {
          h.moveTo(0, -H * 0.02);
          h.lineTo(0, H * 0.01);
          h.stroke({ color: LIGHT.rim, width: H * 0.008, alpha: 0.8 });
          for (let i = 0; i < 3; i += 1) {
            const a = -0.5 + i * 0.5;
            sous(h, Math.sin(a) * H * 0.02, H * 0.012 + Math.cos(a) * H * 0.03, (c) => {
              c.moveTo(0, 0);
              c.lineTo(0, H * 0.045);
              c.stroke({ color: LIGHT.rim, width: H * 0.0085, alpha: 0.9, cap: 'round' });
              c.poly(flat(blob(0, H * 0.05, H * 0.013, H * 0.013, { seed: i + 3, points: 9, wobble: 0.24 }))).fill({
                color: eclaircir(LIGHT.rim, 0.25),
                alpha: 0.9,
              });
              c.moveTo(0, H * 0.012);
              c.lineTo(H * 0.014, H * 0.012);
              c.stroke({ color: LIGHT.rim, width: H * 0.007, alpha: 0.85 });
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
      armeAncre: { rot: 0.02 },
    }),
    k,
    (r) => {
      clipsBipede(r, { foulee: 0.8, allonge: 0.85, lourdeur: 1.15 });
      clipCapacite(r, 'levee');
    },
  );
};

/* ─────────────────────── Rang 3 — les Farges ────────────────────────────── */

function arbaletrierPieces(k: Kit, H: number, maitre: boolean): PieceDef[] {
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
    visage: { sourcils: 0.6, age: maitre ? 0.75 : 0.25, barbe: maitre ? 0.4 : 0, barbeCouleur: 0x6b6055 },
    cheveux: { couleur: maitre ? 0x6b6055 : 0x4a3a24, longueur: 0.4, volume: 0.85 },
    coiffe: (g, kk) => {
      chapelDeFer(g, kk, H * 0.086, k.seed + (maitre ? 9 : 10), maitre);
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
    arme: (g, kk) => sous(g, H * 0.02, -H * 0.05, (h) => arbalete(h, kk, H * 0.3, k.seed + 25, maitre)),
    armeAncre: { rot: -0.18, y: H * 0.25 },
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

const grenadiere: Fabrique = (k) => {
  const H = 96;
  const corsage = melanger(k.pal.primaire, 0x8c3a3f, 0.25);
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
      visage: { sourcils: 0.15, age: 0.1 },
      cheveux: { couleur: 0x53381f, longueur: 1.2, volume: 1.05 },
      robe: { couleur: melanger(corsage, ARDOISE, 0.35), haut: H * 0.2, bas: H * 0.4, hauteur: H * 0.46 },
      coiffe: (g, kk) => coiffeLin(g, kk, H * 0.086, k.seed + 11, false),
      surTorse: (g) => {
        // grenade ouverte brodée : l'emblème de l'atelier
        const gr = blob(-H * 0.01, -H * 0.17, H * 0.032, H * 0.036, { seed: 7, points: 13, wobble: 0.18 });
        g.poly(flat(gr)).fill({ color: LIGHT.rim, alpha: 0.9 });
        g.poly(flat(perturber([pt(-H * 0.012, -H * 0.2), pt(H * 0.012, -H * 0.2), pt(0, -H * 0.235)], 0.5, 5))).fill({
          color: LIGHT.rim,
          alpha: 0.9,
        });
        for (let i = 0; i < 4; i += 1) {
          g.poly(
            flat(blob(-H * 0.026 + i * H * 0.017, -H * 0.168, H * 0.006, H * 0.007, { seed: i + 2, points: 7, wobble: 0.3 })),
          ).fill({ color: k.pal.primaire, alpha: 0.85 });
        }
        orfevrerie(g, [pt(-H * 0.09, -H * 0.26), pt(0, -H * 0.29), pt(H * 0.08, -H * 0.25)], { epaisseur: H * 0.011 });
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

const dameFilDor: Fabrique = (k) => {
  const H = 106;
  const gown = melanger(k.pal.primaire, 0x5a2038, 0.28);
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
      visage: { sourcils: 0.3, age: 0.55 },
      cheveux: { couleur: 0x3f2c1a, longueur: 1.3, volume: 1.1 },
      robe: { couleur: gown, haut: H * 0.22, bas: H * 0.46, hauteur: H * 0.5 },
      cape: { couleur: melanger(gown, ARDOISE, 0.4), w: H * 0.36, h: H * 0.52 },
      coiffe: (g, kk) => {
        coiffeLin(g, kk, H * 0.086, k.seed + 12, true);
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
      surTorse: (g) => {
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
        // bandoulière de bobines
        for (let i = 0; i < 3; i += 1) {
          g.poly(flat(blob(-H * 0.085 + i * H * 0.03, -H * 0.13 + i * H * 0.035, H * 0.014, H * 0.019, { seed: i + 21, points: 11, wobble: 0.2 }))).fill({
            color: melanger(LIGHT.rim, IVOIRE, i * 0.3),
            alpha: 0.9,
          });
        }
      },
      arme: (g, kk) => {
        hampe(g, kk, pt(0, H * 0.16), pt(0, -H * 0.62), H * 0.024, CHENE, 11);
        sous(g, 0, -H * 0.62, (h) => {
          poser(h, kk, blob(0, -H * 0.02, H * 0.026, H * 0.03, { seed: 5, points: 12, wobble: 0.2 }), {
            couleur: LIGHT.rim,
            matiere: 'metal',
            matiereAlpha: 0.22,
            speculaire: { x: 0.3, y: 0.26, r: 0.18 },
          });
        });
        // petit étendard brodé de grenades
        sous(g, H * 0.005, -H * 0.58, (h) =>
          banniereTissu(h, kk, { w: H * 0.2, h: H * 0.16, couleur: k.pal.primaire, accent: LIGHT.rim, seed: 3 }),
        );
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

function teteSanglier(g: Graphics, k: Kit, S: number, ferre: boolean, seed: number): void {
  const soie = melanger(CHENE, 0x2f2a22, 0.45);
  const groin = lisser(
    perturber(
      densifier(
        [
          pt(-S * 0.5, -S * 0.5),
          pt(S * 0.2, -S * 0.62),
          pt(S * 0.86, -S * 0.34),
          pt(S * 0.96, S * 0.06),
          pt(S * 0.5, S * 0.34),
          pt(-S * 0.3, S * 0.42),
          pt(-S * 0.6, S * 0.06),
        ],
        S * 0.24,
      ),
      S * 0.02,
      seed,
    ),
    1,
  );
  poser(g, k, groin, { couleur: soie, matiere: 'fourrure', matiereAlpha: 0.28, echelle: 0.4, seed });
  // groin proprement dit
  poser(g, k, blob(S * 0.86, -S * 0.06, S * 0.2, S * 0.16, { seed: seed + 3, points: 13, wobble: 0.18 }), {
    couleur: melanger(soie, 0xb08e84, 0.45),
    matiere: 'grain',
    matiereAlpha: 0.18,
  });
  for (const dy of [-0.05, 0.05]) {
    g.poly(flat(blob(S * 0.93, dy * S, S * 0.03, S * 0.04, { seed: 9, points: 8, wobble: 0.24 }))).fill({
      color: assombrir(soie, 0.6),
      alpha: 0.8,
    });
  }
  // œil : petit, enfoncé, mauvais
  g.poly(flat(blob(S * 0.24, -S * 0.3, S * 0.07, S * 0.05, { seed: 11, points: 9, wobble: 0.2 }))).fill({
    color: melanger(0x6e1f2a, 0x2a3242, 0.4),
    alpha: 0.92,
  });
  g.poly(flat(blob(S * 0.22, -S * 0.31, S * 0.026, S * 0.02, { seed: 13, points: 7, wobble: 0.26 }))).fill({
    color: LIGHT.chaude,
    alpha: 0.55,
  });
  // oreille
  poser(g, k, fuseau(-S * 0.08, -S * 0.5, -S * 0.24, -S * 0.86, S * 0.2, { seed: seed + 5, taper: 0.5 }), {
    couleur: assombrir(soie, 0.18),
    matiere: 'fourrure',
    matiereAlpha: 0.26,
    echelle: 0.35,
  });
  // défenses recourbées
  for (const [dy, sc] of [
    [0.16, 1],
    [0.28, 0.72],
  ] as const) {
    corne(g, k, {
      cx: S * 0.66,
      cy: S * dy,
      rx: S * 0.3 * sc,
      ry: S * 0.3 * sc,
      a0: 1.1,
      a1: -0.7,
      ep: S * 0.11 * sc,
      couleur: ferre ? melanger(IVOIRE, LIGHT.rim, 0.4) : IVOIRE,
      seed: seed + 7,
    });
  }
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
    cou: { longueur: Hs * 0.16, largeur: Hs * 0.5, angle: -0.85 },
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
      const acierChaud = melanger(ACIER, CHENE, ferre ? 0.26 : 0.4);
      for (let i = 0; i < 3; i += 1) {
        const x = -L * 0.2 + i * L * 0.2;
        const flanc = lisser(
          perturber(
            densifier(
              [
                pt(x - L * 0.1, -Hs * (0.3 - i * 0.04)),
                pt(x + L * 0.1, -Hs * (0.34 - i * 0.04)),
                pt(x + L * 0.09, Hs * 0.06),
                pt(x - L * 0.09, Hs * 0.08),
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
        const plaque = lisser(
          perturber(
            densifier(
              [pt(x - L * 0.07, -Hs * 0.34), pt(x + L * 0.07, -Hs * 0.36), pt(x + L * 0.06, -Hs * 0.06), pt(x - L * 0.06, -Hs * 0.04)],
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
          poser(g, kk, fuseau(x, -Hs * 0.34, x - L * 0.01, -Hs * 0.56, Hs * 0.09, { seed: i + 2, taper: 0.6 }), {
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
        g.moveTo(x, -Hs * 0.32);
        g.quadraticCurveTo(x - L * 0.012, -Hs * 0.44, x - L * 0.025, -Hs * 0.5);
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

function teteCheval(g: Graphics, k: Kit, S: number, robe: number, chanfrein: boolean, seed: number): void {
  const forme = lisser(
    perturber(
      densifier(
        [
          pt(-S * 0.34, -S * 0.5),
          pt(S * 0.16, -S * 0.62),
          pt(S * 0.82, -S * 0.3),
          pt(S * 0.94, S * 0.02),
          pt(S * 0.66, S * 0.24),
          pt(-S * 0.06, S * 0.3),
          pt(-S * 0.4, S * 0.02),
        ],
        S * 0.22,
      ),
      S * 0.018,
      seed,
    ),
    1,
  );
  poser(g, k, forme, { couleur: robe, matiere: 'fourrure', matiereAlpha: 0.24, echelle: 0.4, seed });
  // naseaux et bouche
  g.poly(flat(blob(S * 0.86, -S * 0.02, S * 0.06, S * 0.05, { seed: 5, points: 9, wobble: 0.22 }))).fill({
    color: assombrir(robe, 0.55),
    alpha: 0.8,
  });
  g.moveTo(S * 0.62, S * 0.16);
  g.quadraticCurveTo(S * 0.8, S * 0.2, S * 0.9, S * 0.1);
  g.stroke({ color: assombrir(robe, 0.5), width: S * 0.045, alpha: 0.7, cap: 'round' });
  // œil
  g.poly(flat(blob(S * 0.18, -S * 0.26, S * 0.075, S * 0.06, { seed: 7, points: 10, wobble: 0.2 }))).fill({
    color: melanger(0x2a3242, CHENE, 0.3),
    alpha: 0.92,
  });
  g.poly(flat(blob(S * 0.15, -S * 0.28, S * 0.028, S * 0.022, { seed: 9, points: 7, wobble: 0.26 }))).fill({
    color: LIGHT.chaude,
    alpha: 0.6,
  });
  // oreilles
  for (const dx of [-0.16, -0.02]) {
    poser(g, k, fuseau(S * dx, -S * 0.5, S * (dx - 0.04), -S * 0.86, S * 0.14, { seed: seed + dx * 10, taper: 0.62 }), {
      couleur: assombrir(robe, 0.2),
      matiere: 'fourrure',
      matiereAlpha: 0.26,
      echelle: 0.3,
    });
  }
  // bride et mors
  g.moveTo(-S * 0.2, -S * 0.1);
  g.quadraticCurveTo(S * 0.3, -S * 0.06, S * 0.76, -S * 0.02);
  g.stroke({ color: assombrir(CHENE, 0.3), width: S * 0.05, alpha: 0.85, cap: 'round' });
  g.moveTo(S * 0.32, -S * 0.42);
  g.quadraticCurveTo(S * 0.38, -S * 0.02, S * 0.34, S * 0.2);
  g.stroke({ color: assombrir(CHENE, 0.3), width: S * 0.045, alpha: 0.8, cap: 'round' });
  if (chanfrein) {
    ferrure(
      g,
      k,
      lisser(
        perturber(
          densifier([pt(-S * 0.16, -S * 0.5), pt(S * 0.3, -S * 0.48), pt(S * 0.78, -S * 0.24), pt(S * 0.7, -S * 0.06), pt(S * 0.2, -S * 0.16), pt(-S * 0.2, -S * 0.28)], S * 0.2),
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

  pieces.push({
    nom: 'cou',
    parent: 'corps',
    x: L * 0.36,
    y: -Hs * 0.28,
    rot: -0.9,
    lumiere: 0.4,
    ordreMort: 6,
    dessin: (g, kk) =>
      membre(g, kk, pt(0, 0), pt(0, -Hs * 0.42), Hs * 0.3, {
        couleur: robeCheval,
        matiere: 'fourrure',
        matiereAlpha: 0.22,
        echelle: 0.4,
        taper: 0.3,
        seed: k.seed + 65,
      }),
  });

  pieces.push({
    nom: 'criniere',
    parent: 'cou',
    x: -Hs * 0.1,
    y: -Hs * 0.2,
    lumiere: -0.2,
    ambiance: 1.4,
    periode: 2.8,
    ordreMort: 5,
    dessin: (g, kk) => {
      const m = lisser(
        perturber(
          densifier([pt(0, -Hs * 0.24), pt(Hs * 0.06, -Hs * 0.2), pt(Hs * 0.02, Hs * 0.14), pt(-Hs * 0.12, Hs * 0.22), pt(-Hs * 0.1, -Hs * 0.1)], Hs * 0.1),
          Hs * 0.014,
          k.seed + 67,
        ),
        1,
      );
      poser(g, kk, m, {
        couleur: assombrir(robeCheval, 0.32),
        matiere: 'fourrure',
        matiereAlpha: 0.3,
        echelle: 0.3,
      });
    },
  });

  pieces.push({
    nom: 'tete',
    parent: 'cou',
    x: 0,
    y: -Hs * 0.4,
    rot: 0.55,
    lumiere: 0.6,
    ordreMort: 10,
    dessin: (g, kk) => teteCheval(g, kk, Hs * 0.42, robeCheval, banneret, k.seed + 69),
  });

  /* ── le cavalier ── */

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
    nom: 'bouclier',
    parent: 'bras_d',
    x: HB * 0.1,
    y: HB * 0.24,
    rot: -0.2,
    lumiere: -0.7,
    ordreMort: 3,
    dessin: (g, kk) =>
      ecu(g, kk, {
        w: HB * 0.3,
        h: HB * 0.38,
        couleur: k.pal.primaire,
        bord: banneret ? LIGHT.rim : melanger(ACIER, LIGHT.rim, 0.3),
        meuble: banneret ? 'borne' : 'croix',
        seed: k.seed + 73,
      }),
  });

  pieces.push({
    nom: 'buste',
    parent: 'cavalier',
    x: 0,
    y: 0,
    ordreMort: 9,
    dessin: (g, kk) => {
      // jambes du cavalier, repliées de part et d'autre de la selle
      for (const cote of [1, -1] as const) {
        sous(g, cote * HB * 0.05, HB * 0.02, (h) => {
          membre(h, kk, pt(0, 0), pt(cote * HB * 0.16, HB * 0.42), HB * 0.085, {
            couleur: cote > 0 ? assombrir(ARDOISE, 0.2) : ARDOISE,
            matiere: 'metal',
            matiereAlpha: 0.2,
            echelle: 0.4,
            seed: k.seed + cote,
          });
          sous(h, cote * HB * 0.18, HB * 0.44, (c) =>
            pied(c, kk, { l: HB * 0.14, h: HB * 0.05, couleur: assombrir(ARDOISE, 0.38), seed: 3 }),
          );
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
      // épaulières
      for (const cote of [1, -1] as const) {
        sous(g, cote * HB * 0.14, -HB * 0.31, (h) =>
          poser(h, kk, blob(0, 0, HB * 0.08, HB * 0.06, { seed: 8, points: 12, wobble: 0.2 }), {
            couleur: cote > 0 ? assombrir(ACIER, 0.2) : melanger(ACIER, LIGHT.rim, banneret ? 0.28 : 0.05),
            matiere: 'metal',
            matiereAlpha: 0.24,
            speculaire: { x: 0.3, y: 0.24, r: 0.14 },
          }),
        );
      }
    },
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
        // cimier à plume : le banneret veut être vu de l'autre bout de la vallée
        sous(g, -r * 0.1, -r * 1.2, (h) => {
          for (let i = 0; i < 3; i += 1) {
            poser(h, kk, fuseau(i * r * 0.14 - r * 0.14, 0, i * r * 0.24 - r * 0.4, -r * (1 + i * 0.24), r * 0.3, { seed: i, taper: 0.5 }), {
              couleur: i % 2 ? IVOIRE : k.pal.primaire,
              matiere: 'plumes',
              matiereAlpha: 0.3,
              echelle: 0.3,
            });
          }
        });
      }
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
  // bec crochu : la signature du griffon
  const bec = lisser(
    perturber(
      densifier([pt(S * 0.42, -S * 0.24), pt(S * 1.06, -S * 0.08), pt(S * 0.92, S * 0.3), pt(S * 0.66, S * 0.16), pt(S * 0.44, S * 0.06)], S * 0.16),
      S * 0.014,
      seed + 3,
    ),
    1,
  );
  poser(g, k, bec, {
    couleur: LIGHT.rim,
    matiere: 'metal',
    matiereAlpha: 0.2,
    echelle: 0.4,
    speculaire: { x: 0.3, y: 0.22, r: 0.1 },
  });
  g.moveTo(S * 0.46, S * 0.03);
  g.quadraticCurveTo(S * 0.74, S * 0.08, S * 0.94, S * 0.14);
  g.stroke({ color: assombrir(LIGHT.rim, 0.45), width: S * 0.04, alpha: 0.75, cap: 'round' });
  // cire et narine
  g.poly(flat(blob(S * 0.5, -S * 0.16, S * 0.05, S * 0.035, { seed: 5, points: 8, wobble: 0.24 }))).fill({
    color: assombrir(LIGHT.rim, 0.3),
    alpha: 0.8,
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
      /* À l'épaule et relevées : le griffon a un arrière-train de lion, et il
         faut qu'on le voie. */
      pose: { x: 0.16, y: -0.58, rot: -0.5 },
    },
    seed: k.seed + (couronne ? 110 : 100),
    cou: { longueur: 30 * S, largeur: 26 * S, angle: -0.75 },
    tete: (g, kk) => teteAigle(g, kk, 26 * S, couronne, k.seed + 41),
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
