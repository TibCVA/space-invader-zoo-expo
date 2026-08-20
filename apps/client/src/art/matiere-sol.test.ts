import { describe, expect, it } from 'vitest';
import { REGIONS, TERRAINS } from '@auvergne/engine';

import {
  BASE_DE_PAYS,
  CASES_PAR_TUILE,
  COTE_MAX_TUILE,
  MATIERES_BASE,
  MATIERES_PAYS,
  REGISTRE_MATIERES,
  construireNiveaux,
  indexMatiere,
  matiereEffective,
  niveauPour,
} from './matiere-sol.js';
import { CANTONS, cantonDe } from '../render/cantons.js';
import { MATIERE_DE_TERRAIN, clefMatiereDuSol } from '../render/terrain.js';
import { TER } from '../render/commun.js';

/**
 * LA MATIÈRE PEINTE DU SOL DE LA CARTE D'AVENTURE.
 *
 * Le défaut gardé ici est celui qu'on a mis le plus longtemps à voir : six
 * tuiles de terrain peintes dormaient dans `public/img/terrain/`, déclarées au
 * manifeste depuis la première vague d'images, et n'étaient lues que par le
 * champ de bataille. Le sol de la carte — cent pour cent de l'écran pendant
 * toute une partie — n'en employait aucune. Rien ne cassait, rien n'alertait :
 * c'est le mode de panne le plus coûteux de ce pipeline, et il ne se voit que
 * si un test le nomme.
 *
 * Ces tests gardent donc trois choses, dans cet ordre d'importance :
 *
 *   1. que la matière ne DÉPLACE PAS la couleur du sol — sinon on perdrait le
 *      gradient d'altitude, la teinte de pays et tout le travail du peintre ;
 *   2. que les clefs se répondent d'un bout à l'autre de la chaîne — table des
 *      terrains, tables des douze pays, registre, manifeste livré. Une clef
 *      mal orthographiée ne casse rien et ne charge rien ;
 *   3. que la pyramide de réduction se comporte, parce que c'est elle qui
 *      empêche le sol de scintiller quand la caméra bouge.
 */

/*
 * Le manifeste livré, lu par Vite et non par `node:fs` : la configuration
 * TypeScript du client n'expose délibérément pas les types de Node, pour qu'un
 * module du navigateur ne puisse pas importer `node:fs` par accident. Un glob
 * `?raw` passe par le même chemin que le reste du client et rend une chaîne.
 */
const MANIFESTES = import.meta.glob('../../public/img/manifeste.json', {
  eager: true,
  query: '?raw',
  import: 'default',
}) as Record<string, string>;

/** Une tuile de test : un damier fort, plus un gradient, plus du bruit fixe. */
function tuileFactice(cote: number): Uint8ClampedArray {
  const d = new Uint8ClampedArray(cote * cote * 4);
  for (let y = 0; y < cote; y += 1) {
    for (let x = 0; x < cote; x += 1) {
      const k = (y * cote + x) * 4;
      const damier = ((x >> 2) + (y >> 2)) % 2 === 0 ? 70 : -70;
      const grad = (x / cote) * 40;
      const bruit = ((x * 7919 + y * 104729) % 23) - 11;
      d[k] = 128 + damier + bruit;
      d[k + 1] = 120 + damier * 0.6 + grad;
      d[k + 2] = 96 - damier * 0.3 + bruit;
      d[k + 3] = 255;
    }
  }
  return d;
}

