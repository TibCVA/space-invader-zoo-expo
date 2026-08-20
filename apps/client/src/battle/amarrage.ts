/**
 * `battle/amarrage.ts` — où se pose la carte d'aperçu sur écran étroit.
 *
 * Sur téléphone la carte d'attaque ne se pose plus à côté de la cible : elle
 * s'amarre au bas de l'écran, superposée au champ, rétractable d'une touche.
 * Elle doit y respecter **un invariant absolu** : ne jamais recouvrir la
 * barre d'actions. Six boutons cachés, c'est un combat qu'on ne peut plus
 * jouer — l'audit l'avait relevé comme le défaut bloquant du combat sur
 * iPhone, et la capture le confirmait : un bouton dépassait derrière la
 * carte, les cinq autres avaient disparu.
 *
 * La faute était dans le calcul : la carte était posée à
 * `bas − hauteur`, borné par le haut à la barre d'initiative. Dès que la
 * carte était plus haute que la bande disponible, la borne du haut gagnait
 * et le bas de la carte **débordait** sur la barre d'actions. Une borne qui
 * protège le haut ne protège pas le bas.
 *
 * Ici la bande disponible est calculée d'abord, et la carte y est *rognée*
 * plutôt que débordée : on en montre le haut, le reste glisse sous la barre
 * d'actions, qui reste entière et touchable.
 */

/** Ce que la disposition doit connaître. Aucune dépendance à Pixi. */
export interface CadreAmarrage {
  /** hauteur totale de la scène, en pixels */
  hauteur: number;
  /** largeur totale de la scène */
  largeur: number;
  /** hauteur de la barre d'initiative, en haut */
  barre: number;
  /** hauteur du panneau bas (barre d'actions comprise) */
  panneauBas: number;
  /** largeur de la carte */
  largeurCarte: number;
  /** hauteur de la carte, dépliée */
  hauteurCarte: number;
  /** hauteur de la seule coiffe, quand la carte est rétractée */
  entete: number;
  /** la carte est-elle rétractée ? */
  repliee: boolean;
}

export interface PoseCarte {
  x: number;
  y: number;
  /** hauteur réellement montrée : la carte est rognée, jamais débordée */
  hauteurVisible: number;
  /** vrai si la carte a dû être rognée faute de place */
  rognee: boolean;
}

/** Marge entre la carte et ce qui l'entoure, en pixels. */
const MARGE = 8;

/**
 * Pose la carte amarrée. Le contrat, vérifié par le test :
 * `y + hauteurVisible <= hauteur − panneauBas`, toujours.
 */
export function poserCarteAmarree(c: CadreAmarrage): PoseCarte {
  const voulue = c.repliee ? c.entete : c.hauteurCarte;
  /* Le bas de la bande : juste au-dessus de la barre d'actions. */
  const bas = c.hauteur - c.panneauBas - MARGE;
  /* Le haut de la bande : juste sous la barre d'initiative. */
  const haut = c.barre + MARGE;
  const dispo = Math.max(0, bas - haut);
  const hauteurVisible = Math.min(voulue, dispo);
  const y = bas - hauteurVisible;
  const largeurUtile = Math.min(c.largeurCarte, c.largeur - 2 * MARGE);
  return {
    x: Math.round((c.largeur - largeurUtile) / 2),
    y: Math.round(y),
    hauteurVisible: Math.round(hauteurVisible),
    rognee: hauteurVisible < voulue,
  };
}

/* ════════════════════════ La barre des six actions ═══════════════════════ */

/**
 * Hauteur, en pixels, de la bande du haut du panneau où la touche REPLIE ou
 * DÉPLIE le panneau au lieu d'appuyer sur un bouton.
 *
 * Cette bande est un piège quand un bouton y entre : au doigt, `pointerdown`
 * bascule le panneau, `majActions` repose les boutons ailleurs, et le
 * `pointertap` qui suit tombe sur un AUTRE bouton — ou sur rien. La pose des
 * boutons et le test de touche doivent donc lire la même valeur, sans quoi
 * l'une des deux dérive en silence.
 */
