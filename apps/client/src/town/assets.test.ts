import { describe, expect, it } from 'vitest';
import { BUILDING_LIST } from '@auvergne/content';
import { clefAssetBatiment } from './index.js';
import {
  PANO_PORTRAIT_HAUTEUR,
  PANO_PORTRAIT_LARGEUR,
  cadrerSource,
  preferePanoramaPortrait,
} from './panorama.js';

describe('assets peints de la cité', () => {
  it('expose exactement les quarante bâtiments nommés par la vague 2', () => {
    /* Les cinquante-quatre bâtiments ne réclament que quarante peintures :
       les quatorze améliorations reprennent celle de leur demeure. */
    const keys = BUILDING_LIST
      .map((building) => clefAssetBatiment(building.id))
      .filter((key): key is string => key !== null);
    expect(keys).toHaveLength(BUILDING_LIST.length);
    expect(new Set(keys).size).toBe(40);
    expect(keys).toContain('bati_granit_demeure_1');
    expect(keys).toContain('bati_ermitage_capitole');
    expect(keys).toContain('bati_hotel_ville_3');
  });

  it('chaque amélioration reprend la peinture de sa demeure', () => {
    /* Pas de peinture propre pour les quatorze améliorations : elles
       remplacent leur demeure sur la même emprise, un cran plus grandes —
       la vue retire la demeure de base quand l'amélioration est levée. */
    const improvements = BUILDING_LIST.filter((building) => building.id.includes('_amelioration_'));
    expect(improvements).toHaveLength(14);
    for (const building of improvements) {
      expect(clefAssetBatiment(building.id)).toBe(
        `bati_${building.id.replace('_amelioration_', '_demeure_')}`,
      );
    }
  });

  it('choisit le panorama natif vertical sur téléphone', () => {
    expect(preferePanoramaPortrait(390, 844)).toBe(true);
    expect(preferePanoramaPortrait(1440, 900)).toBe(false);
    const frame = cadrerSource(
      390,
      844,
      PANO_PORTRAIT_LARGEUR,
      PANO_PORTRAIT_HAUTEUR,
    );
    expect(frame.w).toBeGreaterThanOrEqual(390);
    expect(frame.h).toBeGreaterThanOrEqual(844);
  });
});
