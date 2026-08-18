/**
 * `apps/client/src/town/panorama.ts` — LE FOND PEINT DU TABLEAU DE CITÉ.
 *
 * Six panoramas peints (2048 × 1152) attendent dans `public/img/cites/` :
 * `cite_<faction>_<heure>` pour `aube`, `midi` et `crepuscule`. Le cadrage est
 * rigoureusement identique d'une heure à l'autre pour une même faction : seule
 * la lumière change. On peut donc les empiler et croiser leurs opacités pour
 * obtenir n'importe quelle heure intermédiaire.
 *
 * Le manifeste les charge déjà (`art/assets.ts` les verse dans la table des
 * icônes de l'atlas) : il suffit de les y reprendre par `atlas.hasIcon` /
 * `atlas.icon`, exactement comme `landing/backdrop.ts` reprend les deux fonds
 * d'accueil.
 *
 * **Repli obligatoire (bible artistique §0.7).** Si une seule des trois heures
 * manque, le fond peint est abandonné et un fond procédural — ciel dégradé,
 * lignes de crêtes, brume de vallée, terrasses de granit — prend sa place. Le
 * tableau ne montre jamais un trou.
 */
import { Container, Graphics, Sprite, Texture } from 'pixi.js';
import type { FactionId } from '@auvergne/engine';
import type { ArtAtlas } from '../art/index.js';
import type { TownHour } from '../view-contract.js';
import { LIGHT, PALETTE, assombrir, eclaircir, melanger } from '../art/palette.js';
import { blob, flat, grain, perturber, densifier } from '../art/shading.js';
import { fbm, prng, valueNoise } from '../art/noise.js';

/** Les trois heures peintes, dans l'ordre du jour. */
export const HEURES: readonly TownHour[] = ['aube', 'midi', 'crepuscule'];

/** Dimensions natives d'un panorama de cité. */
export const PANO_LARGEUR = 2048;
export const PANO_HAUTEUR = 1152;

/**
 * Étalonnage d'une heure. `teinte` multiplie les bâtiments posés par-dessus le
 * panorama pour qu'ils partagent sa lumière ; `voile` est la nappe de brume
 * appliquée sur tout le tableau.
 */
export interface Etalonnage {
  /** teinte multiplicative appliquée aux plans de bâtiments */
  teinte: number;
  /** couleur du voile atmosphérique */
  voile: number;
  voileAlpha: number;
  /** haut et bas du ciel du repli procédural */
  cielHaut: number;
  cielBas: number;
  /** teinte du sol du repli procédural */
  sol: number;
  /** intensité des lumières de fenêtre (0 le jour, 1 la nuit) */
  fenetres: number;
}

export const ETALONNAGES: Readonly<Record<TownHour, Etalonnage>> = {
  aube: {
    teinte: 0xa8b3c6,
    voile: 0x8fa6b8,
    voileAlpha: 0.16,
    cielHaut: 0x3d4a5e,
    cielBas: 0xb59a7a,
    sol: 0x4a4e52,
    fenetres: 0.45,
  },
  midi: {
    teinte: 0xffffff,
    voile: 0x8fa6b8,
    voileAlpha: 0.06,
    cielHaut: 0x5d7d9a,
    cielBas: 0xbfd0d8,
    sol: 0x5a5f63,
    fenetres: 0,
  },
  crepuscule: {
    teinte: 0xc59a78,
    voile: 0x6a5a6e,
    voileAlpha: 0.2,
    cielHaut: 0x2b3a4a,
    cielBas: 0xc08a3e,
    sol: 0x3a3d41,
    fenetres: 1,
  },
};

