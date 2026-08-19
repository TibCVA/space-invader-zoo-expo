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
