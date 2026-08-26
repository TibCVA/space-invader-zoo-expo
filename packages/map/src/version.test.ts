import { describe, expect, it } from 'vitest';

import { MAP_VERSION, buildWorld } from './build.js';

/**
 * LA CARTE N'EST PAS ENREGISTRÉE : ELLE EST RECONSTRUITE.
 *
 * Une partie sauvegardée ne conserve que son ÉTAT. Le monde — relief, terrains,
 * routes, et surtout les quelque 470 objets avec leurs identifiants — se
 * refabrique à chaque chargement par `buildWorld(graine)`. Changer le semeur,
 * c'est donc changer le sol sous une partie en cours : les identifiants d'objets
 * que l'état porte ne désignent plus rien, une mine possédée devient un coffre,
 * un héros se retrouve dans une rivière.
 *
 * Le seul garde-fou est `MAP_VERSION`, et il est plus fragile qu'il n'en a
 * l'air : `versionsCompatibles` (`packages/protocol/src/api.ts:215`) ne compare
 * que le MAJEUR. Passer de `1.0.0` à `1.1.0` après avoir déplacé neuf gisements
 * aurait été déclaré compatible, et la partie aurait repris en silence sur une
 * autre carte. Pour la carte, toute différence est cassante.
 *
 * D'où ce test, qui est un verrou et non une mesure : il tient une empreinte du
 * monde semé. S'il rougit, ce n'est pas lui qui a tort — c'est que le semeur a
 * changé. La réparation est alors, dans le MÊME commit :
 *
 *   1. monter le MAJEUR de `MAP_VERSION` (`packages/map/src/build.ts`) ;
 *   2. relever la nouvelle empreinte et l'écrire ici ;
 *   3. relancer `pnpm carte` : équité économique, espacement, dosage de garde.
 *
 * Ne JAMAIS mettre l'empreinte à jour sans monter le majeur : ce serait retirer
 * le verrou en croyant réparer la porte.
 */

/** FNV-1a 32 bits, écrit ici pour ne dépendre d'aucun module de Node. */
function empreinte(texte: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < texte.length; i += 1) {
    h ^= texte.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, '0');
}

/**
 * Sérialisation canonique de ce qui casse une partie en cours : la nature, la
 * place et l'identifiant de chaque objet, plus le terrain. Ni les gardes ni les
 * libellés n'y figurent — ils changent la difficulté, pas la validité des
 * références de l'état.
 */
function signature(graine: number): string {
  const w = buildWorld(graine);
  const morceaux: string[] = [`${String(w.cols)}x${String(w.rows)}`];
  for (const o of w.objects) {
    morceaux.push(`${o.uid}|${o.kind}|${String(o.at.col)},${String(o.at.row)}`);
  }
  /* Le terrain, échantillonné une case sur soixante-cinq : assez pour attraper
     un déplacement de rivière ou de route, assez court pour rester lisible. */
  for (let i = 0; i < w.terrain.length; i += 65) morceaux.push(String(w.terrain[i]));
  return morceaux.join(';');
}

describe('la version de la carte verrouille le monde semé', () => {
  it("porte un MAJEUR qui change dès que le semeur change", () => {
    /*
     * Empreintes relevées le jour du plancher toutes-natures : 95 paires
     * d'objets adjacents sur la graine de démonstration, toutes inter-clefs,
     * que `assezLoin` ne voyait pas. Le semis entier bouge — majeur monté de
     * 2 à 3, protocole respecté. Trois graines, parce qu'un semeur peut très
     * bien ne bouger que sur certaines.
     */
    expect(MAP_VERSION).toBe('3.0.0-forez');
    expect(empreinte(signature(20250816)), 'graine 20250816').toBe('78c389cd');
    expect(empreinte(signature(7)), 'graine 7').toBe('4b0bd824');
    expect(empreinte(signature(42)), 'graine 42').toBe('0665316a');
  });

  it('rend deux fois le même monde pour la même graine', () => {
    /* Le déterminisme, gardé au niveau où il compte : si `buildWorld` tirait un
       seul nombre hors de sa graine, deux chargements de la même partie
       donneraient deux cartes et rien d'autre ne le dirait. */
    expect(signature(20250816)).toBe(signature(20250816));
  });
});
