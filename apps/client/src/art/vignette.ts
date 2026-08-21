/**
 * VIGNETTE DE CRÉATURE POUR L'INTERFACE REACT.
 *
 * **Le défaut.** Le propriétaire, en recrutant : « ce n'est pas clair quelle
 * créature (pas d'image) on recrute ni où elles sont ». Le panneau de la cité
 * n'affichait qu'un nom et un prix.
 *
 * **Pourquoi il n'y avait pas d'image, et pourquoi ce fichier existe.** Le
 * manifeste public ne contient **aucune** entrée de catégorie `creature` —
 * vérifié : 136 props, 21 portraits, 12 cités, 12 terrains, 8 matières, 6
 * combats, 2 accueils, et zéro créature. Les vingt-huit créatures sont
 * dessinées **entièrement en code** dans la scène PixiJS. Il n'existe donc
 * aucun fichier à mettre dans une balise `img`, et c'est pour cela que la
 * ligne de recrutement était muette.
 *
 * L'atlas sait pourtant en rendre une vignette au repos (`atlas.creature`).
 * On l'extrait ici une fois par créature, en image encodée, et React l'affiche
 * comme n'importe quelle autre. C'est la VRAIE bête, celle qu'on retrouvera au
 * combat — pas un symbole choisi à sa place.
 *
 * Trois précautions :
 *
 *  - **on ne bloque jamais** : l'extraction est asynchrone et le panneau
 *    s'affiche sans attendre. Une vignette qui n'arrive pas laisse un cadre
 *    vide, jamais un écran figé ;
 *  - **on n'extrait qu'une fois** par créature, le résultat est gardé. Le
 *    rendu partagé est celui du jeu : on ne le sollicite pas à chaque image ;
 *  - **rien n'échoue bruyamment** : sans rendu, sans atlas ou sans extracteur,
 *    la fonction rend `null` et l'interface reste jouable. Le jeu entier tient
 *    déjà sans une seule image, cette règle ne s'arrête pas ici.
 */

import type { CreatureId } from '@auvergne/engine';
import { obtenirAtlas, obtenirRendu } from '../boot.js';

/** Vignettes déjà extraites, par identifiant de créature. */
const cache = new Map<CreatureId, string | null>();
/** Extractions en cours, pour que deux lignes n'extraient pas la même bête. */
const enCours = new Map<CreatureId, Promise<string | null>>();

/**
 * Rend l'image encodée d'une créature, ou `null` si elle n'a pas pu être
 * produite. Ne lève jamais.
 */
export async function vignetteCreature(id: CreatureId): Promise<string | null> {
  const deja = cache.get(id);
  if (deja !== undefined) return deja;
  const encours = enCours.get(id);
  if (encours) return encours;

  const promesse = (async (): Promise<string | null> => {
    try {
      const [{ app }, atlas] = await Promise.all([obtenirRendu(), obtenirAtlas()]);
      const texture = atlas.creature(id);
      if (!texture) return null;
      const extracteur = (app.renderer as { extract?: { base64?: (t: unknown) => Promise<string> } })
        .extract;
      if (!extracteur?.base64) return null;
      return await extracteur.base64(texture);
    } catch {
      /* Pas de rendu accéléré, pas d'extracteur, ou une texture vide : la
         ligne de recrutement se passera d'image. */
      return null;
    }
  })();

  enCours.set(id, promesse);
  const resultat = await promesse;
  enCours.delete(id);
  cache.set(id, resultat);
  return resultat;
}

/** Vide le cache — utilisé quand l'atlas est reconstruit. */
export function oublierVignettes(): void {
  cache.clear();
  enCours.clear();
}
