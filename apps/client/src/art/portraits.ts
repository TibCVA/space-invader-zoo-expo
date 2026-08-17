/**
 * Portraits des vingt-et-un héros (`portrait_<id>`).
 *
 * Peinture vectorielle stylisée, cadrage poitrine, lumière latérale douce à
 * 315°, fond évoquant la faction : granit et bannière pour la Châtellenie,
 * futaie et brume pour l'Ermitage. Diversité réelle d'âge (24 à 61 ans), de
 * morphologie et de coiffure ; aucune ressemblance avec une personne réelle.
 * Cadre d'enluminure : filet doré double, écoinçons feuillagés, cartouche du
 * nom laissé vide (le libellé est composé en Cinzel par l'interface).
 */
import { Container, Graphics } from 'pixi.js';
import { HEROES } from '@auvergne/content';
import {
  FACTION_PALETTE,
  LIGHT,
  PALETTE,
  assombrir,
  eclaircir,
  melanger,
  ombreBleutee,
  perspectiveAtmospherique,
} from './palette.js';
import type { MaterialKey, MaterialSet, Poly } from './shading.js';
import {
  blob,
  clipHalfPlane,
  densifier,
  ecoincon,
  filetDore,
  flat,
  lisser,
  peindre,
  perturber,
  pt,
} from './shading.js';
import { hashString, prng } from './noise.js';
import { TEINTS, chevelure, crane, visage } from './creatures/archetypes.js';
import type { Kit } from './creatures/archetypes.js';

export const PORTRAIT_W = 168;
export const PORTRAIT_H = 208;

const PARCHEMIN = PALETTE.parchemin;
const GRANIT = PALETTE.granitAnthracite;
const GRANIT_CLAIR = PALETTE.granitClair;
const BOIS = PALETTE.brunFougere;
const SAPIN = PALETTE.vertSapin;
const BRUME = PALETTE.bleuBrume;
const ACIER = 0x8f99a4;

type Coiffe =
  | 'aucune'
  | 'chapel'
  | 'bonnet'
  | 'capuche'
  | 'voile'
  | 'coiffe'
  | 'chapeau'
  | 'couronne'
  | 'cagoule';

interface Spec {
  /** 24 à 61 ans */
  age: number;
  /** 0 = fin, 1 = large d'épaules */
  carrure: number;
  teint: number;
  cheveux: number;
  cheveuxLongueur: number;
  cheveuxVolume: number;
  barbe: number;
  coiffe: Coiffe;
  /** couleur du vêtement principal */
  vetement: number;
  /** col ou pièce d'appoint */
  col: number;
  /** matière du vêtement */
  matiere: MaterialKey;
  /** léger décalage de pose, en degrés */
  pose: number;
}

const CHATAIN = 0x53381f;
const NOISETTE = 0x3f2c1a;
const BLOND = 0xa8853f;
const GRIS = 0x8d8578;
const ROUX = 0x8c4a24;
const NOIR = 0x2b2119;

const G = FACTION_PALETTE.granit;
const E = FACTION_PALETTE.ermitage;

/**
 * Fiche visuelle de chaque héros. Elle découle de sa classe, de son titre et
 * de sa biographie dans `packages/content` : le sénéchal des chemins porte le
 * bonnet du maître de poste, la Dame des Brumes le voile, le Poing de Pamole
 * les épaules du carrier.
 */
