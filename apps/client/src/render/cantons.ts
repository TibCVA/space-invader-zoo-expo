/**
 * `render/cantons.ts` — le caractère visuel des douze pays du Forez.
 *
 * **Le défaut que ce fichier corrige.** Le décor et le sol ne connaissaient que
 * le TERRAIN. Une prairie de la Marche de La Renaudie et une prairie des Hauts
 * d'Arconsat recevaient exactement la même couleur, la même densité de semis et
 * le même tirage de buissons ; une futaie de Viscomtat et le Cœur des Bois Noirs
 * étaient interchangeables. Les douze cantons existaient donc dans le moteur, sur
 * la minicarte et dans les libellés — et nulle part dans l'image. Le propriétaire
 * l'a dit sans détour : « les différentes zones bien délimitées visuellement ».
 *
 * **Ce que HMM3 fait, et ce qu'on peut en reprendre.** HMM3 délimite ses zones
 * par le TYPE DE SOL : herbe, terre, neige, lave, souterrain. On ne peut pas
 * copier ce procédé — nos terrains sont ceux du Forez réel et ils traversent les
 * cantons — mais on peut en reprendre l'effet par trois moyens qui se cumulent
 * et qu'un joueur lit sans qu'on lui explique :
 *
 *   1. une TEINTE de pays, mélangée au sol. Elle est prise LOIN du sol — le sol
 *      du Forez vit entre 79° et 90° de teinte, les ancres sont à 35°, 144°,
 *      206°, 352° — parce que la première série, bâtie sur des mélanges voisins,
 *      ne déplaçait la teinte que de zéro à quatre degrés : mesurée, elle ne
 *      faisait rien du tout ;
 *   2. une DENSITÉ propre. Le Cœur des Bois Noirs est une forêt qu'on ne voit pas
 *      au travers ; les Hauts d'Arconsat sont une estive rase. C'est le signal le
 *      plus fort et le moins coûteux : il ne crée aucune couture ;
 *   3. une SIGNATURE : ce qu'on voit ici et moins ailleurs. Les aiguilles de
 *      granit à Vollore, les murets de pierre sèche à Cervières, les souches
 *      noyées des sagnes, les croix de chemin sur la Grande Chaussée.
 *
 * S'y ajoute le décor BÂTI, qui n'existait pas du tout : l'atlas portait une
 * ferme, une chapelle, une tour et un moulin — quatre silhouettes complètes,
 * quatre variantes chacune — que le semis n'a jamais posées. Aucun hameau, aucun
 * clocher, aucune tour de guet sur toute la carte. C'était la réponse la plus
 * directe à « beaucoup de détails, même si items non jouables », et elle
 * dormait dans l'atlas.
 */

import { CELL_ROAD, REGIONS, TERRAINS, type WorldMap } from '@auvergne/engine';
import type { PropKey } from '../art/index.js';
import { PALETTE, melanger } from '../art/palette.js';

/** Ce qui fait qu'on reconnaît un pays sans lire son nom. */
export interface Canton {
  /**
   * Multiplicateur de densité du semis. Un seul chiffre, mais c'est lui qui
   * fait qu'on sent qu'on entre dans les Bois Noirs.
   */
  readonly densite: number;
  /** Teinte de pays, mélangée au sol. */
  readonly teinte: number;
  /** Dose du mélange, en fraction. Jamais au-delà de 0,22 (voir en-tête). */
  readonly dose: number;
  /**
   * Ce qu'on voit ici et moins ailleurs, et la probabilité de substituer une
   * signature au tirage du terrain. La substitution respecte le terrain : on ne
   * met pas un muret dans une tourbière, la table de compatibilité s'en charge.
   */
  readonly signature: readonly PropKey[];
  readonly force: number;
  /**
   * Le bâti de décor, avec sa probabilité par case éligible. Rare par nature :
   * un hameau tous les deux ou trois cents pas, jamais deux fois la même
   * silhouette au même endroit.
   */
  readonly bati: readonly PropKey[];
  readonly chanceBati: number;
}

