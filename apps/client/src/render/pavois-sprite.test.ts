/**
 * Le drapeau lui-même : l'étoffe posée sur le sprite d'un lieu.
 *
 * ## Ce que ce fichier garde, et pourquoi il existe
 *
 * `pavois.test.ts` garde la **règle** — quel lieu porte quelle bannière.
 * Ce fichier garde le **sprite**, parce que c'est là que se trouvaient les deux
 * défauts qui rendaient la demande inopérante à l'écran :
 *
 *  1. la texture n'était posée qu'à la première apparition du sprite
 *     (`if (!banniere.visible)`). Une mine prise à l'adversaire gardait ses
 *     anciennes couleurs jusqu'à ce qu'on la fasse sortir du cadre et revenir —
 *     c'est-à-dire dans la seule situation où le renseignement compte : juste
 *     après une prise ;
 *  2. sur une mine, la bannière tombait à `x + taille × 0,30` et le jeton de
 *     ressource à `x + taille × 0,30` aussi, à 0,20 case d'écart en hauteur :
 *     les deux renseignements se recouvraient. La hampe se plante désormais à
 *     l'ouest, le jeton garde l'est.
 *
 * ## Ce qu'il faut pour l'éprouver sans GPU
 *
 * `ObjetsCarte` construit de vrais `Sprite` et de vrais `Graphics`. C'est de la
 * géométrie : aucun rendu n'est demandé, aucun pixel n'est lu. Seule l'ombre
 * portée passe par un canvas — on lui en prête un factice, comme le fait déjà
 * `art/art.test.ts` pour les dégradés de PixiJS.
 */

import { beforeAll, describe, expect, it } from 'vitest';
import { Texture } from 'pixi.js';
import { bootstrapEngine } from '@auvergne/game';
import { buildWorld } from '@auvergne/map';
import { createGame } from '@auvergne/engine';
import type { GameState, MapObject, WorldMap } from '@auvergne/engine';
import type { ArtAtlas } from '../art/index.js';
import { setupDemo, GRAINE_DEMO } from '../state/demo.js';
import { BANNIERE_MIN_PX, ObjetsCarte, TAILLE } from './objects.js';
import type { Cadrage } from './commun.js';

/**
 * Toile factice, strictement suffisante pour que `Texture.from` accepte le
 * canevas de l'ombre portée. Même procédé que `art/art.test.ts`, et même
 * raison : l'environnement de test est « node », il n'y a pas de DOM.
 */
beforeAll(() => {
  bootstrapEngine();
  if (typeof globalThis.document !== 'undefined') return;
  const rien = (): undefined => undefined;
  class ToileFactice {
    width = 1;
    height = 1;
    style: Record<string, unknown> = {};
    addEventListener = rien;
    removeEventListener = rien;
    getContext: (type: string) => unknown = () => null;
  }
  (globalThis as unknown as { HTMLCanvasElement: unknown }).HTMLCanvasElement = ToileFactice;
  (globalThis as unknown as { document: unknown }).document = {
    createElement: (tag: string) => {
      const canvas = new ToileFactice() as unknown as Record<string, unknown>;
      const contexte = {
        canvas,
        fillStyle: '',
        createRadialGradient: () => ({ addColorStop: rien }),
        beginPath: rien,
        ellipse: rien,
        fill: rien,
      };
      canvas.getContext = (): unknown => contexte;
      return tag === 'canvas' ? canvas : { style: {} };
    },
  };
});

/** Atlas factice : il ne rend rien, il ne fait que rendre des textures distinctes. */
function atlasFactice(): ArtAtlas {
  const table = new Map<string, Texture>();
  const prendre = (cle: string): Texture => {
    const connue = table.get(cle);
    if (connue) return connue;
    const neuve = new Texture();
    table.set(cle, neuve);
    return neuve;
  };
  return {
    icon: (cle: string) => prendre(`icone/${cle}`),
    hasIcon: () => true,
    banner: (couleur: string, motif: number) => prendre(`etoffe/${couleur}/${String(motif)}`),
  } as unknown as ArtAtlas;
}

const CADRE: Cadrage = { col: 0, row: 0, zoom: 24, largeur: 1920, hauteur: 1080 };

let world: WorldMap;

/** Monte la couche des objets, caméra posée sur le lieu visé, voile ouvert. */
function scene(objet: MapObject): { carte: ObjetsCarte; etat: GameState; vue: Cadrage } {
  const etat = createGame(setupDemo(), world);
  const carte = new ObjetsCarte(world, atlasFactice());
  carte.sync(etat);
  const vue: Cadrage = { ...CADRE, col: objet.at.col + 0.5, row: objet.at.row + 0.5 };
  carte.majVue(vue, 0, () => 2);
  return { carte, etat, vue };
}

/** Abscisse écran du centre du lieu, celle dont on mesure les écarts. */
function centre(objet: MapObject, vue: Cadrage): number {
  return vue.largeur / 2 + (objet.at.col + 0.5 - vue.col) * vue.zoom;
}

