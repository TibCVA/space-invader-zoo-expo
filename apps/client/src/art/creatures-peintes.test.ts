/**
 * LES DESSINS PEINTS DES CRÉATURES — la vignette de sélection n'est plus la
 * « vue 3D ».
 *
 * Plainte du propriétaire : « les images des créatures dans les vignettes
 * devraient être les dessins et non la vue 3D lorsqu'on les sélectionne dans
 * la cité et dans les combats ». Mesuré : le manifeste ne déclarait AUCUNE
 * entrée de catégorie `creature` — toutes les surfaces de sélection (lignes
 * de recrutement, fiches de combat, barre d'initiative) retombaient sur la
 * capture du rig procédural, la « vue 3D ». Les vingt-huit dessins peints
 * validés QA existaient pourtant dans le dépôt.
 *
 * Le branchement tient à la couture existante : `atlas.creature()` lit la
 * table de textures que `appliquerAssetsGeneres` remplit depuis le manifeste
 * — déclarer les vingt-huit clefs `creature_<id>` suffit, sans toucher aux
 * composants. Le champ de bataille, lui, garde le rig animé (`creatureRig`).
 */
import { describe, expect, it } from 'vitest';
/* `node:fs` n'est pas dans les types du client — cf. battle/pouce.test.ts. */
// @ts-expect-error — types Node absents du tsconfig du client, cf. ci-dessus
import { readFileSync, statSync } from 'node:fs';
import { CREATURES } from '@auvergne/content';

interface Entree {
  clef: string;
  fichier: string;
  categorie: string;
  largeur: number;
  hauteur: number;
  octets?: number;
}

const MANIFESTE = JSON.parse(
  String(readFileSync(new URL('../../public/img/manifeste.json', import.meta.url), 'utf8')),
) as { budgetOctets?: number; entrees: Entree[] };

describe('les vingt-huit dessins peints sont déclarés et livrés', () => {
  const peintes = MANIFESTE.entrees.filter((e) => e.categorie === 'creature');

  it('chaque créature du bestiaire a son dessin — la liste des replis est vide', () => {
    const declarees = new Set(peintes.map((e) => e.clef));
    const attendues = Object.keys(CREATURES).map((id) => `creature_${id}`);
    expect(attendues.length).toBe(28);
    for (const clef of attendues) {
      expect(declarees.has(clef), clef).toBe(true);
    }
    expect(peintes.length).toBe(28);
  });

  it('les fichiers existent, au poids déclaré près — un octets faux fausse le budget', () => {
    for (const e of peintes) {
      const chemin = new URL(`../../public/img/${e.fichier}`, import.meta.url);
      const taille = statSync(chemin).size as number;
      expect(taille, e.clef).toBe(e.octets);
      expect(e.largeur).toBe(512);
      expect(e.hauteur).toBe(512);
    }
  });

  it('le budget du manifeste couvre TOUTES les entrées — sinon des images sont ignorées en silence', () => {
    const somme = MANIFESTE.entrees.reduce((t, e) => t + (e.octets ?? 0), 0);
    expect(MANIFESTE.budgetOctets).toBeDefined();
    expect(somme).toBeLessThanOrEqual(MANIFESTE.budgetOctets ?? 0);
  });
});
