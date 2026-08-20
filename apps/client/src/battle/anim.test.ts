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
import { FileAnimations, VOL_DU_TRAIT, cheminDeMarche, natureDuTrait } from './anim.js';
import { TRAITS_LISIBLES } from './vfx.js';
import type { ContexteAnim } from './anim.js';
import type { GameEvent } from '@auvergne/engine';

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

/**
 * Ce que lance chaque tireur, et quand l'impact tombe.
 *
 * Deux défauts que l'audit a chiffrés et que ces tests verrouillent.
 *
 * Le premier : `projectile()` annonçait dans son commentaire « flèche, carreau
 * ou bloc de pierre » et dessinait une seule géométrie, avec une teinte écrite
 * en dur à l'appel. L'arbalétrier des Farges, le veneur sylvestre et une tour
 * de siège lançaient rigoureusement le même trait brun.
 *
 * Le second : l'attente de l'impact au tir était écrite en dur à 0,28 s quand
 * le projectile volait 0,3 s — l'impact tombait 20 ms avant l'arrivée du
 * trait. C'était le résidu d'une avance de 117 ms corrigée au corps à corps
 * mais pas au tir. Les deux nombres lisent maintenant la même constante, et
 * c'est cela que le test tient : non pas sa valeur, mais son unicité.
 */
describe('le trait de chaque tireur', () => {
  it('donne un carreau à l’arbalétrier, une flèche au veneur', () => {
    // Les deux seuls tireurs du contenu, améliorés ou non.
    expect(natureDuTrait('granit_t3')).toBe('carreau');
    expect(natureDuTrait('granit_t3_up')).toBe('carreau');
    expect(natureDuTrait('ermitage_t4')).toBe('fleche');
    expect(natureDuTrait('ermitage_t4_up')).toBe('fleche');
  });

  it('ne donne ni carreau ni flèche à qui n’est pas tireur', () => {
    for (const id of ['granit_t1', 'granit_t7', 'ermitage_t1', 'ermitage_t7']) {
      expect(natureDuTrait(id), id).toBe('trait');
    }
  });

  it('distingue vraiment les natures : aucune n’en double une autre', () => {
    const natures = ['carreau', 'fleche', 'pierre', 'trait'] as const;
    const signatures = natures.map((n) => JSON.stringify(TRAITS_LISIBLES[n]));
    expect(new Set(signatures).size, signatures.join(' | ')).toBe(natures.length);
  });

  /*
   * Les deux cas se jouent pour de vrai : on enfile l'événement dans la file
   * d'animations avec des doublures, puis on regarde le trait qui est parti.
   * `reducedMotion` fait vider la file d'un bloc, donc tout s'exécute dans
   * l'appel — pas d'horloge à faire tourner.
   */
  function jouer(detail: Record<string, unknown>, texte: string): Trace[] {
    const traces: Trace[] = [];
    const ctx = contexteDoublure(traces);
    const ev: GameEvent = {
      type: 'CombatAction',
      entry: { kind: 'attaque', text: texte, detail } as never,
    } as never;
    new FileAnimations(ctx).enfiler([ev]);
    return traces;
  }

  it('lance le carreau de l’arbalétrier depuis sa case', () => {
    const traces = jouer({ attaquant: 'A', cible: 'C', degats: 30 }, 'A tire sur C');
    expect(traces).toHaveLength(1);
    expect(traces[0].nature).toBe('carreau');
  });

  it('fait tirer la tour de siège, qui n’a pas d’attaquant', () => {
    /*
     * C'est le défaut que ce test tient : sans case de tour dans le détail, la
     * vue s'arrêtait sur « if (!uidA) return » et la volée frappait
     * l'invisible — la pile perdait des hommes sans qu'un trait ne parte de
     * quelque part.
     */
    const traces = jouer(
      { cible: 'C', degats: 40, pertes: 2, tourCol: 12, tourRow: 1 },
      'Un trait de la tour frappe la pile.',
    );
    expect(traces).toHaveLength(1);
    expect(traces[0].nature).toBe('pierre');
    // Le trait part de la tour, pas de la cible.
    expect(traces[0].depuis).toEqual({ col: 12, row: 1 });
  });

  it('ne lance rien quand ni attaquant ni tour ne sont connus', () => {
    expect(jouer({ cible: 'C', degats: 10 }, 'quelque chose frappe')).toHaveLength(0);
  });

  it('fait voler le trait et attendre l’impact sur la même durée', () => {
    // Le contrat n'est pas « 0,3 seconde », c'est « une seule source ».
    expect(VOL_DU_TRAIT).toBeGreaterThan(0);
    const traces = jouer({ attaquant: 'A', cible: 'C', degats: 30 }, 'A tire sur C');
    expect(traces[0].duree).toBe(VOL_DU_TRAIT);
  });
});

interface Trace {
  nature: string;
  duree: number;
  depuis: { col: number; row: number };
}

/**
 * Un contexte d'animation réduit à ce que le chemin d'attaque touche.
 *
 * La géométrie rend la case elle-même comme position, ce qui permet au test de
 * lire l'ORIGINE du trait en colonne et ligne au lieu de pixels — c'est bien
 * « il part de la tour » qu'on veut vérifier, pas une coordonnée d'écran.
 */
function contexteDoublure(traces: Trace[]): ContexteAnim {
  const piles = {
    pile: (uid: string) =>
      uid === 'A' || uid === 'C'
        ? {
            uid,
            creature: uid === 'A' ? 'granit_t3' : 'ermitage_t1',
            hex: uid === 'A' ? { col: 1, row: 1 } : { col: 8, row: 5 },
            pos: uid === 'A' ? { x: 1, y: 1 } : { x: 8, y: 5 },
            jouer: () => {},
            frapper: () => {},
            orienter: () => {},
            imposerPosition: () => {},
            imposerProfondeur: () => {},
            libre: () => {},
          }
        : null,
  };
  const vfx = {
    projectile: (
      depuis: { x: number; y: number },
      _vers: { x: number; y: number },
      duree: number,
      _teinte: number,
      nature: string,
    ) => {
      traces.push({ nature, duree, depuis: { col: depuis.x, row: depuis.y } });
    },
    impact: () => {},
    sang: () => {},
    nombrePertes: () => {},
    mention: () => {},
    poussiere: () => {},
    secousse: { declencher: () => {} },
  };
  return {
    geo: { taille: 0, etirement: 1, local: (h: { col: number; row: number }) => ({ x: h.col, y: h.row }) },
    piles,
    vfx,
    combat: () => ({}) as never,
    reducedMotion: true,
  } as unknown as ContexteAnim;
}
