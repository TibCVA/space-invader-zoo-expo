/**
 * Garde-fous de l'art procédural.
 *
 * Ces tests ne rendent rien : ils vérifient ce qui peut l'être sans GPU —
 * que les vingt-huit créatures se construisent, qu'elles portent bien leurs
 * sept animations, que les silhouettes sont distinctes, que les clefs d'icônes
 * couvrent exactement ce que le contenu réclame, et que tout est déterministe.
 */
import { beforeAll, describe, expect, it } from 'vitest';
import { Container, Texture } from 'pixi.js';
import { Joint } from './rig.js';
import type { Rig } from './rig.js';
import { ARTIFACTS, HEROES, SKILLS, SPELLS } from '@auvergne/content';
import { MAP_OBJECT_KINDS } from '@auvergne/engine';
import type { MaterialSet } from './shading.js';
import { blob, centroid, clipHalfPlane, flat, perturber, pt, ruban, signedArea } from './shading.js';
import {
  ANGLE_LUMIERE,
  LIGHT,
  assombrir,
  eclaircir,
  luminance,
  melanger,
  perspectiveAtmospherique,
  toRgb,
} from './palette.js';
import { fbm, hashString, valueNoise } from './noise.js';
import { CREATURE_IDS, construireCreature } from './creatures/index.js';
import { MAP_ICONS, MAP_ICON_LABELS, clesIconesCarte, dessinerIconeCarte } from './map-icons.js';
import { clesEmblemes, dessinerEmbleme } from './emblems.js';
import { clesArtefacts, dessinerArtefact } from './artifact-icons.js';
import { clesPortraits, dessinerPortrait } from './portraits.js';
import { PROPS, PROP_KEYS, dessinerProp } from './props.js';
import { BANNERS, dessinerBanniere } from './banners.js';
import { creerMatieres } from './shading.js';
import { creerPinceauxTerrain } from './terrain-brushes.js';
import { creerEffet, creerTexturesParticules } from './effects.js';

/** Matières factices : les tests n'ont pas de canvas, seulement de la géométrie. */
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

const ANIMS = ['attente', 'marche', 'attaque', 'impact', 'riposte', 'defense', 'mort'] as const;

/**
 * PixiJS construit ses dégradés dans un canvas 2D. En environnement Node il n'y
 * en a pas : on pose un canevas factice, strictement suffisant pour que la
 * géométrie se construise. Rien n'est rendu, rien n'est mesuré en pixels.
 */
