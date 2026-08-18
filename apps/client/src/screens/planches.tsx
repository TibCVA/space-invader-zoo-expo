/**
 * Les deux planches de revue : la galerie du design system et la planche de
 * contact de l'art.
 *
 *  - `#/demo/galerie` monte `<UIGallery/>` de `@auvergne/ui` : tous les
 *    composants, toutes les icônes, tous les portraits, sans état de jeu.
 *  - `#/demo/planche-art` monte `renderArtSheet` dans la scène PixiJS : les
 *    vingt-huit créatures animées, le décor, les matières, les bannières, les
 *    icônes, les portraits, les artefacts et les effets.
 */

import { useCallback, type ReactElement } from 'react';
import { UIGallery, UI_VERSION } from '@auvergne/ui';
import { renderArtSheet } from '../art/index.js';
import { Bandeau } from './shell.js';
import { ScenePixi, type FabriqueScene } from './scene.js';

/* ─────────────────────── Galerie du design system ────────────────────────── */

/** `#/demo/galerie` — la planche de contact du design system. */
export function EcranGalerie(): ReactElement {
  return (
    <>
      <Bandeau titre="Galerie du design system" note={`Version ${UI_VERSION}`} />
      <div className="jeu-ecran jeu-ecran--defile">
        <UIGallery />
      </div>
    </>
  );
}

/* ─────────────────────────── Planche de contact ──────────────────────────── */

/** Largeur de composition de la planche : elle est ensuite mise à l'échelle. */
const LARGEUR_PLANCHE = 1840;

/** `#/demo/planche-art` — tout l'art produit, sur une seule feuille animée. */
export function EcranPlancheArt({ reducedMotion = false }: { reducedMotion?: boolean }): ReactElement {
  const fabrique = useCallback<FabriqueScene>(async ({ app, atlas }) => {
    const planche = await renderArtSheet(app.renderer, {
      atlas,
      largeur: LARGEUR_PLANCHE,
      animation: 'attente',
      complet: true,
    });
    return {
      container: planche,
      taille: planche.taille,
      update: (dt: number): void => planche.update(dt),
      destroy: (): void => planche.destroy({ children: true }),
    };
  }, []);

  return (
    <ScenePixi
      titre="Planche de contact"
      note="Tout est dessiné en code"
      cle="planche-art"
      fabrique={fabrique}
      reducedMotion={reducedMotion}
      ajusterLargeur
      defilementVertical
      /* La feuille fait 1840 px de large sur plusieurs milliers de haut : la
         repeindre soixante fois par seconde étoufferait un téléphone. Douze
         images par seconde suffisent à voir respirer les vingt-huit rigs, et
         la planche s'endort au bout de trois secondes — elle se réveille au
         moindre glissement. */
      fps={12}
      sommeilMs={3000}
      legende={
        <>
          <strong>Planche de contact</strong> — créatures, décor, matières, bannières, icônes,
          portraits, artefacts et effets. Molette ou glissement pour parcourir la feuille.
        </>
      }
    />
  );
}