/*
 * Teintes de pays, choisies SUR MESURE et non au nom.
 *
 * La première série était bâtie sur des mélanges voisins du biome — « estive »
 * = hêtre × ocre, « hétraie » = hêtre × fougère — et la mesure l'a réfutée : à
 * douze pour cent, elles déplaçaient la teinte du sol de zéro à quatre degrés et
 * sa clarté de deux points. Autrement dit rien. Ce qu'on croyait lire sur la
 * capture comme une délimitation de zones était le TERRAIN — prairie, forêt,
 * roche — et non le pays.
 *
 * Les ancres sont donc prises loin du sol : le sol du Forez vit entre 79° et 90°
 * de teinte, on va chercher le bleu de brume à 206°, l'ocre à 35°, le sapin à
 * 144°, le grenat à 352°. Et la dose monte à un cinquième, ce que la mesure
 * autorise : la couture qu'on craignait ne vient pas de la dose mais de
 * l'écart entre deux pays voisins, et l'on garde donc les voisins proches —
 * l'Hermitage et Vollore ne se touchent pas, Cervières et la Maison du Trésor
 * partagent la même famille chaude.
 */
/*
 * Le bleu de brume pur vaut 163 de clarté, presque le double du sol : à un
 * cinquième il ÉCLAIRCISSAIT l'estive de seize points et lui ôtait neuf points
 * de saturation — un pays délavé, c'est-à-dire le défaut d'affichage qu'on
 * voulait éviter. On le refroidit donc au bleu profond avant de l'employer.
 */
const BRUME_D_ESTIVE = melanger(PALETTE.bleuBrume, PALETTE.bleuProfond, 0.55);
const TOURBE = PALETTE.bleuProfond;
const SAPIN_NOIR = melanger(PALETTE.vertSapin, PALETTE.bleuProfond, 0.4);
/* La gorge des couteliers : hêtraie fraîche et humide, donc un vert PLUS VIF
   que le sol et non plus sombre — la mousse sombre, mesurée, ne déplaçait rien
   (quatre degrés, deux points de chroma) parce qu'elle est terne et voisine. */
const HETRAIE_FRAICHE = PALETTE.vertHetre;
const PIERRE_CHAUDE = PALETTE.ocre;
const FOUGERE_SECHE = PALETTE.brunFougere;
const CALLUNE = melanger(PALETTE.grenat, PALETTE.brunFougere, 0.3);
/* Le pays des carriers : le granit clair est un neutre à cinq pour cent de
   chroma, donc un gel gris ne fait RIEN — mesuré à deux degrés et zéro point.
   On le refroidit au bleu profond : la pierre du Forez est bleue. */
const GRANIT_GRIS = melanger(PALETTE.bleuProfond, PALETTE.granitClair, 0.4);
/* Même correction : le parchemin d'ombre vaut 176 de clarté. */
const POUSSIERE = melanger(PALETTE.parcheminOmbre, PALETTE.brunFougere, 0.55);

/**
 * Les douze pays.
 *
 * Chaque ligne est un choix d'auteur, appuyé sur le lieu réel : les Hauts
 * d'Arconsat sont une estive à moutons battue par le vent au-dessus du bourg,
 * la Durolle est la gorge des couteliers, le Cœur des Bois Noirs est la
 * sapinière la plus sombre du massif, Vollore et Pamole sont le pays des
 * carriers, la Grande Chaussée est la route du sel.
 */
