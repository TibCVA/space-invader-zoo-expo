/**
 * Le plan de masse : tout construit, la cité est couverte.
 *
 * Exigence littérale du propriétaire : « les bâtiments doivent être disposés
 * de manière logique dans tous les espaces, si bien que quand on a tout
 * construit, l'ensemble de la cité est recouverte par des bâtiments à la
 * bonne taille et non pas simplement de petits bâtiments qui ne recouvrent
 * qu'une partie. »
 *
 * Le test mesure ce que la vue dessine : mêmes rectangles de terrasses, même
 * module, même perspective, même facteur de canevas (`masse.ts`), sur les
 * deux cadres réels — bureau 1920×1080 et iPhone 390×844 (panorama portrait).
 * La couverture est la fraction des terrasses balayée par les emprises des
 * bâtiments, tout construit, améliorations fusionnées à leurs demeures.
 *
 * Avant la recomposition, la capitale de démonstration (22 bâtiments sur une
 * trentaine) laissait vides le faîte, les terrasses hautes et tout le flanc
 * droit du panorama.
 */
import { describe, expect, it } from 'vitest';
import type { BuildingDef, FactionId } from '@auvergne/engine';
import { buildingsOf } from '@auvergne/content';
import {
  PANO_PORTRAIT_HAUTEUR,
  PANO_PORTRAIT_LARGEUR,
  cadrerPanorama,
  cadrerSource,
} from './panorama.js';
import type { CadreCite } from './panorama.js';
import {
  SPRITE_FACTEUR,
  TERRASSES,
  basePct,
  moduleDe,
  tailleDe,
  visiblesDe,
} from './masse.js';

const FACTIONS: FactionId[] = ['granit', 'ermitage'];

/** L'axe de la porte, en coordonnées du plan (0-100) : il reste dégagé. */
const PORTE_PLAN = { x0: 38, x1: 64, y0: 92 };

interface Cas {
  nom: string;
  cadre: CadreCite;
  portrait: boolean;
}

const CAS: Cas[] = [
  { nom: 'bureau 1920×1080', cadre: cadrerPanorama(1920, 1080), portrait: false },
  {
    nom: 'iPhone 390×844',
    cadre: cadrerSource(390, 844, PANO_PORTRAIT_LARGEUR, PANO_PORTRAIT_HAUTEUR),
    portrait: true,
  },
];

function toutConstruit(faction: FactionId): { catalogue: BuildingDef[]; visibles: BuildingDef[] } {
  const catalogue = buildingsOf(faction);
  const batis = new Set(catalogue.map((d) => d.id));
  return { catalogue, visibles: visiblesDe(catalogue, batis) };
}

/** Emprise du canevas peint d'un bâtiment, en pixels du cadre — le pied
    passe par `basePct`, exactement comme dans la vue (terrasses comprises). */
function emprise(
  def: BuildingDef,
  cas: Cas,
  faction: FactionId,
): { gauche: number; droite: number; haut: number; bas: number } {
  const p = basePct(def, faction, cas.portrait);
  const x = cas.cadre.x + (cas.cadre.w * p.x) / 100;
  const y = cas.cadre.y + (cas.cadre.h * p.y) / 100;
  const cote = tailleDe(def, moduleDe(cas.cadre.w, cas.portrait)) * SPRITE_FACTEUR;
  /* Ancre du sprite : (0,5 ; 0,97) — le canevas monte depuis son pied. */
  return { gauche: x - cote / 2, droite: x + cote / 2, haut: y - cote * 0.97, bas: y + cote * 0.03 };
}

