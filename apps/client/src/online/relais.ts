/**
 * `online/relais.ts` — LE PONT ENTRE LES ÉCRANS DE JEU ET LE SERVEUR.
 *
 * Les trois vues impératives — carte, cité, combat — n'ont aucune idée du
 * réseau, et c'est voulu : elles émettent une `Command` par `dispatch()`, comme
 * en solo. Ce module est le seul endroit qui sache qu'une partie est en ligne.
 *
 * ## Pourquoi la commande part *après* avoir été jouée en local
 *
 * Le serveur reste **autoritaire** : sa version l'emporte toujours, et c'est
 * elle qu'on adopte dès qu'elle revient. Mais on applique d'abord la commande
 * localement, pour deux raisons qui n'ont rien à voir avec le confort :
 *
 *  1. **Le moteur local est le même moteur, sur le même état.** Il est
 *     déterministe et sans horloge. Le résultat local et le résultat serveur
 *     sont donc identiques, sauf bogue — auquel cas l'écart se voit
 *     immédiatement, au lieu de dormir. La réconciliation est normalement une
 *     opération vide, et quand elle ne l'est pas, elle le dit.
 *  2. **Une commande refusée en local ne part pas.** Le serveur n'a pas à
 *     arbitrer un geste que le moteur du joueur savait déjà impossible.
 *
 * ## Pourquoi `dispatch` reste synchrone
 *
 * `apps/client/src/view-contract.ts` impose `ViewDispatch = (command) =>
 * DispatchResult`. Le rendre asynchrone obligerait à réécrire les trois vues.
 * L'envoi est donc lancé sans être attendu, et la réponse du serveur revient
 * plus tard poser l'état autoritaire. Dans un jeu au tour par tour joué sur
 * plusieurs jours, ce décalage n'a aucune conséquence perceptible.
 */

import type { Command } from '@auvergne/engine';
import type { PartyStatePayload } from '@auvergne/protocol';
import { envoyerCommandeFiable, messageConflit, type ResultatEnvoi } from './commandes.js';

/** Ce qu'il faut savoir pour parler au serveur d'une partie en cours. */
export interface ContexteEnLigne {
  readonly code: string;
  /** dernière séquence connue ; toute commande l'annonce */
  seq: number;
  /** bannière tenue par ce navigateur */
  readonly monSlot: string;
}

/** Ce que le relais rapporte à la coquille après chaque échange. */
export interface EchoRelais {
  /** journal français produit par le serveur, prêt à afficher */
  readonly journal: readonly string[];
  /** bannières d'IA jouées dans la foulée */
  readonly toursIa: readonly string[];
  /** message d'avertissement à montrer au joueur, ou `null` */
  readonly avertissement: string | null;
  /** état autoritaire à adopter, ou `null` s'il n'y a rien à changer */
  readonly etat: PartyStatePayload | null;
}

type Auditeur = (echo: EchoRelais) => void;

let contexte: ContexteEnLigne | null = null;
let auditeur: Auditeur | null = null;
/** Envois encore en vol : sert aux tests et à la fermeture propre. */
let enVol = 0;

/* ═════════════════════════════ Le branchement ════════════════════════════ */

/**
 * Déclare que la partie chargée est en ligne. Tant que c'est le cas, chaque
 * commande acceptée localement part au serveur.
 */
export function brancherRelais(ctx: ContexteEnLigne, ecoute: Auditeur): void {
  contexte = { ...ctx };
  auditeur = ecoute;
}

/** Coupe le relais : la partie redevient purement locale. */
export function couperRelais(): void {
  contexte = null;
  auditeur = null;
}

/** Contexte courant, ou `null` hors ligne. Lecture seule. */
export function relaisActif(): ContexteEnLigne | null {
  return contexte === null ? null : { ...contexte };
}

/** Met à jour la séquence connue, quand elle vient d'ailleurs (le pouls). */
export function noterSeq(seq: number): void {
  if (contexte !== null && seq > contexte.seq) contexte.seq = seq;
}

/** Nombre d'envois en cours. Utile aux tests et à un écran d'attente. */
export function envoisEnVol(): number {
  return enVol;
}

/* ═══════════════════════════════ L'envoi ═════════════════════════════════ */

/**
 * Transmet une commande déjà acceptée en local. Ne lève jamais et ne bloque
 * pas : la réponse arrive à l'auditeur.
 *
 * Retourne `false` si aucune partie en ligne n'est branchée — l'appelant sait
 * alors qu'il est en solo et n'a rien d'autre à faire.
 */
export function transmettre(command: Command): boolean {
  const ctx = contexte;
  if (ctx === null) return false;

  /* On fige la séquence attendue maintenant : c'est celle sur laquelle le
     joueur a joué, et c'est elle que le serveur doit vérifier. */
  const seqAttendu = ctx.seq;
  enVol += 1;

  void envoyerCommandeFiable(ctx.code, command, seqAttendu)
    .then((resultat) => rendreCompte(ctx.code, resultat))
    .catch(() => {
      /* `envoyerCommandeFiable` ne rejette pas ; ce filet ne sert qu'à garantir
         que le compteur redescende même si cette promesse-ci était détournée. */
      annoncer({
        journal: [],
        toursIa: [],
        avertissement: "L'envoi de votre coup s'est interrompu. Rechargez la partie.",
        etat: null,
      });
    })
    .finally(() => {
      enVol = Math.max(0, enVol - 1);
    });

  return true;
}

/** Traduit l'issue d'un envoi en un écho pour la coquille. */
function rendreCompte(code: string, resultat: ResultatEnvoi): void {
  /* Le relais a pu être coupé pendant que la commande volait — le joueur est
     retourné à l'accueil, ou a ouvert une autre partie. On ne touche alors à
     rien : adopter l'état d'une partie qu'on a quittée écraserait l'autre. */
  if (contexte === null || contexte.code !== code) return;

  if (resultat.issue === 'applique') {
    const charge = resultat.charge;
    contexte.seq = charge.seq;
    annoncer({
      journal: charge.journal,
      toursIa: charge.toursIa,
      avertissement: null,
      /* Le serveur renvoie son état à chaque coup. On l'adopte : c'est lui qui
         fait foi, et c'est aussi par là qu'arrivent les tours d'IA joués
         derrière le nôtre. */
      etat: charge.etat,
    });
    return;
  }

  if (resultat.issue === 'conflit') {
    if (resultat.etat) contexte.seq = resultat.etat.seq;
    annoncer({
      journal: [],
      toursIa: [],
      avertissement: messageConflit(resultat),
      etat: resultat.etat,
    });
    return;
  }

  annoncer({
    journal: [],
    toursIa: [],
    avertissement: resultat.temporaire
      ? `${resultat.message} Votre coup sera renvoyé si vous réessayez.`
      : resultat.message,
    etat: null,
  });
}

function annoncer(echo: EchoRelais): void {
  auditeur?.(echo);
}
