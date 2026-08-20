/**
 * Assemblage de la carte du Forez.
 *
 * `buildTerrain()` produit la partie **fixe** — altitude, pente, biomes,
 * hydrographie, régions, voies — et la mémorise au niveau du module : la
 * géographie ne change jamais d'une partie à l'autre (document maître §4).
 *
 * `buildWorld(seed)` reprend ce terrain, en copie les tableaux typés pour que
 * personne ne puisse abîmer le cache, puis y sème le contenu tiré de la
 * graine : gardes, artefacts, gisements secondaires, caravanes, quêtes.
 *
 * Ordre de construction, et raison de cet ordre :
 *
 *  1. **altitude et pente** — tout le reste en dépend ;
 *  2. **voies** — tracées sur le relief, avant les biomes, pour que le coût du
 *     tracé voie la vraie pente et non un terrain déjà classé ;
 *  3. **régions** — le corridor marchand suit les grandes chaussées ;
 *  4. **biomes** — altitude + pente + humidité + proximité de l'eau ;
 *  5. **emprises** — bourgs, sceaux et sites fixes sont aplanis ;
 *  6. **lisières** — recalculées en dernier, une fois le terrain définitif.
 */
import {
  CELL_BRIDGE,
  CELL_BUILDABLE,
  CELL_CACHE,
  CELL_PASSABLE,
  MAP_COLS,
  MAP_ROWS,
  type MapAnchor,
  type StartKey,
  type WorldMap,
} from '@auvergne/engine';
import { anchorList } from './anchors.js';
import { buildElevation } from './elevation.js';
import { tracerEmbranchements } from './embranchements.js';
import { CELLS, COLS, ROWS, T, idx } from './grid.js';
import { buildObjects, fixedPlots, type ObjectContext } from './objects.js';
import { assignRegions } from './regions.js';
import { buildRoads } from './roads.js';
import { classifyTerrain, couvre, franchissable, markEdges } from './terrain.js';

/** Version de la carte, enregistrée dans chaque partie et chaque sauvegarde. */
export const MAP_VERSION = '1.0.0-forez';

export interface TerrainBuild {
  cols: number;
  rows: number;
  terrain: Uint8Array;
  region: Uint8Array;
  elevation: Int16Array;
  slope: Uint8Array;
  flags: Uint16Array;
}

/** Aplanit une emprise : plus de rocher ni de forte pente sur un site bâti. */
function clearPlot(
  terrain: Uint8Array,
  flags: Uint16Array,
  slope: Uint8Array,
  at: { col: number; row: number },
  radius: number,
): void {
  const r2 = radius * radius;
  for (let dr = -radius; dr <= radius; dr++) {
    for (let dc = -radius; dc <= radius; dc++) {
      if (dc * dc + dr * dr > r2) continue;
      const col = at.col + dc;
      const row = at.row + dr;
      if (col < 0 || row < 0 || col >= COLS || row >= ROWS) continue;
      const i = row * COLS + col;
      const t = terrain[i];
      // L'eau garde son cours : un bourg de vallée reste un bourg de vallée.
      if (t === T.eau) continue;
      if (t === T.rocher || t === T.pente || t === T.humide) terrain[i] = T.prairie;
      flags[i] |= CELL_PASSABLE;
      if (slope[i] <= 16 && terrain[i] !== T.route && terrain[i] !== T.chemin) {
        flags[i] |= CELL_BUILDABLE;
      }
    }
  }
}

/**
 * Force une case à être franchissable : réservé aux entrées et emprises bâties.
 *
 * Un franchissement fait exception. Le pont est déjà franchissable, et combler
 * son tablier rendait une case de prairie qui portait toujours le drapeau de
 * voie : un chemin passant sur de l'herbe au milieu d'une rivière. Le cas est
 * apparu quand les cours d'eau reprojetés à la taille d'une XL de HMM3 sont
 * passés sous des emprises bâties. On laisse donc l'eau et le pont en place.
 */
