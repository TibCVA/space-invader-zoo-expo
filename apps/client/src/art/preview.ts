/**
 * `renderArtSheet(renderer, options)` — planche de contact de tout l'art
 * produit : les vingt-huit créatures animées, le décor, les pinceaux de
 * terrain, les bannières, les icônes de carte, les emblèmes, les artefacts, les
 * portraits et les effets. Elle sert à la revue visuelle automatisée
 * (`#/demo/planche-art`, docs/03-ROUTES.md).
 *
 * Tous les libellés sont composés en Cinzel, majuscules, interlettrage 0,08em,
 * jamais sous 15 px — bible artistique §3.
 */
import { Container, Sprite, Text, TextStyle, TilingSprite } from 'pixi.js';
import type { Renderer } from 'pixi.js';
import { Graphics } from 'pixi.js';
import { ARTIFACTS, CREATURES, SKILLS, SPELLS } from '@auvergne/content';
import { buildArtAtlas } from './index.js';
import type { ArtAtlas } from './index.js';
import { CREATURE_IDS } from './creatures/index.js';
import { PROPS, PROP_KEYS, PROP_LABELS } from './props.js';
import { TERRAIN_BRUSH_KEYS, TERRAIN_BRUSH_LABELS } from './terrain-brushes.js';
import { BANNERS } from './banners.js';
import { MAP_ICON_LABELS, RESOURCE_LABELS, RESOURCE_KEYS_ART, MAP_ICONS } from './map-icons.js';
import { clesPortraits, nomHeros } from './portraits.js';
import { EFFECT_KINDS, EFFECT_LABELS, ECOLE_LABELS } from './effects.js';
import type { EcoleSort, Effet } from './effects.js';
import type { AnimName, CreatureRig } from './rig.js';
import {
  LIGHT,
  PALETTE,
  assombrir,
  eclaircir,
  melanger,
  ombreBleutee,
} from './palette.js';
import { blob, densifier, filetDore, flat, grain, peindre, perturber, pt } from './shading.js';
import { POLICES } from './fonts.js';

export interface ArtSheetOptions {
  /** Atlas déjà construit : évite de le refaire pour la revue. */
  atlas?: ArtAtlas;
  /** Largeur utile de la planche. Par défaut 1840 px. */
  largeur?: number;
  /** Animation jouée par les créatures au montage. */
  animation?: AnimName;
  /** Inclure les 53 artefacts et les 52 emblèmes (vrai par défaut). */
  complet?: boolean;
}

/** La planche : un conteneur qui sait s'animer. */
export interface ArtSheet extends Container {
  update(dt: number): void;
  /** Change l'animation jouée par les vingt-huit créatures. */
  jouer(anim: AnimName): void;
  readonly atlas: ArtAtlas;
  readonly taille: { largeur: number; hauteur: number };
}

const MARGE = 34;
const TITRE_H = 46;

/* ───────────────────────────── Typographie ──────────────────────────────── */

function styleTitre(taille: number, couleur: number): TextStyle {
  return new TextStyle({
    fontFamily: POLICES.titre,
    fontSize: taille,
    fontWeight: '700',
    letterSpacing: taille * 0.08,
    fill: couleur,
    dropShadow: { color: 0x241c14, alpha: 0.55, blur: 0, distance: 1, angle: Math.PI / 2 },
  });
}

function styleLegende(taille: number, couleur: number): TextStyle {
  return new TextStyle({
    fontFamily: POLICES.titre,
    fontSize: taille,
    fontWeight: '600',
    letterSpacing: taille * 0.08,
    fill: couleur,
    align: 'center',
    wordWrap: true,
    wordWrapWidth: 170,
  });
}

function styleNote(taille: number, couleur: number): TextStyle {
  return new TextStyle({
    fontFamily: POLICES.recit,
    fontSize: taille,
    fill: couleur,
    align: 'left',
    wordWrap: true,
    wordWrapWidth: 900,
    lineHeight: taille * 1.62,
  });
}

