import { describe, expect, it } from 'vitest';
import { validerManifeste } from './assets.js';

/**
 * Le chargeur d'images est une couche facultative : un manifeste absent,
 * incomplet ou hostile ne doit jamais casser le jeu, qui garde son art
 * procédural. Ces tests verrouillent ce comportement.
 */
describe('validerManifeste', () => {
  const entreeValide = {
    clef: 'portrait_clotilde',
    fichier: 'portraits/clotilde.webp',
    categorie: 'portrait' as const,
    largeur: 512,
    hauteur: 640,
  };

  it('accepte un manifeste correct', () => {
    const m = validerManifeste({ version: '1.0.0', entrees: [entreeValide] });
    expect(m).not.toBeNull();
    expect(m!.entrees).toHaveLength(1);
    expect(m!.entrees[0].clef).toBe('portrait_clotilde');
  });

  it('applique un budget par défaut quand il est absent', () => {
    const m = validerManifeste({ version: '1', entrees: [entreeValide] });
    expect(m!.budgetOctets).toBeGreaterThan(0);
  });

  it('rejette ce qui n’est pas un manifeste', () => {
    expect(validerManifeste(null)).toBeNull();
    expect(validerManifeste(42)).toBeNull();
    expect(validerManifeste('portraits')).toBeNull();
    expect(validerManifeste({})).toBeNull();
    expect(validerManifeste({ entrees: 'non' })).toBeNull();
  });

  it('retourne null sur un manifeste sans aucune entrée exploitable', () => {
    expect(validerManifeste({ version: '1', entrees: [] })).toBeNull();
    expect(validerManifeste({ version: '1', entrees: [{ clef: 'x' }] })).toBeNull();
  });

  it('écarte les chemins dangereux et garde les autres entrées', () => {
    const m = validerManifeste({
      version: '1',
      entrees: [
        { ...entreeValide, clef: 'absolu', fichier: '/etc/passwd' },
        { ...entreeValide, clef: 'remontee', fichier: '../../secret.webp' },
        { ...entreeValide, clef: 'distant', fichier: 'https://exemple.test/a.webp' },
        { ...entreeValide, clef: 'donnees', fichier: 'data:image/webp;base64,AAAA' },
        entreeValide,
      ],
    });
    expect(m!.entrees.map((e) => e.clef)).toEqual(['portrait_clotilde']);
  });

  it('écarte les dimensions absurdes', () => {
    const m = validerManifeste({
      version: '1',
      entrees: [
        { ...entreeValide, clef: 'geante', largeur: 99999, hauteur: 512 },
        { ...entreeValide, clef: 'nulle', largeur: 0, hauteur: 512 },
        { ...entreeValide, clef: 'negative', largeur: -8, hauteur: 512 },
        { ...entreeValide, clef: 'texte', largeur: '512' },
        entreeValide,
      ],
    });
    expect(m!.entrees.map((e) => e.clef)).toEqual(['portrait_clotilde']);
  });

  it('conserve le drapeau répétable des tuiles', () => {
    const m = validerManifeste({
      version: '1',
      entrees: [
        {
          clef: 'aiguilles',
          fichier: 'terrain/aiguilles.webp',
          categorie: 'terrain',
          largeur: 512,
          hauteur: 512,
          repetable: true,
        },
      ],
    });
    expect(m!.entrees[0].repetable).toBe(true);
  });
});
