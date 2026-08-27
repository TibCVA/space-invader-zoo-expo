/**
 * Les quatre profils d'intelligence artificielle.
 *
 * Un profil n'est **pas** un simple curseur d'agressivité : chacun porte un
 * jeu complet de pondérations qui change la façon de lire la position
 * (`evaluate.ts`), l'ordre des filières de construction (`economy.ts`), le
 * rayon d'action des héros (`explore.ts`), la marge exigée avant d'engager
 * (`army.ts`), la répartition des troupes (`hero.ts`) et la bascule entre
 * objectifs à moyen terme (`strategy.ts`).
 *
 * Résumé des quatre caractères :
 *
 * | Profil     | Caractère |
 * |------------|-----------|
 * | Prudent    | Fortifie, garnisonne, n'engage qu'à coup sûr, laisse un seul héros s'éloigner, ne vise les sceaux qu'une fois son armée mûre. |
 * | Équilibré  | Alterne demeures et revenus, prend les gisements, occupe les bourgs neutres, engage à marge raisonnable. |
 * | Agressif   | Demeures et améliorations d'abord, garnison minimale, trois héros dehors, harcèle les gisements et les héros isolés. |
 * | Expert     | Change de plan selon la position lue : tempo, contestation des sceaux, blocage de la proclamation adverse, marché pour débloquer une construction, garnison variable. |
 *
 * Toutes les valeurs sont **entières** ; les ratios sont en points de base
 * (10000 = neutre), conformément au brief §2 règle 3.
 */

/** Identifiant de profil, imposé par `docs/02-API.md`. */
export type BotProfileId = 'prudent' | 'equilibre' | 'agressif' | 'expert';

/** Filières de construction, dans l'ordre où un profil les considère. */
export type BuildLine =
  | 'demeure' // demeures de créatures (croissance)
  | 'amelioration' // améliorations de créatures
  | 'revenu' // hôtel de ville, marché, halle, ateliers
  | 'defense' // palissade, rempart, tours, portes
  | 'magie' // guildes des arts, source, scriptorium
  | 'mobilite' // taverne, écuries, capitaine
  | 'prestige'; // capitole

/** Objectifs à moyen terme gérés par `strategy.ts`. */
export type ObjectiveKind =
  | 'developpement' // bâtir et recruter, ne rien risquer
  | 'expansion' // gisements, bourgs neutres, ressources
  | 'sceaux' // lever les Sceaux des Marches
  | 'tresor' // forcer la Maison du Trésor et tenir la proclamation
  | 'harcelement' // frapper les héros et les gisements adverses
  | 'conquete' // marcher sur les cités adverses : la seule façon de gagner
  | 'defense'; // rappeler les héros, garnisonner, fortifier

/** Pondérations de la fonction d'évaluation, en points de base. */
export interface EvalWeights {
  /** valeur d'un point de puissance d'armée */
  armyBp: number;
  /** valeur d'un écu de trésorerie */
  treasuryBp: number;
  /** valeur d'un point de revenu quotidien */
  incomeBp: number;
  /** valeur d'une capitale tenue */
  capital: number;
  /** valeur d'un bourg tenu */
  town: number;
  /** valeur d'un gisement tenu */
  mine: number;
  /** valeur d'un sceau levé */
  seal: number;
  /** valeur d'un niveau de héros */
  heroLevel: number;
  /** valeur d'un bâtiment construit */
  building: number;
  /** valeur d'une case explorée (territoire connu) */
  exploredBp: number;
  /** pénalité par point de menace pesant sur nos cités */
  threatBp: number;
  /** valeur du tempo : avance de développement rapportée au calendrier */
  tempoBp: number;
  /** prime pour une proclamation en cours à notre nom */
  claim: number;
  /** pénalité pour une proclamation adverse en cours */
  enemyClaim: number;
}

/** Réglages économiques. */
export interface EconomyWeights {
  /** ordre de priorité des filières */
  lines: readonly BuildLine[];
  /** écus jamais dépensés en construction (matelas de recrutement) */
  reserveEcus: number;
  /** part du trésor consacrée au recrutement chaque jour, en BP */
  recruitShareBp: number;
  /** on ne recrute que les créatures dont le rang est ≥ à ce seuil quand le trésor est serré */
  tightTier: number;
  /**
   * distance (cases) à laquelle une menace déclenche la filière défense.
   *
   * Une distance en cases, donc un réglage lié à la taille de la carte : les
   * valeurs ont été divisées par 2,26 le jour où la carte est passée de
   * 256 × 416 à la taille d'une XL de HMM3. Sans cela, un seuil de soixante
   * cases couvrait la moitié de la largeur du monde et toute armée ennemie,
   * où qu'elle fût, passait pour une menace sur la capitale.
   */
  defenseTrigger: number;
  /** semaine à partir de laquelle les améliorations passent devant les demeures */
  upgradeFromWeek: number;
  /** échanger au marché pour débloquer une construction */
  useMarket: boolean;
  /** ratio de valeur au-delà duquel un échange est refusé, en BP */
  marketMinBp: number;
}

