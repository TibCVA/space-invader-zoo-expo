/**
 * `buildArtAtlas(renderer)` — tout l'art procédural du jeu, en un seul appel.
 *
 * Contrat imposé par docs/02-API.md. La fabrique :
 *   1. attend les polices (@fontsource, jamais de CDN) ;
 *   2. génère les matières et les pinceaux de terrain dans des canvas ;
 *   3. dessine créatures, props, icônes, portraits et bannières en `Graphics` ;
 *   4. les empaquette dans quelques `RenderTexture` de 2048 px, une passe de
 *      rendu par page — c'est ce qui tient le budget de 2,5 s et de 220 Mo.
 *
 * Rien n'est téléchargé, aucun fichier image n'est lu : tout vient du code.
 */
import { Container, Graphics, Rectangle, RenderTexture, Texture } from 'pixi.js';
import type { Renderer } from 'pixi.js';
import type { CreatureId } from '@auvergne/engine';
import { attendrePolices } from './fonts.js';
import { creerMatieres } from './shading.js';
import type { MaterialSet } from './shading.js';
import { creerPinceauxTerrain, TERRAIN_BRUSH_KEYS, TERRAIN_TO_BRUSH } from './terrain-brushes.js';
import type { TerrainBrushKey } from './terrain-brushes.js';
import { CREATURE_IDS, construireCreature } from './creatures/index.js';
import { PROPS, PROP_KEYS, dessinerProp } from './props.js';
import type { PropKey } from './props.js';
import { clesIconesCarte, dessinerIconeCarte } from './map-icons.js';
import { clesEmblemes, dessinerEmbleme } from './emblems.js';
import { clesArtefacts, dessinerArtefact } from './artifact-icons.js';
import { clesPortraits, dessinerPortrait } from './portraits.js';
import { BANNERS, cleBanniere, couleurDepuisCss, dessinerBanniere } from './banners.js';
import type { BannerPattern } from './banners.js';
import { creerTexturesParticules, creerEffet, creerAuraSort } from './effects.js';
import type { EcoleSort, EffectKind, EffectOptions, Effet, ParticleTextures } from './effects.js';
import type { CreatureRig } from './rig.js';
import { LIGHT, PALETTE, melanger } from './palette.js';
import { blob, densifier, filetDore, flat, peindre, perturber, pt } from './shading.js';
import { appliquerAssetsGeneres } from './assets.js';

export type { CreatureRig } from './rig.js';
export type { PropKey } from './props.js';
export type { MaterialSet } from './shading.js';
export type { EffectKind, EcoleSort, Effet, ParticleTextures } from './effects.js';

/* ────────────────────────────── Le contrat ──────────────────────────────── */

export interface ArtAtlas {
  /** Vignette statique d'une créature, au repos. */
  creature(id: CreatureId): Texture;
  /** Conteneur animable neuf. Chaque appel produit une instance distincte. */
  creatureRig(id: CreatureId): CreatureRig;
  /** Décor de carte : `variant` est ramené dans la plage des variantes. */
  prop(key: PropKey, variant: number): Texture;
  /** Matière de terrain répétable sans couture. */
  terrainBrush(key: string): Texture;
  /** Bannière de joueur : couleur CSS ou entier, plus motif d'accessibilité. */
  banner(color: string, pattern: number): Texture;
  /** Icône : `carte_*`, `ressource_*`, `competence_*`, `sort_*`, `artefact_*`, `portrait_*`. */
  icon(key: string): Texture;

  /* ── au-delà du contrat : ce dont le reste du client a besoin ── */