/** Rectangle occupé par le tableau, en pixels écran. */
export interface CadreCite {
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * Position d'un panorama dans la fenêtre. On remplit par défaut (`cover`), sauf
 * quand cela reviendrait à ne montrer qu'un quart du tableau — cas du portrait
 * téléphone : on bascule alors sur un ajustement complet, le fond procédural
 * comblant les bandes.
 */
export function cadrerPanorama(largeur: number, hauteur: number, marge = 1.03): CadreCite {
  const couvre = Math.max(largeur / PANO_LARGEUR, hauteur / PANO_HAUTEUR);
  const contient = Math.min(largeur / PANO_LARGEUR, hauteur / PANO_HAUTEUR);
  const echelle = (couvre / contient > 1.8 ? contient : couvre) * marge;
  const w = PANO_LARGEUR * echelle;
  const h = PANO_HAUTEUR * echelle;
  return { x: (largeur - w) / 2, y: (hauteur - h) / 2, w, h };
}

/** Convertit une position de contenu (pourcentages 0–100) en pixels du cadre. */
export function pointDuCadre(cadre: CadreCite, xPct: number, yPct: number): { x: number; y: number } {
  return { x: cadre.x + (cadre.w * xPct) / 100, y: cadre.y + (cadre.h * yPct) / 100 };
}

/** Interpole l'étalonnage entre les trois heures, `phase` allant de 0 à 2. */
export function etalonnageInterpole(phase: number): Etalonnage {
  const p = Math.max(0, Math.min(2, phase));
  const i = p < 1 ? 0 : 1;
  const t = p < 1 ? p : p - 1;
  const a = ETALONNAGES[HEURES[i]];
  const b = ETALONNAGES[HEURES[i + 1]];
  return {
    teinte: melanger(a.teinte, b.teinte, t),
    voile: melanger(a.voile, b.voile, t),
    voileAlpha: a.voileAlpha + (b.voileAlpha - a.voileAlpha) * t,
    cielHaut: melanger(a.cielHaut, b.cielHaut, t),
    cielBas: melanger(a.cielBas, b.cielBas, t),
    sol: melanger(a.sol, b.sol, t),
    fenetres: a.fenetres + (b.fenetres - a.fenetres) * t,
  };
}

/**
 * Teinte multiplicative des bâtiments, par maison et par heure. Les deux
 * panoramas ne vieillissent pas de la même façon : la Châtellenie prend l'or et
 * le grenat du soir, l'Ermitage bascule dans le bleu de nuit sous la futaie.
 */
const TEINTES: Readonly<Record<FactionId, Readonly<Record<TownHour, number>>>> = {
  granit: { aube: 0xb0b6c2, midi: 0xffffff, crepuscule: 0xc7a077 },
  ermitage: { aube: 0x9aa6b6, midi: 0xf2f4ef, crepuscule: 0x74839a },
};

/** Teinte des bâtiments à une phase donnée, pour la maison indiquée. */
export function teinteInterpolee(phase: number, faction: FactionId): number {
  const p = Math.max(0, Math.min(2, phase));
  const i = p < 1 ? 0 : 1;
  const t = p < 1 ? p : p - 1;
  const table = TEINTES[faction];
  return melanger(table[HEURES[i]], table[HEURES[i + 1]], t);
}

/** Phase continue déduite du jour de la semaine : 1 aube, 4 midi, 7 crépuscule. */
export function phaseDuJour(jour: number): number {
  const j = Math.max(1, Math.min(7, Math.round(jour)));
  return ((j - 1) / 6) * 2;
}

/** Phase d'une heure nommée. */
export function phaseDeLHeure(heure: TownHour): number {
  return HEURES.indexOf(heure);
}

/* ═════════════════════════════ Le fond peint ═════════════════════════════ */

/**
 * Empilement des trois heures peintes, ou fond procédural si l'une manque.
 * Une seule instance par tableau ; elle possède ses nœuds et rien d'autre.
 */
export class FondCite {
  readonly container = new Container();

  /** Vrai quand les trois heures peintes sont disponibles. */
  readonly peint: boolean;

  private readonly sprites: Sprite[] = [];
  private readonly repli = new Graphics();
  private readonly grade = new Graphics();
  private cadre: CadreCite = { x: 0, y: 0, w: 1, h: 1 };
  private phase = 1;

  constructor(
    private readonly atlas: ArtAtlas,
    private readonly faction: FactionId,
  ) {
    this.container.label = 'fond-cite';

    const clefs = HEURES.map((h) => `cite_${faction}_${h}`);
    this.peint = clefs.every((c) => atlas.hasIcon(c));

    /* Le repli est monté dans tous les cas : il bouche les bandes laissées par
       un ajustement complet et sert de fond si les images manquent. */
    this.container.addChild(this.repli);

    if (this.peint) {
      for (const clef of clefs) {
        const s = new Sprite(atlas.icon(clef) as Texture);
        s.label = clef;
        this.sprites.push(s);
        this.container.addChild(s);
      }
    }

    this.container.addChild(this.grade);
    this.setPhase(1);
  }

  /** Place le fond et renvoie le cadre du tableau. */
  disposer(largeur: number, hauteur: number): CadreCite {
    this.cadre = cadrerPanorama(largeur, hauteur);
    for (const s of this.sprites) {
      s.position.set(this.cadre.x, this.cadre.y);
      s.width = this.cadre.w;
      s.height = this.cadre.h;
    }
    this.peindreRepli(largeur, hauteur);
    this.peindreGrade(largeur, hauteur);
    return this.cadre;
  }