/** Réglages militaires. */
export interface MilitaryWeights {
  /** marge exigée face à une garde neutre, en BP (12000 = 1,2×) */
  engageRatioBp: number;
  /** marge exigée face à un héros adverse */
  duelRatioBp: number;
  /** marge exigée pour assiéger une cité tenue */
  siegeRatioBp: number;
  /** marge exigée face à la garde d'un sceau */
  sealRatioBp: number;
  /** part de la puissance laissée en garnison dans la capitale, en BP */
  garrisonShareBp: number;
  /** nombre de héros que le profil cherche à entretenir */
  heroTarget: number;
  /** puissance minimale d'un héros de tête avant de sortir de la capitale */
  sortiePower: number;
  /** rassembler les piles éparses dès que l'écart de puissance dépasse ce BP */
  regroupBp: number;
}

/** Réglages d'exploration. */
export interface ExploreWeights {
  /** poids du gain estimé dans le score de cible, en BP */
  gainBp: number;
  /** poids du risque (garde, menace) dans le score, en BP */
  riskBp: number;
  /** coût par journée de marche, en points de score */
  dayCost: number;
  /**
   * rayon d'action autour de la capitale, en cases (0 = illimité).
   *
   * Même échelle que `defenseTrigger` : une laisse de soixante-dix cases
   * bornait le prudent au tiers de l'ancienne carte, elle l'aurait laissé
   * courir aux deux tiers de la nouvelle.
   */
  leash: number;
  /** nombre de héros affectés à la découverte pure */
  scouts: number;
  /** prime accordée à une cible qui lève du brouillard */
  fogBonus: number;
  /** nombre de cibles retenues pour un calcul de chemin exact */
  shortlist: number;
}

/** Réglages stratégiques. */
export interface StrategyWeights {
  /** poids de chaque objectif, en BP, avant lecture de la position */
  bias: Readonly<Record<ObjectiveKind, number>>;
  /** semaine avant laquelle les sceaux ne sont pas considérés */
  sealFromWeek: number;
  /** marge d'hystérésis avant de changer d'objectif, en points */
  switchMargin: number;
  /** le profil relit la position à chaque tour (expert) ou une fois par semaine */
  replanEveryTurn: boolean;
  /** le profil conteste activement une proclamation adverse */
  contestClaim: boolean;
}

/** Profil complet. Le champ `id` et `name` sont le contrat public. */
export interface BotProfile {
  id: BotProfileId;
  name: string;
  /** phrase de caractère, affichable dans l'assistant de nouvelle partie */
  description: string;
  eval: EvalWeights;
  economy: EconomyWeights;
  military: MilitaryWeights;
  explore: ExploreWeights;
  strategy: StrategyWeights;
}

/* ── Prudent ─────────────────────────────────────────────────────────────── */

