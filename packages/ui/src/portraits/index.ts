/** Baril des portraits de héros. */

export { PortraitPainter, faceGeom, facePath, SKINS, HAIRS, IRIS } from './kit.js';
export type {
  HeroPortraitSpec,
  PaintCtx,
  FaceGeom,
  FaceShape,
  HairStyle,
  FacialHair,
  Headwear,
  Garment,
  SkinKey,
  SkinRamp,
  HairKey,
  HairRamp,
  IrisKey,
  PortraitPainterProps,
} from './kit.js';

export { HERO_PORTRAITS, HERO_PORTRAIT_LIST, HERO_PORTRAIT_KEYS } from './heroes.js';

export { HeroPortrait, HeroAvatar } from './hero-portrait.js';
export type { HeroPortraitProps, PortraitFrame } from './hero-portrait.js';
export * from './source.js';
