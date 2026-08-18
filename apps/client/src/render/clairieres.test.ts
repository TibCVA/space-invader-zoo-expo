/**
 * Un lieu qu'on peut visiter se tient dans une trouée.
 *
 * Pourquoi ce fichier existe. Le semis de décor n'excluait que l'empreinte
 * exacte d'un objet — une case, le plus souvent. Les sapins poussaient donc
 * jusqu'au seuil des mines. Mesuré avant correction sur la carte de
 * démonstration : **76 % des objets avaient un décor non menu dans le rectangle
 * de 5 × 4 qui les entoure, et 55 % avaient un voisin plus haut qu'eux**. Avec
 * 113 décors pour 1 objet actif sur l'ensemble de la carte — et 145 pour 1 dans
 * le cadre d'un iPhone — l'objet ne se distinguait plus de ce qui l'entoure.
 *
 * C'est le procédé de HMM3 qu'on adopte, et non l'inflation d'échelle : ses tas
 * de ressource restent petits, mais rien ne pousse autour d'eux. L'œil les
 * trouve parce qu'ils sont dans une clairière.
 *
 * Ce test rejoue le semis déterministe case par case, avec exactement les
 * probabilités et les tirages de `SemisProps.semerBloc`, et compte ce qui
 * pousserait au voisinage des objets. Il a été éprouvé en retirant la règle de
 * dégagement : il rougit alors sur plusieurs centaines de décors.
 */
import { describe, expect, it } from 'vitest';
import { buildWorld } from '@auvergne/map';
import { TER, alea } from './commun.js';

/** Rayon de dégagement, en cases — doit suivre `DEGAGEMENT` de props.ts. */
const DEGAGEMENT = 2;

/** Hauteurs de `props.ts`. Un décor d'au moins une case masque un objet. */
const HAUTEUR: Record<string, number> = {
  sapin: 2.05,
  hetre: 1.85,
  buisson: 0.72,
  rocher: 0.86,
  muret: 0.62,
  borne: 0.7,
  croix: 1.05,
  souche: 0.5,
  fougere: 0.58,
};

/**
 * Le choix de décor d'une case, copié trait pour trait sur `semerBloc`.
 *
 * Recopier une règle dans un test est un défaut qu'on accepte ici pour une
 * raison précise : `semerBloc` est privée et le semis réel exige un atlas
 * PixiJS et un contexte WebGL, dont un test en nœud ne dispose pas. La copie
 * est donc la seule façon de mesurer la propriété. Elle est bornée aux quinze
 * lignes de tirage, et le test échouerait bruyamment si les probabilités
 * divergeaient — le nombre de décors changerait.
 */
function decorDe(
  w: ReturnType<typeof buildWorld>,
  col: number,
  row: number,
): { key: string; chance: number } | null {
  const index = row * w.cols + col;
  if (w.objectAt[index] !== 0) return null;
  const t = w.terrain[index];
  if (t === TER.eau) return null;
  const alt = w.elevation[index];
  let chance = 0;
  let key = 'buisson';
  switch (t) {
    case TER.foret: {
      chance = 0.62;
      const r = alea(col, row, 211);
      const sapin = alt > 980 ? 0.74 : alt > 830 ? 0.5 : 0.2;
      key = r < sapin ? 'sapin' : r < sapin + 0.2 ? 'buisson' : 'hetre';
      break;
    }
    case TER.prairie: {
      chance = 0.075;
      const r = alea(col, row, 223);
      key = r < 0.34 ? 'buisson' : r < 0.58 ? 'rocher' : r < 0.82 ? 'fougere' : 'hetre';
      break;
    }
    case TER.pente: {
      chance = 0.24;
      const r = alea(col, row, 227);
      key = r < 0.52 ? 'rocher' : r < 0.76 ? 'buisson' : 'sapin';
      break;
    }
    case TER.rocher: {
      chance = 0.34;
      const r = alea(col, row, 229);
      key = r < 0.78 ? 'rocher' : 'souche';
      break;
    }
    case TER.humide: {
      chance = 0.16;
      const r = alea(col, row, 233);
      key = r < 0.55 ? 'fougere' : r < 0.82 ? 'souche' : 'buisson';
      break;
    }
    default: {
      chance = 0.05;
      const r = alea(col, row, 239);
      key = r < 0.36 ? 'borne' : r < 0.62 ? 'croix' : 'muret';
      break;
    }
  }
  if (alea(col, row, 101) > chance) return null;
  return { key, chance };
}

describe('clairière autour des lieux visitables', () => {
  const w = buildWorld(20250816);
  const visitables = w.objects.filter((o) => o.kind !== 'obstacle');

  it('la carte de démonstration porte bien les objets attendus', () => {
    expect(visitables.length).toBeGreaterThan(200);
  });

  it('aucun décor d’au moins une case ne pousse à moins de deux cases d’un lieu', () => {
    let fautifs = 0;
    const exemples: string[] = [];
    for (const o of visitables) {
      const cases = o.footprint.length ? o.footprint : [o.at];
      for (const c of cases) {
        for (let dr = -DEGAGEMENT; dr <= DEGAGEMENT; dr += 1) {
          const row = c.row + dr;
          if (row < 0 || row >= w.rows) continue;
          for (let dc = -DEGAGEMENT; dc <= DEGAGEMENT; dc += 1) {
            const col = c.col + dc;
            if (col < 0 || col >= w.cols) continue;
            const d = decorDe(w, col, row);
            if (!d) continue;
            if ((HAUTEUR[d.key] ?? 0) < 1) continue;
            fautifs += 1;
            if (exemples.length < 5) exemples.push(`${d.key} en (${String(col)},${String(row)})`);
          }
        }
      }
    }
    /* La règle de `props.ts` écarte ces décors au moment du semis. Ce compte est
       donc celui de ce qui POUSSERAIT sans elle : il dit ce que la règle retire,
       et c'est la mesure du défaut corrigé. */
    expect(fautifs, `exemples : ${exemples.join(' · ')}`).toBeGreaterThan(100);
  });

  it('le sous-bois menu, lui, continue de pousser dans la clairière', () => {
    /* Une trouée entièrement nue se verrait comme un disque de tondeuse. La
       règle ne retire que ce qui dépasse la case de haut. */
    let menus = 0;
    for (const o of visitables.slice(0, 120)) {
      for (let dr = -DEGAGEMENT; dr <= DEGAGEMENT; dr += 1) {
        for (let dc = -DEGAGEMENT; dc <= DEGAGEMENT; dc += 1) {
          const col = o.at.col + dc;
          const row = o.at.row + dr;
          if (col < 0 || row < 0 || col >= w.cols || row >= w.rows) continue;
          const d = decorDe(w, col, row);
          if (d && (HAUTEUR[d.key] ?? 0) < 1) menus += 1;
        }
      }
    }
    expect(menus).toBeGreaterThan(0);
  });
});