function libelle(
  texte: string,
  x: number,
  y: number,
  taille = 15,
  couleur = PALETTE.encre,
  /** largeur de repli du texte ; par défaut la largeur historique de 170 px */
  repli = 170,
): Text {
  const style = styleLegende(taille, couleur);
  style.wordWrapWidth = repli;
  const t = new Text({ text: texte.toLocaleUpperCase('fr-FR'), style });
  t.anchor.set(0.5, 0);
  t.position.set(x, y);
  return t;
}

/* ─────────────────────────────── Habillage ──────────────────────────────── */

/** Panneau de parchemin sur structure de granit, biseau et filet d'or. */
function panneau(atlas: ArtAtlas, w: number, h: number, seed: number): Container {
  const c = new Container();
  const g = new Graphics();
  const cadre = perturber(densifier([pt(0, 0), pt(w, 0), pt(w, h), pt(0, h)], 24), 1, seed);
  peindre(g, cadre, atlas.materials, {
    base: melanger(PALETTE.granitAnthracite, PALETTE.granitClair, 0.32),
    matiere: 'granit',
    matiereAlpha: 0.3,
    matiereEchelle: 0.9,
    modele: 0.5,
    rim: false,
    contour: false,
  });
  const interieur = perturber(densifier([pt(7, 7), pt(w - 7, 7), pt(w - 7, h - 7), pt(7, h - 7)], 22), 0.8, seed + 3);
  peindre(g, interieur, atlas.materials, {
    base: PALETTE.parchemin,
    matiere: 'parchemin',
    matiereAlpha: 0.32,
    matiereEchelle: 1.4,
    modele: 0.34,
    rim: false,
    contour: false,
  });
  // biseau : clair en haut, sombre en bas
  g.moveTo(8, 8);
  g.lineTo(w - 8, 8);
  g.stroke({ color: eclaircir(PALETTE.parchemin, 0.6), width: 2, alpha: 0.8 });
  g.moveTo(8, h - 9);
  g.lineTo(w - 8, h - 9);
  g.stroke({ color: ombreBleutee(PALETTE.parcheminOmbre, 0.5), width: 2, alpha: 0.7 });
  filetDore(g, 12, 12, w - 24, h - 24, { epaisseur: 1.6, ecart: 4, seed: seed + 7, alpha: 0.7 });
  grain(g, cadre, atlas.materials, 0.06, 1.6);
  c.addChild(g);
  return c;
}

/** Bandeau de titre de section, avec ferrure d'angle. */
function bandeau(atlas: ArtAtlas, texte: string, w: number): Container {
  const c = new Container();
  const g = new Graphics();
  const forme = perturber(densifier([pt(0, 0), pt(w, 0), pt(w - 10, TITRE_H), pt(10, TITRE_H)], 20), 0.9, 11);
  peindre(g, forme, atlas.materials, {
    base: melanger(PALETTE.grenat, PALETTE.granitAnthracite, 0.32),
    matiere: 'tissu',
    matiereAlpha: 0.24,
    matiereEchelle: 1.2,
    modele: 0.7,
    rim: true,
  });
  for (const x of [16, w - 16]) {
    g.poly(flat(blob(x, TITRE_H / 2, 7, 7, { seed: x, points: 12, wobble: 0.2 }))).fill({ color: LIGHT.rim, alpha: 0.9 });
    g.poly(flat(blob(x - 1.6, TITRE_H / 2 - 1.6, 2.6, 2.4, { seed: x + 3, points: 8, wobble: 0.3 }))).fill({
      color: LIGHT.chaude,
      alpha: 0.6,
    });
  }
  g.moveTo(30, TITRE_H - 8);
  g.lineTo(w - 30, TITRE_H - 8);
  g.stroke({ color: LIGHT.rim, width: 1.4, alpha: 0.5 });
  c.addChild(g);
  const t = new Text({ text: texte.toLocaleUpperCase('fr-FR'), style: styleTitre(23, PALETTE.parchemin) });
  t.anchor.set(0.5, 0.5);
  t.position.set(w / 2, TITRE_H / 2 - 3);
  c.addChild(t);
  return c;
}

