/**
 * Envoi d'une commande à une partie en ligne.
 *
 * Tout l'intérêt de ce fichier tient en une phrase : **la clef d'idempotence
 * est tirée une seule fois, et le renvoi réutilise la même.** Un cousin qui
 * confirme un déplacement dans un tunnel du RER voit sa requête échouer ; on
 * la rejoue trois secondes plus tard avec la même clef, et le serveur — qui a
 * peut-être déjà appliqué la première — renvoie le résultat déjà calculé au
 * lieu de déplacer le héros deux fois (`docs/04-MULTIJOUEUR.md` §4).
 *
 * Trois issues, et trois seulement :
 *
 *  - **`applique`** — le serveur a répondu. `rejeu` dit si c'était un doublon.
 *  - **`conflit`** — `409` : le client était en retard. L'état à jour est
 *    joint, la clef est rendue à l'appelant, le geste n'est pas perdu.
 *  - **`echec`** — refus définitif, ou réseau toujours muet après les
 *    tentatives. La clef est rendue là aussi : elle reste rejouable.
 */

import type { Command } from '@auvergne/engine';
import type { PartyCommandPayload, PartyStatePayload } from '@auvergne/protocol';
import { ErreurConflit, ErreurPartie, envoyerCommande, estTemporaire } from './api.js';

/* ═══════════════════════════ Clef d'idempotence ═══════════════════════════ */

/**
 * Une clef d'idempotence neuve. `crypto.randomUUID()` d'abord — trente-six
 * caractères, tirets compris, ce que `IdempotencyKeySchema` accepte. Le repli
 * n'est utilisé que par les navigateurs sans `randomUUID` en contexte non
 * sécurisé ; il reste imprévisible grâce à `getRandomValues`.
 */
export function nouvelleCleIdempotence(): string {
  const crypto = globalThis.crypto;
  if (crypto && typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  if (crypto && typeof crypto.getRandomValues === 'function') {
    const octets = new Uint8Array(16);
    crypto.getRandomValues(octets);
    return Array.from(octets, (o) => o.toString(16).padStart(2, '0')).join('');
  }
  /* Dernier recours : horodatage et compteur. Jamais utilisé en pratique. */
  compteurDeSecours += 1;
  return `secours-${Date.now().toString(36)}-${compteurDeSecours.toString(36)}`;
}

let compteurDeSecours = 0;

/* ══════════════════════════════ Le résultat ═══════════════════════════════ */

export interface EnvoiApplique {
  issue: 'applique';
  /** la clef utilisée ; à jeter, la commande est passée */
  cle: string;
  charge: PartyCommandPayload;
  /** nombre de requêtes réellement parties (1 si tout s'est bien passé) */
  tentatives: number;
}

export interface EnvoiConflit {
  issue: 'conflit';
  /** la clef ; **à réutiliser** telle quelle après resynchronisation */
  cle: string;
  /** l'état à jour joint par le serveur, s'il l'a joint */
  etat: PartyStatePayload | null;
  message: string;
  tentatives: number;
}

export interface EnvoiEchec {
  issue: 'echec';
  /** la clef ; **à réutiliser** telle quelle pour un nouvel essai */
  cle: string;
  message: string;
  /** vrai si l'échec est temporaire : réseau, 429, 5xx */
  temporaire: boolean;
  tentatives: number;
}

export type ResultatEnvoi = EnvoiApplique | EnvoiConflit | EnvoiEchec;

/* ═══════════════════════════════ Réglages ═════════════════════════════════ */

/** Tentatives par défaut, retrait compris. Quatre suffisent à un tunnel. */
export const TENTATIVES_MAX = 4;
/** Première attente du retrait exponentiel, en millisecondes. */
export const ATTENTE_BASE_MS = 700;
/** Plafond du retrait : au-delà, l'utilisateur préfère un bouton « réessayer ». */
export const ATTENTE_MAX_MS = 8_000;

/** Retrait exponentiel borné : 700 ms, 1,4 s, 2,8 s, … plafonné à 8 s. */
export function attenteRetrait(
  tentative: number,
  base = ATTENTE_BASE_MS,
  plafond = ATTENTE_MAX_MS,
): number {
  const brut = base * 2 ** Math.max(0, tentative - 1);
  return Math.min(plafond, brut);
}

export interface OptionsEnvoi {
  /** réutiliser une clef existante : c'est le cas d'un renvoi après conflit */
  cle?: string;
  tentatives?: number;
  attenteBase?: number;
  attenteMax?: number;
  /** attente injectable ; les tests passent une fonction immédiate */
  dormir?: (ms: number) => Promise<void>;
  signal?: AbortSignal;
}

function dormirVraiment(ms: number): Promise<void> {
  return new Promise((resoudre) => {
    setTimeout(resoudre, ms);
  });
}

/* ═══════════════════════════════ L'envoi ══════════════════════════════════ */

/**
 * Envoie une commande, et la renvoie **avec la même clef** tant que c'est le
 * réseau qui a flanché. Ne lève jamais : l'issue est dans le résultat.
 */
export async function envoyerCommandeFiable(
  code: string,
  commande: Command,
  seqAttendu: number,
  options: OptionsEnvoi = {},
): Promise<ResultatEnvoi> {
  const cle = options.cle ?? nouvelleCleIdempotence();
  const maximum = Math.max(1, options.tentatives ?? TENTATIVES_MAX);
  const dormir = options.dormir ?? dormirVraiment;

  let tentatives = 0;
  let dernier = 'Le serveur des parties est injoignable.';

  while (tentatives < maximum) {
    tentatives += 1;
    try {
      /* La clef ne bouge pas d'une tentative à l'autre : c'est tout l'intérêt. */
      const charge = await envoyerCommande(code, commande, cle, seqAttendu, options.signal);
      return { issue: 'applique', cle, charge, tentatives };
    } catch (cause) {
      if (cause instanceof DOMException && cause.name === 'AbortError') {
        return { issue: 'echec', cle, message: 'Envoi interrompu.', temporaire: true, tentatives };
      }
      if (cause instanceof ErreurConflit) {
        return {
          issue: 'conflit',
          cle,
          etat: cause.etat,
          message: cause.message,
          tentatives,
        };
      }
      if (!estTemporaire(cause)) {
        const message =
          cause instanceof ErreurPartie ? cause.message : "Le serveur a refusé l'action.";
        return { issue: 'echec', cle, message, temporaire: false, tentatives };
      }
      dernier = cause instanceof Error ? cause.message : dernier;
      if (tentatives < maximum) {
        await dormir(attenteRetrait(tentatives, options.attenteBase, options.attenteMax));
      }
    }
  }

  return { issue: 'echec', cle, message: dernier, temporaire: true, tentatives };
}

/**
 * Message français d'un conflit, prêt à afficher. Le geste du joueur n'est pas
 * perdu : c'est ce que la phrase doit dire, avant tout le reste.
 */
export function messageConflit(resultat: EnvoiConflit): string {
  const suite =
    resultat.etat === null
      ? 'La partie est rechargée ; recommencez votre geste.'
      : "La partie vient d'être rechargée : votre geste peut être confirmé de nouveau.";
  return `Un autre joueur a joué avant vous. ${suite}`;
}