const SPECS: Record<string, Spec> = {
  paul: { age: 31, carrure: 0.86, teint: TEINTS[1], cheveux: NOISETTE, cheveuxLongueur: 0.5, cheveuxVolume: 0.9, barbe: 0.2, coiffe: 'chapel', vetement: G.primaire, col: ACIER, matiere: 'metal', pose: -4 },
  thibaut: { age: 44, carrure: 0.62, teint: TEINTS[0], cheveux: CHATAIN, cheveuxLongueur: 0.6, cheveuxVolume: 0.95, barbe: 0.3, coiffe: 'bonnet', vetement: G.sombre, col: G.clair, matiere: 'tissu', pose: 5 },
  loic: { age: 38, carrure: 0.7, teint: TEINTS[2], cheveux: NOIR, cheveuxLongueur: 0.45, cheveuxVolume: 0.85, barbe: 0.42, coiffe: 'chapeau', vetement: G.pierre, col: G.accent, matiere: 'tissu', pose: -6 },
  matthieu: { age: 49, carrure: 1, teint: TEINTS[3], cheveux: GRIS, cheveuxLongueur: 0.35, cheveuxVolume: 0.8, barbe: 0.55, coiffe: 'chapel', vetement: G.pierre, col: ACIER, matiere: 'metal', pose: 3 },
  clotilde: { age: 34, carrure: 0.6, teint: TEINTS[4], cheveux: ROUX, cheveuxLongueur: 1.25, cheveuxVolume: 1.1, barbe: 0, coiffe: 'coiffe', vetement: G.primaire, col: G.clair, matiere: 'tissu', pose: -3 },
  caroline: { age: 52, carrure: 0.66, teint: TEINTS[0], cheveux: GRIS, cheveuxLongueur: 0.9, cheveuxVolume: 1, barbe: 0, coiffe: 'coiffe', vetement: G.sombre, col: G.accent, matiere: 'tissu', pose: 4 },
  thomas: { age: 27, carrure: 0.72, teint: TEINTS[1], cheveux: BLOND, cheveuxLongueur: 0.4, cheveuxVolume: 0.9, barbe: 0.1, coiffe: 'aucune', vetement: G.pierre, col: G.primaire, matiere: 'tissu', pose: -7 },
  georges: { age: 58, carrure: 1, teint: TEINTS[2], cheveux: GRIS, cheveuxLongueur: 0.3, cheveuxVolume: 0.75, barbe: 0.7, coiffe: 'chapel', vetement: G.pierre, col: ACIER, matiere: 'metal', pose: 2 },
  auguste: { age: 61, carrure: 0.68, teint: TEINTS[0], cheveux: GRIS, cheveuxLongueur: 0.75, cheveuxVolume: 0.95, barbe: 0.62, coiffe: 'chapeau', vetement: G.primaire, col: G.accent, matiere: 'tissu', pose: 6 },
  josephine: { age: 41, carrure: 0.64, teint: TEINTS[3], cheveux: NOISETTE, cheveuxLongueur: 1.1, cheveuxVolume: 1.05, barbe: 0, coiffe: 'voile', vetement: G.sombre, col: G.clair, matiere: 'tissu', pose: -5 },

  anastasia: { age: 46, carrure: 0.6, teint: TEINTS[4], cheveux: GRIS, cheveuxLongueur: 1.2, cheveuxVolume: 1.05, barbe: 0, coiffe: 'voile', vetement: E.primaire, col: E.clair, matiere: 'tissu', pose: -4 },
  mathilde: { age: 36, carrure: 0.62, teint: TEINTS[0], cheveux: CHATAIN, cheveuxLongueur: 1.15, cheveuxVolume: 1, barbe: 0, coiffe: 'coiffe', vetement: E.accent, col: E.pierre, matiere: 'tissu', pose: 5 },
  agathe: { age: 29, carrure: 0.66, teint: TEINTS[1], cheveux: ROUX, cheveuxLongueur: 0.8, cheveuxVolume: 1.1, barbe: 0, coiffe: 'capuche', vetement: E.primaire, col: E.appoint, matiere: 'tissu', pose: -6 },
  roxane: { age: 32, carrure: 0.7, teint: TEINTS[2], cheveux: NOIR, cheveuxLongueur: 0.55, cheveuxVolume: 0.9, barbe: 0, coiffe: 'capuche', vetement: E.sombre, col: E.appoint, matiere: 'tissu', pose: 4 },
  jean: { age: 47, carrure: 0.94, teint: TEINTS[3], cheveux: NOISETTE, cheveuxLongueur: 0.5, cheveuxVolume: 0.95, barbe: 0.6, coiffe: 'capuche', vetement: E.sombre, col: BOIS, matiere: 'fourrure', pose: 3 },
  adele: { age: 24, carrure: 0.56, teint: TEINTS[4], cheveux: BLOND, cheveuxLongueur: 1.3, cheveuxVolume: 1.15, barbe: 0, coiffe: 'aucune', vetement: E.appoint, col: E.accent, matiere: 'tissu', pose: -3 },
  ines: { age: 39, carrure: 0.62, teint: TEINTS[2], cheveux: NOIR, cheveuxLongueur: 0.95, cheveuxVolume: 1, barbe: 0, coiffe: 'cagoule', vetement: E.pierre, col: E.primaire, matiere: 'tissu', pose: 6 },
  gustave: { age: 54, carrure: 1, teint: TEINTS[1], cheveux: GRIS, cheveuxLongueur: 0.35, cheveuxVolume: 0.8, barbe: 0.68, coiffe: 'aucune', vetement: GRANIT_CLAIR, col: E.appoint, matiere: 'granit', pose: 2 },
  come: { age: 43, carrure: 0.66, teint: TEINTS[0], cheveux: CHATAIN, cheveuxLongueur: 0.7, cheveuxVolume: 0.9, barbe: 0.4, coiffe: 'bonnet', vetement: E.primaire, col: E.clair, matiere: 'tissu', pose: -5 },
  lise: { age: 26, carrure: 0.6, teint: TEINTS[3], cheveux: NOIR, cheveuxLongueur: 1.2, cheveuxVolume: 1.1, barbe: 0, coiffe: 'aucune', vetement: E.accent, col: PALETTE.bleuProfond, matiere: 'ecailles', pose: -2 },

  jules: { age: 51, carrure: 0.78, teint: TEINTS[2], cheveux: GRIS, cheveuxLongueur: 0.6, cheveuxVolume: 0.9, barbe: 0.5, coiffe: 'chapeau', vetement: BOIS, col: PALETTE.vieilOr, matiere: 'tissu', pose: 0 },
};