const PRUDENT: BotProfile = {
  id: 'prudent',
  name: 'Prudent',
  description:
    'Fortifie sa capitale, garde une grosse garnison et ne livre bataille ' +
    'qu’avec une supériorité écrasante. Il gagne par accumulation.',
  eval: {
    armyBp: 9000,
    treasuryBp: 3200,
    incomeBp: 16000,
    capital: 5200,
    town: 2600,
    mine: 900,
    seal: 6000,
    heroLevel: 160,
    building: 240,
    exploredBp: 4,
    threatBp: 20000,
    tempoBp: 6000,
    claim: 9000,
    enemyClaim: 12000,
  },
  economy: {
    /*
     * MESURÉ sur la carte 3.0.0 (duel de vingt parties) : avec « revenu »
     * en tête, 2200 écus de réserve et 55 % de solde aux recrues, le prudent
     * mourait par CONQUÊTE en 14 à 25 jours avec une force de… zéro — pas un
     * combat livré dans la moitié des parties. Une tortue qui thésaurise
     * pendant qu'on marche sur sa capitale n'est pas prudente, elle est
     * morte. Les demeures passent devant, la réserve descend à ce qu'exige
     * une semaine de recrues, la solde monte : la prudence redevient une
     * ARMÉE derrière des murs, pas un livre de comptes.
     */
    lines: ['demeure', 'defense', 'revenu', 'mobilite', 'amelioration', 'magie', 'prestige'],
    reserveEcus: 900,
    recruitShareBp: 7200,
    tightTier: 2,
    defenseTrigger: 27,
    upgradeFromWeek: 6,
    useMarket: false,
    marketMinBp: 8000,
  },
  military: {
    /*
     * Marges resserrées, et c'est une conséquence directe de la règle de HMM3
     * appliquée au moteur : **une place gardée ne se traverse pas**.
     *
     * Tant que l'entrée d'un gardien restait franchissable, le prudent avançait
     * partout et ne livrait que les combats qu'il choisissait — sauf ceux qu'il
     * subissait en chemin, ce qui le mettait au même niveau que tout le monde.
     * Une fois les gardes devenus de vraies portes, exiger 1,9× avant d'ouvrir
     * une route revient à ne jamais l'ouvrir : mesuré, l'expert passait de 13/20
     * à 19/20 et le prudent cessait d'être un adversaire. Ce n'est pas que
     * l'expert jouait mieux, c'est que le prudent ne jouait plus.
     *
     * 1,55× pour une garde neutre reste de loin le profil le plus circonspect —
     * l'expert engage à 1,3× et l'agressif à 1,15× — et la tortue garde ses deux
     * autres traits, la part de garnison de 42 % et la vigilance à vingt-sept
     * cases. Ce qui change, c'est qu'elle consent à forcer un col au lieu de
     * s'enfermer derrière.
     */
    engageRatioBp: 15500,
    duelRatioBp: 18000,
    siegeRatioBp: 20000,
    sealRatioBp: 19000,
    garrisonShareBp: 4200,
    heroTarget: 2,
    sortiePower: 2600,
    regroupBp: 13000,
  },
  explore: {
    gainBp: 9000,
    riskBp: 19000,
    dayCost: 300,
    leash: 31,
    scouts: 1,
    fogBonus: 90,
    shortlist: 7,
  },
  strategy: {
    bias: {
      developpement: 13000,
      expansion: 9000,
      sceaux: 6500,
      tresor: 6000,
      harcelement: 3000,
      conquete: 7000,
      defense: 12000,
    },
    sealFromWeek: 5,
    switchMargin: 2400,
    replanEveryTurn: false,
    contestClaim: true,
  },
};

/* ── Équilibré ───────────────────────────────────────────────────────────── */

const EQUILIBRE: BotProfile = {
  id: 'equilibre',
  name: 'Équilibré',
  description:
    'Alterne demeures et revenus, prend les gisements et les bourgs neutres, ' +
    'engage dès qu’il a une marge raisonnable.',
  eval: {
    armyBp: 10000,
    treasuryBp: 2500,
    incomeBp: 13000,
    capital: 4600,
    town: 2400,
    mine: 1100,
    seal: 8000,
    heroLevel: 190,
    building: 200,
    exploredBp: 6,
    threatBp: 12000,
    tempoBp: 10000,
    claim: 12000,
    enemyClaim: 14000,
  },
  economy: {
    lines: ['demeure', 'revenu', 'mobilite', 'amelioration', 'defense', 'magie', 'prestige'],
    reserveEcus: 1200,
    recruitShareBp: 7000,
    tightTier: 1,
    defenseTrigger: 15,
    upgradeFromWeek: 4,
    useMarket: true,
    marketMinBp: 6800,
  },
  military: {
    engageRatioBp: 14500,
    duelRatioBp: 15500,
    siegeRatioBp: 18000,
    sealRatioBp: 17000,
    garrisonShareBp: 2200,
    heroTarget: 3,
    sortiePower: 1600,
    regroupBp: 16000,
  },
  explore: {
    gainBp: 11000,
    riskBp: 11000,
    dayCost: 240,
    leash: 57,
    scouts: 1,
    fogBonus: 120,
    shortlist: 9,
  },
  strategy: {
    bias: {
      developpement: 10000,
      expansion: 12000,
      sceaux: 9500,
      tresor: 8000,
      harcelement: 6000,
      conquete: 10000,
      defense: 7000,
    },
    sealFromWeek: 3,
    switchMargin: 1600,
    replanEveryTurn: false,
    contestClaim: true,
  },
};

/* ── Agressif ────────────────────────────────────────────────────────────── */

