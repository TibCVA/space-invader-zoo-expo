/**
 * Épreuves mesurées de la Châtellenie de Granit.
 *
 * Ce sont des MESURES sur la géométrie des rigs, jamais des captures : aucun
 * GPU n'intervient, et chacune de ces épreuves a été éprouvée en défaisant la
 * correction qu'elle garde — le chiffre de la défaite est cité en tête de
 * chaque test, à côté du chiffre corrigé, et le seuil est posé entre les deux.
 *
 * Elles gardent les quatre défauts que la planche de contact montrait sur les
 * rangs quatre, cinq et six :
 *
 *  — le suidé portait sa hure à hauteur de garrot et rendait un ÂNE BÂTÉ ;
 *  — son dos était un cylindre lisse, la barde et les soies étant posées un
 *    quart de hauteur trop bas ;
 *  — le cavalier des rangs six était un jeton posé sur la croupe, son heaume
 *    n'atteignait pas les oreilles du cheval et son écu tenait dans un tiers de
 *    la largeur du tronc ;
 *  — la Dame au Fil d'Or était une masse rouge sans bras ni pieds, coiffée d'un
 *    voile qui lui tombait sur la figure comme une barbe.
 */
import { beforeAll, describe, expect, it } from 'vitest';
import { Container, Graphics, Texture } from 'pixi.js';
import type { Rig } from '../rig.js';
import type { MaterialSet } from '../shading.js';
import { construireCreature } from './index.js';

/** Matières factices : ces épreuves ne mesurent que de la géométrie. */
const MATS: MaterialSet = {
  grain: Texture.EMPTY,
  parchemin: Texture.EMPTY,
  granit: Texture.EMPTY,
  ecorce: Texture.EMPTY,
  metal: Texture.EMPTY,
  tissu: Texture.EMPTY,
  fourrure: Texture.EMPTY,
  plumes: Texture.EMPTY,
  ecailles: Texture.EMPTY,
};

/**
 * PixiJS fabrique ses rampes de dégradé dans un canvas 2D ; en Node il n'y en a
 * pas. Le canevas factice est le même que celui d'`art.test.ts` : strictement
 * de quoi laisser la géométrie se construire.
 */
beforeAll(() => {
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
  const creerCanvas = (): unknown => {
    const canvas = new ToileFactice() as unknown as Record<string, unknown>;
    const contexte = {
      canvas,
      fillStyle: '',
      strokeStyle: '',
      lineWidth: 1,
      lineCap: 'butt',
      lineJoin: 'miter',
      globalAlpha: 1,
      globalCompositeOperation: 'source-over',
      createLinearGradient: () => ({ addColorStop: rien }),
      createRadialGradient: () => ({ addColorStop: rien }),
      createImageData: (w: number, h: number) => ({ width: w, height: h, data: new Uint8ClampedArray(w * h * 4) }),
      getImageData: (_x: number, _y: number, w: number, h: number) => ({
        width: w,
        height: h,
        data: new Uint8ClampedArray(w * h * 4),
      }),
      putImageData: rien,
      fillRect: rien,
      clearRect: rien,
      beginPath: rien,
      closePath: rien,
      moveTo: rien,
      lineTo: rien,
      arc: rien,
      ellipse: rien,
      quadraticCurveTo: rien,
      bezierCurveTo: rien,
      fill: rien,
      stroke: rien,
      save: rien,
      restore: rien,
      translate: rien,
      scale: rien,
      rotate: rien,
    };
    canvas.getContext = (): unknown => contexte;
    return canvas;
  };
  (globalThis as unknown as { document: unknown }).document = {
    createElement: (tag: string) => (tag === 'canvas' ? creerCanvas() : { style: {} }),
    body: { appendChild: () => undefined },
  };
});

interface Boite {
  x0: number;
  x1: number;
  y0: number;
  y1: number;
  w: number;
  h: number;
}

