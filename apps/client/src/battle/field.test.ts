import { describe, expect, it } from 'vitest';
import { TERRAINS } from '@auvergne/engine';

import { AMBIANCE_LABELS, PALETTES_SOL, ambianceDe, fondPeintDe } from './field.js';
import type { Ambiance } from './field.js';

/**
 * AUCUNE IMAGE LIVRÉE NE DOIT DORMIR.
 *
 * C'est le mode de panne le plus coûteux de ce dépôt, et il s'est produit deux
 * fois : six pinceaux de terrain peints ont attendu deux vagues d'images sans
 * que le sol de la carte d'aventure en emploie un seul, et la vague 3 a livré
 * six panoramas de champ de bataille que rien ne lisait. Rien ne casse, rien
 * n'alerte : le repli procédural prend la place et la capture paraît normale.
 *
 * Ces tests ne jugent pas la beauté — cela se fait sur capture. Ils tiennent le
 * CÂBLAGE : que chaque ambiance existe de bout en bout, que chaque panorama
 * nommé par le code soit bien livré, et surtout que tout panorama livré et NON
 * employé soit nommé ici, un par un, avec sa raison. Un fichier oublié doit
 * faire rougir un test, pas passer inaperçu.
 */

const MANIFESTES = import.meta.glob('../../public/img/manifeste.json', {
  eager: true,
  query: '?raw',
  import: 'default',
}) as Record<string, string>;

interface EntreeBrute {
  clef: string;
  categorie: string;
  largeur: number;
  hauteur: number;
}

function manifeste(): EntreeBrute[] {
  const [texte] = Object.values(MANIFESTES);
  if (texte === undefined) return [];
  return (JSON.parse(texte) as { entrees: EntreeBrute[] }).entrees;
}

const AMBIANCES: readonly Ambiance[] = ['sapiniere', 'prairie', 'lande', 'rocher', 'humide', 'cour'];

/**
 * Les panoramas livrés qu'aucune ambiance n'emploie, et POURQUOI.
 *
 * Cette liste est un aveu, pas un réglage : chaque ligne coûte une image payée
 * et non affichée. Elle doit rester courte, et vide si possible.
 */
const PANORAMAS_INEMPLOYES: Readonly<Record<string, string>> = {
  combat_pont:
    "il faudrait que le moteur dise qu'on se bat sur un franchissement ; `ambianceDe` " +
    'ne reçoit que la région, le terrain et le drapeau de siège',
};

describe('les ambiances du champ de bataille', () => {
  it('existe de bout en bout pour chacune : libellé, palette, pinceau', () => {
    for (const a of AMBIANCES) {
      expect(AMBIANCE_LABELS[a], a).toBeTruthy();
      expect(PALETTES_SOL[a], a).toBeDefined();
      expect(PALETTES_SOL[a].pinceau, `${a} sans pinceau`).toBeTruthy();
    }
    /* Et pas d'ambiance fantôme dans les tables. */
    expect(Object.keys(AMBIANCE_LABELS).sort()).toEqual([...AMBIANCES].sort());
    expect(Object.keys(PALETTES_SOL).sort()).toEqual([...AMBIANCES].sort());
  });

  it('donne aux hautes chaumes leur propre décor', () => {
    /*
     * Les hautes chaumes couvrent 7,4 % de la carte depuis que le relief a été
     * étagé, et l'on s'y battait dans un pré : même couleur, même semis, et
     * depuis la vague 3 le panorama de chaume restait inutilisé. Un joueur qui
     * monte sur les crêtes doit voir qu'il y est.
     */
    const lande = TERRAINS.indexOf('lande');
    expect(lande, "le moteur ne connaît pas de terrain « lande »").toBeGreaterThanOrEqual(0);
    expect(ambianceDe('coeur_bois_noirs', 'lande', false)).toBe('lande');
    /* Mais un siège l'emporte toujours sur le terrain. */
    expect(ambianceDe('coeur_bois_noirs', 'lande', true)).toBe('cour');
  });

  it('ne nomme que des panoramas réellement livrés', () => {
    const livres = new Set(manifeste().filter((e) => e.categorie === 'combat').map((e) => e.clef));
    expect(livres.size, 'aucun panorama de combat au manifeste').toBeGreaterThan(0);
    for (const a of AMBIANCES) {
      const clef = fondPeintDe(a);
      if (clef === null) continue;
      expect(livres.has(clef), `${a} demande « ${clef} », absent du manifeste`).toBe(true);
    }
  });

  it("n'abandonne aucun panorama livré sans le dire", () => {
    /*
     * L'invariant qui compte. Si Codex livre `combat_neige` demain et que
     * personne ne le branche, ce test rougit et nomme le fichier. La seule
     * façon de le faire taire est soit de brancher l'image, soit de l'inscrire
     * dans `PANORAMAS_INEMPLOYES` avec sa raison — un choix, pas un oubli.
     */
    const employes = new Set(AMBIANCES.map((a) => fondPeintDe(a)).filter((c): c is string => c !== null));
    const orphelins = manifeste()
      .filter((e) => e.categorie === 'combat')
      .map((e) => e.clef)
      .filter((c) => !employes.has(c))
      .filter((c) => PANORAMAS_INEMPLOYES[c] === undefined);
    expect(orphelins).toEqual([]);
  });

  it('exige des panoramas le format qui laisse le centre libre', () => {
    /*
     * 1024 × 640, c'est le format du brief, et il n'est pas décoratif : le
     * plateau hexagonal occupe le centre, et le brief demande que le décor se
     * tienne sur le pourtour et à l'horizon. Un panorama carré ou portrait
     * signifierait que la consigne de cadrage n'a pas été lue, et le décor
     * passerait sous les figurines.
     */
    for (const e of manifeste().filter((x) => x.categorie === 'combat')) {
      expect(e.largeur / e.hauteur, `${e.clef} : ${String(e.largeur)} × ${String(e.hauteur)}`).toBeCloseTo(1.6, 1);
      expect(e.largeur, e.clef).toBeGreaterThanOrEqual(768);
    }
  });
});
