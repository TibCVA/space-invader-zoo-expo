/**
 * CHARGEUR D'IMAGES GÉNÉRÉES.
 *
 * Le jeu est jouable et complet sans une seule image : tout l'art est produit
 * procéduralement par les autres modules de `art/`. Ce fichier ajoute une couche
 * **facultative** de bitmaps générés, qui viennent *remplacer* certaines entrées
 * de l'atlas quand elles sont présentes.
 *
 * Principe : le repli procédural n'est jamais retiré. Une image absente,
 * corrompue ou hors format est ignorée avec un avertissement, et l'atlas garde
 * sa version dessinée. Le jeu ne peut donc jamais se retrouver avec un trou.
 *
 * Contrat d'écriture des fichiers : `docs/05-ASSETS.md`.
 */
import { Assets, Texture } from 'pixi.js';

/** Emplacement servi par Vite (`apps/client/public/img/`). */
export const RACINE_IMAGES = '/img';
export const CHEMIN_MANIFESTE = `${RACINE_IMAGES}/manifeste.json`;

/**
 * Délai de garde par image. Au-delà, on abandonne **cette** image et l'atlas
 * garde sa version procédurale.
 *
 * Le point délicat est de choisir la borne. Dix secondes paraissaient
 * confortables sur un réseau de bureau ; sur un iPhone en 4G, un panorama de
 * cinq cents kilo-octets pris dans une file de six requêtes peut les dépasser,
 * et l'image est alors abandonnée pour rien — la cité retombe sur son décor
 * procédural alors que la peinture serait arrivée deux secondes plus tard.
 * Vingt-cinq secondes laissent passer une connexion médiocre tout en bornant
 * l'attente : sans borne, une requête qui ne revient jamais fige le jeu pour de
 * bon, ce qui est arrivé.
 */
const DELAI_IMAGE_MS = 25_000;

/**
 * PixiJS décode les images dans un *worker* qu'il fabrique à partir d'une URL
 * `blob:`. Notre CSP dit `script-src 'self'` et ne mentionne pas `worker-src` —
 * qui retombe donc sur `default-src 'self'`, lequel refuse `blob:`. Le worker
 * n'est jamais créé, la promesse de `Assets.load` **n'est jamais tenue ni
 * rejetée**, et le chargement se fige définitivement à « on peint les
 * vingt-huit créatures ».
 *
 * Mesuré sous le vrai binaire du serveur : six essais sur six figés, sur la
 * carte comme sur le combat et les cités. Le harnais de capture ne le voyait
 * pas parce qu'il sert le bundle par `vite preview`, qui n'envoie aucune CSP —
 * exactement l'angle mort qui avait déjà laissé passer le défaut `unsafe-eval`.
 *
 * On décode donc sur le fil principal. C'est un peu plus lent au démarrage, et
 * cela ne coûte rien d'autre : la CSP reste stricte, aucune exception n'est
 * ouverte pour `blob:`.
 */
let preferencesPosees = false;

export function poserPreferencesAssets(): void {
  poserPreferences();
}

function poserPreferences(): void {
  if (preferencesPosees) return;
  preferencesPosees = true;
  try {
    Assets.setPreferences({ preferWorkers: false });
  } catch {
    /* Une version de PixiJS sans cette préférence : le délai de garde
       ci-dessous reste le filet de sécurité. */
  }
}

/**
 * `Assets.load` borné dans le temps. Rejette au-delà du délai plutôt que de
 * laisser l'appelant attendre indéfiniment.
 */
async function chargerBorne(url: string, delaiMs = DELAI_IMAGE_MS): Promise<Texture> {
  poserPreferences();
  let minuterie: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      Assets.load(url) as Promise<Texture>,
      new Promise<never>((_, rejeter) => {
        minuterie = setTimeout(
          () => rejeter(new Error(`délai dépassé après ${String(delaiMs)} ms`)),
          delaiMs,
        );
      }),
    ]);
  } finally {
    if (minuterie !== undefined) clearTimeout(minuterie);
  }
}

export type CategorieAsset =
  | 'portrait'
  | 'terrain'
  | 'matiere'
  | 'cite'
  | 'accueil'
  | 'creature'
  | 'prop'
  | 'ciel';

export interface EntreeAsset {
  /** Clef d'atlas remplacée, ex. `portrait_clotilde`, `terrain_aiguilles`. */
  clef: string;
  /** Chemin relatif à `/img`, ex. `portraits/clotilde.webp`. */
  fichier: string;
  categorie: CategorieAsset;
  largeur: number;
  hauteur: number;
  /** Vrai si la texture doit se répéter sans couture (pinceaux de terrain). */
  repetable?: boolean;
  /** Invite et graine, pour pouvoir régénérer à l'identique. */
  invite?: string;
  graine?: string | number;
  /** Octets, à titre indicatif pour le budget. */
  octets?: number;
}

export interface Manifeste {
  version: string;
  /** Budget total accepté, en octets. Au-delà, le chargement s'arrête. */
  budgetOctets?: number;
  entrees: EntreeAsset[];
}

export interface RapportAssets {
  present: boolean;
  version: string | null;
  charges: number;
  ignores: { clef: string; raison: string }[];
  octets: number;
  dureeMs: number;
}