/** Boîte d'une articulation, ramenée dans le repère du rig (sol en y ≈ 0). */
function boite(rig: Rig, nom: string): Boite {
  const b = rig.joint(nom).getBounds();
  const a = rig.corps.toLocal({ x: b.x, y: b.y });
  return { x0: a.x, x1: a.x + b.width, y0: a.y, y1: a.y + b.height, w: b.width, h: b.height };
}

/** Position d'attache d'une articulation, dans le repère du rig. */
function ancre(rig: Rig, nom: string): { x: number; y: number } {
  const p = rig.joint(nom).toGlobal({ x: 0, y: 0 });
  return rig.corps.toLocal(p);
}

/**
 * Les sommets peints PAR une articulation elle-même, dans son propre repère —
 * sans ceux de ses articulations filles.
 *
 * Une boîte englobante ne sait pas répondre à « est-ce que l'étoffe passe
 * devant la figure ? » : elle dit jusqu'où l'étoffe descend, pas où. On lit donc
 * les instructions du `Graphics` de la pièce — la même géométrie que celle qui
 * part au GPU, sans rien rendre.
 *
 * L'exclusion des filles n'est pas un détail : `coiffe` est fille de `tete`, si
 * bien qu'une mesure prise sur la boîte de `tete` grossit quand le voile
 * grossit. Une épreuve dont le gabarit dépend de ce qu'elle mesure ne garde
 * rien.
 */
function sommetsPropres(rig: Rig, nom: string): { x: number; y: number }[] {
  const out: { x: number; y: number }[] = [];
  const joint = rig.joint(nom) as unknown as Container;
  const lire = (c: Container): void => {
    if (c instanceof Graphics) {
      const ctx = c.context as unknown as { instructions: { data: unknown }[] };
      for (const ins of ctx.instructions) {
        const d = ins.data as {
          path?: { shapePath?: { shapePrimitives?: { shape: { points?: number[] } }[] } };
        };
        for (const prim of d.path?.shapePath?.shapePrimitives ?? []) {
          const pts = prim.shape.points;
          if (!pts) continue;
          for (let i = 0; i < pts.length; i += 2) out.push({ x: pts[i], y: pts[i + 1] });
        }
      }
    }
    for (const enfant of c.children) {
      if (enfant === joint || !rig.aJoint((enfant as { nom?: string }).nom ?? '')) {
        lire(enfant as Container);
      }
    }
  };
  lire(joint);
  return out;
}

const SANGLIERS = ['granit_t5', 'granit_t5_up'] as const;
const CAVALIERS = ['granit_t6', 'granit_t6_up'] as const;