function forceWalkable(terrain: Uint8Array, flags: Uint16Array, col: number, row: number): void {
  if (col < 0 || row < 0 || col >= COLS || row >= ROWS) return;
  const i = row * COLS + col;
  if ((flags[i] & CELL_BRIDGE) !== 0) {
    flags[i] |= CELL_PASSABLE;
    return;
  }
  if (terrain[i] === T.eau) terrain[i] = T.prairie;
  flags[i] |= CELL_PASSABLE;
}

/**
 * Rétablit les invariants des drapeaux après l'aplanissement des emprises.
 *
 * `clearPlot` transforme du rocher en prairie : la case ne peut plus abriter de
 * cache, et une case redevenue sèche doit être franchissable. On repasse donc
 * une fois sur toute la grille pour que `flags` ne mente jamais sur `terrain`.
 */
function normaliseFlags(terrain: Uint8Array, flags: Uint16Array): void {
  for (let i = 0; i < CELLS; i++) {
    const t = terrain[i];
    let f = flags[i];
    /*
     * La règle vient de `terrain.ts` — elle n'est pas réécrite ici.
     *
     * Elle l'était, et les deux versions avaient divergé : la lande recevait
     * son couvert dans `terrain.ts` et le perdait dans cette boucle, si bien
     * que ses mille cent quatre-vingt-trois cases n'ont jamais abrité un seul
     * objet. Une passe qui existe pour empêcher les drapeaux de mentir sur le
     * terrain ne peut pas, elle-même, dire autre chose que la source.
     */
    if (t === T.eau) {
      if ((f & CELL_BRIDGE) === 0) f &= ~CELL_PASSABLE;
      else f |= CELL_PASSABLE;
      f &= ~CELL_BUILDABLE;
    } else if (!franchissable(t)) {
      /* La falaise et le chaos rocheux ne se franchissent pas, et aucun pont
         ne les franchit : c'est le relief qui ferme les zones. */
      f &= ~(CELL_PASSABLE | CELL_BRIDGE | CELL_BUILDABLE);
    } else {
      f |= CELL_PASSABLE;
      f &= ~CELL_BRIDGE;
    }
    if (couvre(t)) f |= CELL_CACHE;
    else f &= ~CELL_CACHE;
    if (t === T.route || t === T.chemin) f &= ~CELL_BUILDABLE;
    flags[i] = f;
  }
}

/**
 * Aucune terre praticable hors de la composante principale — par la brèche
 * d'abord, par le scellement en dernier recours.
 *
 * Les falaises suivent les pentes réelles du relief, et le relief réel forme
 * parfois des cuvettes : à leur premier passage elles ont emmuré huit poches
 * de terre praticable — neuf composantes là où la carte doit en avoir une.
 * Une poche inaccessible est un piège : le semeur d'objets y déposerait des
 * trésors que personne ne peut atteindre. Et l'on ne peut pas simplement tout
 * sceller : les tests l'ont prouvé au premier essai, une ancre historique
 * (un lieu fixe du Forez) tombait dans une poche, et son entrée devenait une
 * case bloquée.
 *
 * On perce donc : pour chaque poche, la case de falaise qui touche à la fois
 * la poche et la composante principale redevient du rocher franchissable.
 * Une brèche dans une barre rocheuse est exactement ce que la montagne
 * appelle un col — et un col percé dans une falaise est un goulet naturel,
 * précisément la structure que la carte doit gagner. Si aucune brèche d'une
 * case n'existe (anneau épais), la poche est scellée en falaise : mieux vaut
 * un sommet muré qu'un trésor inatteignable.
 */