const AGRESSIF: BotProfile = {
  id: 'agressif',
  name: 'Agressif',
  description:
    'Demeures et améliorations avant tout, garnison réduite au strict minimum, ' +
    'trois héros dehors qui harcèlent les gisements et les héros isolés.',
  eval: {
    armyBp: 13000,
    treasuryBp: 1400,
    incomeBp: 8000,
    capital: 3800,
    town: 2200,
    mine: 1400,
    seal: 9500,
    heroLevel: 260,
    building: 130,
    exploredBp: 9,
    threatBp: 6000,
    tempoBp: 15000,
    claim: 14000,
    enemyClaim: 11000,
  },
  economy: {
    lines: ['demeure', 'amelioration', 'mobilite', 'revenu', 'magie', 'defense', 'prestige'],
    reserveEcus: 300,
    recruitShareBp: 9200,
    tightTier: 1,
    defenseTrigger: 6,
    upgradeFromWeek: 2,
    useMarket: true,
    marketMinBp: 5600,
  },
  military: {
    engageRatioBp: 11500,
    duelRatioBp: 11000,
    siegeRatioBp: 13500,
    sealRatioBp: 13000,
    garrisonShareBp: 700,
    heroTarget: 4,
    sortiePower: 900,
    regroupBp: 22000,
  },
  explore: {
    gainBp: 13000,
    riskBp: 6500,
    dayCost: 170,
    leash: 0,
    scouts: 2,
    fogBonus: 150,
    shortlist: 10,
  },
  strategy: {
    bias: {
      developpement: 6500,
      expansion: 11000,
      sceaux: 11000,
      tresor: 10000,
      harcelement: 13000,
      conquete: 14000,
      defense: 3500,
    },
    sealFromWeek: 2,
    switchMargin: 900,
    replanEveryTurn: true,
    contestClaim: true,
  },
};

/* ── Expert ──────────────────────────────────────────────────────────────── */

const EXPERT: BotProfile = {
  id: 'expert',
  name: 'Expert',
  description:
    'Relit la position à chaque tour : prend le tempo quand il mène, se couvre ' +
    'quand il est derrière, conteste les sceaux, bloque la proclamation adverse ' +
    'et se sert du marché pour ne jamais rester bloqué sur une ressource.',
  eval: {
    armyBp: 11500,
    treasuryBp: 2000,
    incomeBp: 15000,
    capital: 5000,
    town: 2800,
    mine: 1500,
    seal: 11000,
    heroLevel: 230,
    building: 220,
    exploredBp: 8,
    threatBp: 13000,
    tempoBp: 18000,
    claim: 20000,
    enemyClaim: 22000,
  },
  economy: {
    lines: ['demeure', 'revenu', 'amelioration', 'mobilite', 'magie', 'defense', 'prestige'],
    reserveEcus: 800,
    recruitShareBp: 8600,
    tightTier: 1,
    defenseTrigger: 12,
    upgradeFromWeek: 3,
    useMarket: true,
    marketMinBp: 5200,
  },
  military: {
    engageRatioBp: 13000,
    duelRatioBp: 13500,
    siegeRatioBp: 16000,
    sealRatioBp: 15000,
    garrisonShareBp: 1500,
    heroTarget: 4,
    sortiePower: 1300,
    regroupBp: 14000,
  },
  explore: {
    gainBp: 12500,
    riskBp: 10000,
    dayCost: 200,
    leash: 0,
    scouts: 1,
    fogBonus: 130,
    shortlist: 12,
  },
  strategy: {
    bias: {
      developpement: 9000,
      expansion: 12000,
      sceaux: 12500,
      tresor: 12000,
      harcelement: 8000,
      conquete: 13000,
      defense: 8000,
    },
    sealFromWeek: 2,
    switchMargin: 700,
    replanEveryTurn: true,
    contestClaim: true,
  },
};

/* ── Table publique ──────────────────────────────────────────────────────── */

/** Les quatre profils, indexés par identifiant. */
export const BOT_PROFILES: Readonly<Record<BotProfileId, BotProfile>> = Object.freeze({
  prudent: PRUDENT,
  equilibre: EQUILIBRE,
  agressif: AGRESSIF,
  expert: EXPERT,
});

/** Les quatre identifiants, dans l'ordre canonique du plus prudent au plus fin. */
export const BOT_PROFILE_IDS: readonly BotProfileId[] = [
  'prudent',
  'equilibre',
  'agressif',
  'expert',
];

/** Profil d'un identifiant, avec repli sur « équilibré » si inconnu. */
export function botProfile(id: string | undefined | null): BotProfile {
  if (id === 'prudent' || id === 'equilibre' || id === 'agressif' || id === 'expert') {
    return BOT_PROFILES[id];
  }
  return BOT_PROFILES.equilibre;
}