export const POIGNEE_TACTILE = 26;

/** Le minimum d'Apple pour une cible tactile, en points. */
const TOUCHE_MINI = 44;

/** Ce que la pose des boutons doit connaître de l'écran. */
export interface CadreActions {
  /** largeur totale de la scène */
  largeur: number;
  /** hauteur du panneau d'actions, tel qu'il est posé au bas de la scène */
  panneauBas: number;
  /** largeur du panneau latéral gauche (0 en compact) */
  gauche: number;
  /** largeur du panneau latéral droit (0 en compact) */
  droite: number;
  /** disposition téléphone : panneau rétractable, poignée en haut */
  compact: boolean;
  /** le panneau est-il rétracté ? */
  replie: boolean;
  /** nombre de boutons à poser */
  nombre: number;
}

/** Un bouton, dans le repère du panneau d'actions. */
export interface RectangleBouton {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface PoseBoutons {
  readonly rectangles: readonly RectangleBouton[];
  /** hauteur de la bande de poignée réservée en haut du panneau */
  readonly zonePoignee: number;
}

/**
 * Pose la rangée de boutons. Le contrat, vérifié par `actions.test.ts` :
 * chaque rectangle tient entièrement dans l'écran, sous la poignée, dans le
 * panneau, et ne descend jamais sous 44 points de côté.
 */
export function poserBoutonsActions(c: CadreActions): PoseBoutons {
  const n = Math.max(0, Math.round(c.nombre));
  const zonePoignee = c.compact ? POIGNEE_TACTILE : 0;
  if (n === 0) return { rectangles: [], zonePoignee };

  /*
   * La largeur d'un bouton se DÉDUIT de la place, elle ne se décrète pas.
   * L'ancienne pose partait d'un plancher — `Math.max(56, …)` — sans jamais
   * vérifier que la rangée entrait dans l'écran : six boutons de 56 points
   * séparés de 8 mesurent 384 points, soit neuf de trop sur un iPhone SE et
   * vingt-quatre de trop sur un petit Android. Le sixième bouton sortait par
   * la droite. La largeur descend maintenant jusqu'au minimum tactile plutôt
   * que de déborder.
   */
  const ecart = 8;
  const bord = c.compact ? 8 : 20;
  const gauche = c.gauche + bord;
  const droite = c.droite + bord;
  const bande = Math.max(TOUCHE_MINI, c.largeur - gauche - droite);
  const dispo = Math.min(bande, c.compact ? 420 : 760);
  const bw = Math.max(1, Math.floor((dispo - ecart * (n - 1)) / n));
  const total = n * bw + ecart * (n - 1);
  const debutX = gauche + (c.largeur - gauche - droite - total) / 2;

  /*
   * Verticalement, le panneau rétracté doit loger DEUX choses : la bande de
   * bascule en haut, et la rangée sous elle. Les boutons étaient posés à
   * `y = 16`, en plein dans les 26 points de la bascule : les dix points
   * supérieurs de chaque bouton repliaient le panneau au `pointerdown` et le
   * `pointertap` suivant tombait sur un bouton qui avait déjà bougé.
   */
  const hautMini = c.compact && c.replie ? zonePoignee + 4 : 8;
  const basMarge = c.compact && !c.replie ? 12 : 6;
  const bh = Math.max(1, Math.min(52, c.panneauBas - hautMini - basMarge));
  const y =
    c.compact && !c.replie
      ? c.panneauBas - bh - basMarge
      : c.compact
        ? hautMini
        : (c.panneauBas - bh) / 2;

  const rectangles: RectangleBouton[] = [];
  for (let i = 0; i < n; i += 1) {
    rectangles.push({ x: Math.round(debutX + i * (bw + ecart)), y: Math.round(y), w: bw, h: bh });
  }
  return { rectangles, zonePoignee };
}