  /** Matières générées (grain, parchemin, granit, écorce, métal, tissu…). */
  readonly materials: MaterialSet;
  /** Textures de particule partagées. */
  readonly particles: ParticleTextures;
  /** Fabrique un effet vivant (poussière, fumée, pluie, impact, aura…). */
  effet(kind: EffectKind, options?: EffectOptions): Effet;
  /** Aura de sort par école. */
  auraSort(ecole: EcoleSort, options?: EffectOptions): Effet;
  /** Toutes les clefs d'icône disponibles. */
  iconKeys(): string[];
  /** Vrai si la clef existe déjà dans l'atlas. */
  hasIcon(key: string): boolean;
  /** Ancre au sol d'un prop, en pixels depuis le coin haut-gauche de sa texture. */
  propAnchor(key: PropKey, variant: number): { x: number; y: number };
  /** Statistiques de construction, pour la porte de qualité. */
  readonly stats: AtlasStats;
  /** Libère les pages de rendu et les matières. */
  destroy(): void;
}

export interface AtlasStats {
  /** durée de construction en millisecondes */
  dureeMs: number;
  /** nombre de pages de 2048 px */
  pages: number;
  /** estimation de la mémoire vidéo occupée, en mébioctets */
  vramMo: number;
  /** nombre d'entrées empaquetées */
  entrees: number;
}

/* ───────────────────────────── L'empaqueteur ────────────────────────────── */

const PAGE = 2048;
const MARGE = 2;

interface Entree {
  key: string;
  node: Container;
  w: number;
  h: number;
  /** point d'ancrage dans la cellule, en fraction (0..1) */
  ancre: { x: number; y: number };
}

interface Place {
  key: string;
  page: number;
  x: number;
  y: number;
  w: number;
  h: number;
  /** transformation appliquée au nœud pour tenir dans la cellule */
  echelle: number;
  ox: number;
  oy: number;
}

/**
 * Empaquetage par étagères : simple, déterministe et suffisant pour des
 * cellules de tailles voisines. Une seule passe de rendu par page.
 */
class Empaqueteur {
  private readonly entrees: Entree[] = [];
  private readonly places: Place[] = [];
  private x = MARGE;
  private y = MARGE;
  private hauteurLigne = 0;
  private page = 0;

  ajouter(key: string, node: Container, w: number, h: number, ancre = { x: 0.5, y: 0.5 }): void {
    this.entrees.push({ key, node, w, h, ancre });
  }

  get nombre(): number {
    return this.entrees.length;
  }

  private placer(w: number, h: number): { page: number; x: number; y: number } {
    if (this.x + w + MARGE > PAGE) {
      this.x = MARGE;
      this.y += this.hauteurLigne + MARGE;
      this.hauteurLigne = 0;
    }
    if (this.y + h + MARGE > PAGE) {
      this.page += 1;
      this.x = MARGE;
      this.y = MARGE;
      this.hauteurLigne = 0;
    }
    const pos = { page: this.page, x: this.x, y: this.y };
    this.x += w + MARGE;
    if (h > this.hauteurLigne) this.hauteurLigne = h;
    return pos;
  }

  /**
   * Rend toutes les entrées et retourne les textures découpées.
   * Les `Graphics` sources sont détruits : seule la page survit.
   */
  rendre(renderer: Renderer): { textures: Map<string, Texture>; pages: RenderTexture[]; ancres: Map<string, { x: number; y: number }> } {
    // 1 — mesurer, mettre à l'échelle, placer
    const racines: Container[] = [];
    for (const e of this.entrees) {
      const b = e.node.getLocalBounds();
      const bw = Math.max(1, b.width);
      const bh = Math.max(1, b.height);
      const echelle = Math.min(1, (e.w - 4) / bw, (e.h - 4) / bh);
      const ox = (e.w - bw * echelle) / 2 - b.x * echelle;
      const oy = (e.h - bh * echelle) / 2 - b.y * echelle;
      const pos = this.placer(e.w, e.h);
      this.places.push({ key: e.key, page: pos.page, x: pos.x, y: pos.y, w: e.w, h: e.h, echelle, ox, oy });
      while (racines.length <= pos.page) racines.push(new Container());
      const enveloppe = new Container();
      enveloppe.position.set(pos.x + ox, pos.y + oy);
      enveloppe.scale.set(echelle);
      enveloppe.addChild(e.node);
      racines[pos.page].addChild(enveloppe);
    }

    // 2 — une passe de rendu par page
    const pages: RenderTexture[] = [];
    for (let i = 0; i < racines.length; i += 1) {
      const rt = RenderTexture.create({ width: PAGE, height: PAGE, antialias: true, resolution: 1 });
      rt.source.label = `atlas_page_${i}`;
      renderer.render({ container: racines[i], target: rt, clear: true });
      pages.push(rt);
    }

    // 3 — découper
    const textures = new Map<string, Texture>();
    const ancres = new Map<string, { x: number; y: number }>();
    for (const p of this.places) {
      const src = pages[p.page];
      if (!src) continue;
      const tex = new Texture({
        source: src.source,
        frame: new Rectangle(p.x, p.y, p.w, p.h),
        label: p.key,
      });
      textures.set(p.key, tex);
      const e = this.entrees.find((q) => q.key === p.key);
      ancres.set(p.key, {
        x: (e?.ancre.x ?? 0.5) * p.w,
        y: (e?.ancre.y ?? 0.5) * p.h,
      });
    }

    for (const r of racines) r.destroy({ children: true });
    return { textures, pages, ancres };
  }
}

