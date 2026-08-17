/**
 * Miniature du Forez — le vrai relief, peint depuis `buildTerrain()`.
 *
 * La carte n'est pas une illustration : c'est le champ d'altitude réel du
 * massif des Bois Noirs, ombragé par la lumière unique du nord-ouest
 * (azimut 315°, élévation 38°) et coloré par biome. Le calcul coûte une
 * dizaine de millisecondes et n'est fait **qu'une fois** par session : le
 * canvas obtenu est mémorisé au niveau du module.
 *
 * Rien ici ne mute la carte : `buildTerrain()` renvoie le cache de
 * `@auvergne/map`, que l'on se contente de lire.
 */

import { buildTerrain } from '@auvergne/map';
import { TERRAINS } from '@auvergne/engine';
import { C, context2d, mix, rgb, shade, surface, tint } from './paint.js';
import { clamp, fbm2, makeNoise2D } from './noise.js';

/** Teinte de base par terrain, dans l'ordre de `TERRAINS` du moteur. */
const TERRAIN_COLORS: Readonly<Record<string, string>> = {
  route: mix(C.ocre, C.brunFougere, 0.35),
  chemin: mix(C.brunFougere, C.parcheminOmbre, 0.34),
  prairie: mix(C.vertHetre, C.parcheminOmbre, 0.16),
  foret: C.vertSapin,
  pente: mix(C.granitClair, C.brunFougere, 0.34),
  humide: mix(C.vertSapin, C.bleuProfond, 0.42),
  rocher: mix(C.granitAnthracite, C.granitClair, 0.45),
  eau: mix(C.bleuProfond, C.bleuBrume, 0.28),
};

export interface MinimapRender {
  canvas: HTMLCanvasElement;
  cols: number;
  rows: number;
}

let cache: MinimapRender | null = null;

/** Lumière unique : vecteur vers le soleil, azimut 315°, élévation 38°. */
const LX = -0.5573;
const LY = -0.5573;
const LZ = 0.6157;
/** Taille d'une case en mètres (grille du Forez). */
const CELL_M = 48;

/**
 * Peint la carte entière, une case par pixel. Trois strates conformes à la
 * loi n°1 : teinte de biome, ombrage de relief, grain de matière.
 */
export function renderForezMinimap(): MinimapRender {
  if (cache) return cache;
  const build = buildTerrain();
  const { cols, rows, terrain, elevation } = build;
  const canvas = surface(cols, rows);
  const ctx = context2d(canvas);
  const image = ctx.createImageData(cols, rows);
  const data = image.data;

  /* Rampes pré-calculées : deux teintes par terrain, ombre froide et lumière chaude. */
  const dark: number[][] = [];
  const bright: number[][] = [];
  for (const key of TERRAINS) {
    const base = TERRAIN_COLORS[key] ?? C.granitClair;
    const d = rgb(shade(base, 0.5));
    const b = rgb(tint(base, 0.42));
    dark.push([d.r, d.g, d.b]);
    bright.push([b.r, b.g, b.b]);
  }

  const noise = makeNoise2D(4242);
  const brume = rgb(C.bleuBrume);

  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const i = row * cols + col;
      const west = elevation[i - (col > 0 ? 1 : 0)];
      const east = elevation[i + (col < cols - 1 ? 1 : 0)];
      const north = elevation[i - (row > 0 ? cols : 0)];
      const south = elevation[i + (row < rows - 1 ? cols : 0)];
      const dzdx = (east - west) / (2 * CELL_M);
      const dzdy = (south - north) / (2 * CELL_M);
      const len = Math.sqrt(dzdx * dzdx + dzdy * dzdy + 1);
      const lambert = clamp((-dzdx * LX - dzdy * LY + LZ) / len, 0, 1);
      /* Étalement du contraste : le relief doux du Forez doit rester lisible. */
      const light = clamp((lambert - 0.46) * 3.1 + 0.42, 0, 1);

      const t = terrain[i];
      const d = dark[t] ?? dark[0];
      const b = bright[t] ?? bright[0];
      /* Grain de matière, léger, teinté. */
      const grain = fbm2(noise, col / 7, row / 7, 2) * 9;
      /* Perspective atmosphérique : l'altitude bleuit les sommets. */
      const alt = clamp((elevation[i] - 640) / 620, 0, 1) * 0.24;

      const k = i * 4;
      const r = d[0] + (b[0] - d[0]) * light + grain;
      const g = d[1] + (b[1] - d[1]) * light + grain;
      const bl = d[2] + (b[2] - d[2]) * light + grain;
      data[k] = clamp(r + (brume.r - r) * alt, 0, 255);
      data[k + 1] = clamp(g + (brume.g - g) * alt, 0, 255);
      data[k + 2] = clamp(bl + (brume.b - bl) * alt, 0, 255);
      data[k + 3] = 255;
    }
  }
  ctx.putImageData(image, 0, 0);

  /* Vignettage doux : le parchemin s'assombrit vers ses bords. */
  const vg = ctx.createRadialGradient(cols * 0.45, rows * 0.45, rows * 0.22, cols * 0.5, rows * 0.5, rows * 0.62);
  vg.addColorStop(0, 'rgba(42, 50, 66, 0)');
  vg.addColorStop(1, 'rgba(42, 50, 66, 0.34)');
  ctx.fillStyle = vg;
  ctx.fillRect(0, 0, cols, rows);

  cache = { canvas, cols, rows };
  return cache;
}