describe('rang 5 — les sangliers ne sont plus des ânes bâtés', () => {
  /**
   * Un suidé porte sa hure AU NIVEAU DU POITRAIL ; un équidé la porte au-dessus
   * de la ligne du dos, et c'est la première chose qu'on lit à la vignette.
   *
   * L'encolure était couchée de 0,5 rad : mesurée, l'ancre de tête tombait à
   * 0,408 (sanglier) et 0,396 (verrat) de la hauteur du tronc sous son échine.
   * Couchée de 1,05 rad, elle descend à 0,637 et 0,618 — à mi-tronc, là où le
   * rendu de référence la montre. Le seuil est posé entre les deux nuages.
   */
  it('porte la hure au niveau du poitrail, et non du garrot', () => {
    for (const id of SANGLIERS) {
      const rig = construireCreature(id, MATS);
      const tronc = boite(rig, 'tronc');
      const tete = ancre(rig, 'tete');
      const part = (tete.y - tronc.y0) / tronc.h;
      expect(part, `${id} — hure à ${(part * 100).toFixed(0)} % du tronc sous l'échine`)
        .toBeGreaterThan(0.5);
      rig.destroy({ children: true });
    }
  });

  /**
   * La hure est un COIN : nettement plus longue que haute. Le rapport de sa
   * boîte tombait à 1,019 et 1,014 quand l'encolure la redressait, à 1,059 et
   * 1,028 quand les défenses lui pendaient sous la mâchoire ; il vaut 1,163 et
   * 1,121 avec les deux corrections. La boîte est ici la bonne mesure justement
   * parce qu'elle englobe tout ce que la hure porte, défenses comprises.
   */
  it('donne à la hure un profil de coin, plus long que haut', () => {
    for (const id of SANGLIERS) {
      const rig = construireCreature(id, MATS);
      const tete = boite(rig, 'tete');
      expect(tete.w / tete.h, `${id} — hure ${tete.w.toFixed(0)} × ${tete.h.toFixed(0)}`)
        .toBeGreaterThan(1.08);
      rig.destroy({ children: true });
    }
  });

  /**
   * Les DÉFENSES remontent devant le groin ; elles ne pendent pas sous la
   * mâchoire.
   *
   * Les deux arcs étaient centrés en (0,86 S ; 0,26 S) et (0,94 S ; 0,02 S) —
   * c'est-à-dire SOUS la ligne de l'auge — et remontaient de là vers l'avant :
   * ce qu'on voyait à l'écran était la partie basse, un croissant blafard pendu
   * sous la tête, qu'on lisait comme une corne molle. Le centre des arcs passe
   * au-dessus du museau, et la pointe croise la ligne du chanfrein.
   *
   * On le mesure sur le NUAGE PROPRE de la hure — tous les sommets que la pièce
   * `tete` peint elle-même — et non sur sa boîte, pour que la mesure porte sur
   * la géométrie des défenses et non sur les contours qui l'entourent : la hure
   * s'étalait sur 62,5 × 53,7 et 70,1 × 64,8, soit un rapport de 1,164 et 1,082
   * — presque aussi haute que longue, parce que les défenses lui doublaient la
   * hauteur vers le bas. Elle vaut maintenant 1,516 et 1,367.
   */
  it('relève les défenses devant le groin au lieu de les pendre sous la mâchoire', () => {
    for (const id of SANGLIERS) {
      const rig = construireCreature(id, MATS);
      const sommets = sommetsPropres(rig, 'tete');
      let x0 = Infinity;
      let x1 = -Infinity;
      let y0 = Infinity;
      let y1 = -Infinity;
      for (const s of sommets) {
        x0 = Math.min(x0, s.x);
        x1 = Math.max(x1, s.x);
        y0 = Math.min(y0, s.y);
        y1 = Math.max(y1, s.y);
      }
      const rapport = (x1 - x0) / (y1 - y0);
      expect(rapport, `${id} — hure peinte ${(x1 - x0).toFixed(0)} × ${(y1 - y0).toFixed(0)}`)
        .toBeGreaterThan(1.25);
      rig.destroy({ children: true });
    }
  });

  /**
   * L'échine porte une CRÊTE DE SOIES qui dépasse le dos.
   *
   * `ligneDos` valait −0,34 Hs corrigé d'une pente, soit un quart de hauteur
   * SOUS l'échine réelle : barde, dossière et soies étaient posées au milieu du
   * flanc et le dos restait lisse — un cylindre. On mesure l'ÉLANCEMENT de la
   * pièce `tronc`, hauteur sur longueur, parce que la crête est ce qui la fait
   * monter au-dessus de l'échine : 0,488 et 0,512 quand la ligne était basse et
   * les soies réduites à des traits, 0,624 et 0,645 depuis qu'elles sont des
   * fuseaux plantés sur le dos réel.
   */
  it('hérisse la ligne du dos d’une crête de soies', () => {
    for (const id of SANGLIERS) {
      const rig = construireCreature(id, MATS);
      const tronc = boite(rig, 'tronc');
      expect(tronc.h / tronc.w, `${id} — tronc ${tronc.w.toFixed(0)} × ${tronc.h.toFixed(0)}`)
        .toBeGreaterThan(0.58);
      rig.destroy({ children: true });
    }
  });
});