describe('l’étoffe posée sur un lieu', () => {
  beforeAll(() => {
    world = buildWorld(GRAINE_DEMO);
  });

  /** Une mine gardée, qui porte aussi son jeton de ressource. */
  function mine(): MapObject {
    const o = world.objects.find((q) => q.kind === 'mine' && typeof q.data.resource === 'string');
    if (!o) throw new Error('aucune mine sur la carte');
    return o;
  }

  it('n’en pose aucune sur un lieu neutre', () => {
    const objet = mine();
    const { carte, vue } = scene(objet);
    const peint = carte.pavoisPeint(objet.uid);
    expect(peint, 'le lieu doit être dessiné').toBeTruthy();
    expect(peint!.proprietaire).toBeNull();
    expect(peint!.visible).toBe(false);
    carte.destroy();
    void vue;
  });

  it('la pose dès que le lieu passe sous une bannière', () => {
    const objet = mine();
    const { carte, etat, vue } = scene(objet);
    etat.objects[objet.uid].owner = 'P1';
    carte.majVue(vue, 0, () => 2);
    const peint = carte.pavoisPeint(objet.uid)!;
    expect(peint.visible).toBe(true);
    expect(peint.proprietaire).toBe('P1');
    expect(peint.texture).toBeTruthy();
    carte.destroy();
  });

  it('la REPEINT quand le lieu change de main, sans sortir du cadre', () => {
    const objet = mine();
    const { carte, etat, vue } = scene(objet);

    etat.objects[objet.uid].owner = 'P1';
    carte.majVue(vue, 0, () => 2);
    const premiere = carte.pavoisPeint(objet.uid)!.texture;
    expect(premiere).toBeTruthy();

    /* La prise. Le sprite ne sort jamais du cadre : c'est exactement la
       situation où l'ancienne couleur restait affichée, faute d'être relue. */
    etat.objects[objet.uid].owner = 'P2';
    carte.majVue(vue, 0, () => 2);
    const apres = carte.pavoisPeint(objet.uid)!;

    expect(apres.proprietaire).toBe('P2');
    expect(apres.visible).toBe(true);
    expect(apres.texture).toBeTruthy();
    expect(apres.texture, 'l’étoffe doit être repeinte').not.toBe(premiere);
    carte.destroy();
  });

  it('la retire quand le lieu redevient neutre', () => {
    const objet = mine();
    const { carte, etat, vue } = scene(objet);
    etat.objects[objet.uid].owner = 'P1';
    carte.majVue(vue, 0, () => 2);
    expect(carte.pavoisPeint(objet.uid)!.visible).toBe(true);
    etat.objects[objet.uid].owner = null;
    carte.majVue(vue, 0, () => 2);
    const peint = carte.pavoisPeint(objet.uid)!;
    expect(peint.visible).toBe(false);
    expect(peint.proprietaire).toBeNull();
    carte.destroy();
  });

  it('plante la hampe à l’ouest et laisse l’est au jeton de ressource', () => {
    const objet = mine();
    const { carte, etat, vue } = scene(objet);
    etat.objects[objet.uid].owner = 'P1';
    carte.majVue(vue, 0, () => 2);
    const peint = carte.pavoisPeint(objet.uid)!;
    const cx = centre(objet, vue);

    expect(peint.xEmbleme, 'la mine doit porter son jeton de ressource').not.toBeNull();
    expect(peint.x, 'la hampe se plante à l’ouest du lieu').toBeLessThan(cx);
    expect(peint.xEmbleme!, 'le jeton de ressource garde l’est').toBeGreaterThan(cx);
    /* L'écart dépasse la moitié de la largeur du lieu : le recouvrement mesuré
       avant correction — zéro pixel d'écart en abscisse — n'est plus possible. */
    expect(Math.abs(peint.x - peint.xEmbleme!)).toBeGreaterThan(TAILLE.mine * vue.zoom * 0.5);
    carte.destroy();
  });

  it('tient la bannière au-dessus du plancher de lisibilité, même au zoom le plus large', () => {
    const objet = mine();
    const { carte, etat } = scene(objet);
    etat.objects[objet.uid].owner = 'P1';
    /* ZOOM_MIN vaut 7 px la case : c'est la vue la plus large que la caméra
       autorise, et celle où l'étoffe se réduisait à neuf pixels de haut. */
    const large: Cadrage = { ...CADRE, zoom: 7, col: objet.at.col + 0.5, row: objet.at.row + 0.5 };
    carte.majVue(large, 0, () => 2);
    const peint = carte.pavoisPeint(objet.uid)!;
    expect(peint.visible).toBe(true);
    expect(peint.hauteur).toBeGreaterThanOrEqual(BANNIERE_MIN_PX);
    carte.destroy();
  });

  it('respecte le pavois de démonstration, et le lâche quand on le vide', () => {
    const objet = mine();
    const { carte, vue } = scene(objet);
    /* « P2 » et non « P3 » : la composition de démonstration ne lève que deux
       bannières, et le rendu ne peut pas peindre l'étoffe d'un joueur que
       l'état ne connaît pas — il n'en a ni la couleur ni le motif. */
    carte.poserPavoisDemo(new Map([[objet.uid, 'P2']]));
    carte.majVue(vue, 0, () => 2);
    expect(carte.pavoisPeint(objet.uid)!.proprietaire).toBe('P2');

    carte.poserPavoisDemo(new Map());
    carte.majVue(vue, 0, () => 2);
    const peint = carte.pavoisPeint(objet.uid)!;
    expect(peint.visible).toBe(false);
    expect(peint.proprietaire).toBeNull();
    carte.destroy();
  });

  it('ne pavoise pas un genre que le moteur ne fait jamais changer de main', () => {
    const coffre = world.objects.find((q) => q.kind === 'coffre')!;
    const { carte, etat, vue } = scene(coffre);
    etat.objects[coffre.uid].owner = 'P1';
    carte.majVue(vue, 0, () => 2);
    expect(carte.pavoisPeint(coffre.uid)!.visible).toBe(false);
    carte.destroy();
  });
});