/* ─────────────────────────── Icône de secours ───────────────────────────── */

/** Plaque de parchemin marquée d'une croix de Saint-André : clef inconnue. */
function iconeInconnue(mats: MaterialSet): Graphics {
  const g = new Graphics();
  const R = 34;
  const forme = perturber(
    densifier([pt(-R, -R), pt(R, -R * 0.96), pt(R * 0.96, R), pt(-R * 0.98, R * 0.98)], 14),
    1,
    7,
  );
  peindre(g, forme, mats, {
    base: melanger(PALETTE.parcheminOmbre, PALETTE.granitClair, 0.35),
    matiere: 'parchemin',
    matiereAlpha: 0.3,
    matiereEchelle: 0.5,
    modele: 0.8,
  });
  filetDore(g, -R * 0.9, -R * 0.88, R * 1.8, R * 1.8, { epaisseur: 1.4, ecart: 3, seed: 3, alpha: 0.7 });
  g.moveTo(-R * 0.5, -R * 0.5);
  g.lineTo(R * 0.5, R * 0.5);
  g.moveTo(R * 0.5, -R * 0.5);
  g.lineTo(-R * 0.5, R * 0.5);
  g.stroke({ color: melanger(PALETTE.grenat, PALETTE.granitAnthracite, 0.3), width: 3, alpha: 0.8, cap: 'round' });
  g.poly(flat(blob(0, 0, 5, 5, { seed: 5, points: 11, wobble: 0.24 }))).fill({ color: LIGHT.rim, alpha: 0.8 });
  return g;
}

/* ────────────────────────────── La fabrique ─────────────────────────────── */

const CELL_CREATURE = { w: 192, h: 208 };
const CELL_ICONE = { w: 88, h: 88 };
const CELL_PORTRAIT = { w: 176, h: 216 };
const CELL_BANNIERE = { w: 100, h: 152 };

