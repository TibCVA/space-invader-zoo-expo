/**
 * `degradeLineaire` : la propriété algébrique, versionnée cette fois.
 *
 * Ce fichier existe parce que les trente cas qui ont validé le correctif des
 * dégradés obliques vivaient dans un répertoire `__epreuve/`, lequel figure
 * dans `.gitignore` : ils n'ont jamais existé dans l'historique, et ils ont
 * disparu avec le conteneur qui les avait écrits. La propriété qu'ils
 * gardaient est pourtant purement algébrique — aucun GPU requis — et sans elle
 * la prochaine montée de PixiJS peut réinverser tout l'atlas en silence.
 *
 * Rappel du défaut d'origine, pour qu'on sache ce qu'on protège. `FillGradient`
 * mesure son axe en unités de texture, pas en unités locales : passer
 * naïvement un vecteur unitaire donnait un axe 256 fois trop court, la rampe
 * se réduisait à son premier arrêt et TOUT dégradé oblique rendait un aplat.
 * C'est pourquoi les créatures étaient noires : à 135°, le `clamp-to-edge`
 * renvoyait l'arrêt le plus sombre.
 *
 * Trois invariants sont vérifiés ici, et ils suffisent à décrire le correctif :
 *
 *  1. l'axe balaie **exactement** la boîte normalisée — ni court, ni long ;
 *  2. le point de départ tombe sur le coin où le dégradé doit valoir zéro ;
 *  3. quand PixiJS retournerait la rampe, les arrêts sont retournés pour
 *     annuler l'inversion — le sens visible reste le sens demandé.
 */
import { describe, expect, it } from 'vitest';
import { FillGradient } from 'pixi.js';
import { degradeLineaire } from './shading.js';
import { ANGLE_LUMIERE } from './palette.js';

const TAILLE_RAMPE = FillGradient.defaultLinearOptions.textureSize ?? 256;

/** Les vingt-quatre directions du tour complet, plus les cas limites. */
const ANGLES = [
  0, 15, 30, 45, 60, 75, 90, 105, 118, 135, 150, 165, 180, 195, 210, 225, 240, 255, 270, 285,
  300, 315, 330, 345, 359, 360, -45, ANGLE_LUMIERE,
];

const DEUX = [
  { offset: 0, color: 0xffffff },
  { offset: 1, color: 0x000000 },
];

function axe(angle: number): { start: { x: number; y: number }; end: { x: number; y: number } } {
  const g = degradeLineaire([...DEUX], angle) as unknown as {
    start: { x: number; y: number };
    end: { x: number; y: number };
  };
  return { start: g.start, end: g.end };
}

describe('degradeLineaire — l’axe', () => {
  it('balaie exactement la boîte normalisée, à tout angle', () => {
    for (const angle of ANGLES) {
      const a = (angle * Math.PI) / 180;
      const dx = Math.cos(a);
      const dy = Math.sin(a);
      const porteeAttendue = Math.abs(dx) + Math.abs(dy);
      const { start, end } = axe(angle);
      const longueur = Math.hypot(end.x - start.x, end.y - start.y);
      // La longueur de l'axe vaut la portée : jamais 1/256 d'elle, qui était
      // le défaut, jamais davantage.
      expect(longueur, `angle ${String(angle)}`).toBeCloseTo(porteeAttendue, 5);
    }
  });

  it('ne rend jamais un aplat : l’axe a toujours une longueur utile', () => {
    for (const angle of ANGLES) {
      const { start, end } = axe(angle);
      const longueur = Math.hypot(end.x - start.x, end.y - start.y);
      // Un axe 256 fois trop court était l'aplat : on garde une marge large.
      expect(longueur, `angle ${String(angle)}`).toBeGreaterThan(1 / 16);
    }
  });

  it('part du coin où le dégradé doit valoir zéro', () => {
    for (const angle of ANGLES) {
      const a = (angle * Math.PI) / 180;
      const dx = Math.cos(a);
      const dy = Math.sin(a);
      const projection = (dx < 0 ? dx : 0) + (dy < 0 ? dy : 0);
      const { start } = axe(angle);
      expect(start.x, `angle ${String(angle)} — x`).toBeCloseTo((dx * projection) / TAILLE_RAMPE, 8);
      expect(start.y, `angle ${String(angle)} — y`).toBeCloseTo((dy * projection) / TAILLE_RAMPE, 8);
    }
  });
});

