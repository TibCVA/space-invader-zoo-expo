/**
 * Gardes de l'Ermitage des Bois Noirs — les trois chantiers de la planche.
 *
 * Ces épreuves ne rendent rien : elles MESURENT la géométrie des rigs et les
 * valeurs de la palette, ce qui est tout ce qu'on peut vérifier sans GPU. Chacune
 * garde un défaut nommé sur la planche de contact `shots/betes-fin/`, et chacune
 * a été éprouvée en défaisant la correction qu'elle garde — la liste des défaites
 * et les chiffres relevés sont dans l'en-tête de chaque test.
 *
 * Les mesures sont prises dans le repère de `rig.corps`, où le sol est à y = 0 et
 * où l'axe y descend.
 */
import { beforeAll, describe, expect, it } from 'vitest';
import { Texture } from 'pixi.js';
import type { CreatureId } from '@auvergne/engine';
import type { MaterialSet } from '../shading.js';
import { luminance } from '../palette.js';
import type { Rig } from '../rig.js';
import { construireCreature } from './index.js';
import { VALEURS_PENITENT } from './ermitage.js';

/** Matières factices : ces épreuves n'ont pas de canevas, seulement des polygones. */
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
 * PixiJS fabrique ses dégradés dans un canevas 2D, qui n'existe pas sous Node :
 * on en pose un factice, strictement suffisant pour que la géométrie se
 * construise. Même toile que celle d'`art.test.ts`, pour la même raison.
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
      createImageData: (w: number, h: number) => ({
        width: w,
        height: h,
        data: new Uint8ClampedArray(w * h * 4),
      }),
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
  x: number;
  y: number;
  w: number;
  h: number;
  /** bord droit */
  d: number;
  /** bord bas */
  b: number;
}

/** Boîte d'une articulation, enfants compris, dans le repère du corps. */
function boite(rig: Rig, nom: string): Boite {
  const g = rig.joint(nom).getBounds();
  const hg = rig.corps.toLocal({ x: g.x, y: g.y });
  return { x: hg.x, y: hg.y, w: g.width, h: g.height, d: hg.x + g.width, b: hg.y + g.height };
}

/** Position d'une articulation dans le repère du corps, ancre comprise. */
function ancre(rig: Rig, nom: string): { x: number; y: number } {
  return rig.corps.toLocal(rig.joint(nom).toGlobal({ x: 0, y: 0 }));
}

/** Distance entre deux ancres. */
function ecart(rig: Rig, a: string, b: string): number {
  const pa = ancre(rig, a);
  const pb = ancre(rig, b);
  return Math.hypot(pb.x - pa.x, pb.y - pa.y);
}

/** Exécute `fn` sur un rig neuf puis le détruit. */
function surRig(id: string, fn: (rig: Rig) => void): void {
  const rig = construireCreature(id as CreatureId, MATS);
  try {
    fn(rig);
  } finally {
    rig.destroy({ children: true });
  }
}

/* ───────────────── Rang 7 — la présence des deux vouivres ───────────────── */