/** Fabrique et met en cache toutes les textures procédurales. */
export async function buildArtAtlas(renderer: Renderer): Promise<ArtAtlas> {
  const debut = typeof performance !== 'undefined' ? performance.now() : Date.now();
  await attendrePolices();

  const materials = creerMatieres();
  const pinceaux = creerPinceauxTerrain();
  const particles = creerTexturesParticules();

  const pack = new Empaqueteur();

  // ── créatures : vignette au repos ─────────────────────────────────────
  for (const id of CREATURE_IDS) {
    const rig = construireCreature(id, materials);
    rig.update(0.0001);
    pack.ajouter(`creature_${id}`, rig, CELL_CREATURE.w, CELL_CREATURE.h, { x: 0.5, y: 0.94 });
  }

  // ── props : toutes les variantes ──────────────────────────────────────
  const ancresProps = new Map<string, { x: number; y: number }>();
  for (const key of PROP_KEYS) {
    const def = PROPS[key];
    for (let v = 0; v < def.variantes; v += 1) {
      const g = dessinerProp(materials, key, v);
      pack.ajouter(`prop_${key}_${v}`, g, def.w, def.h, { x: 0.5, y: 0.92 });
    }
  }

  // ── icônes de carte, ressources, compétences, sorts, artefacts ────────
  const clefsIcones: string[] = [];
  for (const key of clesIconesCarte()) {
    pack.ajouter(key, dessinerIconeCarte(materials, key), CELL_ICONE.w, CELL_ICONE.h);
    clefsIcones.push(key);
  }
  for (const key of clesEmblemes()) {
    pack.ajouter(key, dessinerEmbleme(materials, key), CELL_ICONE.w, CELL_ICONE.h);
    clefsIcones.push(key);
  }
  for (const key of clesArtefacts()) {
    pack.ajouter(key, dessinerArtefact(materials, key), CELL_ICONE.w, CELL_ICONE.h);
    clefsIcones.push(key);
  }
  for (const key of clesPortraits()) {
    pack.ajouter(key, dessinerPortrait(materials, key), CELL_PORTRAIT.w, CELL_PORTRAIT.h);
    clefsIcones.push(key);
  }
  pack.ajouter('inconnu', iconeInconnue(materials), CELL_ICONE.w, CELL_ICONE.h);

  // ── bannières des cinq joueurs ────────────────────────────────────────
  for (let i = 0; i < BANNERS.length; i += 1) {
    const def = BANNERS[i];
    const g = dessinerBanniere(materials, def.color, def.pattern, { seed: i * 5 + 2 });
    pack.ajouter(cleBanniere(def.color, def.pattern), g, CELL_BANNIERE.w, CELL_BANNIERE.h, { x: 0.5, y: 0.08 });
  }

  const { textures, pages, ancres } = pack.rendre(renderer);
  for (const [k, v] of ancres) ancresProps.set(k, v);

  // ── images générées, facultatives ─────────────────────────────────────
  // Si `public/img/manifeste.json` existe, ses bitmaps remplacent les entrées
  // correspondantes. Sinon, ou en cas d'échec, l'atlas garde sa version
  // procédurale : le jeu ne dépend jamais d'un asset. Voir docs/05-ASSETS.md.
  await appliquerAssetsGeneres(textures, pinceaux);

  const banniereCache = new Map<string, Texture>();
  const rtSupplementaires: RenderTexture[] = [];
  let avertis = new Set<string>();

  const secours = (): Texture => textures.get('inconnu') ?? Texture.WHITE;

  const atlas: ArtAtlas = {
    creature(id: CreatureId): Texture {
      return textures.get(`creature_${id}`) ?? secours();
    },
    creatureRig(id: CreatureId): CreatureRig {
      return construireCreature(id, materials);
    },
    prop(key: PropKey, variant: number): Texture {
      const def = PROPS[key];
      if (!def) return secours();
      const v = ((Math.trunc(variant) % def.variantes) + def.variantes) % def.variantes;
      return textures.get(`prop_${key}_${v}`) ?? secours();
    },
    terrainBrush(key: string): Texture {
      const direct = pinceaux[key as TerrainBrushKey];
      if (direct) return direct;
      const mappe = TERRAIN_TO_BRUSH[key];
      if (mappe) return pinceaux[mappe];
      return pinceaux.herbe;
    },
    banner(color: string, pattern: number): Texture {
      const teinte = typeof color === 'number' ? color : couleurDepuisCss(color);
      const motif = (((Math.trunc(pattern) % 5) + 5) % 5) as BannerPattern;
      const cle = cleBanniere(teinte, motif);
      const connu = textures.get(cle) ?? banniereCache.get(cle);
      if (connu) return connu;
      // couleur inédite : on la rend à la demande, une seule fois
      const g = dessinerBanniere(materials, teinte, motif, { seed: motif * 5 + 2 });
      const b = g.getLocalBounds();
      const rt = RenderTexture.create({
        width: Math.max(4, Math.ceil(b.width) + 4),
        height: Math.max(4, Math.ceil(b.height) + 4),
        antialias: true,
        resolution: 1,
      });
      const enveloppe = new Container();
      enveloppe.position.set(-b.x + 2, -b.y + 2);
      enveloppe.addChild(g);
      renderer.render({ container: enveloppe, target: rt, clear: true });
      enveloppe.destroy({ children: true });
      rtSupplementaires.push(rt);
      banniereCache.set(cle, rt);
      return rt;
    },
    icon(key: string): Texture {
      const t = textures.get(key);
      if (t) return t;
      if (!avertis.has(key)) {
        avertis.add(key);
        console.warn(`[art] icône absente de l'atlas : « ${key} ». Vignette de secours utilisée.`);
      }
      return secours();
    },
    materials,
    particles,
    effet(kind: EffectKind, options: EffectOptions = {}): Effet {
      return creerEffet(kind, particles, options);
    },
    auraSort(ecole: EcoleSort, options: EffectOptions = {}): Effet {
      return creerAuraSort(ecole, particles, options);
    },
    iconKeys(): string[] {
      return [...clefsIcones];
    },
    hasIcon(key: string): boolean {
      return textures.has(key);
    },
    propAnchor(key: PropKey, variant: number): { x: number; y: number } {
      const def = PROPS[key];
      if (!def) return { x: 0, y: 0 };
      const v = ((Math.trunc(variant) % def.variantes) + def.variantes) % def.variantes;
      return ancresProps.get(`prop_${key}_${v}`) ?? { x: def.w / 2, y: def.h * 0.92 };
    },
    stats: {
      dureeMs: 0,
      pages: pages.length,
      vramMo: 0,
      entrees: pack.nombre,
    },
    destroy(): void {
      for (const rt of pages) rt.destroy(true);
      for (const rt of rtSupplementaires) rt.destroy(true);
      for (const t of Object.values(materials)) t.destroy(true);
      for (const t of Object.values(pinceaux)) t.destroy(true);
      for (const t of Object.values(particles)) t.destroy(true);
      textures.clear();
      banniereCache.clear();
      avertis = new Set<string>();
    },
  };

  const fin = typeof performance !== 'undefined' ? performance.now() : Date.now();
  const octetsPages = pages.length * PAGE * PAGE * 4;
  const octetsMatieres = (Object.keys(materials).length + TERRAIN_BRUSH_KEYS.length + 4) * 192 * 192 * 4;
  (atlas.stats as AtlasStats).dureeMs = Math.round(fin - debut);
  (atlas.stats as AtlasStats).vramMo = Math.round(((octetsPages + octetsMatieres) / (1024 * 1024)) * 10) / 10;

  return atlas;
}

