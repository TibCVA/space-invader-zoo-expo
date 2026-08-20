/**
 * `art/matiere-sol.ts` — les tuiles peintes du SOL de la carte d'aventure.
 *
 * **Le défaut que ce fichier corrige, et il est gros.** Six pinceaux de terrain
 * peints — `herbe`, `aiguilles`, `roche`, `tourbe`, `gravier`, `eau` — sont
 * livrés dans `public/img/terrain/` et déclarés au manifeste depuis la première
 * vague d'images. Ils n'ont jamais servi qu'au **champ de bataille**
 * (`battle/field.ts`) et à la planche de contact. Le sol de la carte
 * d'aventure, c'est-à-dire cent pour cent de l'écran pendant tout le jeu, était
 * peint pixel par pixel par `render/terrain.ts` sans une seule matière peinte :
 * huit strates de couleur, d'ombrage et de bruit, et rien qui dise de QUOI le
 * sol est fait. `docs/10-BRIEF-IMAGEGEN-VAGUE-3.md` §2 nomme ce piège en toutes
 * lettres ; ce fichier est le raccordement qu'il réclamait.
 *
 * **Pourquoi pas une texture PixiJS.** Le peintre du terrain n'est pas un
 * shader : c'est une boucle par pixel qui écrit dans une `ImageData`. Il lui
 * faut donc les octets de la tuile, pas un objet GPU. On lit l'image une fois,
 * on la réduit, et on en garde une **carte d'écart** plutôt que la couleur.
 *
 * **Pourquoi un écart et non la couleur.** Poser la couleur de la tuile
 * effacerait tout le travail du peintre : le gradient de biome par altitude, la
 * teinte de pays, l'ombrage de relief, l'occlusion de vallée. On ne garde donc
 * de la tuile que ce qu'elle sait et que le peintre ignore — sa MATIÈRE, c'est-
 * à-dire l'écart relatif de chaque pixel à la moyenne de la tuile, par canal.
 * Appliqué en multipliant, cet écart :
 *
 *   - conserve exactement la couleur moyenne du sol (la moyenne des écarts est
 *     nulle par construction, et le test le vérifie) ;
 *   - garde la loi de lumière unique : c'est l'ombrage du moteur qui décide de
 *     la valeur, la tuile ne fait que la sculpter ;
 *   - importe quand même les événements de teinte — le lichen jaune sur le
 *     granit bleu, la sphaigne rousse dans la tourbe — parce que l'écart est
 *     gardé par canal et non en luminance.
 *
 * **Le repli.** Aucune image n'est requise. Sans manifeste, sans réseau, ou
 * avec une clef mal orthographiée, la table reste vide et le peintre retombe
 * sur sa matière semée en code (`semerMatiere`). Le jeu ne peut pas avoir de
 * trou : c'est la règle de `docs/05-ASSETS.md` et elle vaut ici aussi.
 */

import type { Manifeste } from './assets.js';
import { RACINE_IMAGES, lireManifeste } from './assets.js';

/**
 * Combien de cases une tuile couvre sur la carte.
 *
 * Le compromis est entre le DÉTAIL (peu de cases par tuile = beaucoup de pixels
 * de tuile par case) et la RÉPÉTITION (peu de cases par tuile = un motif qui
 * revient souvent sous l'œil). Huit cases donnent, à la résolution maximale de
 * seize pixels par case, une période de cent vingt-huit pixels — et c'est
 * précisément la taille à laquelle on réduit la tuile, donc aucun pixel de
 * l'image n'est gaspillé et aucun n'est inventé.
 *
 * La répétition résiduelle est cassée autrement, sans coûter une image de plus :
 * le peintre échantillonne la tuile à la position **déjà gauchie** qui lui sert
 * pour les lisières. Les lignes droites du pavage n'existent donc pas.
 */
export const CASES_PAR_TUILE = 8;

/**
 * Côté maximal conservé, en pixels. Au-delà, on jette : le peintre ne peut pas
 * afficher plus de `CASES_PAR_TUILE × 16` pixels de tuile, et garder une
 * 512 × 512 par matière coûterait trois mégaoctets de mémoire vive pour rien.
 */