const SPEC_DEFAUT: Spec = {
  age: 40,
  carrure: 0.72,
  teint: TEINTS[1],
  cheveux: CHATAIN,
  cheveuxLongueur: 0.6,
  cheveuxVolume: 0.95,
  barbe: 0.3,
  coiffe: 'aucune',
  vetement: GRANIT_CLAIR,
  col: PALETTE.vieilOr,
  matiere: 'tissu',
  pose: 0,
};

interface Ctx {
  g: Graphics;
  mats: MaterialSet;
  kit: Kit;
}

function poser(
  g: Graphics,
  mats: MaterialSet,
  poly: Poly,
  base: number,
  o: { matiere?: MaterialKey; alpha?: number; echelle?: number; modele?: number; rim?: boolean } = {},
): void {
  peindre(g, poly, mats, {
    base,
    matiere: o.matiere ?? 'grain',
    matiereAlpha: o.alpha ?? 0.16,
    matiereEchelle: o.echelle ?? 0.5,
    modele: o.modele ?? 1,
    rim: o.rim !== false,
  });
}

/* ─────────────────────────────── Le fond ────────────────────────────────── */

function fondGranit(g: Graphics, mats: MaterialSet, seed: number, cadre: Poly): void {
  const W = PORTRAIT_W;
  const H = PORTRAIT_H;
  // mur d'appareil, joints décalés, perspective atmosphérique légère
  poser(g, mats, cadre, perspectiveAtmospherique(melanger(GRANIT_CLAIR, GRANIT, 0.4), 500), {
    matiere: 'granit',
    alpha: 0.3,
    echelle: 0.7,
    modele: 0.5,
    rim: false,
  });
  const rand = prng(seed);
  for (let r = 0; r < 7; r += 1) {
    for (let c = 0; c < 5; c += 1) {
      const w = W / 4.4;
      const x = -W / 2 + c * w + (r % 2 ? w * 0.4 : -w * 0.1);
      const y = -H / 2 + r * (H / 7);
      const bloc = clipHalfPlane(
        clipHalfPlane(
          clipHalfPlane(
            clipHalfPlane(
              perturber(densifier([pt(x, y), pt(x + w * 0.95, y - 1), pt(x + w * 0.93, y + H / 7 - 2), pt(x - 1, y + H / 7 - 1)], 9), 1, r * 7 + c),
              pt(-W / 2 + 8, 0),
              pt(1, 0),
            ),
            pt(W / 2 - 8, 0),
            pt(-1, 0),
          ),
          pt(0, -H / 2 + 8),
          pt(0, 1),
        ),
        pt(0, H / 2 - 8),
        pt(0, -1),
      );
      if (bloc.length >= 3) {
        g.poly(flat(bloc)).fill({
          color: perspectiveAtmospherique(melanger(GRANIT_CLAIR, (r + c) % 2 ? GRANIT : 0x414a52, 0.24 + rand() * 0.2), 520),
          alpha: 0.4,
        });
        g.poly(flat(bloc), true).stroke({ color: ombreBleutee(GRANIT_CLAIR, 0.6), width: 1, alpha: 0.25 });
      }
    }
  }
  // bannière grenat tendue derrière l'épaule
  const ban = clipHalfPlane(
    perturber(densifier([pt(W * 0.06, -H * 0.46), pt(W * 0.44, -H * 0.44), pt(W * 0.42, H * 0.3), pt(W * 0.24, H * 0.24), pt(W * 0.04, H * 0.32)], 12), 1.2, seed + 3),
    pt(W / 2 - 8, 0),
    pt(-1, 0),
  );
  if (ban.length >= 3) {
    poser(g, mats, ban, perspectiveAtmospherique(G.primaire, 260), {
      matiere: 'tissu',
      alpha: 0.26,
      echelle: 0.8,
      modele: 0.7,
      rim: false,
    });
    for (let i = 0; i < 3; i += 1) {
      g.moveTo(W * (0.12 + i * 0.1), -H * 0.42);
      g.quadraticCurveTo(W * (0.14 + i * 0.1), 0, W * (0.11 + i * 0.1), H * 0.26);
      g.stroke({ color: ombreBleutee(G.primaire, 0.6), width: 2, alpha: 0.3 });
    }
  }
  // voile de lumière venant du nord-ouest
  g.poly(flat(perturber(densifier([pt(-W * 0.5, -H * 0.5), pt(-W * 0.02, -H * 0.5), pt(-W * 0.5, H * 0.06)], 14), 1, seed + 9))).fill({
    color: LIGHT.chaude,
    alpha: 0.09,
  });
}