/* ───────────────────────── Réexports de confort ─────────────────────────── */

export { PROPS, PROP_KEYS, PROP_LABELS, dessinerProp, oscillationProp } from './props.js';
export { TERRAIN_BRUSH_KEYS, TERRAIN_BRUSH_LABELS, TERRAIN_TO_BRUSH } from './terrain-brushes.js';
export { BANNERS, dessinerBanniere, dessinerBanniereJoueur, cleBanniere } from './banners.js';
export { MAP_ICON_LABELS, RESOURCE_LABELS, clesIconesCarte } from './map-icons.js';
export { clesEmblemes, SKILL_IDS as CLEFS_COMPETENCES } from './emblems.js';
export { clesArtefacts } from './artifact-icons.js';
export { clesPortraits, nomHeros } from './portraits.js';
export { CREATURE_IDS, construireCreature, factionDe } from './creatures/index.js';
export { EFFECT_KINDS, EFFECT_LABELS, ECOLE_LABELS, creerEffet, creerAuraSort, creerTexturesParticules } from './effects.js';
export { POLICES, attendrePolices } from './fonts.js';
export * from './palette.js';
export { Rig, Joint, clip, p as piste, COURBES } from './rig.js';
export type { AnimName, Clip, Piste } from './rig.js';
export { renderArtSheet } from './preview.js';
export type { ArtSheetOptions } from './preview.js';