const BUDGET_DEFAUT = 12 * 1024 * 1024;
/** Une image ne peut pas dépasser cette taille : garde-fou mémoire. */
const COTE_MAX = 4096;

let dernierRapport: RapportAssets | null = null;

export function rapportAssets(): RapportAssets | null {
  return dernierRapport;
}

/**
 * Lit le manifeste. Retourne `null` si aucun n'est publié — cas normal tant
 * qu'aucune image n'a été générée. N'échoue jamais.
 */
export async function lireManifeste(base = CHEMIN_MANIFESTE): Promise<Manifeste | null> {
  if (typeof fetch !== 'function') return null;
  try {
    const reponse = await fetch(base, { cache: 'no-cache' });
    if (!reponse.ok) return null;
    const brut: unknown = await reponse.json();
    return validerManifeste(brut);
  } catch {
    return null;
  }
}

/** Validation défensive : un manifeste mal formé ne doit pas casser le jeu. */
export function validerManifeste(brut: unknown): Manifeste | null {
  if (!brut || typeof brut !== 'object') return null;
  const o = brut as Partial<Manifeste>;
  if (!Array.isArray(o.entrees)) return null;

  const entrees: EntreeAsset[] = [];
  for (const e of o.entrees) {
    if (!e || typeof e !== 'object') continue;
    const { clef, fichier, categorie, largeur, hauteur } = e as EntreeAsset;
    if (typeof clef !== 'string' || !clef) continue;
    if (typeof fichier !== 'string' || !fichier) continue;
    // Aucun chemin absolu, aucune remontée de dossier, aucune URL distante.
    if (fichier.startsWith('/') || fichier.includes('..') || /^[a-z]+:/i.test(fichier)) continue;
    if (typeof largeur !== 'number' || typeof hauteur !== 'number') continue;
    if (largeur <= 0 || hauteur <= 0 || largeur > COTE_MAX || hauteur > COTE_MAX) continue;
    if (typeof categorie !== 'string') continue;
    entrees.push(e as EntreeAsset);
  }
  if (!entrees.length) return null;

  return {
    version: typeof o.version === 'string' ? o.version : '0',
    budgetOctets: typeof o.budgetOctets === 'number' ? o.budgetOctets : BUDGET_DEFAUT,
    entrees,
  };
}

/**
 * Charge les images déclarées et écrit les textures obtenues dans les tables de
 * l'atlas. Les entrées qui échouent sont simplement ignorées : l'atlas garde sa
 * version procédurale.
 *
 * @param textures  table des icônes de l'atlas (clef → texture)
 * @param pinceaux  table des pinceaux de terrain (clef → texture)
 */
export async function appliquerAssetsGeneres(
  textures: Map<string, Texture>,
  pinceaux: Record<string, Texture>,
  manifeste?: Manifeste | null,
): Promise<RapportAssets> {
  const debut = maintenant();
  /* `undefined` veut dire « lis-le toi-même » ; `null` veut dire « il n'y en a
     pas, je viens de le vérifier ». Confondre les deux relançait une requête
     pour rien sur une installation sans images. */
  const m = manifeste === undefined ? await lireManifeste() : manifeste;

  if (!m) {
    dernierRapport = {
      present: false,
      version: null,
      charges: 0,
      ignores: [],
      octets: 0,
      dureeMs: Math.round(maintenant() - debut),
    };
    return dernierRapport;
  }

  const budget = m.budgetOctets ?? BUDGET_DEFAUT;
  const ignores: { clef: string; raison: string }[] = [];
  let octets = 0;
  let charges = 0;

  // Chargement en parallèle borné : 6 requêtes simultanées, pour ne pas saturer
  // une connexion mobile pendant l'écran de chargement.
  const file = [...m.entrees];
  const travailleurs = Array.from({ length: Math.min(6, file.length) }, async () => {
    for (;;) {
      const entree = file.shift();
      if (!entree) return;

      if (octets + (entree.octets ?? 0) > budget) {
        ignores.push({ clef: entree.clef, raison: 'budget dépassé' });
        continue;
      }

      const url = `${RACINE_IMAGES}/${entree.fichier}`;
      try {
        const texture = await chargerBorne(url);
        if (!texture || !texture.source) {
          ignores.push({ clef: entree.clef, raison: 'texture vide' });
          continue;
        }
        if (entree.repetable) {
          texture.source.addressMode = 'repeat';
        }
        if (entree.categorie === 'terrain' && entree.clef in pinceaux) {
          pinceaux[entree.clef] = texture;
        } else {
          textures.set(entree.clef, texture);
        }
        octets += entree.octets ?? 0;
        charges++;
      } catch (e) {
        ignores.push({ clef: entree.clef, raison: `chargement impossible (${String(e).slice(0, 80)})` });
      }
    }
  });

  await Promise.all(travailleurs);

  dernierRapport = {
    present: true,
    version: m.version,
    charges,
    ignores,
    octets,
    dureeMs: Math.round(maintenant() - debut),
  };

  if (ignores.length) {
    console.warn(
      `[art] ${ignores.length} image(s) générée(s) ignorée(s), repli procédural utilisé :`,
      ignores.slice(0, 8),
    );
  }
  return dernierRapport;
}

function maintenant(): number {
  return typeof performance !== 'undefined' ? performance.now() : Date.now();
}