describe('plan de masse — tout construit couvre les terrasses', () => {
  for (const faction of FACTIONS) {
    for (const cas of CAS) {
      it(`${faction}, ${cas.nom} : au moins 70 % des terrasses sous les bâtiments`, () => {
        /* La couverture se mesure sur l'UNION DES TERRASSES — les sols où un
           bâtiment peut réellement se poser — pas sur le rectangle englobant,
           qui compte murets et falaises comme des espaces à couvrir. */
        const { visibles } = toutConstruit(faction);
        const terrasses = TERRASSES[faction][cas.portrait ? 'portrait' : 'paysage'];
        const NX = 160;
        const NY = 100;
        const dansTerrasse = new Uint8Array(NX * NY);
        let total = 0;
        for (let r = 0; r < NY; r++) {
          for (let c = 0; c < NX; c++) {
            const xPct = ((c + 0.5) / NX) * 100;
            const yPct = ((r + 0.5) / NY) * 100;
            for (const z of terrasses) {
              if (xPct >= z.x0 && xPct <= z.x1 && yPct >= z.y0 && yPct <= z.y1) {
                dansTerrasse[r * NX + c] = 1;
                total++;
                break;
              }
            }
          }
        }
        expect(total).toBeGreaterThan(0);
        const grille = new Uint8Array(NX * NY);
        for (const def of visibles) {
          const e = emprise(def, cas, faction);
          const versPct = (px: number, horizontal: boolean): number =>
            horizontal
              ? ((px - cas.cadre.x) / cas.cadre.w) * 100
              : ((px - cas.cadre.y) / cas.cadre.h) * 100;
          const c0 = Math.max(0, Math.floor((versPct(e.gauche, true) / 100) * NX));
          const c1 = Math.min(NX - 1, Math.ceil((versPct(e.droite, true) / 100) * NX));
          const r0 = Math.max(0, Math.floor((versPct(e.haut, false) / 100) * NY));
          const r1 = Math.min(NY - 1, Math.ceil((versPct(e.bas, false) / 100) * NY));
          for (let r = r0; r <= r1; r++) {
            for (let c = c0; c <= c1; c++) grille[r * NX + c] = 1;
          }
        }
        let couvertes = 0;
        for (let i = 0; i < grille.length; i++) {
          if (dansTerrasse[i] === 1 && grille[i] === 1) couvertes++;
        }
        const part = couvertes / total;
        expect(part, `couverture ${(part * 100).toFixed(1)} %`).toBeGreaterThanOrEqual(0.7);
      });

      it(`${faction}, ${cas.nom} : chaque pied de bâtiment est dans une terrasse`, () => {
        const { visibles } = toutConstruit(faction);
        const terrasses = TERRASSES[faction][cas.portrait ? 'portrait' : 'paysage'];
        for (const def of visibles) {
          const p = basePct(def, faction, cas.portrait);
          const dedans = terrasses.some(
            (z) => p.x >= z.x0 && p.x <= z.x1 && p.y >= z.y0 && p.y <= z.y1,
          );
          expect(dedans, `${def.id} a le pied hors terrasse (${p.x.toFixed(1)}, ${p.y.toFixed(1)})`)
            .toBe(true);
        }
      });
    }

    it(`${faction} : l'axe de la porte reste dégagé`, () => {
      const { visibles } = toutConstruit(faction);
      for (const def of visibles) {
        const dansAxe =
          def.scene.x > PORTE_PLAN.x0 && def.scene.x < PORTE_PLAN.x1 && def.scene.y > PORTE_PLAN.y0;
        expect(dansAxe, `${def.id} bouche la porte`).toBe(false);
      }
    });

    it(`${faction} : chaque amélioration agrandit sa demeure sur place`, () => {
      const { catalogue } = toutConstruit(faction);
      const parId = new Map(catalogue.map((d) => [d.id, d]));
      for (const def of catalogue) {
        if (!def.id.includes('_amelioration_')) continue;
        const demeure = parId.get(def.id.replace('_amelioration_', '_demeure_'));
        expect(demeure, `${def.id} sans demeure`).toBeDefined();
        if (!demeure) continue;
        expect(def.scene.x).toBe(demeure.scene.x);
        expect(def.scene.y).toBe(demeure.scene.y);
        expect(def.scene.scale).toBeGreaterThan(demeure.scene.scale);
      }
    });

    it(`${faction} : tout construit, l'amélioration remplace la demeure au tableau`, () => {
      const { catalogue, visibles } = toutConstruit(faction);
      const ids = new Set(visibles.map((d) => d.id));
      for (const def of catalogue) {
        if (def.id.includes('_amelioration_')) {
          expect(ids.has(def.id), `${def.id} absente`).toBe(true);
          expect(
            ids.has(def.id.replace('_amelioration_', '_demeure_')),
            `${def.id} et sa demeure peintes ensemble`,
          ).toBe(false);
        }
      }
    });

    it(`${faction} : les chaînes montent sur une même emprise`, () => {
      const { catalogue } = toutConstruit(faction);
      for (const chaine of ['hotel_ville', 'defense'] as const) {
        const membres = catalogue.filter((d) => d.chain === chaine);
        if (membres.length < 2) continue;
        for (const m of membres) {
          expect(m.scene.x).toBe(membres[0].scene.x);
          expect(m.scene.y).toBe(membres[0].scene.y);
        }
      }
      const guildes = catalogue
        .filter((d) => d.id.startsWith('guilde_'))
        .sort((a, b) => a.id.localeCompare(b.id));
      for (const g of guildes) {
        expect(g.scene.x).toBe(guildes[0].scene.x);
        expect(g.scene.y).toBe(guildes[0].scene.y);
      }
    });
  }
});