describe('les vouivres tiennent leur rang', () => {
  /**
   * Un serpent lové POSE ses anneaux au sol.
   *
   * Le corps était perché à 84 unités du sol pour une masse qui n'en descend que
   * 19 : l'encre s'arrêtait à y = −51 pendant que l'ombre portée est peinte à
   * y = 0. La case de la planche met à l'échelle la boîte ENTIÈRE, ombre
   * comprise ; près de la moitié de la vignette était donc du vide entre la bête
   * et son ombre, et c'est la première cause de sa petitesse.
   *
   * Défait (altitude du corps ramenée de 44 à 84) : le rapport passe de −0,062 à
   * −0,338 et l'épreuve rougit sur les deux vouivres.
   */
  it('pose ses anneaux au sol, et non trente pixels au-dessus', () => {
    for (const id of ['ermitage_t7', 'ermitage_t7_up']) {
      surRig(id, (rig) => {
        const c = boite(rig, 'corps');
        expect(c.b / c.h, `${id} — bas du corps à ${c.b.toFixed(0)} pour une hauteur de ${c.h.toFixed(0)}`)
          .toBeGreaterThan(-0.14);
      });
    }
  });

  /**
   * L'ENVERGURE. Une aile qui ne dépasse pas la bête ne se lit pas comme une
   * aile : elle se lit comme une nageoire dorsale. Elle mesurait 84 × 50 pour un
   * corps de 236 de large, et la vouivre lisait comme un rang trois à côté du
   * Griffon de Pamole, qui remplit sa vignette.
   *
   * Deux mesures, parce que deux choses manquaient : la LARGEUR de la membrane
   * rapportée au serpent, et le fait qu'elle monte AU-DESSUS de la tête —
   * l'ancienne se rangeait derrière la nuque.
   *
   * Relevé : 0,773 de la largeur du corps, sommet d'aile à −247 pour une tête
   * dont le sommet est à −185.
   * Défait (envergure ramenée à 84 × 50) : l'épreuve rougit sur les deux
   * vouivres, et sur les deux assertions à la fois.
   */
  it('déploie une aile qui déborde le serpent et monte au-dessus de la tête', () => {
    for (const id of ['ermitage_t7', 'ermitage_t7_up']) {
      surRig(id, (rig) => {
        const c = boite(rig, 'corps');
        const aile = boite(rig, 'aile_g');
        const tete = boite(rig, 'tete');
        expect(aile.w / c.w, `${id} — aile large de ${aile.w.toFixed(0)} pour un corps de ${c.w.toFixed(0)}`)
          .toBeGreaterThan(0.6);
        expect(aile.y, `${id} — sommet d'aile ${aile.y.toFixed(0)}, sommet de tête ${tete.y.toFixed(0)}`)
          .toBeLessThan(tete.y);
      });
    }
  });

  /**
   * Un serpent SE RESSERRE vers la queue, et ses anneaux se recouvrent.
   *
   * Les écarts entre attaches valaient 30, 40 et 30 pour des anneaux de 52, 44 et
   * 34 : l'espacement ne suivait pas la décroissance, aucun anneau n'en couvrait
   * vraiment un autre, et la vignette rendait un chapelet de galets d'égale
   * importance. On mesure ici la suite des écarts, qui doit être strictement
   * décroissante — c'est la forme même de l'enroulement.
   *
   * Relevé : 32,6 · 26,3 · 20,1 · 11,0.
   * Défait (écarts remis à 30 · 40 · 30 · 14) : la suite remonte au deuxième
   * cran et l'épreuve rougit.
   */
  it('resserre la chaîne de ses anneaux du tronc jusqu’au fouet', () => {
    for (const id of ['ermitage_t7', 'ermitage_t7_up']) {
      surRig(id, (rig) => {
        const suite = [
          ecart(rig, 'corps', 'anneau1'),
          ecart(rig, 'anneau1', 'anneau2'),
          ecart(rig, 'anneau2', 'anneau3'),
          ecart(rig, 'anneau3', 'queue'),
        ];
        for (let i = 1; i < suite.length; i += 1) {
          expect(suite[i], `${id} — écarts ${suite.map((v) => v.toFixed(1)).join(' · ')}`)
            .toBeLessThan(suite[i - 1]);
        }
      });
    }
  });

  /**
   * Le FOUET repart vers l'arrière, et il ne monte pas au ciel.
   *
   * Il pointait à soixante degrés au-dessus de l'horizontale, vers le
   * haut-gauche — exactement le quartier où la membrane doit s'ouvrir. Les deux
   * masses se disputaient la même moitié d'image et la silhouette se pliait en un
   * V étroit. On mesure la DIRECTION de la queue dans le repère du corps, en
   * transformant un point de son propre repère : c'est la seule mesure qui isole
   * la cause, la longueur du fouet et la rotation des anneaux entrant dans toutes
   * les autres.
   *
   * Relevé : composante horizontale −0,78, verticale −0,63, soit trente-neuf
   * degrés au-dessus de l'horizontale.
   * Défait (rotation remise à π + 1,05) : la verticale passe à −0,87, soit
   * soixante degrés, et l'épreuve rougit sur les deux vouivres.
   */
  it('fait repartir le fouet vers l’arrière sans lui donner le ciel', () => {
    for (const id of ['ermitage_t7', 'ermitage_t7_up']) {
      surRig(id, (rig) => {
        const base = ancre(rig, 'queue');
        const loin = rig.corps.toLocal(rig.joint('queue').toGlobal({ x: 60, y: 0 }));
        const dx = loin.x - base.x;
        const dy = loin.y - base.y;
        const n = Math.hypot(dx, dy) || 1;
        expect(dx / n, `${id} — la queue ne part pas vers l'arrière`).toBeLessThan(-0.5);
        expect(dy / n, `${id} — la queue monte de ${((Math.asin(-dy / n) * 180) / Math.PI).toFixed(0)}°`)
          .toBeGreaterThan(-0.75);
      });
    }
  });

  /**
   * La GUEULE est ouverte AU REPOS.
   *
   * Fermée, la tête de la vouivre est une amande verte de quinze pixels qu'on ne
   * distingue pas de la pointe d'un anneau. La rotation est posée sur la pose de
   * repos de l'articulation et non dans le dessin, si bien que les pistes de
   * `clipsSerpent` — qui ajoutent leur valeur au repos — continuent de refermer
   * puis rouvrir la gueule. On vérifie donc les deux : l'ouverture, et le fait
   * que la mâchoire s'anime toujours.
   *
   * Défait (`rot` de la mâchoire remis à 0) : l'épreuve rougit sur la première
   * assertion, la seconde restant verte — c'est ce qu'on veut d'une garde qui
   * porte sur la pose de repos et non sur l'animation.
   */
  it('tient la gueule ouverte au repos sans perdre sa morsure', () => {
    for (const id of ['ermitage_t7', 'ermitage_t7_up']) {
      surRig(id, (rig) => {
        expect(rig.joint('machoire').repos.rot, `${id} — mâchoire au repos`).toBeGreaterThan(0.2);
        const repos = rig.joint('machoire').rotation;
        rig.play('attaque');
        let bouge = false;
        for (let i = 0; i < 30; i += 1) {
          rig.update(1 / 60);
          if (Math.abs(rig.joint('machoire').rotation - repos) > 0.05) bouge = true;
        }
        expect(bouge, `${id} — la mâchoire ne bouge plus à l'attaque`).toBe(true);
      });
    }
  });
});