describe('la matière peinte du sol', () => {
  it("ne déplace pas la couleur moyenne du sol : c'est un écart, pas une peinture", () => {
    /*
     * L'invariant central. Le peintre applique, par pixel et par canal :
     *
     *     r *= 1 + (dr / 127) * FORCE
     *
     * Si la moyenne de ce facteur n'était pas 1, chaque terrain recevrait un
     * décalage constant de couleur — un pré qui vire au brun, une roche qui
     * s'éclaircit — et l'on aurait détruit sans s'en apercevoir le gradient de
     * biome par altitude, le gel de pays et l'étalonnage de la palette. On
     * vérifie donc la formule exacte du peintre, pas une approximation.
     */
    const cote = 64;
    const niveaux = construireNiveaux(tuileFactice(cote), cote);
    for (const niveau of niveaux) {
      for (const force of [0.3, 0.62, 1]) {
        for (const canal of ['dr', 'dg', 'db'] as const) {
          const d = niveau[canal];
          let somme = 0;
          for (let i = 0; i < d.length; i += 1) somme += 1 + (d[i] / 127) * force;
          const moyenne = somme / d.length;
          expect(
            Math.abs(moyenne - 1),
            `niveau ${String(niveau.cote)}, ${canal}, force ${String(force)} : moyenne ${moyenne.toFixed(4)}`,
          ).toBeLessThan(0.01);
        }
      }
    }
  });

  it('borne son écart : jamais de pixel noir ni de pixel brûlé', () => {
    /* À force 1, le facteur vit dans [0, 2]. Une tuile ne peut donc pas
       éteindre un pixel ni le pousser au blanc : elle sculpte, elle ne
       repeint pas. C'est ce que garantit la quantification sur ±127. */
    const cote = 64;
    const [fin] = construireNiveaux(tuileFactice(cote), cote);
    for (const d of [fin.dr, fin.dg, fin.db]) {
      for (let i = 0; i < d.length; i += 1) {
        expect(d[i]).toBeGreaterThanOrEqual(-127);
        expect(d[i]).toBeLessThanOrEqual(127);
      }
    }
  });

  it('descend une pyramide de puissances de deux, par moyenne de quatre', () => {
    const niveaux = construireNiveaux(tuileFactice(128), 128);
    expect(niveaux.map((n) => n.cote)).toEqual([128, 64, 32, 16]);
    for (const n of niveaux) {
      expect(n.dr).toHaveLength(n.cote * n.cote);
      expect(n.cote & (n.cote - 1)).toBe(0);
    }
    /* Le niveau grossier est bien la moyenne du fin, à l'arrondi près : c'est
       ce qui empêche le sol de scintiller quand la caméra recule. */
    const [fin, gros] = niveaux;
    const attendu = Math.round((fin.dr[0] + fin.dr[1] + fin.dr[fin.cote] + fin.dr[fin.cote + 1]) / 4);
    expect(gros.dr[0]).toBe(attendu);
  });

  it('refuse une tuile qui ne peut pas être échantillonnée par masque', () => {
    expect(() => construireNiveaux(new Uint8ClampedArray(100 * 100 * 4), 100)).toThrow(/puissance de deux/);
    expect(() => construireNiveaux(new Uint8ClampedArray(16), 64)).toThrow(/insuffisants/);
  });

  it('choisit le plus petit niveau qui couvre le besoin', () => {
    const tuile = { clef: 'essai', niveaux: construireNiveaux(tuileFactice(128), 128) };
    /* Le cadrage de jeu le plus détaillé : seize pixels par case, huit cases
       par tuile, donc cent vingt-huit pixels. Le niveau fin, tout juste. */
    expect(niveauPour(tuile, CASES_PAR_TUILE * 16)?.cote).toBe(128);
    expect(niveauPour(tuile, CASES_PAR_TUILE * 12)?.cote).toBe(128);
    expect(niveauPour(tuile, CASES_PAR_TUILE * 8)?.cote).toBe(64);
    expect(niveauPour(tuile, CASES_PAR_TUILE * 5)?.cote).toBe(64);
    expect(niveauPour(tuile, CASES_PAR_TUILE * 2)?.cote).toBe(16);
    /* Et si l'on demandait plus que ce qu'on a, on rend le plus fin : on ne
       peut pas inventer des pixels. */
    expect(niveauPour(tuile, 4096)?.cote).toBe(128);
  });

  it('garde assez de pixels pour la résolution maximale du peintre, et pas plus', () => {
    /*
     * Le peintre ne peut afficher que `CASES_PAR_TUILE × res` pixels de tuile,
     * et sa résolution plafonne à seize pixels par case. Garder des 512 × 512
     * en mémoire vive coûterait trois mégaoctets pour des pixels que personne
     * ne verrait ; en garder moins de cent vingt-huit rendrait le sol flou au
     * cadrage le plus proche. Les deux bornes se touchent, et c'est pour cela
     * que la valeur est celle-là et pas une autre.
     */
    expect(COTE_MAX_TUILE).toBe(CASES_PAR_TUILE * 16);
  });
});