export const CANTONS: Readonly<Record<string, Canton>> = {
  hauts_arconsat: {
    densite: 0.62,
    teinte: BRUME_D_ESTIVE,
    dose: 0.18,
    signature: ['rocher', 'muret', 'aiguille'],
    force: 0.5,
    bati: ['ferme', 'tour'],
    chanceBati: 0.006,
  },
  vallee_durolle: {
    densite: 1.15,
    teinte: HETRAIE_FRAICHE,
    dose: 0.22,
    signature: ['hetre', 'fougere', 'souche'],
    force: 0.45,
    bati: ['moulin', 'ferme'],
    chanceBati: 0.01,
  },
  lac_sagnes: {
    densite: 0.9,
    teinte: TOURBE,
    dose: 0.2,
    signature: ['souche', 'fougere', 'buisson'],
    force: 0.6,
    bati: ['chapelle'],
    chanceBati: 0.004,
  },
  maison_tresor: {
    densite: 0.8,
    teinte: PIERRE_CHAUDE,
    dose: 0.14,
    signature: ['croix', 'rocher', 'muret'],
    force: 0.5,
    bati: ['tour', 'chapelle'],
    chanceBati: 0.008,
  },
  chatellenie_cervieres: {
    densite: 0.78,
    teinte: PIERRE_CHAUDE,
    dose: 0.2,
    signature: ['muret', 'croix', 'buisson'],
    force: 0.55,
    bati: ['ferme', 'tour', 'chapelle'],
    chanceBati: 0.012,
  },
  futaies_viscomtat: {
    densite: 1.28,
    teinte: SAPIN_NOIR,
    dose: 0.14,
    signature: ['hetre', 'sapin', 'fougere'],
    force: 0.55,
    bati: ['ferme'],
    chanceBati: 0.006,
  },
  coeur_bois_noirs: {
    densite: 1.42,
    teinte: SAPIN_NOIR,
    dose: 0.22,
    signature: ['sapin', 'souche', 'rocher'],
    force: 0.68,
    bati: ['chapelle'],
    chanceBati: 0.003,
  },
  pays_noiretable: {
    densite: 0.95,
    teinte: FOUGERE_SECHE,
    dose: 0.16,
    signature: ['buisson', 'muret', 'croix'],
    force: 0.45,
    bati: ['ferme', 'chapelle'],
    chanceBati: 0.011,
  },
  hermitage_peyrotine: {
    densite: 1.05,
    teinte: CALLUNE,
    dose: 0.14,
    signature: ['croix', 'hetre', 'buisson'],
    force: 0.5,
    bati: ['chapelle', 'ferme'],
    chanceBati: 0.012,
  },
  vollore_pamole: {
    densite: 0.86,
    teinte: GRANIT_GRIS,
    dose: 0.2,
    signature: ['aiguille', 'rocher', 'muret'],
    force: 0.62,
    bati: ['ferme', 'tour'],
    chanceBati: 0.01,
  },
  marche_renaudie: {
    densite: 1.0,
    teinte: FOUGERE_SECHE,
    dose: 0.16,
    signature: ['sapin', 'muret', 'ferme'],
    force: 0.42,
    bati: ['ferme', 'moulin'],
    chanceBati: 0.013,
  },
  grande_chaussee: {
    densite: 0.88,
    teinte: POUSSIERE,
    dose: 0.18,
    signature: ['borne', 'croix', 'muret'],
    force: 0.5,
    bati: ['ferme', 'chapelle', 'tour'],
    chanceBati: 0.014,
  },
};

/** Le pays par défaut, si un index de région sortait de la table. */
const PAYS_QUELCONQUE: Canton = {
  densite: 1,
  teinte: HETRAIE_FRAICHE,
  dose: 0,
  signature: [],
  force: 0,
  bati: [],
  chanceBati: 0,
};

/**
 * La teinte de pays s'applique comme un GEL de lumière, non comme un mélange.
 *
 * Le mélange linéaire vers une couleur plate a un défaut que la mesure a mis au
 * jour : sur un sol presque gris — la roche du Forez vit à onze pour cent de
 * saturation — mélanger de l'ocre à un sixième annule le bleu et rend un gris
 * plat à deux pour cent. C'est exactement ce que le peintre du terrain a
 * combattu pendant tout un chantier : « les anciennes crêtes finissaient toutes
 * dans le gris ». Un pays ne doit pas laver la roche de sa couleur.
 *
 * Un gel multiplie les canaux au lieu de les tirer vers une valeur commune : il
 * se comporte comme un verre coloré posé devant la lumière. Normalisé sur la
 * moyenne de ses canaux, il ne change presque pas la clarté, et il AJOUTE de la
 * chroma dans sa direction au lieu d'en retirer — un gris chauffé par un gel
 * ocre devient un gris chaud, pas un gris mort.
 */
