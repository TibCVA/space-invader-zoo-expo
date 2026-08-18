/**
 * La pile marche là où le moteur a marché — jamais à travers un rocher.
 *
 * Pourquoi ce fichier existe. L'animation de déplacement interpolait par
 * `hexLine`, la ligne droite, pendant que la prévisualisation au survol
 * montrait le vrai chemin de `hexPath`, qui contourne obstacles et piles. Dès
 * que les deux divergeaient, la créature traversait un rocher ou une pile
 * alliée **sous les yeux du joueur**, à l'endroit exact où on venait de lui
 * dessiner le contour. C'était le premier défaut bloquant de l'audit du
 * combat — et le premier test des 6 673 lignes de `battle/`, qui n'en
 * comptaient aucun.
 *
 * La subtilité que le test doit couvrir : au moment où l'animation démarre,
 * l'état du combat a déjà appliqué le déplacement. La pile y est à l'arrivée,
 * son corps posé sur la case de destination. `cheminDeMarche` repart donc d'un
 * clone replacé au départ — et c'est ce cas-là, pas le cas naïf, que le test
 * principal exerce.
 *
 * Éprouvé en défaisant la correction : court-circuiter l'appel au moteur dans
 * `cheminDeMarche` (retour direct de `hexLine`) fait rougir « contourne le
 * mur » — la ligne droite traverse le rocher de la colonne 4. Le premier
 * scénario du fichier garantit que le mur discrimine réellement les deux
 * trajectoires : sans lui, un mur mal placé rendrait tout le test décoratif.
 */
import { describe, expect, it } from 'vitest';
import { hexBlocked, hexDistance, hexLine, unitAt } from '@auvergne/engine';
import type { CombatObstacle, CombatState, HexCoord } from '@auvergne/engine';
import { army, makeBattle } from '@auvergne/engine/combat/testkit';
import { cheminDeMarche } from './anim.js';

/** Un mur de rochers en travers de la ligne droite, avec un passage au sud. */
function poserMur(combat: CombatState, col: number, rows: number[]): void {
  for (const row of rows) {
    const o: CombatObstacle = {
      at: { col, row },
      kind: 'rocher',
      blocksMove: true,
      blocksSight: false,
    };
    combat.obstacles.push(o);
  }
}

function bataille(): { combat: CombatState; uid: string; de: HexCoord; vers: HexCoord } {
  const { combat } = makeBattle({
    /* Un marcheur, surtout pas un volant : pour les créatures qui volent,
       `hexPath` rend la ligne droite — traverser le mur est leur vrai
       déplacement, et le test n'aurait rien à vérifier. Le Chevalier du Forez
       est la pile au sol la plus rapide (vitesse 9). */
    attackerArmy: army(['granit_t6', 2]),
    defenderArmy: army(['ermitage_t1', 1]),
    seed: 7,
  });
  const marcheur = combat.units.find((u) => u.creature === 'granit_t6');
  if (!marcheur) throw new Error('pile de test absente');
  /* Position connue, et un champ nettoyé des obstacles semés par la région. */
  combat.obstacles.length = 0;
  marcheur.at = { col: 2, row: 5 };
  const de = { col: 2, row: 5 };
  const vers = { col: 6, row: 5 };
  /* Mur vertical entre les deux : la ligne droite le traverse, le contour
     passe au-dessus ou au-dessous, dans le rayon de marche du Chevalier. */
  poserMur(combat, 4, [3, 4, 5, 6, 7]);
  return { combat, uid: marcheur.uid, de, vers };
}

describe('cheminDeMarche', () => {
  it('le scénario discrimine vraiment : la ligne droite traverse le mur', () => {
    const { combat, de, vers } = bataille();
    const droite = hexLine(de, vers);
    expect(droite.some((h) => hexBlocked(combat, h))).toBe(true);
  });

  it('contourne le mur, même quand l’état porte déjà la pile à l’arrivée', () => {
    const { combat, uid, de, vers } = bataille();
    /* L'état vécu par l'animation : le moteur a déjà déplacé la pile. */
    const marcheur = combat.units.find((u) => u.uid === uid);
    if (!marcheur) throw new Error('pile absente');
    marcheur.at = vers;

    const chemin = cheminDeMarche(combat, uid, de, vers);

    expect(chemin.length).toBeGreaterThanOrEqual(2);
    expect(chemin[0]).toEqual(de);
    expect(chemin[chemin.length - 1]).toEqual(vers);
    for (let i = 1; i < chemin.length; i++) {
      expect(hexDistance(chemin[i - 1], chemin[i]), 'pas contigu').toBe(1);
    }
    for (const h of chemin) {
      expect(hexBlocked(combat, h), `rocher traversé en (${String(h.col)},${String(h.row)})`).toBe(
        false,
      );
      const autre = unitAt(combat, h, marcheur);
      expect(autre, `pile traversée en (${String(h.col)},${String(h.row)})`).toBeNull();
    }
  });

  it('retombe sur la ligne droite quand la destination est emmurée', () => {
    const { combat, uid, de, vers } = bataille();
    /* On ferme le passage : le mur court désormais sur toute la colonne. */
    poserMur(combat, 4, [0, 1, 2, 8, 9, 10]);
    const chemin = cheminDeMarche(combat, uid, de, vers);
    expect(chemin).toEqual(hexLine(de, vers));
  });

  it('retombe sur la ligne droite pour une pile inconnue de l’état', () => {
    const { combat, de, vers } = bataille();
    const chemin = cheminDeMarche(combat, 'uid-fantome', de, vers);
    expect(chemin).toEqual(hexLine(de, vers));
  });
});
