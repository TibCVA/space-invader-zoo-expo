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
  it('réclame une peinture par bâtiment distinct, les améliorations mises à part', () => {
    /* Les améliorations reprennent la peinture de leur demeure : le nombre
       d'images distinctes est celui des bâtiments moins les quatorze
       ateliers. Quarante sont peintes depuis la vague 2 ; la Citadelle et le
       Château, ajoutés avec la croissance ×2 de HMM3, attendent la vague 3
       et tiennent sur le dessin procédural en attendant (repli jamais
       retiré, bible artistique §0.7). */
    const keys = BUILDING_LIST
      .map((building) => clefAssetBatiment(building.id))
      .filter((key): key is string => key !== null);
    expect(keys).toHaveLength(BUILDING_LIST.length);
    const ateliers = BUILDING_LIST.filter((b) => b.id.includes('_amelioration_')).length;
    expect(new Set(keys).size).toBe(BUILDING_LIST.length - ateliers);
    expect(keys).toContain('bati_granit_demeure_1');
    expect(keys).toContain('bati_ermitage_capitole');
    expect(keys).toContain('bati_hotel_ville_3');
  });

  it('nomme les peintures qui restent à produire', () => {
    /* La liste explicite de ce qui manque : elle rétrécit quand une vague
       d'images arrive, et elle empêche d'oublier un bâtiment neuf. */
    const ATTENDUES_VAGUE_3 = ['bati_citadelle', 'bati_chateau'];
    const clefs = new Set(
      BUILDING_LIST.map((b) => clefAssetBatiment(b.id)).filter((k): k is string => k !== null),
    );
    for (const clef of ATTENDUES_VAGUE_3) expect(clefs.has(clef), clef).toBe(true);
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