function fondFutaie(g: Graphics, mats: MaterialSet, seed: number, cadre: Poly): void {
  const W = PORTRAIT_W;
  const H = PORTRAIT_H;
  poser(g, mats, cadre, perspectiveAtmospherique(melanger(SAPIN, BRUME, 0.24), 420), {
    matiere: 'grain',
    alpha: 0.16,
    echelle: 0.8,
    modele: 0.4,
    rim: false,
  });
  const rand = prng(seed + 11);
  // trois plans de futaie, de plus en plus bleutés
  for (let plan = 3; plan >= 1; plan -= 1) {
    const dist = plan * 320;
    const n = 3 + plan;
    for (let i = 0; i < n; i += 1) {
      const x = -W * 0.46 + (i / (n - 1)) * W * 0.92 + (rand() - 0.5) * 12;
      const w = (W * 0.05) / plan + 3;
      const tronc = clipHalfPlane(
        clipHalfPlane(
          perturber(densifier([pt(x - w, H * 0.5), pt(x + w, H * 0.5), pt(x + w * 0.55, -H * 0.5), pt(x - w * 0.6, -H * 0.5)], 16), 1.4, plan * 13 + i),
          pt(-W / 2 + 8, 0),
          pt(1, 0),
        ),
        pt(W / 2 - 8, 0),
        pt(-1, 0),
      );
      if (tronc.length >= 3) {
        g.poly(flat(tronc)).fill({
          color: perspectiveAtmospherique(melanger(BOIS, SAPIN, 0.3 + rand() * 0.3), dist),
          alpha: 0.7,
        });
      }
    }
    // nappe de brume entre les plans
    const nappe = clipHalfPlane(
      clipHalfPlane(
        perturber(densifier([pt(-W * 0.5, H * 0.5 - plan * H * 0.16), pt(W * 0.5, H * 0.48 - plan * H * 0.16), pt(W * 0.5, H * 0.5), pt(-W * 0.5, H * 0.5)], 16), 2.2, plan * 5),
        pt(-W / 2 + 8, 0),
        pt(1, 0),
      ),
      pt(W / 2 - 8, 0),
      pt(-1, 0),
    );
    if (nappe.length >= 3) g.poly(flat(nappe)).fill({ color: BRUME, alpha: 0.16 });
  }
  // rais de lumière du nord-ouest
  for (let i = 0; i < 3; i += 1) {
    const p = clipHalfPlane(
      perturber(densifier([pt(-W * 0.5, -H * 0.5 + i * 18), pt(-W * 0.2 + i * 20, -H * 0.5), pt(-W * 0.5 + i * 22, H * 0.2)], 12), 1.4, i + 3),
      pt(-W / 2 + 8, 0),
      pt(1, 0),
    );
    if (p.length >= 3) g.poly(flat(p)).fill({ color: LIGHT.chaude, alpha: 0.07 });
  }
}