describe('rang 6 — le cavalier existe autant que sa monture', () => {
  /**
   * Le heaume se découpe SUR LE CIEL, au-dessus de la ligne d'oreilles du
   * cheval. À l'échelle précédente (`Hs × 0,92`), le sommet du plumail tombait
   * à 4,2 unités au-dessus des oreilles sur le chevalier et 9,8 sur le
   * banneret : la tête de l'homme se confondait avec celle de la bête. Portée à
   * `Hs × 1,15`, elle les dépasse de 19,6 et 27,2.
   */
  it('lève le heaume au-dessus des oreilles du cheval', () => {
    for (const id of CAVALIERS) {
      const rig = construireCreature(id, MATS);
      const heaume = boite(rig, 'tete_cavalier');
      const cheval = boite(rig, 'tete');
      expect(cheval.y0 - heaume.y0, `${id} — heaume à ${heaume.y0.toFixed(0)}, oreilles à ${cheval.y0.toFixed(0)}`)
        .toBeGreaterThan(13);
      rig.destroy({ children: true });
    }
  });

  /**
   * L'écu fait une MASSE : il couvre plus de la moitié de la largeur du tronc
   * du cheval. À 0,42 × 0,54 HB, et à l'ancienne échelle de cavalier, il n'en
   * couvrait que 0,485 et 0,480 — un jeton posé sur le flanc ; à 0,54 × 0,7 il
   * en couvre 0,625 et 0,619. (Rendre l'échelle du cavalier seule le ramène à
   * 0,500 et 0,495 : les deux réglages comptent, et le seuil est sous les deux.)
   */
  it('donne à l’écu une masse qu’on lit avant le caparaçon', () => {
    for (const id of CAVALIERS) {
      const rig = construireCreature(id, MATS);
      const ecu = boite(rig, 'bouclier');
      const tronc = boite(rig, 'tronc');
      expect(ecu.w / tronc.w, `${id} — écu ${ecu.w.toFixed(0)} pour un tronc ${tronc.w.toFixed(0)}`)
        .toBeGreaterThan(0.55);
      rig.destroy({ children: true });
    }
  });

  /**
   * L'arme donne une DIAGONALE à la silhouette : sa boîte est presque aussi
   * large que haute. La lance du chevalier l'avait déjà (0,82) ; le gonfanon du
   * banneret montait tout droit et ne valait que 0,565, si bien que l'amélioré
   * n'avait aucune ligne qui le distingue de sa forme de base — et qu'il forçait
   * la boîte du sprite à 335 de haut, donc une réduction plus forte que celle du
   * chevalier. Couché de trente degrés, il vaut 0,817.
   */
  it('donne à l’arme du rang une diagonale franche', () => {
    for (const id of CAVALIERS) {
      const rig = construireCreature(id, MATS);
      const arme = boite(rig, 'arme');
      expect(arme.w / arme.h, `${id} — arme ${arme.w.toFixed(0)} × ${arme.h.toFixed(0)}`)
        .toBeGreaterThan(0.65);
      rig.destroy({ children: true });
    }
  });

  /**
   * La crinière fait une MASSE : elle déborde l'encolure au lieu d'y rester
   * collée. On rapporte l'aire de sa boîte à celle de l'encolure, et non sa
   * seule hauteur — une frange courte mais bien répartie garderait la hauteur
   * sans rien peser : à 0,72 couW elle valait 0,298 et 0,297 de l'encolure, à
   * 1,24 couW elle vaut 0,373 et 0,371.
   */
  it('donne au cheval une crinière qui pèse sur son encolure', () => {
    for (const id of CAVALIERS) {
      const rig = construireCreature(id, MATS);
      const criniere = boite(rig, 'criniere');
      const cou = boite(rig, 'cou');
      const part = (criniere.w * criniere.h) / (cou.w * cou.h);
      expect(part, `${id} — crinière ${(part * 100).toFixed(0)} % de l'aire de l'encolure`)
        .toBeGreaterThan(0.34);
      rig.destroy({ children: true });
    }
  });
});