  /** `phase` : 0 aube, 1 midi, 2 crépuscule ; les valeurs entre deux sont fondues. */
  setPhase(phase: number): void {
    this.phase = Math.max(0, Math.min(2, phase));
    if (this.sprites.length === 3) {
      /* Empilement : l'aube est opaque, les deux autres se révèlent par-dessus. */
      this.sprites[0].alpha = 1;
      this.sprites[1].alpha = Math.min(1, this.phase);
      this.sprites[2].alpha = Math.max(0, this.phase - 1);
    }
    this.peindreGrade(this.cadre.w, this.cadre.h);
  }

  destroy(): void {
    this.container.destroy({ children: true });
  }

  /* ── Voile atmosphérique posé sur le tableau (loi n°5) ── */

  private peindreGrade(largeur: number, hauteur: number): void {
    const cal = etalonnageInterpole(this.phase);
    const g = this.grade;
    g.clear();
    const w = Math.max(1, largeur);
    const h = Math.max(1, hauteur);

    /* Sur un panorama peint, la brume est déjà dans l'image : y superposer des
       nappes ne fait qu'y imprimer des bandes horizontales. On s'en tient alors
       à un voile uniforme très léger. Le repli procédural, lui, a besoin de sa
       perspective atmosphérique. */
    if (this.peint) {
      g.rect(-w, -h, w * 3, h * 3).fill({ color: cal.voile, alpha: cal.voileAlpha * 0.45 });
    } else {
      const bandes = 40;
      for (let i = 0; i < bandes; i += 1) {
        const t = i / (bandes - 1);
        g.rect(-w, h * 0.4 + t * h * 0.62, w * 3, (h * 0.62) / bandes + 1).fill({
          color: cal.voile,
          alpha: cal.voileAlpha * (0.1 + t * 0.5),
        });
      }
    }

    /* Vignettage haut et bas, en dégradé continu : la peinture doit tenir dans
       la page sans qu'on voie où le voile commence. */
    const marches = 26;
    for (let i = 0; i < marches; i += 1) {
      const t = i / (marches - 1);
      g.rect(-w, -h * 0.02 + t * h * 0.12, w * 3, h * 0.12 / marches + 1).fill({
        color: melanger(cal.cielHaut, LIGHT.froide, 0.4),
        alpha: 0.16 * (1 - t) * (1 - t),
      });
      g.rect(-w, h - t * h * 0.16, w * 3, h * 0.16 / marches + 1).fill({
        color: melanger(cal.sol, LIGHT.froide, 0.5),
        alpha: 0.22 * (1 - t) * (1 - t),
      });
    }
  }

  /* ── Repli procédural : un vrai paysage, jamais un panneau ── */