export const COTE_MAX_TUILE = 128;

/** Facteur d'encodage de l'écart relatif : ±127 pour ±100 %. */
const ECHELLE = 127;

/** Les six matières de base, une par famille de terrain. */
export const MATIERES_BASE = ['herbe', 'aiguilles', 'roche', 'tourbe', 'gravier', 'eau'] as const;

/**
 * Les six matières de PAYS demandées à la vague 3. Elles n'existent pas encore
 * dans `public/img/` ; les nommer ici ne coûte rien et fait que le jour où
 * Codex les livre, elles sont employées sans une ligne de code à écrire.
 * Une clef absente retombe silencieusement sur sa matière de base.
 */
export const MATIERES_PAYS = [
  'herbe_estive',
  'herbe_grasse',
  'aiguilles_noires',
  'roche_carrier',
  'roche_chaude',
  'lande_callune',
] as const;

/** Registre complet, dans l'ordre : c'est cet index que le peintre transporte. */
export const REGISTRE_MATIERES: readonly string[] = [...MATIERES_BASE, ...MATIERES_PAYS];

const INDEX = new Map<string, number>(REGISTRE_MATIERES.map((c, i) => [c, i]));

/**
 * L'index d'une matière dans le registre, ou −1 si la clef est inconnue.
 *
 * Le peintre l'appelle une fois par case échantillonnée, soit mille quatre
 * cents fois par bloc : c'est une table de hachage et non un balayage.
 */
export function indexMatiere(clef: string): number {
  return INDEX.get(clef) ?? -1;
}

/** Un niveau de réduction : la carte d'écart à une taille donnée. */
export interface NiveauMatiere {
  /** Côté en pixels, toujours une puissance de deux (le masque en dépend). */
  readonly cote: number;
  /** Écart relatif au rouge moyen, ±127 pour ±100 %. */
  readonly dr: Int8Array;
  readonly dg: Int8Array;
  readonly db: Int8Array;
}

/** Une matière chargée : sa pyramide, du plus fin au plus grossier. */
export interface TuileMatiere {
  readonly clef: string;
  readonly niveaux: readonly NiveauMatiere[];
}

export interface RapportMatieres {
  /** Clefs effectivement chargées. */
  readonly chargees: readonly string[];
  /** Clefs déclarées au manifeste mais refusées, avec la raison. */
  readonly refusees: readonly { clef: string; raison: string }[];
  readonly dureeMs: number;
}

const table = new Map<string, TuileMatiere>();
let dernierRapport: RapportMatieres | null = null;

/** La matière chargée sous cette clef, ou `null`. */
export function matiereSol(clef: string): TuileMatiere | null {
  return table.get(clef) ?? null;
}

/** Vrai dès qu'au moins une matière est chargée. */
export function matieresPretes(): boolean {
  return table.size > 0;
}

export function rapportMatieres(): RapportMatieres | null {
  return dernierRapport;
}

/** Vide la table. Réservé aux tests et à la destruction de l'atlas. */
export function oublierMatieres(): void {
  table.clear();
  dernierRapport = null;
}

/**
 * Le niveau à employer pour un besoin donné, en pixels.
 *
 * On prend le plus PETIT niveau qui couvre le besoin : un niveau plus grand ne
 * serait pas plus net une fois affiché — le peintre échantillonne au plus
 * proche — mais il aliaserait, c'est-à-dire qu'il ferait scintiller le sol
 * d'un pas de caméra à l'autre. C'est le raisonnement du mipmapping, fait à la
 * main parce qu'on est sur le processeur et non sur la carte graphique.
 */
export function niveauPour(tuile: TuileMatiere, besoinPx: number): NiveauMatiere | null {
  const n = tuile.niveaux;
  if (n.length === 0) return null;
  /* Les niveaux vont du plus fin au plus grossier. On descend tant qu'on
     couvre encore le besoin ; le premier qui ne le couvre plus arrête tout, et
     l'on garde le précédent. Si même le plus fin ne suffit pas, c'est lui qu'on
     rend : on ne peut pas inventer des pixels. */
  let choisi = n[0];
  for (const niveau of n) {
    if (niveau.cote < besoinPx) break;
    choisi = niveau;
  }
  return choisi;
}