export function gelDePays(couleur: number, teinte: number, dose: number): number {
  if (dose <= 0) return couleur;
  const tr = (teinte >> 16) & 255;
  const tg = (teinte >> 8) & 255;
  const tb = teinte & 255;
  const moyenne = Math.max(1, (tr + tg + tb) / 3);
  const gel = (canal: number, t: number): number => {
    const v = Math.round(canal * (1 + dose * (t / moyenne - 1)));
    return v < 0 ? 0 : v > 255 ? 255 : v;
  };
  const r = gel((couleur >> 16) & 255, tr);
  const g = gel((couleur >> 8) & 255, tg);
  const b = gel(couleur & 255, tb);
  return (r << 16) | (g << 8) | b;
}

/** Le caractère du pays d'un index de région. */
export function cantonDe(region: number): Canton {
  const id = REGIONS[region];
  return (id ? CANTONS[id] : undefined) ?? PAYS_QUELCONQUE;
}

/**
 * Quels terrains acceptent quelle silhouette.
 *
 * Sans cette table, la signature d'un canton poserait des murets de pierre
 * sèche au milieu d'une tourbière et des sapins sur une dalle de granit. Le
 * terrain garde le dernier mot sur ce qui POUSSE ; le canton ne décide que du
 * goût, à l'intérieur de ce que le terrain permet.
 *
 * Les noms de terrain sont ceux de `TERRAINS` du moteur : `accepte` les résout
 * en index une fois pour toutes, pour ne pas comparer des chaînes par case.
 */
const TERRAINS_DE_LA_SIGNATURE: Readonly<Record<PropKey, readonly string[]>> = {
  sapin: ['foret', 'pente', 'lande', 'rocher'],
  hetre: ['foret', 'prairie', 'pente'],
  buisson: ['prairie', 'pente', 'lande', 'humide', 'foret'],
  rocher: ['prairie', 'pente', 'rocher', 'falaise', 'lande'],
  aiguille: ['rocher', 'falaise', 'pente'],
  muret: ['prairie', 'lande', 'pente'],
  borne: ['prairie', 'lande', 'chemin', 'route'],
  croix: ['prairie', 'lande', 'chemin', 'route', 'pente'],
  moulin: ['prairie', 'chemin', 'route'],
  pont: [],
  tour: ['prairie', 'lande', 'pente', 'rocher'],
  ferme: ['prairie', 'chemin', 'route'],
  chapelle: ['prairie', 'lande', 'chemin', 'route'],
  souche: ['foret', 'humide', 'lande'],
  fougere: ['foret', 'humide', 'prairie', 'pente'],
};

/** Index de terrain acceptés, par silhouette — résolus une seule fois. */
const ACCEPTE = new Map<PropKey, ReadonlySet<number>>(
  (Object.keys(TERRAINS_DE_LA_SIGNATURE) as PropKey[]).map((k) => [
    k,
    new Set(
      TERRAINS_DE_LA_SIGNATURE[k]
        .map((nom) => TERRAINS.indexOf(nom as (typeof TERRAINS)[number]))
        .filter((i) => i >= 0),
    ),
  ]),
);

/** Ce terrain accepte-t-il cette silhouette ? */
export function accepte(key: PropKey, terrain: number): boolean {
  return ACCEPTE.get(key)?.has(terrain) ?? false;
}

/**
 * Le bâti de décor se tient au bord d'une voie, comme dans la vraie vie.
 *
 * Une ferme au milieu d'un pré sans chemin pour y monter est un décor de
 * maquette. On cherche donc une voie dans un rayon de trois cases — assez pour
 * que le hameau paraisse desservi, assez peu pour qu'il ne soit pas SUR la
 * route, où il masquerait le passage du héros.
 */
export function pretDeLaVoie(w: WorldMap, col: number, row: number, rayon = 3): boolean {
  for (let dr = -rayon; dr <= rayon; dr += 1) {
    const r = row + dr;
    if (r < 0 || r >= w.rows) continue;
    for (let dc = -rayon; dc <= rayon; dc += 1) {
      const c = col + dc;
      if (c < 0 || c >= w.cols) continue;
      if ((w.flags[r * w.cols + c] & CELL_ROAD) !== 0) return true;
    }
  }
  return false;
}