describe('les clefs de matière se répondent de bout en bout', () => {
  it('ne nomme, dans le registre, que des clefs distinctes', () => {
    expect(new Set(REGISTRE_MATIERES).size).toBe(REGISTRE_MATIERES.length);
    expect(REGISTRE_MATIERES).toEqual([...MATIERES_BASE, ...MATIERES_PAYS]);
  });

  it('ne fait porter au peintre que des matières du registre', () => {
    /* Pour CHAQUE terrain du moteur et CHAQUE pays du Forez, la clef que le
       peintre calcule doit être connue du registre — sinon la case est peinte
       sans matière, en silence, et personne ne le voit jamais. */
    const manquantes: string[] = [];
    for (let terrain = 0; terrain < TERRAINS.length; terrain += 1) {
      for (let region = 0; region < REGIONS.length; region += 1) {
        const canton = cantonDe(region);
        for (const sol of [terrain, TER.prairie, TER.foret, TER.rocher, TER.humide]) {
          const clef = clefMatiereDuSol(terrain, sol, canton);
          if (clef !== null && indexMatiere(clef) < 0) {
            manquantes.push(`${TERRAINS[terrain]}/${REGIONS[region]} → ${clef}`);
          }
        }
      }
    }
    expect(manquantes).toEqual([]);
  });

  it("ne laisse aucun terrain jouable sans matière, sauf ceux qui n'en ont pas besoin", () => {
    /* Les chemins n'ont pas de matière propre : ils laissent voir celle du pré
       qu'ils traversent, et la chaussée est le seul cas où la voie prend le
       dessus. Tout le reste doit être couvert, faute de quoi une partie de la
       carte resterait sans grain sans que rien ne le signale. */
    const sansMatiere = TERRAINS.filter((_, i) => MATIERE_DE_TERRAIN[i] === undefined);
    expect(sansMatiere).toEqual(['chemin']);
  });

  it('ne substitue une matière de pays qu’à une matière que le peintre produit', () => {
    /*
     * L'erreur exacte que ce test attrape a déjà été commise dans ce dépôt sur
     * une autre table : la clef disait `fil_or` là où le code dit `filDor`, et
     * pendant une demi-journée la règle n'a rien gardé du tout. Ici, une clef
     * de gauche qui n'est pas une matière de base rendrait la substitution
     * MORTE : le pays garderait la tuile de son terrain, silencieusement.
     */
    const bases = new Set<string>(Object.values(MATIERE_DE_TERRAIN));
    const mortes: string[] = [];
    for (const [id, canton] of Object.entries(CANTONS)) {
      for (const [de, vers] of Object.entries(canton.sol ?? {})) {
        if (!bases.has(de)) mortes.push(`${id} : « ${de} » n'est produit par aucun terrain`);
        if (indexMatiere(vers) < 0) mortes.push(`${id} : « ${vers} » est hors du registre`);
      }
    }
    expect(mortes).toEqual([]);
  });

  it('emploie effectivement les six matières de pays demandées à la vague 3', () => {
    /*
     * On ne demande pas une image à Codex pour la laisser dormir. Chaque clef
     * de `MATIERES_PAYS` doit être réclamée par au moins un canton, sans quoi
     * `docs/10-BRIEF-IMAGEGEN-VAGUE-3.md` ferait produire un fichier que le
     * code n'irait jamais chercher.
     */
    const reclamees = new Set<string>();
    for (const canton of Object.values(CANTONS)) {
      for (const vers of Object.values(canton.sol ?? {})) reclamees.add(vers);
    }
    for (const clef of MATIERES_PAYS) {
      expect([...reclamees], `${clef} n'est réclamée par aucun pays`).toContain(clef);
    }
  });

  it("peint le sol MÊME quand aucune tuile de pays n'est livrée", () => {
    /*
     * LE TEST QUI MANQUAIT, ET LE DÉFAUT QU'IL A COÛTÉ DE NE PAS AVOIR.
     *
     * Les tests précédents vérifiaient que les clefs se répondaient. Toutes se
     * répondaient. Le sol restait nu quand même : les douze pays nomment tous
     * une variante d'`herbe`, les six tuiles de pays ne sont pas livrées, et
     * le peintre demandait `herbe_estive`, ne trouvait rien, et laissait la
     * case sans matière. Presque toute la carte — prairie, lande, pente —
     * était concernée. Le journal disait « 6 chargées », la capture montrait
     * le même grain qu'avant le chantier, à un centième près.
     *
     * On simule donc ici l'état de livraison RÉEL — les six matières de base,
     * pas une de plus — et l'on exige que chaque case de la carte reçoive tout
     * de même une tuile.
     */
    const livrees = new Set<string>(MATIERES_BASE);
    const connue = (c: string): boolean => livrees.has(c);
    const nues: string[] = [];
    for (let terrain = 0; terrain < TERRAINS.length; terrain += 1) {
      if (MATIERE_DE_TERRAIN[terrain] === undefined) continue;
      for (let region = 0; region < REGIONS.length; region += 1) {
        const canton = cantonDe(region);
        const clef = clefMatiereDuSol(terrain, terrain, canton);
        if (clef === null) continue;
        const effective = matiereEffective(clef, connue);
        if (effective === null) nues.push(`${TERRAINS[terrain]}/${REGIONS[region]} → ${clef}`);
      }
    }
    expect(nues).toEqual([]);
  });

  it('donne une base à chaque matière de pays, et une base qui existe', () => {
    for (const clef of MATIERES_PAYS) {
      const base = BASE_DE_PAYS[clef];
      expect(base, `${clef} n'a pas de matière de base`).toBeDefined();
      expect([...MATIERES_BASE], `${clef} → ${String(base)}`).toContain(base);
    }
    /* Et l'inverse : pas de repli déclaré pour une clef qui n'en est pas une. */
    for (const clef of Object.keys(BASE_DE_PAYS)) {
      expect([...MATIERES_PAYS], `${clef} n'est pas une matière de pays`).toContain(clef);
    }
  });

  it('préfère toujours la tuile de pays quand elle est livrée', () => {
    /* Le repli ne doit pas devenir la règle : le jour où Codex livre l'humus
       noir des Bois Noirs, c'est lui qu'on emploie, pas les aiguilles. */
    const tout = new Set<string>(REGISTRE_MATIERES);
    expect(matiereEffective('aiguilles_noires', (c) => tout.has(c))).toBe('aiguilles_noires');
    expect(matiereEffective('aiguilles_noires', (c) => c === 'aiguilles')).toBe('aiguilles');
    expect(matiereEffective('aiguilles_noires', () => false)).toBeNull();
    /* Une matière de base absente ne s'invente pas une descendance. */
    expect(matiereEffective('herbe', () => false)).toBeNull();
  });

  it('donne une matière à chacun des douze pays', () => {
    for (const id of REGIONS) {
      expect(Object.keys(CANTONS[id].sol ?? {}).length, id).toBeGreaterThan(0);
    }
  });
});

describe('le manifeste livré nourrit vraiment le sol', () => {
  it('déclare les six matières de base, répétables', () => {
    /*
     * Ce test-ci ne garde pas du code : il garde le FAIT que les fichiers
     * existent et sont déclarés sous la bonne clef. C'est lui qui aurait dit,
     * il y a deux vagues d'images, que six tuiles peintes attendaient sans
     * être employées. Si le manifeste disparaît, le jeu retombe sur sa matière
     * semée en code — mais on veut le SAVOIR.
     */
    const [texte] = Object.values(MANIFESTES);
    expect(texte, 'aucun manifeste livré dans apps/client/public/img/').toBeDefined();
    const brut: unknown = JSON.parse(texte);
    const entrees = (brut as { entrees: { clef: string; categorie: string; repetable?: boolean }[] }).entrees;
    for (const clef of MATIERES_BASE) {
      const e = entrees.find((x) => x.clef === clef);
      expect(e, `« ${clef} » absente du manifeste`).toBeDefined();
      expect(e?.categorie, clef).toBe('terrain');
      expect(e?.repetable, `« ${clef} » doit être répétable`).toBe(true);
    }
  });
});