/**
 * Le tableau des niveaux à employer pour toute une passe de peinture, indexé
 * comme `REGISTRE_MATIERES`. Une case `null` veut dire « pas d'image ici, le
 * peintre garde sa matière semée en code ».
 */
export function niveauxDeMatiere(besoinPx: number): (NiveauMatiere | null)[] {
  return REGISTRE_MATIERES.map((clef) => {
    const t = table.get(clef);
    return t ? niveauPour(t, besoinPx) : null;
  });
}

/* ───────────────────────── Construction de la pyramide ──────────────────── */

/**
 * Convertit des octets RGBA en carte d'écart, puis en pyramide.
 *
 * Fonction PURE, sans DOM : c'est elle que les tests exercent. Le côté doit
 * être une puissance de deux — la réduction se fait par moyenne de quatre
 * pixels et l'échantillonnage par masque binaire.
 */
export function construireNiveaux(rgba: Uint8ClampedArray | Uint8Array, cote: number): NiveauMatiere[] {
  if (cote <= 0 || (cote & (cote - 1)) !== 0) {
    throw new Error(`Côté de tuile invalide : ${String(cote)} (une puissance de deux est requise).`);
  }
  const n = cote * cote;
  if (rgba.length < n * 4) {
    throw new Error(`Octets insuffisants : ${String(rgba.length)} pour ${String(cote)} × ${String(cote)}.`);
  }

  /* La moyenne par canal : c'est elle qu'on retire, et c'est ce retrait qui
     garantit que la matière ne déplace jamais la couleur du sol. */
  let sr = 0;
  let sg = 0;
  let sb = 0;
  for (let i = 0; i < n; i += 1) {
    sr += rgba[i * 4];
    sg += rgba[i * 4 + 1];
    sb += rgba[i * 4 + 2];
  }
  /* Un plancher à 1 : une tuile entièrement noire sur un canal ne doit pas
     produire une division par zéro mais un écart nul. */
  const mr = Math.max(1, sr / n);
  const mg = Math.max(1, sg / n);
  const mb = Math.max(1, sb / n);

  const dr = new Int8Array(n);
  const dg = new Int8Array(n);
  const db = new Int8Array(n);
  for (let i = 0; i < n; i += 1) {
    dr[i] = quantifier(rgba[i * 4] / mr - 1);
    dg[i] = quantifier(rgba[i * 4 + 1] / mg - 1);
    db[i] = quantifier(rgba[i * 4 + 2] / mb - 1);
  }

  const niveaux: NiveauMatiere[] = [{ cote, dr, dg, db }];
  let courant = niveaux[0];
  while (courant.cote > 16) {
    courant = reduire(courant);
    niveaux.push(courant);
  }
  return niveaux;
}

function quantifier(ecart: number): number {
  const v = Math.round(ecart * ECHELLE);
  return v < -127 ? -127 : v > 127 ? 127 : v;
}

/** Réduction de moitié par moyenne de quatre : un filtre boîte, rien de plus. */
function reduire(n: NiveauMatiere): NiveauMatiere {
  const c = n.cote >> 1;
  const dr = new Int8Array(c * c);
  const dg = new Int8Array(c * c);
  const db = new Int8Array(c * c);
  for (let y = 0; y < c; y += 1) {
    for (let x = 0; x < c; x += 1) {
      const a = 2 * y * n.cote + 2 * x;
      const b = a + 1;
      const d = a + n.cote;
      const e = d + 1;
      const k = y * c + x;
      dr[k] = Math.round((n.dr[a] + n.dr[b] + n.dr[d] + n.dr[e]) / 4);
      dg[k] = Math.round((n.dg[a] + n.dg[b] + n.dg[d] + n.dg[e]) / 4);
      db[k] = Math.round((n.db[a] + n.db[b] + n.db[d] + n.db[e]) / 4);
    }
  }
  return { cote: c, dr, dg, db };
}