/** Cellule : socle discret sous une vignette, plus son libellé. */
function cellule(
  atlas: ArtAtlas,
  contenu: Container,
  w: number,
  h: number,
  texte: string,
  sousTitre?: string,
): Container {
  const c = new Container();
  const g = new Graphics();
  const fond = perturber(densifier([pt(2, 2), pt(w - 2, 2), pt(w - 2, h - 2), pt(2, h - 2)], 18), 0.8, w + h);
  peindre(g, fond, atlas.materials, {
    base: melanger(PALETTE.parcheminOmbre, PALETTE.parchemin, 0.55),
    matiere: 'parchemin',
    matiereAlpha: 0.28,
    matiereEchelle: 1.1,
    modele: 0.3,
    rim: false,
    contour: false,
  });
  g.poly(flat(fond), true).stroke({ color: melanger(PALETTE.parcheminOmbre, PALETTE.granitClair, 0.4), width: 1.2, alpha: 0.6 });
  c.addChild(g);
  c.addChild(contenu);
  /* Le libellé se replie sur la largeur de SA cellule, et il est posé à partir
     de sa hauteur mesurée : un nom sur deux lignes (« Maître-arbalétrier »,
     « Sceau des Marches ») venait sinon s'écrire par-dessus le sous-titre. */
  const t = libelle(texte, w / 2, 0, 15, PALETTE.encre, Math.max(72, w - 14));
  t.position.y = h - (sousTitre ? 24 : 10) - t.height;
  c.addChild(t);
  if (sousTitre) {
    const s = new Text({
      text: sousTitre,
      style: new TextStyle({
        fontFamily: POLICES.donnees,
        fontSize: 14,
        fill: melanger(PALETTE.encre, PALETTE.parcheminOmbre, 0.35),
        align: 'center',
      }),
    });
    s.anchor.set(0.5, 0);
    s.position.set(w / 2, h - 21);
    c.addChild(s);
  }
  return c;
}

/* ───────────────────────────── La planche ───────────────────────────────── */

/**
 * Compose la planche de contact. Si aucun atlas n'est fourni, il est construit.
 * Le résultat est un `Container` prêt à être ajouté à une scène : appelez
 * `update(dt)` à chaque image pour l'animer.
 */
