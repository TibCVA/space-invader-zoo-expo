/**
 * Entrer dans une partie en ligne.
 *
 * Le serveur est autoritaire : ce qu'il envoie dans `PartyStatePayload.etat`
 * est **l'état du monde tel qu'il fait foi**, déjà expurgé du brouillard des
 * autres bannières. Ce module fait le dernier mètre — vérifier le `setup`,
 * désérialiser l'état, reconstruire la carte, poser le tout dans le magasin du
 * client — pour que les écrans de jeu existants n'aient rien à savoir du
 * réseau : ils lisent le même `AppState` que pour une partie solo.
 *
 * La carte se reconstruit depuis la seule graine (`buildWorld(seed)`) : elle
 * n'est jamais transportée, c'est le principe du dépôt depuis le début.
 */

import type { GameSetup, PlayerId } from '@auvergne/engine';
import { GameSetupSchema, deserializeState } from '@auvergne/protocol';
import type { PartyStatePayload } from '@auvergne/protocol';
import { brancherRelaisDeCommandes, chargerPartie, poserNotice } from '../state/store.js';
import { brancherRelais, couperRelais, transmettre, type EchoRelais } from './relais.js';

/** Ce que l'écran obtient quand l'entrée échoue : un message, en français. */
export class ErreurEntree extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ErreurEntree';
  }
}

/** Lit le `setup` d'une charge d'état, ou explique pourquoi c'est impossible. */
export function lireSetup(charge: PartyStatePayload): GameSetup {
  const analyse = GameSetupSchema.safeParse(charge.setup);
  if (!analyse.success) {
    throw new ErreurEntree(
      'La configuration de cette partie n’est pas lisible par cette version du jeu. Rechargez la page ; si le message revient, la partie a été créée par une version plus récente.',
    );
  }
  return analyse.data as GameSetup;
}

/* ───────────────────── La chronique de l'absence ─────────────────────────── */

/** Une ligne de journal, identifiée sans ambiguïté. */
function clefDeLigne(e: { turn: number; player: PlayerId | null; text: string }): string {
  return `${String(e.turn)}|${e.player ?? ''}|${e.text}`;
}

interface JournalLu {
  readonly journal: readonly { turn: number; player: PlayerId | null; text: string }[];
}

/**
 * Les lignes du journal que le joueur N'A PAS ENCORE VUES — la chronique de
 * son absence, au jeu par correspondance.
 *
 * Le repère est la DERNIÈRE ligne vue (retenue par partie, dans le
 * navigateur) : tout ce qui la suit est nouveau. Si elle a été poussée hors
 * du journal (il est borné), on retombe sur le tour : nouveau = plus récent
 * que le dernier tour vu. Seules comptent les lignes des AUTRES — le serveur
 * ne sert d'ailleurs que les nôtres, celles du monde et les faits publics.
 */
export function lignesNouvelles(
  apres: JournalLu,
  moi: PlayerId,
  repere: { clef: string; tour: number } | null,
): { turn: number; player: PlayerId | null; text: string }[] {
  const autres = apres.journal.filter((e) => e.player !== moi);
  if (!repere) return [];
  const i = apres.journal.map(clefDeLigne).lastIndexOf(repere.clef);
  if (i >= 0) {
    return apres.journal.slice(i + 1).filter((e) => e.player !== moi);
  }
  return autres.filter((e) => e.turn > repere.tour);
}

/** Le repère « dernière ligne vue » d'une partie, dans le navigateur. */
function lireRepere(code: string): { clef: string; tour: number } | null {
  try {
    const brut = localStorage.getItem(`auvergne.chronique.${code}`);
    if (!brut) return null;
    const forme = JSON.parse(brut) as { clef?: unknown; tour?: unknown };
    if (typeof forme.clef !== 'string' || typeof forme.tour !== 'number') return null;
    return { clef: forme.clef, tour: forme.tour };
  } catch {
    return null;
  }
}

function poserRepere(code: string, journal: JournalLu['journal'], tour: number): void {
  try {
    const derniere = journal[journal.length - 1];
    if (!derniere) return;
    localStorage.setItem(
      `auvergne.chronique.${code}`,
      JSON.stringify({ clef: clefDeLigne(derniere), tour }),
    );
  } catch {
    /* Navigation privée ou stockage plein : la chronique se tait, le jeu vit. */
  }
}

