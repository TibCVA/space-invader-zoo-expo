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
  demiVuePct,
  empriseDe,
  moduleDe,
  planDeMasse,
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

/**
 * Le plan de masse d'un cas, tout construit — LE MÊME appel que la vue :
 * position déclarée, accrochage aux terrasses, desserrage des voisins. Le
 * desserrage a d'abord vécu dans la vue seule, et les gardes ont mesuré
 * pendant ce temps-là un tableau que personne ne dessinait.
 */
function planDuCas(faction: FactionId, cas: Cas): Map<string, { x: number; y: number }> {
  return planDeMasse(toutConstruit(faction).visibles, faction, cas.portrait);
}

/** Emprise du canevas peint d'un bâtiment, en pixels du cadre. */
function emprise(
  def: BuildingDef,
  cas: Cas,
  faction: FactionId,
  plan: ReadonlyMap<string, { x: number; y: number }>,
): { gauche: number; droite: number; haut: number; bas: number } {
  const p = plan.get(def.id) ?? basePct(def, faction, cas.portrait);
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
        const plan = planDuCas(faction, cas);
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
          const e = emprise(def, cas, faction, plan);
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
        /* DESSERRAGE COMPRIS : c'est la garde qui interdit qu'en écartant deux
           voisins on décroche un bâtiment du sol peint. */
        const { visibles } = toutConstruit(faction);
        const plan = planDuCas(faction, cas);
        const terrasses = TERRASSES[faction][cas.portrait ? 'portrait' : 'paysage'];
        for (const def of visibles) {
          const p = plan.get(def.id) ?? basePct(def, faction, cas.portrait);
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

/**
 * LA DISTANCE ENTRE DEUX BÂTIMENTS DISTINCTS.
 *
 * Plainte du propriétaire, en jouant : « les bâtiments sont trop proches les
 * uns des autres ». Aucune des seize gardes ci-dessus ne tenait cela — elles
 * tiennent les terrasses, l'axe de la porte, les chaînes et la couverture,
 * c'est-à-dire chaque bâtiment SEUL et le tableau ENTIER, jamais une paire.
 * `basePct` place d'ailleurs chaque pied sans jamais regarder ses voisins.
 *
 * Mesuré alors, tout construit : un bâtiment de la Châtellenie disparaissait à
 * 87 % dans son voisin (« Écuries du Forez / Porte des Farges »), et
 * l'Ermitage en portrait avait trente-neuf paires à moitié enfouies.
 *
 * On mesure sur la MASSE VISIBLE (`demiVuePct`) et non sur le canevas peint :
 * le carré du WebP est aux deux tiers transparent, deux canevas qui se
 * recouvrent ne veulent pas dire deux maisons qui se recouvrent.
 */
describe('plan de masse — deux bâtiments distincts ne se marchent pas dessus', () => {
  /** Le rapport le plus serré du tableau, et les paires à moitié enfouies. */
  function serrage(faction: FactionId, cas: Cas) {
    const { visibles } = toutConstruit(faction);
    const plan = planDuCas(faction, cas);
    /* Un point de hauteur pèse moins qu'un point de largeur : le tableau est
       en perspective, et le cadre n'est pas carré. */
    const aspect = cas.cadre.h / cas.cadre.w;
    let pire = Infinity;
    let pireNom = '—';
    let enfouies = 0;
    for (let i = 0; i < visibles.length; i += 1) {
      for (let j = i + 1; j < visibles.length; j += 1) {
        const a = visibles[i];
        const b = visibles[j];
        /* Même emprise = même place au sol, par construction : une chaîne qui
           monte, une guilde qui grandit. Les écarter serait le défaut. */
        if (empriseDe(a) === empriseDe(b)) continue;
        const pa = plan.get(a.id) ?? basePct(a, faction, cas.portrait);
        const pb = plan.get(b.id) ?? basePct(b, faction, cas.portrait);
        const d = Math.hypot(pa.x - pb.x, (pa.y - pb.y) * aspect);
        const rapport = d / (demiVuePct(a, cas.portrait) + demiVuePct(b, cas.portrait));
        if (rapport < 0.6) enfouies += 1;
        if (rapport < pire) {
          pire = rapport;
          pireNom = `${a.name} / ${b.name}`;
        }
      }
    }
    return { pire, pireNom, enfouies };
  }

  for (const faction of FACTIONS) {
    for (const cas of CAS) {
      it(`${faction}, ${cas.nom} : aucun bâtiment n'est enterré dans son voisin`, () => {
        const { pire, pireNom } = serrage(faction, cas);
        /* 1 = les deux masses se touchent sans se recouvrir. Un tableau de
           ville EST serré — on n'exige pas l'isolement, on interdit
           l'enfouissement. Sans desserrage : de 0,07 à 0,25 selon le panorama. */
        expect(pire, `paire la plus serrée : ${pireNom} (${pire.toFixed(2)})`).toBeGreaterThan(0.45);
      });

      it(`${faction}, ${cas.nom} : presque aucune paire à moitié enfouie`, () => {
        const { enfouies } = serrage(faction, cas);
        /* Sans desserrage : 2, 15, 27 et 39 selon le panorama. L'Ermitage en
           portrait en garde quatre — ses clairières ne peuvent matériellement
           pas tenir trente-deux bâtiments, et le sol l'emporte sur l'écart.
           Éprouvée en débranchant le desserrage : rougit sur trois panoramas
           des quatre. La Châtellenie en paysage n'en avait que deux, sous la
           barre ; là c'est la garde de l'enfouissement (0,13) qui tient. */
        expect(enfouies, `${enfouies} paires recouvertes de plus de 40 %`).toBeLessThanOrEqual(6);
      });
    }
  }
});