  private peindreRepli(largeur: number, hauteur: number): void {
    const g = this.repli;
    g.clear();
    const cal = etalonnageInterpole(this.phase);
    const w = Math.max(1, largeur);
    const h = Math.max(1, hauteur);
    const forestier = this.faction === 'ermitage';

    /* Quand le panorama est peint, ce calque ne sert qu'à combler les bandes
       laissées par un ajustement complet — cas du portrait téléphone. Y peindre
       un second paysage donnerait deux horizons concurrents : on s'en tient à
       un fond sourd, comme le carton d'un encadrement. */
    if (this.peint) {
      const haut = melanger(cal.cielHaut, LIGHT.froide, 0.35);
      const bas = melanger(cal.sol, LIGHT.froide, 0.45);
      for (let i = 0; i < 32; i += 1) {
        const t = i / 31;
        g.rect(0, (h * i) / 32 - 1, w, h / 32 + 2).fill(melanger(haut, bas, Math.pow(t, 0.9)));
      }
      grain(
        g,
        [
          { x: 0, y: 0 },
          { x: w, y: 0 },
          { x: w, y: h },
          { x: 0, y: h },
        ],
        this.atlas.materials,
        0.12,
        Math.max(0.6, w / 900),
      );
      return;
    }

    const horizon = h * 0.42;

    /* Ciel : vingt-huit bandes, jamais un aplat (loi n°1). */
    for (let i = 0; i < 28; i += 1) {
      const t = i / 27;
      const c = melanger(cal.cielHaut, cal.cielBas, Math.pow(t, 0.8));
      g.rect(0, (horizon * i) / 28 - 1, w, horizon / 28 + 2).fill(c);
    }
    /* Un soleil bas au nord-ouest, cohérent avec la loi n°2. */
    const sx = w * 0.2;
    const sy = horizon * 0.42;
    for (let i = 5; i >= 1; i -= 1) {
      g.poly(flat(blob(sx, sy, h * 0.05 * i, h * 0.042 * i, { seed: 4 + i, points: 18, wobble: 0.14 }))).fill({
        color: LIGHT.chaude,
        alpha: 0.05,
      });
    }

    /* Trois lignes de crêtes, de plus en plus proches et de moins en moins bleues. */
    for (let couche = 0; couche < 3; couche += 1) {
      const base = horizon + couche * h * 0.05;
      const amplitude = h * (0.1 - couche * 0.022);
      const pts: number[] = [-w * 0.1, base + h * 0.4];
      for (let x = -w * 0.1; x <= w * 1.1; x += w / 42) {
        const n =
          fbm(x / (w * 0.16) + couche * 7, couche * 3.1, 4, 12, 100 + couche * 17) - 0.5;
        pts.push(x, base - amplitude * (0.5 + n * 1.6));
      }
      pts.push(w * 1.1, base + h * 0.4);
      const teinte = melanger(
        forestier ? PALETTE.vertSapin : PALETTE.granitAnthracite,
        PALETTE.bleuBrume,
        0.62 - couche * 0.2,
      );
      g.poly(pts).fill({ color: melanger(teinte, cal.cielBas, 0.14), alpha: 0.96 });
      /* Arête éclairée au nord-ouest. */
      g.poly(pts).stroke({ color: eclaircir(teinte, 0.22), width: 1.4, alpha: 0.5 });
    }

    /* L'éperon de la cité : trois terrasses appareillées. */
    const solBase = melanger(cal.sol, forestier ? PALETTE.mousseSombre : PALETTE.granitClair, 0.42);
    const rand = prng(forestier ? 91 : 17);
    for (let terrasse = 0; terrasse < 3; terrasse += 1) {
      const y0 = h * (0.5 + terrasse * 0.16);
      const marge = w * (0.24 - terrasse * 0.1);
      const pts: number[] = [];
      const n = 34;
      for (let i = 0; i <= n; i += 1) {
        const t = i / n;
        const x = marge + (w - marge * 2) * t;
        const bosse = Math.sin(t * Math.PI) * h * 0.05;
        const bruit = (valueNoise(t * 6, terrasse * 2.3, 12, 55) - 0.5) * h * 0.012;
        pts.push(x, y0 - bosse + bruit);
      }
      pts.push(w + marge, h + 10, -marge, h + 10);
      const teinte = melanger(solBase, LIGHT.froide, 0.24 - terrasse * 0.08);
      g.poly(pts).fill({ color: teinte });
      /* Mur de soutènement : assises claires en haut, ombre bleutée en bas. */
      g.poly(pts).stroke({ color: eclaircir(teinte, 0.3), width: 2, alpha: 0.55 });
      for (let i = 0; i < 26; i += 1) {
        const t = (i + 0.5) / 26;
        const x = marge + (w - marge * 2) * t;
        const yy = y0 - Math.sin(t * Math.PI) * h * 0.05 + h * 0.018;
        g.rect(x - w * 0.012, yy, w * 0.024, h * 0.012).fill({
          color: melanger(teinte, LIGHT.froide, 0.3 + rand() * 0.25),
          alpha: 0.35,
        });
      }
    }

    /* Semis de matière : le sol ne doit jamais être un aplat. */
    const zone = perturber(
      densifier(
        [
          { x: 0, y: h * 0.46 },
          { x: w, y: h * 0.46 },
          { x: w, y: h },
          { x: 0, y: h },
        ],
        Math.max(12, w / 24),
      ),
      1.2,
      21,
    );
    grain(g, zone, this.atlas.materials, 0.1, Math.max(0.6, w / 1400));
    for (let i = 0; i < 130; i += 1) {
      const x = rand() * w;
      const y = h * 0.46 + rand() * h * 0.54;
      const r = 1.2 + rand() * 3.4;
      g.poly(flat(blob(x, y, r, r * 0.6, { seed: i * 7 + 3, points: 8, wobble: 0.3 }))).fill({
        color: rand() > 0.5 ? eclaircir(solBase, 0.3) : assombrir(solBase, 0.3),
        alpha: 0.14 + rand() * 0.12,
      });
    }
  }
}
