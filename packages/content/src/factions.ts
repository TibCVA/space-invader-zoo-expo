/**
 * Les deux maisons du Forez.
 *
 * Aucune n'est « bonne » ni « mauvaise » (document maître §2.2) : la
 * Châtellenie apporte routes, marchés et justice au prix de l'autorité et de
 * la fiscalité ; l'Ermitage protège les sources et les futaies au prix de
 * l'isolement et de la défiance envers le commerce.
 *
 * Les couleurs proviennent de la bible artistique §2 : aucun `#FFF`, aucun
 * `#000`, uniquement des teintes de la palette validée.
 */
import type { FactionDef, FactionId } from '@auvergne/engine';

export const GRANIT: FactionDef = {
  id: 'granit',
  name: 'Châtellenie de Granit',
  motto: 'La pierre tient, la parole tient.',
  description:
    "Féodale, marchande, militaire et architecturée. La Châtellenie croit qu'un pays se gouverne par des chartes écrites, des poids étalonnés et des murs bien assis. Ses arbalétriers tiennent les portes, ses bannerets tiennent les routes, ses gabelous tiennent les comptes. On lui reproche de confondre parfois l'ordre et la contrainte, et de faire payer la sûreté plus cher qu'elle ne vaut.",
  colors: {
    primary: '#6E1F2A',
    secondary: '#C9A227',
    accent: '#414A52',
    stone: '#2A2C2F',
    light: '#EDE3CE',
  },
  capitalName: 'Châtellenie de Granit',
  mechanic: {
    name: 'Serment de Pierre',
    description:
      "Deux piles alliées placées côte à côte peuvent jurer la ligne : +2 en défense, ripostes majorées d'un dixième et immunité au premier déplacement forcé, mais −1 en vitesse tant que la formation tient. Tenir ou manœuvrer : il faut choisir.",
  },
  startingResources: {
    ecus: 12000,
    bois: 20,
    granit: 20,
    fer: 12,
    sel: 10,
    essence: 5,
    filDor: 7,
  },
};

export const ERMITAGE: FactionDef = {
  id: 'ermitage',
  name: 'Ermitage des Bois Noirs',
  motto: 'La forêt se souvient.',
  description:
    "Sylvestre, monastique, mystique et mobile. L'Ermitage tient que le pays ne se gouverne pas : il s'écoute. Ses veneurs connaissent des layons que nulle charte n'a jamais notés, ses prieures entretiennent les sources consacrées, ses colosses dorment sous la mousse jusqu'à ce qu'on les réveille. On lui reproche sa méfiance du commerce, ses silences et son goût des vieux pactes que plus personne ne sait lire.",
  colors: {
    primary: '#1B3A2B',
    secondary: '#4E8977',
    accent: '#7C8F6B',
    stone: '#2A2C2F',
    light: '#CFC6B4',
  },
  capitalName: 'Ermitage des Bois Noirs',
  mechanic: {
    name: 'Mémoire de la Forêt',
    description:
      "La faction lit le terrain : en futaie elle marche vite et se dissimule, près d'une source elle récupère du mana, en hauteur elle voit plus loin, dans la brume elle gagne initiative et attaques de flanc, sur le rocher ses colosses deviennent inébranlables.",
  },
  startingResources: {
    ecus: 11000,
    bois: 26,
    granit: 14,
    fer: 7,
    sel: 7,
    essence: 14,
    filDor: 3,
  },
};

export const FACTIONS: Readonly<Record<FactionId, FactionDef>> = {
  granit: GRANIT,
  ermitage: ERMITAGE,
};

/** Identifiants de faction, dans l'ordre canonique d'affichage. */
export const FACTION_IDS: readonly FactionId[] = ['granit', 'ermitage'];
