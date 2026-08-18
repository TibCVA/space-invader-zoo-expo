/**
 * FOND PEINT DE LA PAGE D'ACCUEIL.
 *
 * Deux compositions distinctes — pas un recadrage : `accueil_paysage`
 * (2560 × 1440, tiers gauche calme pour le titre et le menu) et
 * `accueil_portrait` (1170 × 2532, tiers médian calme pour les boutons).
 * L'orientation décide laquelle est affichée.
 *
 * Quand elles existent, elles remplacent la scène procédurale en canvas : plus
 * de couche de crêtes dessinée en bande de hauteur fixe, plus de liseré doré
 * appliqué en contour plein autour des sapins, plus de composition paysage
 * recadrée de force en portrait. Quand elles n'existent pas, la scène
 * procédurale reste montée et la page ne change pas.
 *
 * Le fond peint garde du mouvement (loi n°7) : une dérive très lente, coupée
 * par `prefers-reduced-motion`.
 */
import { useEffect, useState } from 'react';
import { lireManifeste, RACINE_IMAGES } from '../art/assets.js';

export interface FondPeint {
  paysage: string;
  portrait: string;
}

let cache: FondPeint | null | undefined;
let enCours: Promise<FondPeint | null> | null = null;

/** Lit le manifeste une seule fois par session. Ne rejette jamais. */
export async function chargerFondPeint(): Promise<FondPeint | null> {
  if (cache !== undefined) return cache;
  if (enCours) return enCours;
  enCours = (async (): Promise<FondPeint | null> => {
    try {
      const m = await lireManifeste();
      if (!m) return null;
      let paysage = '';
      let portrait = '';
      for (const e of m.entrees) {
        if (e.clef === 'accueil_paysage') paysage = `${RACINE_IMAGES}/${e.fichier}`;
        else if (e.clef === 'accueil_portrait') portrait = `${RACINE_IMAGES}/${e.fichier}`;
      }
      /* Les deux sont exigées : une seule des deux orientations produirait un
         cadrage faux sur l'autre, ce qui est précisément le défaut à corriger. */
      return paysage && portrait ? { paysage, portrait } : null;
    } catch {
      return null;
    } finally {
      enCours = null;
    }
  })();
  cache = await enCours;
  return cache;
}

/**
 * `null` tant que le manifeste n'est pas lu, puis les deux adresses ou `null`
 * définitivement. L'appelant monte la scène procédurale tant que c'est `null`.
 */
export function useFondPeint(): FondPeint | null {
  const [fond, setFond] = useState<FondPeint | null>(cache ?? null);
  useEffect(() => {
    if (cache !== undefined) {
      setFond(cache);
      return undefined;
    }
    let vivant = true;
    void chargerFondPeint().then((f) => {
      if (vivant) setFond(f);
    });
    return () => {
      vivant = false;
    };
  }, []);
  return fond;
}