beforeAll(() => {
  if (typeof globalThis.document !== 'undefined') return;
  const rien = (): undefined => undefined;
  // PixiJS reconnaît un canvas par `instanceof HTMLCanvasElement` : on fournit
  // donc une classe portant ce nom, plutôt qu'un simple objet littéral.
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

describe('palette', () => {
  it("n'assombrit jamais jusqu'au noir et refroidit toujours vers le bleu", () => {
    for (const c of [0x6e1f2a, 0x4a6138, 0xc9a227, 0xe8dcc0]) {
      const sombre = assombrir(c, 1);
      const { r, g, b } = toRgb(sombre);
      expect(r + g + b).toBeGreaterThan(24);
      // l'ombre tire vers le bleu : le canal bleu perd moins que le rouge
      const base = toRgb(c);
      const perteR = base.r - r;
      const perteB = base.b - b;
      expect(perteB).toBeLessThanOrEqual(perteR + 40);
    }
  });

  it("n'éclaircit jamais jusqu'au blanc pur", () => {
    for (const c of [0x2a2c2f, 0x1e3226, 0x2b3a4a]) {
      const clair = eclaircir(c, 1);
      expect(luminance(clair)).toBeLessThan(0.98);
      expect(luminance(clair)).toBeGreaterThan(luminance(c));
    }
  });

  it('applique la perspective atmosphérique bornée à 0,55', () => {
    const proche = perspectiveAtmospherique(0x6e1f2a, 0);
    const lointain = perspectiveAtmospherique(0x6e1f2a, 100000);
    expect(proche).toBe(0x6e1f2a);
    expect(lointain).toBe(melanger(0x6e1f2a, 0x8fa6b8, 0.55));
  });
});

describe('bruit', () => {
  it('est périodique, donc répétable sans couture', () => {
    for (let i = 0; i < 12; i += 1) {
      const x = i * 3.7;
      const y = i * 1.3;
      expect(valueNoise(x + 32, y, 32, 7)).toBeCloseTo(valueNoise(x, y, 32, 7), 10);
      expect(valueNoise(x, y + 32, 32, 7)).toBeCloseTo(valueNoise(x, y, 32, 7), 10);
    }
  });

  it('est déterministe entre deux appels', () => {
    expect(fbm(3.2, 7.1, 16, 42, 4)).toBe(fbm(3.2, 7.1, 16, 42, 4));
    expect(hashString('granit_t7_up')).toBe(hashString('granit_t7_up'));
  });
});

describe('géométrie de peinture', () => {
  it("ne produit jamais de cercle parfait : les rayons d'un blob varient", () => {
    const b = blob(0, 0, 20, 20, { seed: 3, points: 24, wobble: 0.1 });
    const c = centroid(b);
    const rayons = b.map((p) => Math.hypot(p.x - c.x, p.y - c.y));
    const min = Math.min(...rayons);
    const max = Math.max(...rayons);
    expect(max - min).toBeGreaterThan(0.6);
  });

  it('découpe correctement un polygone par un demi-plan', () => {
    const carre = [pt(-10, -10), pt(10, -10), pt(10, 10), pt(-10, 10)];
    const moitie = clipHalfPlane(carre, pt(0, 0), pt(1, 0));
    expect(moitie.length).toBeGreaterThanOrEqual(3);
    for (const p of moitie) expect(p.x).toBeGreaterThanOrEqual(-1e-9);
    expect(Math.abs(signedArea(moitie))).toBeCloseTo(200, 6);
  });

  it('perturbe de façon déterministe', () => {
    const a = perturber([pt(0, 0), pt(10, 0), pt(10, 10)], 1.5, 9);
    const b = perturber([pt(0, 0), pt(10, 0), pt(10, 10)], 1.5, 9);
    expect(flat(a)).toEqual(flat(b));
  });
});

describe('les vingt-huit créatures', () => {
  it('couvre exactement les identifiants imposés', () => {
    expect(CREATURE_IDS).toHaveLength(28);
    expect(CREATURE_IDS[0]).toBe('granit_t1');
    expect(CREATURE_IDS[13]).toBe('granit_t7_up');
    expect(CREATURE_IDS[27]).toBe('ermitage_t7_up');
  });

  it('se construisent toutes, avec leurs sept animations et une capacité', () => {
    for (const id of CREATURE_IDS) {
      const rig = construireCreature(id, MATS);
      for (const a of ANIMS) expect(rig.animations, id).toContain(a);
      expect(rig.animations, id).toContain('capacite');
      rig.destroy({ children: true });
    }
  });

  it('supportent les huit animations et une boucle de mise à jour', () => {
    for (const id of ['granit_t1', 'granit_t6', 'granit_t7_up', 'ermitage_t2', 'ermitage_t6_up', 'ermitage_t7_up']) {
      const rig = construireCreature(id, MATS);
      for (const a of [...ANIMS, 'capacite'] as const) {
        rig.play(a);
        for (let i = 0; i < 40; i += 1) rig.update(1 / 60);
      }
      rig.setFacing(-1);
      rig.update(1 / 60);
      rig.setFacing(1);
      rig.update(1 / 60);
      rig.destroy({ children: true });
    }
  });

  it('ont des silhouettes de tailles distinctes au sein d’un même rang', () => {
    const boites = new Map<string, string>();
    for (const id of CREATURE_IDS) {
      const rig = construireCreature(id, MATS);
      const b = rig.getLocalBounds();
      expect(b.width, id).toBeGreaterThan(20);
      expect(b.height, id).toBeGreaterThan(30);
      const clef = `${Math.round(b.width)}x${Math.round(b.height)}`;
      boites.set(id, clef);
      rig.destroy({ children: true });
    }
    // aucune paire base/amélioré ne doit avoir exactement la même empreinte
    for (const id of CREATURE_IDS) {
      if (!id.endsWith('_up')) continue;
      const base = id.slice(0, -3);
      expect(boites.get(id), id).not.toBe(boites.get(base));
    }
  });

  it('sont déterministes : deux constructions donnent la même empreinte', () => {
    for (const id of ['granit_t4_up', 'ermitage_t5']) {
      const a = construireCreature(id, MATS).getLocalBounds();
      const b = construireCreature(id, MATS).getLocalBounds();
      expect(`${a.x},${a.y},${a.width},${a.height}`).toBe(`${b.x},${b.y},${b.width},${b.height}`);
    }
  });
});

describe('clefs d’atlas', () => {
  it('fournit toutes les clefs de compétence réclamées par le contenu', () => {
    const fournies = new Set(clesEmblemes());
    for (const s of Object.values(SKILLS)) expect(fournies.has(s.icon), s.icon).toBe(true);
  });

  it('fournit toutes les clefs de sort réclamées par le contenu', () => {
    const fournies = new Set(clesEmblemes());
    for (const s of Object.values(SPELLS)) expect(fournies.has(s.icon), s.icon).toBe(true);
  });

  it('fournit toutes les clefs d’artefact réclamées par le contenu', () => {
    const fournies = new Set(clesArtefacts());
    for (const a of Object.values(ARTIFACTS)) expect(fournies.has(a.icon), a.icon).toBe(true);
  });

  it('fournit tous les portraits de héros réclamés par le contenu', () => {
    const fournies = new Set(clesPortraits());
    for (const h of Object.values(HEROES)) expect(fournies.has(h.portrait), h.portrait).toBe(true);
    expect(fournies.size).toBe(21);
  });

  /*
   * La liste des genres est LUE dans le contrat du moteur, jamais recopiée.
   *
   * Elle l'était : seize genres énumérés à la main — précisément les seize qui
   * avaient une icône. Le test ne pouvait donc pas rougir sur les treize
   * autres, et ces treize couvraient un tiers des lieux de la carte, tous
   * rendus par le même repli `carte_borne`. Un coffre, une banque, une école
   * et un temple étaient indiscernables à l'écran.
   */
  it('couvre tous les genres d’objet de carte', () => {
    const fournies = new Set(clesIconesCarte());
    const manquants = MAP_OBJECT_KINDS.filter((k) => !fournies.has(`carte_${k}`));
    expect(manquants, `genres sans icône propre : ${manquants.join(', ')}`).toEqual([]);
  });

  /*
   * Deux genres ne partagent jamais un dessin.
   *
   * C'est la faute précise qui s'était installée : treize genres n'avaient
   * aucune entrée, et `render/objects.ts` les rabattait tous sur `carte_borne`.
   * Avoir une entrée ne suffit donc pas — encore faut-il qu'elle soit à eux.
   */
  it('donne à chaque genre un dessin qui n’est qu’à lui', () => {
    const dessins = Object.values(MAP_ICONS);
    expect(new Set(dessins).size).toBe(dessins.length);
  });

  it('nomme chaque genre dans la légende', () => {
    const manquants = MAP_OBJECT_KINDS.filter((k) => !MAP_ICON_LABELS[`carte_${k}`]);
    expect(manquants, `genres sans libellé : ${manquants.join(', ')}`).toEqual([]);
  });
});

describe('dessin de toutes les vignettes', () => {
  it('dessine chaque variante de décor sans erreur et avec une empreinte utile', () => {
    for (const key of PROP_KEYS) {
      for (let v = 0; v < PROPS[key].variantes; v += 1) {
        const g = dessinerProp(MATS, key, v);
        const b = g.getLocalBounds();
        expect(b.width, `${key} ${v}`).toBeGreaterThan(8);
        expect(b.height, `${key} ${v}`).toBeGreaterThan(8);
        g.destroy();
      }
    }
  });

  it('dessine chaque icône de carte et chaque jeton de ressource', () => {
    for (const key of clesIconesCarte()) {
      const g = dessinerIconeCarte(MATS, key);
      expect(g.getLocalBounds().width, key).toBeGreaterThan(6);
      g.destroy();
    }
  });

  it('dessine les vingt compétences et les trente-deux sorts', () => {
    const clefs = clesEmblemes();
    expect(clefs.filter((k) => k.startsWith('competence_'))).toHaveLength(20);
    expect(clefs.filter((k) => k.startsWith('sort_'))).toHaveLength(32);
    for (const key of clefs) {
      const g = dessinerEmbleme(MATS, key);
      expect(g.getLocalBounds().width, key).toBeGreaterThan(20);
      g.destroy();
    }
  });

  it('dessine les cinquante-trois artefacts', () => {
    const clefs = clesArtefacts();
    expect(clefs.length).toBe(Object.keys(ARTIFACTS).length);
    for (const key of clefs) {
      const g = dessinerArtefact(MATS, key);
      expect(g.getLocalBounds().width, key).toBeGreaterThan(20);
      g.destroy();
    }
  });

  it('dessine les vingt-et-un portraits', () => {
    for (const key of clesPortraits()) {
      const c = dessinerPortrait(MATS, key);
      const b = c.getLocalBounds();
      expect(b.width, key).toBeGreaterThan(100);
      expect(b.height, key).toBeGreaterThan(120);
      c.destroy({ children: true });
    }
  });

  it('dessine les cinq bannières, motif compris', () => {
    for (const b of BANNERS) {
      const g = dessinerBanniere(MATS, b.color, b.pattern, { seed: b.pattern });
      expect(g.getLocalBounds().height, b.player).toBeGreaterThan(60);
      g.destroy();
    }
  });

  it('génère les matières, les pinceaux de terrain et les particules', () => {
    const mats = creerMatieres();
    expect(Object.keys(mats)).toHaveLength(9);
    const pinceaux = creerPinceauxTerrain();
    expect(Object.keys(pinceaux)).toHaveLength(6);
    const parts = creerTexturesParticules();
    expect(Object.keys(parts)).toHaveLength(4);
    // les effets tournent sans erreur et finissent par s'éteindre quand on les arrête
    const impact = creerEffet('impact', parts, { graine: 3 });
    for (let i = 0; i < 60 * 4; i += 1) impact.update(1 / 60);
    expect(impact.termine).toBe(true);
    const brume = creerEffet('brume', parts, { graine: 5 });
    brume.update(1 / 60);
    expect(brume.termine).toBe(false);
    brume.arreter();
    for (let i = 0; i < 60 * 15; i += 1) brume.update(1 / 60);
    expect(brume.termine).toBe(true);
  });
});

describe('décor', () => {
  it('propose trois à cinq variantes par objet', () => {
    /* Quinze depuis l'aiguille de granit, que les barrières de crête ont rendue
       nécessaire : une chaîne de montagnes doit se voir. */
    expect(PROP_KEYS).toHaveLength(15);
    for (const key of PROP_KEYS) {
      const def = PROPS[key];
      expect(def.variantes, key).toBeGreaterThanOrEqual(3);
      expect(def.variantes, key).toBeLessThanOrEqual(5);
      expect(def.w, key).toBeGreaterThan(0);
      expect(def.h, key).toBeGreaterThan(0);
    }
  });
});

/**
 * La loi n°2 : une seule lumière, et personne ne la contredit.
 *
 * `degradeSurface` peint tout l'atlas, et son angle était écrit en dur à 135°
 * alors que son propre en-tête annonçait « orienté selon le soleil (315°) ».
 * À 135°, `cos` et `sin` valent (−0,707 ; +0,707) : la première teinte tombe en
 * haut à DROITE, la haute lumière passe au nord-est, et chaque surface se
 * retrouve éclairée à quatre-vingt-dix degrés de ses propres ombres portées.
 * Quatre autres sites — les deux parchemins du combat, la flaque du champ, la
 * barbe des créatures — recopiaient la même valeur fausse.
 *
 * Tant que `degradeLineaire` rendait un aplat, la contradiction ne se voyait
 * pas. Depuis qu'elle peint, elle se voit — et c'est *pourquoi* les créatures
 * étaient noires : à 135° le `clamp-to-edge` renvoyait l'arrêt le plus sombre.
 *
 * Le test ne vérifie pas « 45 » : il vérifie que l'angle SE DÉDUIT du soleil
 * déclaré, et qu'aucun fichier d'art ne passe plus d'angle d'éclairage en dur.
 */
describe('loi n°2 — l’angle d’éclairage', () => {
  it('se déduit du soleil déclaré, il ne se recopie pas', () => {
    const attendu = Math.round((Math.atan2(LIGHT.toShadow.y, LIGHT.toShadow.x) * 180) / Math.PI);
    expect(ANGLE_LUMIERE).toBe(attendu);
  });

  it('met la haute lumière au nord-ouest, comme les ombres le supposent', () => {
    // Un dégradé clair → ombre orienté ANGLE_LUMIERE : son offset 0 doit
    // tomber du côté du soleil, donc en haut à gauche en repère écran.
    const a = (ANGLE_LUMIERE * Math.PI) / 180;
    const versOmbre = { x: Math.cos(a), y: Math.sin(a) };
    // La direction du dégradé et celle des ombres portées doivent coïncider.
    expect(versOmbre.x).toBeCloseTo(LIGHT.toShadow.x, 2);
    expect(versOmbre.y).toBeCloseTo(LIGHT.toShadow.y, 2);
    // Et le soleil est bien l'opposé : en haut à gauche.
    expect(LIGHT.toSun.x).toBeLessThan(0);
    expect(LIGHT.toSun.y).toBeLessThan(0);
  });
});

/*
 * ───────────────────── Anatomie des bêtes, mesurée ─────────────────────────
 *
 * Ces cinq tests gardent les corrections du lot « quatre bêtes » : ce sont des
 * MESURES sur la géométrie des rigs, pas des captures. Chacun a été éprouvé en
 * défaisant la correction qu'il garde, et chacun a rougi.
 */

/** Toutes les articulations d'un rig, en descendant l'arbre d'affichage. */
function articulations(rig: Rig): Joint[] {
  const out: Joint[] = [];
  const descendre = (c: Container): void => {
    for (const enfant of c.children) {
      if (enfant instanceof Joint) out.push(enfant);
      descendre(enfant as Container);
    }
  };
  descendre(rig.corps as unknown as Container);
  return out;
}

/** Position d'une articulation dans le repère du rig, ancre comprise. */
function ancre(rig: Rig, nom: string): { x: number; y: number } {
  const p = rig.joint(nom).toGlobal({ x: 0, y: 0 });
  return rig.corps.toLocal(p);
}

describe('anatomie des bêtes', () => {
  /**
   * Deux pièces du même nom : `Rig.ajouter` indexe par nom, la seconde chasse
   * la première de la table et la PREMIÈRE n'est plus jamais animée. Elle reste
   * peinte, immobile, pendant que sa jumelle bouge. Le défaut a coûté six
   * pattes à chaque quadrupède, puis trois ailes à la vouivre — dont deux
   * nommées `aile_g`, l'aile du fond figée pendant que l'autre battait.
   */
  it("ne porte jamais deux articulations du même nom", () => {
    for (const id of CREATURE_IDS) {
      const rig = construireCreature(id, MATS);
      const noms = articulations(rig).map((j) => j.nom);
      const uniques = new Set(noms);
      expect(`${id}: ${noms.length}`, `${id} — noms en double : ${noms.join(' ')}`).toBe(
        `${id}: ${uniques.size}`,
      );
      rig.destroy({ children: true });
    }
  });

  /**
   * Un quadrupède porte sa tête DEVANT son poitrail. L'encolure part droit dans
   * son repère et l'articulation est ensuite tournée pour la coucher : comme
   * une rotation emporte le sommet du fût vers l'arrière, une `avance` nulle
   * pose le crâne au-dessus des omoplates. Mesuré sur le loup avant
   * correction : ancre de tête en x = +26 pour un tronc allant jusqu'à +52.
   */
  it('porte la tête de chaque quadrupède devant le poitrail', () => {
    for (const id of ['granit_t5', 'granit_t5_up', 'ermitage_t3', 'ermitage_t3_up', 'ermitage_t5', 'ermitage_t5_up']) {
      const rig = construireCreature(id, MATS);
      const tronc = rig.joint('tronc').getBounds();
      const avant = rig.corps.toLocal({ x: tronc.x + tronc.width, y: tronc.y }).x;
      const tete = ancre(rig, 'tete');
      expect(tete.x / avant, `${id} — ancre de tête ${tete.x.toFixed(0)} pour un poitrail à ${avant.toFixed(0)}`)
        .toBeGreaterThan(0.85);
      rig.destroy({ children: true });
    }
  });

  /**
   * Le membre postérieur est COUDÉ : le jarret part franchement en arrière, le
   * canon revient à l'aplomb. Un fuseau unique de la hanche au sol ne dépasse
   * son attache que d'une demi-épaisseur — c'est ce qui faisait « quatre
   * baguettes ».
   *
   * On mesure donc le RECUL : de combien le membre passe derrière son point
   * d'attache, rapporté à sa longueur. Le premier essai mesurait l'étalement
   * total du membre, et il ne prouvait rien : cette largeur est dominée par la
   * masse de cuisse, qui existe avec ou sans jarret. Défait, le recul retombe à
   * 0,172 · 0,153 · 0,156 pour le loup, le cerf et le sanglier ; coudé, il vaut
   * 0,241 · 0,233 · 0,248. Le seuil est posé entre les deux nuages.
   */
  it('coude le membre postérieur de chaque quadrupède', () => {
    for (const id of ['granit_t5', 'granit_t5_up', 'ermitage_t3', 'ermitage_t3_up', 'ermitage_t5', 'ermitage_t5_up']) {
      const rig = construireCreature(id, MATS);
      const b = rig.joint('patte_pg').getBounds();
      const attache = ancre(rig, 'patte_pg');
      const arriere = rig.corps.toLocal({ x: b.x, y: b.y }).x;
      const recul = (attache.x - arriere) / b.height;
      expect(recul, `${id} — recul du jarret ${recul.toFixed(3)}`).toBeGreaterThan(0.2);
      // et il recule plus que l'antérieur, qui descend d'aplomb sous l'épaule
      const ba = rig.joint('patte_ag').getBounds();
      const reculAvant =
        (ancre(rig, 'patte_ag').x - rig.corps.toLocal({ x: ba.x, y: ba.y }).x) / ba.height;
      expect(recul, `${id} — postérieur ${recul.toFixed(3)} contre antérieur ${reculAvant.toFixed(3)}`)
        .toBeGreaterThan(reculAvant * 1.3);
      rig.destroy({ children: true });
    }
  });

  /**
   * La vouivre est un SERPENT AILÉ DRESSÉ : sa tête est devant ET au-dessus de
   * son tronc, au bout d'un col en S. Avant correction, l'ancre de tête tombait
   * en x = −2 pour un tronc allant jusqu'à +27 — au-dessus du milieu du corps.
   */
  it('dresse le col de la vouivre devant et au-dessus du tronc', () => {
    for (const id of ['ermitage_t7', 'ermitage_t7_up']) {
      const rig = construireCreature(id, MATS);
      const tb = rig.joint('tronc').getBounds();
      const avant = rig.corps.toLocal({ x: tb.x + tb.width, y: tb.y + tb.height }).x;
      const haut = rig.corps.toLocal({ x: tb.x, y: tb.y }).y;
      const tete = ancre(rig, 'tete');
      expect(tete.x, `${id} — tête en x ${tete.x.toFixed(0)}, tronc jusqu'à ${avant.toFixed(0)}`)
        .toBeGreaterThan(avant);
      expect(tete.y, `${id} — tête en y ${tete.y.toFixed(0)}, dos à ${haut.toFixed(0)}`)
        .toBeLessThan(haut);
      rig.destroy({ children: true });
    }
  });

  /**
   * Le colosse a une CARRURE, des bras hors du tronc, et des pieds au sol.
   * Avant correction : bras de 40 unités dont 30 derrière le buste, jambes qui
   * se touchaient, et treize pixels de vide entre le pied et l'ombre.
   */
  it('donne au colosse une carrure, des bras hors du buste et des pieds au sol', () => {
    for (const id of ['ermitage_t6', 'ermitage_t6_up']) {
      const rig = construireCreature(id, MATS);
      const buste = rig.joint('buste').getBounds();
      const epaules = rig.joint('epaules').getBounds();
      expect(epaules.width / buste.width, `${id} — épaules ${epaules.width.toFixed(0)} pour un buste ${buste.width.toFixed(0)}`)
        .toBeGreaterThan(1.5);
      /* Chaque bras déborde franchement le buste, du bon côté. Le seuil est à
         0,4 largeur de buste et non 0,2 : à 0,2 l'épreuve restait verte quand on
         ramenait les bras à ±0,17 H, c'est-à-dire dans la masse du tronc — un
         bras large déborde un peu même rentré, et le test ne gardait rien. */
      const gauche = rig.joint('bras_g').getBounds();
      const droit = rig.joint('bras_d').getBounds();
      expect(buste.x - gauche.x, `${id} — bras gauche`).toBeGreaterThan(buste.width * 0.4);
      expect(droit.x + droit.width - (buste.x + buste.width), `${id} — bras droit`)
        .toBeGreaterThan(buste.width * 0.4);
      // les deux jambes laissent passer le jour entre elles
      const jg = rig.joint('jambe_g').getBounds();
      const jd = rig.joint('jambe_d').getBounds();
      expect(jd.x - (jg.x + jg.width), `${id} — jour entre les jambes`).toBeGreaterThan(2);
      // et le pied touche le sol, où l'ombre est peinte
      const bas = rig.corps.toLocal({ x: jg.x, y: jg.y + jg.height }).y;
      expect(bas, `${id} — pied à ${bas.toFixed(0)} du sol`).toBeGreaterThan(-4);
      rig.destroy({ children: true });
    }
  });
});

/**
 * `ruban` : la primitive ajoutée pour le col en S. Un fuseau ne se courbe pas,
 * un arc ne change pas de sens de courbure ; il fallait les deux.
 */
describe('primitive ruban', () => {
  it('suit une ligne médiane à double courbure et respecte l’épaisseur demandée', () => {
    const chemin = [pt(0, 0), pt(-10, -16), pt(-12, -34), pt(-2, -50), pt(14, -58), pt(26, -70)];
    const r = ruban(chemin, () => 20, { pas: 5, lissage: 2 });
    expect(r.length).toBeGreaterThan(20);
    expect(r.length % 2).toBe(0);
    // Les deux bords sont appariés : le k-ième point de gauche fait face au
    // k-ième point de droite pris depuis la fin, à l'épaisseur demandée.
    const n = r.length / 2;
    for (const i of [0, Math.floor(n / 3), Math.floor((2 * n) / 3), n - 1]) {
      const a = r[i];
      const b = r[r.length - 1 - i];
      expect(Math.hypot(a.x - b.x, a.y - b.y)).toBeCloseTo(20, 5);
    }
    // Le ruban passe par les deux extrémités du chemin.
    const milieuDebut = { x: (r[0].x + r[r.length - 1].x) / 2, y: (r[0].y + r[r.length - 1].y) / 2 };
    const milieuFin = { x: (r[n - 1].x + r[n].x) / 2, y: (r[n - 1].y + r[n].y) / 2 };
    expect(Math.hypot(milieuDebut.x - chemin[0].x, milieuDebut.y - chemin[0].y)).toBeLessThan(1);
    expect(Math.hypot(milieuFin.x - chemin[5].x, milieuFin.y - chemin[5].y)).toBeLessThan(1);
    // La courbure change de sens : le produit vectoriel des tangentes doit
    // s'annuler en cours de route, ce qu'un arc ne fait jamais.
    const signes = new Set<number>();
    for (let i = 1; i < chemin.length - 1; i += 1) {
      const u = { x: chemin[i].x - chemin[i - 1].x, y: chemin[i].y - chemin[i - 1].y };
      const v = { x: chemin[i + 1].x - chemin[i].x, y: chemin[i + 1].y - chemin[i].y };
      signes.add(Math.sign(u.x * v.y - u.y * v.x));
    }
    expect(signes.size).toBeGreaterThan(1);
  });

  it('ne relie jamais la pointe à la base', () => {
    /*
     * Une ligne droite : les deux bords doivent rester parallèles à l'axe. Le
     * lissage de Chaikin de `lisser` referme le contour — appliqué tel quel à
     * une médiane OUVERTE, il relie la nuque à l'épaule et le col se replie sur
     * lui-même. `ruban` a donc son propre lissage ouvert, et c'est cela qu'on
     * vérifie ici : sur un segment vertical, aucun point ne quitte ±5 en x.
     */
    const r = ruban([pt(0, 0), pt(0, -60)], () => 10, { pas: 6 });
    for (const q of r) {
      expect(Math.abs(Math.abs(q.x) - 5)).toBeLessThan(0.001);
      expect(q.y).toBeLessThanOrEqual(0.001);
      expect(q.y).toBeGreaterThanOrEqual(-60.001);
    }
  });
});