function desenclaver(terrain: Uint8Array, flags: Uint16Array): void {
  const composante = new Int32Array(CELLS);
  const file = new Int32Array(CELLS);

  const etiqueter = (): { nombre: number; principale: number } => {
    composante.fill(-1);
    let numero = 0;
    let principale = -1;
    let meilleureTaille = 0;
    for (let depart = 0; depart < CELLS; depart++) {
      if ((flags[depart] & CELL_PASSABLE) === 0 || composante[depart] >= 0) continue;
      let taille = 0;
      let tete = 0;
      let queue = 0;
      file[queue++] = depart;
      composante[depart] = numero;
      while (tete < queue) {
        const i = file[tete++];
        taille++;
        const col = i % COLS;
        const row = (i / COLS) | 0;
        for (let dr = -1; dr <= 1; dr++) {
          for (let dc = -1; dc <= 1; dc++) {
            if (!dr && !dc) continue;
            const c = col + dc;
            const r = row + dr;
            if (c < 0 || r < 0 || c >= COLS || r >= ROWS) continue;
            const j = r * COLS + c;
            if ((flags[j] & CELL_PASSABLE) === 0 || composante[j] >= 0) continue;
            composante[j] = numero;
            file[queue++] = j;
          }
        }
      }
      if (taille > meilleureTaille) {
        meilleureTaille = taille;
        principale = numero;
      }
      numero++;
    }
    return { nombre: numero, principale };
  };

  /* Chaque tour perce au plus une brèche par poche ; huit poches au premier
     passage, la boucle converge en une poignée de tours. La borne évite un
     cas pathologique de devenir une boucle infinie. */
  for (let tour = 0; tour < 16; tour++) {
    const { nombre, principale } = etiqueter();
    if (nombre <= 1) return;

    const percees = new Set<number>();
    for (let i = 0; i < CELLS; i++) {
      /* On perce ce qui ferme, quoi que ce soit : depuis que le chaos rocheux
         ferme lui aussi, une poche ceinte de rocher aurait été scellée sans
         qu'aucune brèche ne soit seulement cherchée. */
      if (terrain[i] === T.eau || franchissable(terrain[i])) continue;
      let secondaire = -1;
      let touchePrincipale = false;
      const col = i % COLS;
      const row = (i / COLS) | 0;
      for (let dr = -1; dr <= 1; dr++) {
        for (let dc = -1; dc <= 1; dc++) {
          if (!dr && !dc) continue;
          const c = col + dc;
          const r = row + dr;
          if (c < 0 || r < 0 || c >= COLS || r >= ROWS) continue;
          const comp = composante[r * COLS + c];
          if (comp < 0) continue;
          if (comp === principale) touchePrincipale = true;
          else secondaire = comp;
        }
      }
      if (touchePrincipale && secondaire >= 0 && !percees.has(secondaire)) {
        terrain[i] = T.pente;
        flags[i] |= CELL_PASSABLE;
        percees.add(secondaire);
      }
    }

    if (percees.size === 0) {
      /* Plus aucune brèche d'une case : les poches restantes sont scellées. */
      for (let i = 0; i < CELLS; i++) {
        if ((flags[i] & CELL_PASSABLE) === 0 || composante[i] === principale) continue;
        terrain[i] = terrain[i] === T.eau ? T.eau : T.falaise;
        flags[i] &= ~(CELL_PASSABLE | CELL_BRIDGE | CELL_BUILDABLE);
      }
      return;
    }
  }
}

let terrainCache: TerrainBuild | null = null;