describe('degradeLineaire — le sens', () => {
  /*
   * Le retournement se lit dans les COULEURS, pas dans les offsets.
   *
   * PixiJS exige des offsets croissants ; `map(1 - offset).reverse()` les rend
   * donc toujours croissants, et ce sont les couleurs qui se retrouvent en
   * miroir. Chercher un offset décroissant, c'était chercher au mauvais
   * endroit — et le test serait passé au vert sans rien garder.
   */
  function lu(angle: number): {
    retourne: boolean;
    premiereCouleur: string;
    derniereCouleur: string;
  } {
    const g = degradeLineaire([...DEUX], angle) as unknown as {
      start: { x: number; y: number };
      end: { x: number; y: number };
      colorStops: { offset: number; color: string }[];
    };
    return {
      retourne: g.end.x - g.start.x < 0 || g.end.y - g.start.y < 0,
      premiereCouleur: g.colorStops[0].color,
      derniereCouleur: g.colorStops[g.colorStops.length - 1].color,
    };
  }

  /* PixiJS normalise les couleurs à sa façon (`#ffffffff`). On ne compare donc
     pas à un littéral mais à une rampe TÉMOIN prise à un angle qui ne retourne
     pas — le test survit ainsi à un changement de notation. */
  const TEMOIN = lu(ANGLE_LUMIERE);

  it('ne retourne pas la rampe à l’angle d’éclairage', () => {
    // Le témoin ne vaut que si lui-même n'est pas retourné.
    expect(TEMOIN.retourne).toBe(false);
  });

  it('met les couleurs en miroir exactement quand l’axe part vers le haut ou la gauche', () => {
    for (const angle of ANGLES) {
      const { retourne, premiereCouleur } = lu(angle);
      // Sans retournement, la rampe commence par la couleur demandée en
      // premier ; avec, elle commence par la dernière — c'est ce pré-miroir
      // qui annule celui de PixiJS et rend au peintre le sens qu'il a demandé.
      expect(premiereCouleur, `angle ${String(angle)}`).toBe(
        retourne ? TEMOIN.derniereCouleur : TEMOIN.premiereCouleur,
      );
    }
  });

  it('garde les offsets croissants, comme PixiJS l’exige', () => {
    for (const angle of ANGLES) {
      const g = degradeLineaire([...DEUX], angle) as unknown as {
        colorStops: { offset: number; color: string }[];
      };
      for (let i = 1; i < g.colorStops.length; i += 1) {
        expect(
          g.colorStops[i].offset,
          `angle ${String(angle)} — arrêt ${String(i)}`,
        ).toBeGreaterThanOrEqual(g.colorStops[i - 1].offset);
      }
    }
  });

  it('n’aplatit jamais : les deux bouts de la rampe restent distincts', () => {
    for (const angle of ANGLES) {
      const { premiereCouleur, derniereCouleur } = lu(angle);
      expect(premiereCouleur, `angle ${String(angle)}`).not.toBe(derniereCouleur);
    }
  });

  it('conserve tous les arrêts, sans en perdre ni en inventer', () => {
    const cinq = [
      { offset: 0, color: 0x111111 },
      { offset: 0.24, color: 0x222222 },
      { offset: 0.52, color: 0x333333 },
      { offset: 0.78, color: 0x444444 },
      { offset: 1, color: 0x555555 },
    ];
    for (const angle of [ANGLE_LUMIERE, 135, 90, 270]) {
      const g = degradeLineaire([...cinq], angle) as unknown as {
        colorStops: { offset: number; color: string }[];
      };
      expect(g.colorStops, `angle ${String(angle)}`).toHaveLength(cinq.length);
      const offsets = g.colorStops.map((x) => x.offset).sort((x, y) => x - y);
      expect(offsets[0]).toBeCloseTo(0, 6);
      expect(offsets[offsets.length - 1]).toBeCloseTo(1, 6);
      // Les cinq couleurs demandées se retrouvent toutes, dans un sens ou
      // dans l'autre : aucune n'est perdue en route.
      const couleurs = new Set(g.colorStops.map((x) => x.color));
      expect(couleurs.size).toBe(cinq.length);
    }
  });
});
