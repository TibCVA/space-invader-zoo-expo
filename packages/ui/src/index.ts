/**
 * `@auvergne/ui` — design system de Heroes of Might and Magic, Auvergne Edition.
 *
 * Composants React sans aucune logique de jeu : ils lisent des propriétés et
 * émettent des rappels. Tout le dessin est vectoriel et généré ; aucun asset
 * externe, aucun emoji, tout le texte visible est en français.
 *
 * Feuille de style à importer une fois par l'application :
 *
 *     import '@auvergne/ui/styles.css';
 *
 * Les matières procédurales sont posées sur `:root` par `installTextures()`,
 * appelé au démarrage (la galerie le fait pour elle-même).
 */

/* ─────────────────────────────── Jetons ─────────────────────────────────── */
export {
  tokens,
  palette,
  light,
  sun,
  granit,
  ermitage,
  factionPalette,
  banners,
  resourceColors,
  schoolColors,
  rarityColors,
  status,
  space,
  radius,
  bevel,
  border,
  shadow,
  font,
  fontSize,
  fontWeight,
  lineHeight,
  letterSpacing,
  duration,
  easing,
  motion,
  zIndex,
  breakpoint,
  touch,
  iconSize,
  portraitSize,
  mediaFrom,
  mediaUnder,
  cx,
  alpha,
  mix,
  shade,
  tint,
  aerial,
} from './tokens.js';
export type { Tokens, FactionKey, BannerToken, BannerPattern, BreakpointKey, SpaceKey } from './tokens.js';

/* ─────────────────────────────── Polices ────────────────────────────────── */
export { FONT_IMPORTS, FONT_ROLES } from './fonts.js';

/* ─────────────────────────────── Matières ───────────────────────────────── */
export {
  svgUri,
  layered,
  texture,
  textureVars,
  textureVarName,
  textureStyle,
  installTextures,
  parchmentTexture,
  graniteTexture,
  leatherTexture,
  ironTexture,
  goldThreadTexture,
  velvetTexture,
  bannerPatternUri,
} from './textures.js';
export type { TextureLayer, TextureName } from './textures.js';

/* ───────────────────────────── Outillage SVG ────────────────────────────── */
export {
  useSvgId,
  Materials,
  MATERIALS,
  mat,
  matR,
  matInk,
  LightFilter,
  DropShadowFilter,
  GrainFilter,
  BlurFilter,
  GrainVeil,
  Drawing,
} from './svg-kit.js';
export type { MaterialKey, DrawingProps } from './svg-kit.js';

/* ─────────────────────────────── Icônes ─────────────────────────────────── */
export * from './icons/index.js';

/* ───────────────────────────── Composants ───────────────────────────────── */
export * from './components/index.js';

/* ─────────────────────────────── Héraldique ─────────────────────────────── */
export { IlluminationBorder, FactionBlazon, PlayerBanner, Cartouche, BannerPip } from './heraldry.js';
export type { IlluminationBorderProps, BlazonProps, PlayerBannerProps, CartoucheProps } from './heraldry.js';

/* ─────────────────────────────── Portraits ──────────────────────────────── */
export * from './portraits/index.js';

/* ──────────────────────────── Revue visuelle ────────────────────────────── */
export { UIGallery } from './gallery.js';
export type { UIGalleryProps } from './gallery.js';

/** Version du design system, utile pour les rapports de revue. */
export const UI_VERSION = '1.0.0';