/* ──────────────────── Rang 3 — les deux loups sont des loups ─────────────── */

describe('les loups sont des loups', () => {
  const GABARIT = { ermitage_t3: { Hs: 50, L: 94 }, ermitage_t3_up: { Hs: 54, L: 100 } } as const;

  /**
   * La tête est portée BAS, sous la ligne du dos.
   *
   * C'est la posture de chasse, et c'est la seule chose qui sépare un loup d'un
   * chien à trente pixels. L'encolure était tournée de 0,55 : l'ancre de tête
   * tombait 7,2 unités sous le garrot, soit à mi-hauteur de l'épaule, ce qui est
   * le port d'un chien attentif.
   *
   * Relevé après correction : 13,5 pour Hs = 50, soit 0,27.
   * Défait (encolure remise à 0,32 Hs et 0,55 radian, `teteRot` à −0,04) :
   * l'épreuve rougit sur les deux loups.
   */
  it('porte la tête sous le garrot', () => {
    for (const [id, g] of Object.entries(GABARIT)) {
      surRig(id, (rig) => {
        const dos = boite(rig, 'tronc').y;
        const t = ancre(rig, 'tete');
        expect((t.y - dos) / g.Hs, `${id} — tête à ${t.y.toFixed(1)}, garrot à ${dos.toFixed(1)}`)
          .toBeGreaterThan(0.2);
      });
    }
  });

  /**
   * Le MUSEAU porte loin devant l'attache de tête.
   *
   * Le crâne allait de −0,58 S à +1,00 S — 1,58 S de long pour 0,98 de haut, le
   * rapport d'un ourson — et la zone dite « museau » faisait 0,68 de long pour
   * 0,44 de haut, c'est-à-dire un groin. Un loup a le chanfrein long, droit et
   * sec ; on mesure ce qu'il porte en avant de son attache.
   *
   * Relevé : 43,8 pour Hs = 50, soit 0,876.
   * Défait (museau, truffe, babines et mandibule ramenés à leurs anciennes
   * proportions) : l'épreuve rougit sur les deux loups.
   */
  it('porte un museau long devant l’attache de tête', () => {
    for (const [id, g] of Object.entries(GABARIT)) {
      surRig(id, (rig) => {
        const t = boite(rig, 'tete');
        const a = ancre(rig, 'tete');
        expect((t.d - a.x) / g.Hs, `${id} — museau porté à ${(t.d - a.x).toFixed(1)} pour Hs = ${g.Hs}`)
          .toBeGreaterThan(0.8);
      });
    }
  });

  /**
   * Les OREILLES sont dressées, et elles se découpent sur le ciel.
   *
   * Elles faisaient 0,34 S de haut et leur pointe RECULAIT de 0,10 S derrière
   * leur base : deux bosses sombres sur le sommet du crâne, indiscernables du
   * poil. Celle d'un loup fait les deux tiers de la hauteur de sa tête. On mesure
   * ce que la tête élève au-dessus de son attache, en demi-hauteurs de garrot.
   *
   * Relevé : 36,9 pour S = 25, soit 1,478.
   * Défait (oreilles remises à 0,34 S, pointe reculée derrière la base) :
   * l'épreuve rougit sur les deux loups.
   */
  it('dresse des oreilles qui montent franchement au-dessus du crâne', () => {
    for (const [id, g] of Object.entries(GABARIT)) {
      surRig(id, (rig) => {
        const t = boite(rig, 'tete');
        const a = ancre(rig, 'tete');
        expect((a.y - t.y) / (g.Hs * 0.5), `${id} — la tête monte de ${(a.y - t.y).toFixed(1)} au-dessus de son attache`)
          .toBeGreaterThan(1.25);
      });
    }
  });

  /**
   * La QUEUE est un fouet de poils, pas un cône.
   *
   * La queue partagée du squelette est un fuseau lissé d'un seul ton qui s'affine
   * régulièrement : juste pour un cerf, faux pour un canidé, chez qui la queue
   * est le troisième volume de la bête. `queueLoup` lui donne son profil en
   * brosse et ses mèches ; on mesure l'emprise, qui est ce que la brosse ajoute,
   * et le fait qu'elle PEND au lieu de se relever en trompette.
   *
   * Relevé : 0,692 de la longueur de tronc.
   * Défait (retour à `queue: { longueur: L * 0,46, epaisseur: Hs * 0,3 }` du
   * squelette partagé, `queueLoup` débranché) : l'épreuve rougit.
   */
  it('traîne une queue fournie, et basse', () => {
    for (const [id, g] of Object.entries(GABARIT)) {
      surRig(id, (rig) => {
        const q = boite(rig, 'queue');
        const tronc = boite(rig, 'tronc');
        expect(q.w / g.L, `${id} — queue large de ${q.w.toFixed(1)} pour L = ${g.L}`).toBeGreaterThan(0.62);
        expect(q.b, `${id} — bas de queue ${q.b.toFixed(1)}, bas de tronc ${tronc.b.toFixed(1)}`)
          .toBeGreaterThan(tronc.b - g.Hs * 0.5);
      });
    }
  });
});