/* ───────────────────────────── Les coiffures ────────────────────────────── */

function poserCoiffe(ctx: Ctx, spec: Spec, r: number, seed: number): void {
  const { g, mats } = ctx;
  switch (spec.coiffe) {
    case 'chapel': {
      const bord = lisser(
        perturber(densifier([pt(-r * 1.5, -r * 0.6), pt(0, -r * 0.86), pt(r * 1.52, -r * 0.56), pt(r * 1.1, -r * 0.3), pt(0, -r * 0.18), pt(-r * 1.14, -r * 0.32)], r * 0.34), r * 0.03, seed),
        1,
      );
      const calotte = lisser(
        perturber(densifier([pt(-r * 1.0, -r * 0.58), pt(-r * 0.6, -r * 1.3), pt(0, -r * 1.48), pt(r * 0.64, -r * 1.26), pt(r * 1.02, -r * 0.56)], r * 0.3), r * 0.025, seed + 3),
        1,
      );
      poser(g, mats, calotte, ACIER, { matiere: 'metal', alpha: 0.24, echelle: 0.4 });
      poser(g, mats, bord, assombrir(ACIER, 0.16), { matiere: 'metal', alpha: 0.24, echelle: 0.4 });
      g.moveTo(0, -r * 1.46);
      g.lineTo(0, -r * 0.6);
      g.stroke({ color: eclaircir(ACIER, 0.4), width: r * 0.08, alpha: 0.6, cap: 'round' });
      break;
    }
    case 'bonnet': {
      const b = lisser(
        perturber(densifier([pt(-r * 1.06, -r * 0.5), pt(-r * 0.8, -r * 1.28), pt(r * 0.3, -r * 1.42), pt(r * 1.04, -r * 0.9), pt(r * 1.0, -r * 0.34), pt(-r * 0.9, -r * 0.28)], r * 0.32), r * 0.03, seed),
        1,
      );
      poser(g, mats, b, melanger(spec.vetement, GRANIT, 0.28), { matiere: 'tissu', alpha: 0.24, echelle: 0.5 });
      g.moveTo(-r * 1.02, -r * 0.44);
      g.lineTo(r * 1.0, -r * 0.4);
      g.stroke({ color: spec.col, width: r * 0.14, alpha: 0.85, cap: 'round' });
      break;
    }
    case 'chapeau': {
      const bord = lisser(
        perturber(densifier([pt(-r * 1.74, -r * 0.5), pt(-r * 0.8, -r * 0.88), pt(r * 0.9, -r * 0.8), pt(r * 1.78, -r * 0.36), pt(r * 0.9, -r * 0.1), pt(-r * 0.9, -r * 0.14)], r * 0.32), r * 0.045, seed),
        1,
      );
      const calotte = lisser(
        perturber(densifier([pt(-r * 0.9, -r * 0.58), pt(-r * 0.76, -r * 1.4), pt(r * 0.48, -r * 1.48), pt(r * 0.92, -r * 0.6)], r * 0.28), r * 0.03, seed + 5),
        1,
      );
      const feutre = melanger(spec.vetement, GRANIT, 0.42);
      poser(g, mats, bord, feutre, { matiere: 'tissu', alpha: 0.24, echelle: 0.5 });
      poser(g, mats, calotte, eclaircir(feutre, 0.12), { matiere: 'tissu', alpha: 0.24, echelle: 0.5 });
      g.moveTo(-r * 0.92, -r * 0.72);
      g.lineTo(r * 0.94, -r * 0.7);
      g.stroke({ color: spec.col, width: r * 0.14, alpha: 0.85, cap: 'round' });
      break;
    }
    case 'capuche': {
      const c = lisser(
        perturber(
          densifier(
            [pt(-r * 1.2, r * 0.6), pt(-r * 1.12, -r * 0.5), pt(-r * 0.6, -r * 1.34), pt(r * 0.06, -r * 1.62), pt(r * 0.66, -r * 1.14), pt(r * 1.16, -r * 0.28), pt(r * 1.22, r * 0.7), pt(r * 0.6, r * 0.5), pt(r * 0.48, -r * 0.36), pt(-r * 0.52, -r * 0.42), pt(-r * 0.64, r * 0.54)],
            r * 0.34,
          ),
          r * 0.035,
          seed,
        ),
        1,
      );
      poser(g, mats, c, melanger(spec.vetement, SAPIN, 0.3), { matiere: 'tissu', alpha: 0.24, echelle: 0.5 });
      g.poly(flat(blob(0, -r * 0.05, r * 0.56, r * 0.66, { seed: seed + 7, points: 14, wobble: 0.14 }))).fill({
        color: ombreBleutee(spec.vetement, 0.9),
        alpha: 0.42,
      });
      break;
    }
    case 'cagoule': {
      const c = lisser(
        perturber(
          densifier([pt(-r * 1.1, r * 0.9), pt(-r * 0.9, -r * 0.6), pt(-r * 0.3, -r * 1.9), pt(r * 0.06, -r * 2.3), pt(r * 0.44, -r * 1.66), pt(r * 1.0, -r * 0.44), pt(r * 1.16, r * 0.96), pt(0, r * 0.74)], r * 0.4),
          r * 0.03,
          seed,
        ),
        1,
      );
      poser(g, mats, c, melanger(PARCHEMIN, spec.vetement, 0.3), { matiere: 'tissu', alpha: 0.26, echelle: 0.55 });
      break;
    }
    case 'voile': {
      const v = lisser(
        perturber(
          densifier([pt(-r * 1.24, r * 1.6), pt(-r * 1.1, -r * 0.4), pt(-r * 0.4, -r * 1.32), pt(r * 0.5, -r * 1.2), pt(r * 1.14, -r * 0.3), pt(r * 1.3, r * 1.7), pt(r * 0.66, r * 1.3), pt(r * 0.5, -r * 0.4), pt(-r * 0.54, -r * 0.46), pt(-r * 0.66, r * 1.32)], r * 0.36),
          r * 0.03,
          seed,
        ),
        1,
      );
      poser(g, mats, v, melanger(PARCHEMIN, spec.col, 0.22), { matiere: 'tissu', alpha: 0.26, echelle: 0.6 });
      g.moveTo(-r * 1.08, -r * 0.3);
      g.quadraticCurveTo(0, -r * 1.32, r * 1.1, -r * 0.24);
      g.stroke({ color: LIGHT.rim, width: r * 0.1, alpha: 0.75 });
      break;
    }
    case 'coiffe': {
      const c = lisser(
        perturber(
          densifier([pt(-r * 1.12, -r * 0.2), pt(-r * 1.0, -r * 1.06), pt(-r * 0.2, -r * 1.34), pt(r * 0.68, -r * 1.16), pt(r * 1.1, -r * 0.42), pt(r * 1.18, r * 0.7), pt(r * 0.6, r * 0.52), pt(r * 0.5, -r * 0.3), pt(-r * 0.52, -r * 0.42), pt(-r * 0.68, r * 0.6), pt(-r * 1.2, r * 0.76)], r * 0.34),
          r * 0.035,
          seed,
        ),
        1,
      );
      poser(g, mats, c, melanger(PARCHEMIN, 0xf0ead9, 0.4), { matiere: 'tissu', alpha: 0.26, echelle: 0.55 });
      g.moveTo(-r * 1.0, -r * 0.5);
      g.quadraticCurveTo(0, -r * 1.24, r * 1.02, -r * 0.44);
      g.stroke({ color: LIGHT.rim, width: r * 0.11, alpha: 0.8 });
      break;
    }
    case 'aucune':
    default:
      break;
  }
}

