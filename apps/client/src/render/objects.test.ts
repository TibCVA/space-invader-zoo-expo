/**
 * Un objet qu'on peut visiter se voit de plus loin qu'un sapin.
 *
 * Pourquoi ce fichier existe. La demande était explicite : « les éléments
 * actifs ou qui entraînent une action sur la carte doivent être très jolis et
 * bien visibles, bien distincts des éléments juste décoratifs ». Le rendu
 * faisait l'inverse, et on peut le chiffrer.
 *
 * `props.ts` tire un sapin à 2,05 case, multiplié par un facteur aléatoire de
 * 0,80 à 1,22 : le plus grand mesure 2,50 cases. L'ancienne table d'échelles
 * plaçait le tas de ressource à 1,35, la borne à 1,20, l'artefact à 1,40 — soit
 * la moitié de la hauteur du sapin voisin. Même la mine, à 2,40, restait
 * dessous. Mesuré sur la carte de démonstration : **55 % des objets avaient un
 * voisin décoratif plus haut qu'eux**, et le rapport décor/actif atteignait
 * 113 pour 1 sur l'ensemble de la carte, 145 pour 1 dans le cadre d'un iPhone.
 *
 * Le décor recevait par-dessus le marché une oscillation d'ambiance allant
 * jusqu'à 3 px, quand l'objet actif « respirait » de 0,55 px : sur une carte
 * immobile, c'est le décor qui attirait l'œil.
 *
 * Ce test garde la règle qui en découle : tout ce qui déclenche une action se
 * tient au-dessus du décor **médian**. On vise le médian et non le plus grand
 * à dessein — porter un tas de ressource à 2,50 cases en ferait un monument,
 * alors que HMM3 garde ses tas petits mais saturés et **posés dans une
 * clairière**. Le dégagement du décor autour des objets et la dalle permanente
 * portent le reste du signal.
 *
 * Éprouvé en défaisant la correction : l'ancienne table le fait rougir sur
 * **huit des quinze familles interactives** — artefact, belvédère, borne,
 * caravane, garde, quête, ressource, source.
 */
import { describe, expect, it } from 'vitest';
import { DECOR_MEDIAN, TAILLE } from './objects.js';

/** La seule nature qui soit du décor : le rendu ne la dessine même pas. */
const DECORATIF = new Set(['obstacle']);

describe('échelle des objets de carte', () => {
  it('place chaque objet interactif au-dessus du décor médian', () => {
    for (const [nature, taille] of Object.entries(TAILLE)) {
      if (DECORATIF.has(nature)) continue;
      expect(taille, `« ${nature} » doit dépasser le décor médian`).toBeGreaterThanOrEqual(
        DECOR_MEDIAN,
      );
    }
  });

  it('garde la hiérarchie d’importance à l’intérieur des objets interactifs', () => {
    /* Un plancher commun ne doit pas écraser les rangs : une cité reste plus
       imposante qu'une mine, qui reste plus imposante qu'un tas de ressource. */
    expect(TAILLE.ville).toBeGreaterThan(TAILLE.village);
    expect(TAILLE.village).toBeGreaterThan(TAILLE.mine);
    expect(TAILLE.mine).toBeGreaterThan(TAILLE.ressource);
    expect(TAILLE.maison_tresor).toBeGreaterThanOrEqual(TAILLE.ville);
  });

  it('ne laisse aucune nature sans échelle', () => {
    /* Ajouter une nature à `MapObjectKind` sans lui donner de taille la ferait
       tomber sur `undefined`, donc sur une échelle NaN et un objet invisible.
       Le catalogue va s'allonger : ce test est là pour ce jour-là. */
    for (const [nature, taille] of Object.entries(TAILLE)) {
      expect(taille, `« ${nature} »`).toBeTypeOf('number');
      expect(Number.isFinite(taille), `« ${nature} »`).toBe(true);
      expect(taille).toBeGreaterThan(0);
    }
  });
});