/**
 * Installe une partie en ligne dans le magasin du client. Ne navigue pas :
 * l'écran appelant décide où aller, et quand.
 *
 * Le second appel et les suivants — le pouls a vu la séquence bouger, ou le
 * serveur vient de répondre à notre coup — passent par le même chemin :
 * l'état autoritaire remplace l'état local, et le relais est rebranché sur la
 * nouvelle séquence.
 */
export async function installerPartieEnLigne(charge: PartyStatePayload): Promise<void> {
  const setup = lireSetup(charge);

  let state;
  try {
    state = deserializeState(charge.etat);
  } catch {
    throw new ErreurEntree(
      'L’état de la partie envoyé par le serveur n’a pas pu être ouvert. Réessayez dans un instant.',
    );
  }

  const { buildWorld } = await import('@auvergne/map');
  const world = buildWorld(setup.seed);

  chargerPartie({
    state,
    world,
    setup,
    ...(charge.monSlot ? { localPlayer: charge.monSlot as PlayerId } : {}),
    /* Aucun emplacement local : la sauvegarde de référence est au serveur. */
    slot: null,
    commands: [],
  });

  /* `chargerPartie` coupe systématiquement le relais : on le rebranche ici, et
     ici seulement. L'ordre importe — brancher avant écraserait le crochet. */
  if (charge.monSlot) {
    brancherRelais({ code: charge.code, seq: charge.seq, monSlot: charge.monSlot }, surEcho);
    brancherRelaisDeCommandes(transmettre);

    /*
     * LA CHRONIQUE DE L'ABSENCE — le chaînon du jeu par correspondance : la
     * main revient, le monde a changé, et RIEN ne le disait. On compte les
     * lignes de journal que ce navigateur n'a pas encore vues (capture d'une
     * cité, reddition, gabelle, tours joués par le serveur) et on les
     * annonce, la plus récente en toutes lettres. Le repère avance à CHAQUE
     * installation : on ne raconte jamais deux fois la même absence.
     */
    const moi = charge.monSlot as PlayerId;
    const repere = lireRepere(charge.code);
    const nouvelles = lignesNouvelles(state, moi, repere);
    poserRepere(charge.code, state.journal, state.turn);
    if (charge.monTour && nouvelles.length > 0) {
      const derniere = nouvelles[nouvelles.length - 1];
      poserNotice(
        nouvelles.length === 1
          ? `Pendant votre absence : ${derniere.text}`
          : `Pendant votre absence (${String(nouvelles.length)} faits) : ${derniere.text} — le Journal a le reste.`,
      );
    }
  } else {
    /* Sans bannière, on observe : rien ne part au serveur. */
    couperRelais();
  }
}

/**
 * Réponse du serveur à l'un de nos coups.
 *
 * Trois choses en arrivent, dans cet ordre d'importance : un état autoritaire à
 * adopter, un avertissement à montrer, et le journal de ce que le serveur a
 * joué derrière nous — les tours d'IA, notamment, qui n'existent pas côté
 * client.
 */
function surEcho(echo: EchoRelais): void {
  const lignes: string[] = [];
  if (echo.avertissement) lignes.push(echo.avertissement);
  if (echo.toursIa.length > 0) {
    lignes.push(
      echo.toursIa.length === 1
        ? `Le serveur a joué la bannière ${echo.toursIa[0]}.`
        : `Le serveur a joué les bannières ${echo.toursIa.join(', ')}.`,
    );
  }
  const message = lignes.length > 0 ? lignes.join(' ') : null;

  if (!echo.etat) {
    if (message) poserNotice(message);
    return;
  }

  /* Réinstaller est volontairement brutal : l'état du serveur remplace le nôtre
     en entier. C'est le sens de « le serveur fait foi », et c'est aussi ce qui
     rattrape en une fois les tours d'IA joués dans la foulée.
     Le message vient **après** : `chargerPartie` repart d'un état neuf et
     effacerait un avertissement posé avant lui. */
  void installerPartieEnLigne(echo.etat)
    .then(() => {
      if (message) poserNotice(message);
    })
    .catch((cause: unknown) => {
      poserNotice(
        cause instanceof ErreurEntree
          ? cause.message
          : 'La partie n’a pas pu être remise à jour depuis le serveur.',
      );
    });
}