/* ─────────────────────────────── Le portrait ────────────────────────────── */

/** Dessine le portrait d'un héros, centré en (0, 0). */
export function dessinerPortrait(mats: MaterialSet, key: string): Container {
  const id = key.startsWith('portrait_') ? key.slice('portrait_'.length) : key;
  const def = HEROES[id];
  const spec = SPECS[id] ?? SPEC_DEFAUT;
  const faction = def?.faction === 'ermitage' ? 'ermitage' : def?.faction === 'granit' ? 'granit' : 'neutre';
  const seed = hashString(id) % 9973;
  const racine = new Container();
  const g = new Graphics();
  racine.addChild(g);
  const kit: Kit = { mats, faction: faction === 'ermitage' ? 'ermitage' : 'granit', pal: faction === 'ermitage' ? E : G, seed };
  const W = PORTRAIT_W;
  const H = PORTRAIT_H;

  const cadre = perturber(
    densifier([pt(-W / 2 + 6, -H / 2 + 6), pt(W / 2 - 6, -H / 2 + 6), pt(W / 2 - 6, H / 2 - 6), pt(-W / 2 + 6, H / 2 - 6)], 20),
    0.8,
    seed,
  );

  if (faction === 'ermitage') fondFutaie(g, mats, seed, cadre);
  else fondGranit(g, mats, seed, cadre);

  // ── le buste ────────────────────────────────────────────────────────────
  const pose = (spec.pose * Math.PI) / 180;
  const larg = W * (0.3 + spec.carrure * 0.13);
  const epauleY = H * 0.16;
  const buste = lisser(
    perturber(
      densifier(
        [
          pt(-larg, H * 0.5),
          pt(-larg * 0.96, epauleY + H * 0.04),
          pt(-larg * 0.58, epauleY - H * 0.04),
          pt(-W * 0.1, epauleY - H * 0.1),
          pt(W * 0.1, epauleY - H * 0.1),
          pt(larg * 0.6, epauleY - H * 0.03),
          pt(larg * 0.98, epauleY + H * 0.05),
          pt(larg, H * 0.5),
        ],
        14,
      ),
      1.2,
      seed + 13,
    ),
    1,
  );
  const bClip = clipHalfPlane(buste, pt(0, H / 2 - 8), pt(0, -1));
  poser(g, mats, bClip.length >= 3 ? bClip : buste, spec.vetement, {
    matiere: spec.matiere,
    alpha: 0.24,
    echelle: 0.7,
    modele: 1,
  });
  // col et parement
  const col = lisser(
    perturber(
      densifier([pt(-W * 0.17, epauleY - H * 0.09), pt(0, epauleY + H * 0.02), pt(W * 0.17, epauleY - H * 0.09), pt(W * 0.12, epauleY + H * 0.06), pt(0, epauleY + H * 0.12), pt(-W * 0.12, epauleY + H * 0.06)], 12),
      0.9,
      seed + 17,
    ),
    1,
  );
  poser(g, mats, col, spec.col, { matiere: spec.matiere === 'metal' ? 'metal' : 'tissu', alpha: 0.24, echelle: 0.5 });
  // agrafe d'épaule
  g.poly(flat(blob(-larg * 0.72, epauleY - H * 0.01, 6, 6.4, { seed: seed + 21, points: 12, wobble: 0.2 }))).fill({
    color: LIGHT.rim,
    alpha: 0.9,
  });
  g.poly(flat(blob(-larg * 0.74, epauleY - H * 0.015, 2.4, 2.2, { seed: seed + 23, points: 8, wobble: 0.3 }))).fill({
    color: LIGHT.chaude,
    alpha: 0.6,
  });

  // ── cou et tête ─────────────────────────────────────────────────────────
  const rTete = H * 0.115;
  const teteY = epauleY - H * 0.1 - rTete * 0.86;
  const cou = perturber(
    densifier([pt(-rTete * 0.44, teteY + rTete * 0.4), pt(rTete * 0.44, teteY + rTete * 0.4), pt(rTete * 0.56, epauleY - H * 0.05), pt(-rTete * 0.56, epauleY - H * 0.05)], 8),
    0.7,
    seed + 27,
  );
  poser(g, mats, cou, assombrir(spec.teint, 0.26), { matiere: 'grain', alpha: 0.1, modele: 0.8, rim: false });

  const tete = new Graphics();
  tete.position.set(0, teteY);
  tete.rotation = pose * 0.35;
  if (spec.coiffe !== 'cagoule') {
    chevelure(tete, kit, {
      r: rTete,
      couleur: spec.cheveux,
      longueur: spec.cheveuxLongueur,
      volume: spec.cheveuxVolume,
      seed: seed + 31,
    });
  }
  crane(tete, kit, { r: rTete, teint: spec.teint, seed: seed + 33, menton: spec.carrure > 0.85 ? 1.06 : 0.96 });
  if (spec.coiffe !== 'cagoule') {
    visage(tete, {
      r: rTete,
      teint: spec.teint,
      age: (spec.age - 24) / 37,
      sourcils: spec.carrure * 0.6,
      barbe: spec.barbe,
      barbeCouleur: spec.barbe > 0 ? melanger(spec.cheveux, GRIS, Math.max(0, (spec.age - 40) / 30)) : undefined,
    });
  } else {
    for (const dx of [-0.38, 0.3]) {
      tete.poly(flat(blob(dx * rTete, -rTete * 0.22, rTete * 0.2, rTete * 0.08, { seed: dx * 10 + 3, points: 10, wobble: 0.2 }))).fill({
        color: ombreBleutee(PARCHEMIN, 1),
        alpha: 0.86,
      });
    }
  }
  poserCoiffe({ g: tete, mats, kit }, spec, rTete, seed + 37);
  racine.addChild(tete);

  // ── enluminure, posée par-dessus le sujet ──────────────────────────────
  const cadreG = new Graphics();
  racine.addChild(cadreG);
  // bandeau de parchemin en pied : le cartouche du nom
  const cart = perturber(
    densifier([pt(-W * 0.42, H * 0.32), pt(W * 0.42, H * 0.31), pt(W * 0.4, H * 0.45), pt(-W * 0.4, H * 0.46)], 14),
    0.8,
    seed + 41,
  );
  poser(cadreG, mats, cart, PARCHEMIN, { matiere: 'parchemin', alpha: 0.32, echelle: 0.6, modele: 0.7, rim: false });
  filetDore(cadreG, -W * 0.4, H * 0.33, W * 0.8, H * 0.11, { epaisseur: 1.2, ecart: 2.6, seed: seed + 43, alpha: 0.8 });

  filetDore(cadreG, -W / 2 + 7, -H / 2 + 7, W - 14, H - 14, { epaisseur: 2, ecart: 4.4, seed: seed + 47, alpha: 0.95 });
  const cx = W / 2 - 15;
  const cy = H / 2 - 15;
  ecoincon(cadreG, -cx, -cy, 20, 0.6, LIGHT.rim, 0.8);
  ecoincon(cadreG, cx, -cy, 20, 2.5, LIGHT.rim, 0.7);
  ecoincon(cadreG, -cx, cy, 20, -0.7, LIGHT.rim, 0.7);
  ecoincon(cadreG, cx, cy, 20, 3.7, LIGHT.rim, 0.65);

  // vignettage doux, bleuté dans les coins sud-est
  cadreG
    .poly(flat(perturber(densifier([pt(W * 0.18, H * 0.5), pt(W * 0.5, H * 0.5), pt(W * 0.5, H * 0.1)], 14), 1, seed + 53)))
    .fill({ color: LIGHT.froide, alpha: 0.1 });

  return racine;
}

/** Toutes les clefs de portrait, lues depuis le contenu. */
export function clesPortraits(): string[] {
  return Object.values(HEROES).map((h) => h.portrait);
}

/** Libellé du héros, pour la planche de contact. */
export function nomHeros(key: string): string {
  const id = key.startsWith('portrait_') ? key.slice('portrait_'.length) : key;
  return HEROES[id]?.name ?? id;
}

export { PORTRAIT_W as LARGEUR_PORTRAIT, PORTRAIT_H as HAUTEUR_PORTRAIT };