/* ───────────── Rang 1 — le Pèlerin et le Pénitent Blanc, la paire ────────── */

describe('le Pèlerin et le Pénitent se distinguent, et portent tous deux', () => {
  /**
   * Le CHAPEAU contre la CAGOULE.
   *
   * L'Ermitage comptait trois silhouettes encapuchonnées sur ses quatorze —
   * pèlerin, pénitent, veneur — que la vignette ne séparait pas, et la paire du
   * rang un était donc deux fois la même tête. Le bord large est la coiffe la
   * plus reconnaissable qui existe à soixante-quatre pixels : une barre
   * horizontale au-dessus des épaules. On mesure la largeur de tête, rapportée à
   * la taille du personnage, et l'écart entre les deux.
   *
   * Relevé : 0,387 H pour le Pèlerin, 0,244 H pour le Pénitent, rapport 1,59.
   * Défait (chapeau retiré, capuche seule) : l'épreuve rougit.
   */
  it('coiffe le Pèlerin d’un bord large et le Pénitent d’une pointe', () => {
    let pelerin = 0;
    let penitent = 0;
    surRig('ermitage_t1', (rig) => {
      pelerin = boite(rig, 'tete').w / 94;
    });
    surRig('ermitage_t1_up', (rig) => {
      penitent = boite(rig, 'tete').w / 102;
    });
    expect(pelerin, `chapeau du Pèlerin : ${pelerin.toFixed(3)} H`).toBeGreaterThan(0.33);
    expect(pelerin / penitent, `Pèlerin ${pelerin.toFixed(3)} contre Pénitent ${penitent.toFixed(3)}`)
      .toBeGreaterThan(1.35);
  });

  /**
   * Le Pénitent a RETROUVÉ sa cape et son dos.
   *
   * Il est censé être l'amélioration du Pèlerin et il était plus pauvre que lui :
   * le Pèlerin a une cape, un ballot au dos, une besace ; le Pénitent n'avait ni
   * cape ni dos, et sa silhouette était un triangle plein.
   *
   * Défait (`cape: null` et bloc `dos` supprimé) : l'épreuve rougit.
   */
  it('rend au Pénitent le mantelet et le ballot qui lui manquaient', () => {
    surRig('ermitage_t1_up', (rig) => {
      expect(rig.aJoint('cape'), 'le Pénitent n’a pas de cape').toBe(true);
      expect(rig.aJoint('dos'), 'le Pénitent n’a pas de dos').toBe(true);
      expect(boite(rig, 'cape').w / 102, 'mantelet du Pénitent').toBeGreaterThan(0.4);
    });
  });

  /**
   * Les PIEDS NUS dépassent l'ourlet.
   *
   * C'est l'attribut que le vœu impose, et la robe le couvrait : son ourlet
   * tombait à 5,1 unités du sol quand le pied s'arrête à 3,3, soit moins de deux
   * pixels de dépassement, visibles seulement dans les déchirures. Un pénitent
   * déchaussé dont on ne voit pas les pieds est un pénitent chaussé.
   *
   * Relevé après raccourcissement de la robe : 6,1 unités, soit 0,060 H.
   * Défait (hauteur de robe remise à 0,50 H) : 1,7 unité, soit 0,017 H, et
   * l'épreuve rougit.
   */
  it('laisse voir les pieds nus du Pénitent sous l’ourlet', () => {
    surRig('ermitage_t1_up', (rig) => {
      const robe = boite(rig, 'robe');
      const pied = boite(rig, 'jambe_g');
      expect((pied.b - robe.b) / 102, `ourlet à ${robe.b.toFixed(1)}, pied à ${pied.b.toFixed(1)}`)
        .toBeGreaterThan(0.04);
    });
  });

  /**
   * TROIS VALEURS, et non une.
   *
   * C'est le défaut de fond du Pénitent, et il ne se mesure pas sur la géométrie :
   * toutes ses pièces — robe, basque, épaulement, manche, cagoule — étaient
   * tirées du même lin à moins de dix pour cent d'écart. Une silhouette qui ne
   * porte qu'une valeur n'a pas de volume, et un blanc pur sur le fond clair
   * d'une case de parchemin ne se lit pas du tout.
   *
   * Les trois teintes sont donc hissées dans `VALEURS_PENITENT` pour être
   * mesurables. On exige un écart de luminance d'au moins 0,18 entre le lin et le
   * mantelet, et autant entre le mantelet et le creux de cagoule — deux marches
   * franches plutôt qu'un dégradé qu'on ne voit pas.
   *
   * Défait (mantelet ramené à `melanger(lin, BRUME, 0.34)`, sa valeur d'avant) :
   * l'écart lin → mantelet retombe sous le seuil et l'épreuve rougit.
   */
  it('donne au Pénitent trois valeurs franches, et pas un seul blanc', () => {
    const l = luminance(VALEURS_PENITENT.lin);
    const b = luminance(VALEURS_PENITENT.bure);
    const c = luminance(VALEURS_PENITENT.creux);
    expect(l - b, `lin ${l.toFixed(3)} contre mantelet ${b.toFixed(3)}`).toBeGreaterThan(0.18);
    expect(b - c, `mantelet ${b.toFixed(3)} contre creux ${c.toFixed(3)}`).toBeGreaterThan(0.18);
    // et rien ne tombe dans le blanc pur ni dans le noir : loi n°6 et §2 de la bible
    expect(l).toBeLessThan(0.95);
    expect(c).toBeGreaterThan(0.06);
  });
});