/* ─────────────────────────────── Le chargement ──────────────────────────── */

/**
 * Lit les tuiles de sol déclarées au manifeste et les range dans la table.
 *
 * N'échoue **jamais** : chaque clef est tentée séparément, et un échec laisse
 * simplement la matière absente. Retourne le rapport, qui est imprimé au
 * journal quand quelque chose a été refusé — c'est le seul moyen de voir une
 * clef mal orthographiée, le mode de panne le plus coûteux de ce pipeline.
 */
export async function chargerMatieresSol(manifeste?: Manifeste | null): Promise<RapportMatieres> {
  const debut = maintenant();
  const m = manifeste === undefined ? await lireManifeste() : manifeste;
  const chargees: string[] = [];
  const refusees: { clef: string; raison: string }[] = [];

  if (!m) {
    dernierRapport = { chargees, refusees, dureeMs: Math.round(maintenant() - debut) };
    return dernierRapport;
  }

  const voulues = new Set<string>(REGISTRE_MATIERES);
  const aLire = m.entrees.filter((e) => voulues.has(e.clef));

  /* Trois de front : ces fichiers sont déjà dans le cache HTTP pour les six
     matières de base (PixiJS vient de les charger pour le champ de bataille),
     et l'écran de chargement n'a pas à attendre douze requêtes en file. */
  const file = [...aLire];
  const travailleurs = Array.from({ length: Math.min(3, file.length) }, async () => {
    for (;;) {
      const e = file.shift();
      if (!e) return;
      try {
        const rgba = await lireOctets(`${RACINE_IMAGES}/${e.fichier}`);
        table.set(e.clef, { clef: e.clef, niveaux: construireNiveaux(rgba.data, rgba.cote) });
        chargees.push(e.clef);
      } catch (cause) {
        refusees.push({ clef: e.clef, raison: String(cause).slice(0, 90) });
      }
    }
  });
  await Promise.all(travailleurs);

  dernierRapport = { chargees, refusees, dureeMs: Math.round(maintenant() - debut) };
  if (refusees.length) {
    console.warn(`[art] ${String(refusees.length)} matière(s) de sol non chargée(s) :`, refusees);
  }
  return dernierRapport;
}

/**
 * Décode une image en octets, réduite au côté utile et carrée.
 *
 * On passe par un canevas parce qu'il n'existe pas d'autre chemin vers les
 * pixels dans un navigateur. La réduction est faite par le canevas lui-même,
 * en qualité haute : c'est un filtre bien meilleur que ce qu'on écrirait ici,
 * et il est natif.
 */
async function lireOctets(url: string): Promise<{ data: Uint8ClampedArray; cote: number }> {
  if (typeof document === 'undefined') throw new Error('aucun document');
  const source = await decoder(url);
  const cote = COTE_MAX_TUILE;
  const el = document.createElement('canvas');
  el.width = cote;
  el.height = cote;
  const ctx = el.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new Error('contexte 2D indisponible');
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(source, 0, 0, cote, cote);
  if (typeof (source as ImageBitmap).close === 'function') (source as ImageBitmap).close();
  const img = ctx.getImageData(0, 0, cote, cote);
  return { data: img.data, cote };
}

async function decoder(url: string): Promise<CanvasImageSource> {
  if (typeof createImageBitmap === 'function' && typeof fetch === 'function') {
    const rep = await fetch(url, { cache: 'force-cache' });
    if (!rep.ok) throw new Error(`HTTP ${String(rep.status)}`);
    return await createImageBitmap(await rep.blob());
  }
  /* Repli pour les navigateurs sans `createImageBitmap`. La CSP autorise
     `img-src 'self'`, donc l'adresse relative passe. */
  return await new Promise<HTMLImageElement>((resoudre, rejeter) => {
    const img = new Image();
    img.onload = (): void => {
      resoudre(img);
    };
    img.onerror = (): void => {
      rejeter(new Error('image illisible'));
    };
    img.src = url;
  });
}

function maintenant(): number {
  return typeof performance !== 'undefined' ? performance.now() : Date.now();
}