describe('rang 4 — la Dame au Fil d’Or n’est plus un rectangle rouge', () => {
  /**
   * Les bottes sortent de la jupe. La robe mesurait 0,5 H et son ourlet tombait
   * six unités SOUS la semelle : l'étoffe passait sous le pied et la Dame
   * n'avait pas d'appui. Coupée à 0,38 H, elle laisse voir 6,8 unités de jambe.
   */
  it('laisse voir les bottes sous la jupe', () => {
    const rig = construireCreature('granit_t4_up', MATS);
    const robe = boite(rig, 'robe');
    const jambe = boite(rig, 'jambe_d');
    expect(jambe.y1 - robe.y1, `ourlet à ${robe.y1.toFixed(0)}, semelle à ${jambe.y1.toFixed(0)}`)
      .toBeGreaterThan(3);
    rig.destroy({ children: true });
  });

  /**
   * Un bras SORT de la masse. Coude fléchi d'un demi-radian et bras d'ombre à
   * −0,5, la main ne dépassait l'étoffe que de 2 unités : rien ne se détachait,
   * et la silhouette en noir n'avait pas de bras du tout. Bras tendu, elle la
   * dépasse de 12,5.
   */
  it('sort un bras de la masse de la robe', () => {
    const rig = construireCreature('granit_t4_up', MATS);
    const bras = boite(rig, 'bras_d');
    const robe = boite(rig, 'robe');
    const cape = boite(rig, 'cape');
    const etoffe = Math.max(robe.x1, cape.x1);
    expect(bras.x1 - etoffe, `main à ${bras.x1.toFixed(0)}, étoffe à ${etoffe.toFixed(0)}`)
      .toBeGreaterThan(6);
    rig.destroy({ children: true });
  });

  /**
   * Rien de la coiffe ne descend DEVANT la figure.
   *
   * C'est la loi des couvre-chefs de la Châtellenie — « rien au-dessous de
   * −0,70 rayon au droit du visage » — et le voile de la Dame la violait tout
   * seul : peint d'un bloc de (−0,08 H ; 0) à (0,12 H ; 0,2 H), il descendait à
   * +21 unités au droit du nez, soit deux rayons de tête sous le menton. À
   * l'écran c'était une barbe blanche.
   *
   * On mesure donc le point le plus bas de la pièce `coiffe` DANS LA BANDE DU
   * VISAGE. Le rayon de tête ne se recopie pas : la pièce `tete` peint sa
   * chevelure jusqu'à ±1,17 rayon et rien de plus large, ce qui le donne. La
   * bande n'est pas choisie non plus : `visage` pose les sourcils jusqu'à
   * ±0,64 rayon, et ±0,7 les couvre tous. Relevé : +2,24 rayons avec le voile
   * d'un seul pan — deux têtes sous le menton —, −0,58 avec les deux pans
   * latéraux. La Grenadière, qui porte le même touron de lin sans voile, sert
   * de témoin : elle était déjà à −0,46.
   */
  it('ne laisse rien de la coiffe tomber devant la figure', () => {
    for (const id of ['granit_t4', 'granit_t4_up'] as const) {
      const rig = construireCreature(id, MATS);
      let large = 0;
      for (const s of sommetsPropres(rig, 'tete')) large = Math.max(large, Math.abs(s.x));
      const r = large / 1.17;
      let bas = -Infinity;
      for (const s of sommetsPropres(rig, 'coiffe')) {
        if (Math.abs(s.x) < r * 0.7 && s.y > bas) bas = s.y;
      }
      expect(bas / r, `${id} — la coiffe descend à ${(bas / r).toFixed(2)} rayon au droit du visage`)
        .toBeLessThan(0.2);
      rig.destroy({ children: true });
    }
  });
});
