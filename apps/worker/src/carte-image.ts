/**
 * La carte entière en image, un pixel par case.
 *
 *   npx tsx src/carte-image.ts             → carte.png dans le dossier courant
 *   npx tsx src/carte-image.ts /tmp/x.png  → ailleurs
 *
 * Pourquoi cet outil existe. Le tableau de bord donne des nombres, et les
 * captures du client donnent une vue zoomée de quarante cases sur vingt : ni
 * l'un ni l'autre ne montre la STRUCTURE. On a redessiné le relief de la carte —
 * cinq crêtes murées, cinq chaînes de partage, une coupe entre capitales tombée
 * de vingt-cinq cases à cinq — sans pouvoir regarder une seule fois la forme de
 * ce qu'on venait de bâtir. Une image de 113 × 184 pixels suffit à voir d'un
 * coup si les murs se tiennent, où sont les cols, et si une zone est enclose.
 *
 * L'échelle est réglable ; le PNG est écrit à la main, sans dépendance, parce
 * qu'un outil de diagnostic ne mérite pas qu'on ajoute une bibliothèque au
 * projet pour lui.
 */
import { deflateSync } from 'node:zlib';
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { buildWorld, COLS, ROWS, START_POSITIONS } from '@auvergne/map';
import { CELL_PASSABLE, CELL_ROAD, TERRAINS } from '@auvergne/engine';

/** Un pixel par case, agrandi : à 4 l'image fait 452 × 736, lisible à l'œil. */
const ZOOM = 4;

/** Couleurs de diagnostic : lisibilité d'abord, jamais la palette du jeu. */
const COULEURS: Record<string, [number, number, number]> = {
  eau: [40, 92, 148],
  falaise: [24, 24, 28],
  rocher: [64, 60, 66],
  pente: [150, 132, 96],
  lande: [188, 176, 112],
  foret: [46, 104, 60],
  prairie: [128, 176, 96],
  humide: [86, 110, 96],
  route: [232, 208, 150],
  chemin: [206, 184, 138],
};

function png(largeur: number, hauteur: number, rgb: Uint8Array): Buffer {
  /* Lignes filtrées : un octet de filtre (0) devant chaque rangée. */
  const brut = Buffer.alloc(hauteur * (1 + largeur * 3));
  for (let y = 0; y < hauteur; y++) {
    brut[y * (1 + largeur * 3)] = 0;
    rgb.subarray(y * largeur * 3, (y + 1) * largeur * 3);
    Buffer.from(rgb.subarray(y * largeur * 3, (y + 1) * largeur * 3)).copy(
      brut,
      y * (1 + largeur * 3) + 1,
    );
  }

  const morceau = (type: string, corps: Buffer): Buffer => {
    const longueur = Buffer.alloc(4);
    longueur.writeUInt32BE(corps.length, 0);
    const nom = Buffer.from(type, 'ascii');
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(Buffer.concat([nom, corps])), 0);
    return Buffer.concat([longueur, nom, corps, crc]);
  };

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(largeur, 0);
  ihdr.writeUInt32BE(hauteur, 4);
  ihdr[8] = 8; // profondeur
  ihdr[9] = 2; // couleur vraie, sans alpha
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    morceau('IHDR', ihdr),
    morceau('IDAT', deflateSync(brut, { level: 9 })),
    morceau('IEND', Buffer.alloc(0)),
  ]);
}

let tableCrc: Uint32Array | null = null;
function crc32(buf: Buffer): number {
  if (!tableCrc) {
    tableCrc = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      tableCrc[n] = c >>> 0;
    }
  }
  let c = 0xffffffff;
  for (const octet of buf) c = tableCrc[(c ^ octet) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function main(): void {
  const sortie = resolve(process.argv[2] ?? 'carte.png');
  const w = buildWorld(20250816);
  const largeur = COLS * ZOOM;
  const hauteur = ROWS * ZOOM;
  const rgb = new Uint8Array(largeur * hauteur * 3);

  const capitales = new Set(
    Object.values(START_POSITIONS).map((s) => s.at.row * COLS + s.at.col),
  );

  for (let row = 0; row < ROWS; row++) {
    for (let col = 0; col < COLS; col++) {
      const i = row * COLS + col;
      const nom = TERRAINS[w.terrain[i]];
      let c = COULEURS[nom] ?? [255, 0, 255];
      /* Une voie par-dessus son biome, comme à l'écran. */
      if ((w.flags[i] & CELL_ROAD) !== 0) c = COULEURS.chemin;
      /* Ce qui ne se franchit pas ressort en noir : c'est la seule chose qu'on
         vient regarder. */
      if ((w.flags[i] & CELL_PASSABLE) === 0) c = nom === 'eau' ? COULEURS.eau : [20, 18, 22];
      if (capitales.has(i)) c = [230, 60, 60];
      for (let dy = 0; dy < ZOOM; dy++) {
        for (let dx = 0; dx < ZOOM; dx++) {
          const p = ((row * ZOOM + dy) * largeur + col * ZOOM + dx) * 3;
          rgb[p] = c[0];
          rgb[p + 1] = c[1];
          rgb[p + 2] = c[2];
        }
      }
    }
  }

  writeFileSync(sortie, png(largeur, hauteur, rgb));
  console.log(`${sortie} — ${String(largeur)} × ${String(hauteur)}`);
}

main();