export async function renderArtSheet(
  renderer: Renderer,
  options: ArtSheetOptions = {},
): Promise<ArtSheet> {
  const atlas = options.atlas ?? (await buildArtAtlas(renderer));
  const W = options.largeur ?? 1840;
  const complet = options.complet !== false;
  const animation: AnimName = options.animation ?? 'attente';

  const racine = new Container() as ArtSheet;
  const rigs: CreatureRig[] = [];
  const effets: Effet[] = [];

  const fond = new Graphics();
  racine.addChild(fond);

  const corps = new Container();
  corps.position.set(MARGE, MARGE);
  racine.addChild(corps);

  const larg = W - MARGE * 2;
  let y = 0;

  /* ── titre général ── */
  const titre = new Text({
    text: 'Planche de contact — Heroes of Might and Magic : Auvergne Edition',
    style: styleTitre(34, PALETTE.parchemin),
  });
  titre.position.set(4, y);
  corps.addChild(titre);
  y += 50;
  const chapeau = new Text({
    text:
      "Tout ce qui suit est dessiné en code : aucune image, aucune police distante, aucun échantillon. " +
      "Soleil au nord-ouest (azimut 315°, élévation 38°), lumière chaude #FFE9C2, ombre froide #3A4657, " +
      "liseré doré #C9A227 sur chaque silhouette.",
    style: styleNote(17, melanger(PALETTE.parchemin, PALETTE.bleuBrume, 0.35)),
  });
  chapeau.style.wordWrapWidth = larg - 8;
  chapeau.position.set(4, y);
  corps.addChild(chapeau);
  y += Math.ceil(chapeau.height) + 22;

  /* ── section utilitaire ── */
  const section = (texte: string): void => {
    const b = bandeau(atlas, texte, larg);
    b.position.set(0, y);
    corps.addChild(b);
    y += TITRE_H + 14;
  };

  const grille = (
    items: { contenu: Container; texte: string; sousTitre?: string }[],
    cw: number,
    ch: number,
    colonnes?: number,
  ): void => {
    const n = colonnes ?? Math.max(1, Math.floor(larg / (cw + 10)));
    const pas = cw + 10;
    const decalage = (larg - (Math.min(n, items.length) * pas - 10)) / 2;
    const p = panneau(atlas, larg, Math.ceil(items.length / n) * (ch + 10) + 18, items.length);
    p.position.set(0, y);
    corps.addChild(p);
    items.forEach((it, i) => {
      const col = i % n;
      const row = Math.floor(i / n);
      const cell = cellule(atlas, it.contenu, cw, ch, it.texte, it.sousTitre);
      cell.position.set(decalage + col * pas, y + 9 + row * (ch + 10));
      corps.addChild(cell);
    });
    y += Math.ceil(items.length / n) * (ch + 10) + 18 + 20;
  };

  /* ── 1. créatures, vivantes ── */
  for (const faction of ['granit', 'ermitage'] as const) {
    section(
      faction === 'granit'
        ? 'Châtellenie de Granit — quatorze formes animées'
        : 'Ermitage des Bois Noirs — quatorze formes animées',
    );
    const items = CREATURE_IDS.filter((id) => id.startsWith(faction)).map((id) => {
      const def = CREATURES[id];
      const rig = atlas.creatureRig(id);
      rigs.push(rig);
      const boite = new Container();
      const b = rig.getLocalBounds();
      /*
       * On REMPLIT la case, sans plafonner l'échelle à 1.
       *
       * Le plafond faisait qu'une bête plus petite que sa case y restait à sa
       * taille natale : le manant occupait un cinquième de son cadre, le loup un
       * quart, et vingt-huit sculptures se jugeaient sur des vignettes de
       * cinquante pixels. C'est ce qui rendait la revue impossible — on ne
       * pouvait pas voir ce qu'il y avait à corriger, et l'impression de « très
       * fruste » venait autant du cadrage que du dessin.
       *
       * Les tailles relatives ne sont donc plus comparables d'une case à
       * l'autre ; c'est le prix, et il est juste : la ligne de statistiques
       * donne le rang et les points de vie, et cette planche existe pour juger
       * une sculpture, pas une échelle. Le champ de bataille, lui, garde les
       * proportions réelles.
       */
      const k = Math.min(150 / Math.max(1, b.width), 156 / Math.max(1, b.height));
      rig.scale.set(k);
      rig.position.set(88 - (b.x + b.width / 2) * k, 178 - Math.max(0, b.y + b.height) * k);
      boite.addChild(rig);
      return {
        contenu: boite,
        texte: def?.name ?? id,
        sousTitre: def ? `rang ${def.tier}${def.upgraded ? ' · amélioré' : ''} · ${def.hp} PV · ${def.speed} vit.` : id,
      };
    });
    grille(items, 176, 222, 7);
  }

  /* ── 2. décor ── */
  section('Décor — quatorze objets, trois à cinq variantes chacun');
  {
    /*
     * Les variantes tiennent dans leur case, et c'était faux.
     *
     * L'échelle se calculait sur `def.w` et `def.h` — la boîte de DESSIN d'un
     * décor — alors que la texture de l'atlas est rendue à une autre résolution.
     * Un sapin de cent unités de large sortait donc de l'atlas à trois fois
     * cette taille, et cinq variantes mises côte à côte débordaient sur trois
     * cases : les arbres et les maisons se recouvraient les uns les autres et
     * masquaient les libellés. Quatorze décors étaient invisibles, comme les
     * créatures l'étaient avant qu'on cesse de plafonner leur échelle.
     *
     * On mesure donc la TEXTURE, et l'on partage la largeur de la case entre le
     * nombre de variantes. Une seule échelle pour toutes celles d'un même décor :
     * ce sont des variantes, pas des tailles différentes.
     */
    const items: { contenu: Container; texte: string; sousTitre?: string }[] = [];
    const CASE_L = 188;
    const CASE_H = 186;
    for (const key of PROP_KEYS) {
      const def = PROPS[key];
      const boite = new Container();
      const sprites: Sprite[] = [];
      let plusLarge = 1;
      let plusHaut = 1;
      for (let v = 0; v < def.variantes; v += 1) {
        const s = new Sprite(atlas.prop(key, v));
        s.anchor.set(0.5, 1);
        sprites.push(s);
        plusLarge = Math.max(plusLarge, s.texture.width);
        plusHaut = Math.max(plusHaut, s.texture.height);
      }
      const pas = (CASE_L - 16) / def.variantes;
      /* Les silhouettes se chevauchent d'un dixième : un bosquet, pas une
         parade — mais jamais assez pour cacher la voisine. */
      const k = Math.min((pas * 1.1) / plusLarge, (CASE_H - 46) / plusHaut);
      sprites.forEach((s, v) => {
        s.scale.set(k);
        s.position.set(8 + pas * (v + 0.5), CASE_H - 44);
        boite.addChild(s);
      });
      items.push({ contenu: boite, texte: PROP_LABELS[key], sousTitre: `${def.variantes} variantes` });
    }
    grille(items, CASE_L, CASE_H, 7);
  }

  /* ── 3. pinceaux de terrain ── */
  section('Pinceaux de matière — répétables sans couture');
  {
    const items = TERRAIN_BRUSH_KEYS.map((key) => {
      const boite = new Container();
      const tile = new TilingSprite({ texture: atlas.terrainBrush(key), width: 176, height: 132 });
      tile.position.set(10, 10);
      boite.addChild(tile);
      const bord = new Graphics();
      bord
        .poly(flat(perturber(densifier([pt(10, 10), pt(186, 10), pt(186, 142), pt(10, 142)], 18), 0.7, key.length)), true)
        .stroke({ color: melanger(PALETTE.granitAnthracite, PALETTE.parcheminOmbre, 0.4), width: 2, alpha: 0.8 });
      boite.addChild(bord);
      return { contenu: boite, texte: TERRAIN_BRUSH_LABELS[key] };
    });
    grille(items, 196, 186, 6);
  }

  /* ── 4. bannières ── */
  section('Bannières des cinq joueurs — couleur et motif d’accessibilité');
  {
    const items = BANNERS.map((b) => {
      const boite = new Container();
      const s = new Sprite(atlas.banner(`#${b.color.toString(16).padStart(6, '0')}`, b.pattern));
      s.anchor.set(0.5, 0);
      s.position.set(88, 12);
      s.scale.set(Math.min(1, 150 / Math.max(1, s.texture.width), 150 / Math.max(1, s.texture.height)));
      boite.addChild(s);
      return { contenu: boite, texte: `${b.player} · ${b.label}`, sousTitre: b.patternName };
    });
    grille(items, 176, 210, 5);
  }

  /* ── 5. icônes de carte et ressources ── */
  section('Icônes d’objets de carte et jetons de ressource');
  {
    const items: { contenu: Container; texte: string }[] = [];
    for (const key of Object.keys(MAP_ICONS)) {
      const boite = new Container();
      const s = new Sprite(atlas.icon(key));
      s.anchor.set(0.5, 0.5);
      s.position.set(62, 54);
      boite.addChild(s);
      items.push({ contenu: boite, texte: MAP_ICON_LABELS[key] ?? key });
    }
    for (const r of RESOURCE_KEYS_ART) {
      const boite = new Container();
      const s = new Sprite(atlas.icon(`ressource_${r}`));
      s.anchor.set(0.5, 0.5);
      s.position.set(62, 54);
      boite.addChild(s);
      items.push({ contenu: boite, texte: RESOURCE_LABELS[r] ?? r });
    }
    grille(items, 124, 128, 11);
  }

  /* ── 6. portraits ── */
  section('Portraits — vingt-et-un héros');
  {
    const items = clesPortraits().map((key) => {
      const boite = new Container();
      const s = new Sprite(atlas.icon(key));
      s.anchor.set(0.5, 0);
      s.position.set(88, 8);
      s.scale.set(Math.min(1, 160 / Math.max(1, s.texture.width), 178 / Math.max(1, s.texture.height)));
      boite.addChild(s);
      return { contenu: boite, texte: nomHeros(key) };
    });
    grille(items, 176, 214, 9);
  }

  if (complet) {
    /* ── 7. compétences ── */
    section('Emblèmes de compétence — vingt');
    {
      const items = Object.values(SKILLS).map((s) => {
        const boite = new Container();
        const sp = new Sprite(atlas.icon(s.icon));
        sp.anchor.set(0.5, 0.5);
        sp.position.set(60, 50);
        boite.addChild(sp);
        return { contenu: boite, texte: s.name };
      });
      grille(items, 120, 122, 10);
    }

    /* ── 8. sorts ── */
    section('Sorts — huit par école, quatre écoles');
    {
      const items = Object.values(SPELLS).map((s) => {
        const boite = new Container();
        const sp = new Sprite(atlas.icon(s.icon));
        sp.anchor.set(0.5, 0.5);
        sp.position.set(60, 50);
        boite.addChild(sp);
        return { contenu: boite, texte: s.name, sousTitre: `${ECOLE_LABELS[s.school as EcoleSort]} ${s.level}` };
      });
      grille(items, 120, 138, 11);
    }

    /* ── 9. artefacts ── */
    section('Artefacts — cinquante-trois pièces');
    {
      const items = Object.values(ARTIFACTS).map((a) => {
        const boite = new Container();
        const sp = new Sprite(atlas.icon(a.icon));
        sp.anchor.set(0.5, 0.5);
        sp.position.set(56, 48);
        boite.addChild(sp);
        return { contenu: boite, texte: a.name, sousTitre: a.rarity };
      });
      grille(items, 112, 140, 12);
    }
  }

  /* ── 10. effets ── */
  section('Particules et effets — mouvement permanent, amplitude discrète');
  {
    const items: { contenu: Container; texte: string }[] = [];
    for (const kind of EFFECT_KINDS) {
      if (kind === 'aura') continue;
      const boite = new Container();
      const socle = new Graphics();
      peindre(
        socle,
        perturber(densifier([pt(8, 8), pt(160, 8), pt(160, 124), pt(8, 124)], 16), 0.8, kind.length),
        atlas.materials,
        {
          base: melanger(PALETTE.granitAnthracite, PALETTE.bleuProfond, 0.34),
          matiere: 'granit',
          matiereAlpha: 0.26,
          matiereEchelle: 0.8,
          modele: 0.35,
          rim: false,
          contour: false,
        },
      );
      boite.addChild(socle);
      const e = atlas.effet(kind, { largeur: 120, hauteur: 74, intensite: 1.1, graine: kind.length * 977 });
      e.position.set(84, 66);
      effets.push(e);
      boite.addChild(e);
      items.push({ contenu: boite, texte: EFFECT_LABELS[kind] });
    }
    for (const ecole of ['braises', 'sources', 'brumes', 'racines'] as const) {
      const boite = new Container();
      const socle = new Graphics();
      peindre(
        socle,
        perturber(densifier([pt(8, 8), pt(160, 8), pt(160, 124), pt(8, 124)], 16), 0.8, ecole.length + 5),
        atlas.materials,
        {
          base: melanger(PALETTE.granitAnthracite, PALETTE.bleuProfond, 0.34),
          matiere: 'granit',
          matiereAlpha: 0.26,
          matiereEchelle: 0.8,
          modele: 0.35,
          rim: false,
          contour: false,
        },
      );
      boite.addChild(socle);
      const e = atlas.auraSort(ecole, { largeur: 100, hauteur: 66, intensite: 1.2, graine: ecole.length * 331 });
      e.position.set(84, 70);
      effets.push(e);
      boite.addChild(e);
      items.push({ contenu: boite, texte: `Aura — ${ECOLE_LABELS[ecole]}` });
    }
    grille(items, 168, 150, 10);
  }

  /* ── pied de planche ── */
  const pied = new Text({
    text:
      `Atlas : ${atlas.stats.entrees} entrées, ${atlas.stats.pages} page(s) de 2048 px, ` +
      `${atlas.stats.vramMo} Mo estimés, construit en ${atlas.stats.dureeMs} ms.`,
    style: styleNote(16, melanger(PALETTE.parchemin, PALETTE.bleuBrume, 0.45)),
  });
  pied.position.set(4, y);
  corps.addChild(pied);
  y += Math.ceil(pied.height) + 10;

  /* ── fond général : ciel de granit, pas un dégradé unique ── */
  const H = y + MARGE * 2;
  peindre(fond, perturber(densifier([pt(0, 0), pt(W, 0), pt(W, H), pt(0, H)], 40), 1.4, 3), atlas.materials, {
    base: melanger(PALETTE.granitAnthracite, PALETTE.bleuProfond, 0.42),
    matiere: 'granit',
    matiereAlpha: 0.22,
    matiereEchelle: 2.2,
    modele: 0.28,
    rim: false,
    contour: false,
  });
  // deux voiles pour éviter l'aplat : lumière au nord-ouest, froid au sud-est
  fond
    .poly(flat(perturber(densifier([pt(0, 0), pt(W * 0.62, 0), pt(0, H * 0.42)], 24), 1.2, 5)))
    .fill({ color: LIGHT.chaude, alpha: 0.05 });
  fond
    .poly(flat(perturber(densifier([pt(W, H), pt(W * 0.34, H), pt(W, H * 0.52)], 24), 1.2, 7)))
    .fill({ color: LIGHT.froide, alpha: 0.14 });
  grain(fond, [pt(0, 0), pt(W, 0), pt(W, H), pt(0, H)], atlas.materials, 0.07, 2.4);
  // vignettage : quatre coins assombris en bleu, jamais en gris
  for (const [cx, cy] of [
    [0, 0],
    [W, 0],
    [0, H],
    [W, H],
  ] as const) {
    fond.poly(flat(blob(cx, cy, W * 0.3, H * 0.3, { seed: cx + cy, points: 18, wobble: 0.2 }))).fill({
      color: assombrir(PALETTE.bleuProfond, 0.5),
      alpha: 0.12,
    });
  }

  for (const r of rigs) r.play(animation);

  racine.update = (dt: number): void => {
    for (const r of rigs) r.update(dt);
    for (const e of effets) e.update(dt);
  };
  racine.jouer = (anim: AnimName): void => {
    for (const r of rigs) r.play(anim);
  };
  Object.defineProperty(racine, 'atlas', { value: atlas, enumerable: true });
  Object.defineProperty(racine, 'taille', {
    value: { largeur: W, hauteur: H },
    enumerable: true,
  });

  return racine;
}
