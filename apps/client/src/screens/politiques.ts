/**
 * LES POLITIQUES — la charte du village et la gabelle du royaume,
 * injouables jusqu'ici.
 *
 * `SetCharter` et `SetGabelle` n'étaient émises nulle part. La charte est le
 * choix PERMANENT d'un village (jamais la capitale, jamais deux fois) ; la
 * gabelle est la politique du sel du royaume entier, que seul le détenteur de
 * la Maison du Trésor fixe. Deux gestes rares mais structurants — c'est
 * l'équivalent des choix de gouvernance de HMM3.
 *
 * Comme partout : on décrit CE QU'ON PROPOSE, le moteur reste seul juge. Les
 * effets écrits ici citent les règles mesurées dans le code — pas des
 * promesses (`economy.ts:126-132`, `economy.ts:486`, `economy.ts:566`,
 * `gabelle.ts:495`). L'aperçu de la gabelle appelle `gabelleIncome`, la
 * fonction pure que le noyau débite chaque jour : ce qui s'affiche est ce qui
 * tombera.
 */
import { gabelleIncome } from '@auvergne/engine';
import type {
  Charter,
  Command,
  GabellePolicy,
  GameState,
  PlayerId,
  TownState,
  TownUid,
} from '@auvergne/engine';

/* ────────────────────────────── La charte ───────────────────────────────── */

export interface OffreCharte {
  readonly id: Charter;
  readonly nom: string;
  /** l'effet, dans les termes des règles mesurées — jamais une promesse */
  readonly effet: string;
}

/**
 * Les trois chartes, décrites par leurs règles RÉELLES :
 *  - marchande : +20 % sur le revenu d'écus de la cité, et le marché du
 *    royaume rend mieux (+6 % de rendement) ;
 *  - militaire : +1 fer par jour, et la croissance des demeures +10 % ;
 *  - spirituelle : +1 essence par jour, et l'agitation s'apaise plus vite.
 */
export const CHARTES: readonly OffreCharte[] = [
  {
    id: 'marchande',
    nom: 'Charte marchande',
    effet: '+20 % sur le revenu d’écus de la cité · le marché du royaume rend mieux',
  },
  {
    id: 'militaire',
    nom: 'Charte militaire',
    effet: '+1 fer par jour · la croissance des demeures gagne 10 %',
  },
  {
    id: 'spirituelle',
    nom: 'Charte spirituelle',
    effet: '+1 essence par jour · l’agitation s’apaise plus vite',
  },
];

/**
 * La cité peut-elle encore choisir ? Les deux conditions de FORME du moteur
 * (`apply.ts:672-677`) : jamais la capitale, jamais deux fois. Le choix est
 * PERMANENT — c'est la raison de la confirmation à l'écran.
 */
export function charteOffrable(town: TownState): boolean {
  return !town.isCapital && town.charter === null;
}

export function commandeDeCharte(town: TownUid, charte: Charter): Command {
  return { type: 'SetCharter', town, charter: charte };
}

/* ────────────────────────────── La gabelle ──────────────────────────────── */

export interface OffreGabelle {
  readonly id: GabellePolicy;
  readonly nom: string;
  /** ce que le royaume toucherait DEMAIN sous ce régime, par le vrai calcul */
  readonly apercu: { ecus: number; sel: number; unrest: number };
  readonly enVigueur: boolean;
}

export interface Gabelle {
  /** vrai si NOTRE bannière détient la Maison du Trésor — la seule qui fixe */
  readonly detenteur: boolean;
  readonly courante: GabellePolicy;
  readonly offres: readonly OffreGabelle[];
}

const NOMS_GABELLE: Readonly<Record<GabellePolicy, string>> = {
  franchise: 'Franchise',
  mesure: 'Gabelle mesurée',
  forte: 'Gabelle forte',
};

const POLITIQUES: readonly GabellePolicy[] = ['franchise', 'mesure', 'forte'];

/**
 * L'état de la gabelle, et l'aperçu de chaque régime.
 *
 * `gabelleIncome` est PURE (elle ne consomme pas le dé — `gabelle.ts:17-20`,
 * c'est écrit pour ça) : on la rejoue sur une copie superficielle de l'état
 * où seule la politique change. Ce que la ligne affiche est ce que le noyau
 * versera demain sous ce régime.
 */
export function gabelleDe(game: GameState, joueur: PlayerId): Gabelle {
  let detenteur = false;
  for (const uid of Object.keys(game.objects).sort()) {
    const o = game.objects[uid];
    if (o.kind === 'maison_tresor') detenteur = o.owner === joueur;
  }
  const offres = POLITIQUES.map((id) => ({
    id,
    nom: NOMS_GABELLE[id],
    apercu: gabelleIncome({ ...game, gabelle: id }),
    enVigueur: game.gabelle === id,
  }));
  return { detenteur, courante: game.gabelle, offres };
}

export function commandeDeGabelle(policy: GabellePolicy): Command {
  return { type: 'SetGabelle', policy };
}