/** Contrat `docs/02-API.md` : le terrain fixe, mis en cache. */
export function buildTerrain(): TerrainBuild {
  if (terrainCache) return terrainCache;

  const { elevation, slope } = buildElevation();
  const roads = buildRoads(elevation, slope);
  const region = assignRegions(roads.road);
  const { terrain, flags } = classifyTerrain(elevation, slope, roads.road, roads.bridge);

  for (const plot of fixedPlots()) {
    clearPlot(terrain, flags, slope, plot.at, plot.radius);
    forceWalkable(terrain, flags, plot.at.col, plot.at.row);
  }
  // Emprises 2 × 2 des cités : les quatre cases doivent être bâties, donc sèches.
  for (const plot of fixedPlots()) {
    if (plot.radius < 3) continue;
    forceWalkable(terrain, flags, plot.at.col + 1, plot.at.row);
    forceWalkable(terrain, flags, plot.at.col, plot.at.row - 1);
    forceWalkable(terrain, flags, plot.at.col + 1, plot.at.row - 1);
  }

  normaliseFlags(terrain, flags);
  desenclaver(terrain, flags);
  markEdges(terrain, flags);

  terrainCache = {
    cols: MAP_COLS,
    rows: MAP_ROWS,
    terrain,
    region,
    elevation,
    slope,
    flags,
  };
  return terrainCache;
}

/** Réinitialise le cache du terrain. Réservé aux tests et aux mesures. */
export function resetTerrainCache(): void {
  terrainCache = null;
  worldCache.clear();
  economyCache.clear();
}

/* ── Monde complet ──────────────────────────────────────────────────────── */

const worldCache = new Map<number, WorldMap>();
const economyCache = new Map<number, Record<StartKey, number>>();
/** Nombre de mondes conservés en cache (une partie en cours, quelques rejeux). */
const WORLD_CACHE_MAX = 4;

/** Contrat `docs/02-API.md` : terrain fixe + contenu tiré de la graine. */
export function buildWorld(seed: number): WorldMap {
  const key = seed >>> 0;
  const hit = worldCache.get(key);
  if (hit) return hit;

  const base = buildTerrain();

  // Copies défensives : `WorldMap` est manipulé par le moteur et le client.
  const terrain = Uint8Array.from(base.terrain);
  const region = Uint8Array.from(base.region);
  const elevation = Int16Array.from(base.elevation);
  const slope = Uint8Array.from(base.slope);
  const flags = Uint16Array.from(base.flags);

  const ctx: ObjectContext = { terrain, flags, elevation, slope, region };
  const built = buildObjects(ctx, key);

  /* Chaque lieu qui se visite reçoit son embranchement de chemin jusqu'à la
     voie la plus proche — exigence du propriétaire, et logique d'un pays
     habité. Tracé sur les copies du monde : la géographie statique du cache
     n'en sait rien, les objets changent avec la graine. */
  tracerEmbranchements(terrain, flags, built.objects);

  const objectAt = new Uint32Array(CELLS);
  for (let k = 0; k < built.objects.length; k++) {
    for (const f of built.objects[k].footprint) {
      if (f.col < 0 || f.row < 0 || f.col >= COLS || f.row >= ROWS) continue;
      objectAt[idx(f.col, f.row)] = k + 1;
    }
  }

  const anchors: MapAnchor[] = anchorList();

  const world: WorldMap = {
    cols: MAP_COLS,
    rows: MAP_ROWS,
    terrain,
    region,
    elevation,
    slope,
    flags,
    objectAt,
    objects: built.objects,
    anchors,
  };

  if (worldCache.size >= WORLD_CACHE_MAX) {
    const oldest = worldCache.keys().next();
    if (!oldest.done) {
      worldCache.delete(oldest.value);
      economyCache.delete(oldest.value);
    }
  }
  worldCache.set(key, world);
  economyCache.set(key, built.startValues);
  return world;
}

/** Contrat `docs/02-API.md` : altitude d'une case, en mètres. */
export function elevationAt(world: WorldMap, col: number, row: number): number {
  if (col < 0 || row < 0 || col >= world.cols || row >= world.rows) return 0;
  return world.elevation[row * world.cols + col] | 0;
}

/**
 * Valeur économique accessible en sept jours depuis chaque départ, telle que
 * mesurée par la passe d'équilibrage. Utile aux tests et à la télémétrie.
 */
export function startEconomy(seed: number): Record<StartKey, number> {
  const key = seed >>> 0;
  buildWorld(key);
  return economyCache.get(key) ?? ({} as Record<StartKey, number>);
}
