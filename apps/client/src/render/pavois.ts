/**
 * `render/pavois.ts` — qui porte une bannière sur la carte, et laquelle.
 *
 * ## Pourquoi ce fichier existe
 *
 * La demande était : « il faut que l'on voit avec ses drapeaux de couleurs
 * visuellement les Assets types mines ou châteaux ou autres qui sont pris par
 * un joueur ». C'est le pavois de HMM3 : un gisement, une demeure, une cité
 * passés sous une bannière portent cette bannière, et un lieu resté neutre n'en
 * porte aucune. On lit la carte politique d'un coup d'œil, sans cliquer.
 *
 * `objects.ts` dessinait bien une bannière, mais **trois défauts la rendaient
 * inopérante**, tous mesurés sur `#/demo/carte` :
 *
 *  1. la règle du pavois n'existait pas : n'importe quel genre de lieu portant
 *     un `owner` recevait une bannière, y compris ceux que le moteur ne fait
 *     jamais changer de main (un coffre, un obélisque, une caravane). À
 *     l'inverse, un `sceau` dont le propriétaire n'est inscrit que dans
 *     `state.seals` — c'est le registre qui fait foi, `visitSeal` écrit dans les
 *     deux — restait nu si l'objet lui-même n'avait pas été recopié ;
 *  2. la texture n'était posée qu'**une fois**, à la première apparition
 *     (`if (!banniere.visible)`). Une mine qui change de main gardait donc les
 *     couleurs de son ancien maître jusqu'à ce qu'on la fasse sortir du cadre
 *     et revenir — c'est-à-dire précisément dans la situation où le
 *     renseignement compte le plus, juste après une prise ;
 *  3. sur une mine, la bannière et le jeton de ressource étaient posés au même
 *     endroit (`x + taille × 0,30`, à 0,20 case d'écart en hauteur) : ils se
 *     recouvraient.
 *
 * Ce module ne dessine rien. Il tient la **règle** — quels genres de lieu se
 * pavoisent, et sous quelle bannière — pour que le rendu de la carte et la
 * fiche d'inspection répondent la même chose.
 *
 * ## La liste des genres pavoisables n'est pas une opinion
 *
 * Elle est relevée sur `packages/engine/src/world/objects.ts`, seul endroit du
 * moteur qui écrive `obj.owner = hero.owner` : `visitMine`, `visitViewpoint`
 * (belvédère), `visitSeal`, `visitTreasury` (Maison du Trésor),
 * `visitSettlement` (cité et village) et `visitDemeure`. Six fonctions, sept
 * genres. Tout le reste — moulin compris, dont la roue se rend au premier passé
 * de la semaine et ne se possède pas, exactement comme le moulin de HMM3 ne
 * porte pas de drapeau — reste sans bannière.
 */

import type {
  GameState,
  MapObject,
  MapObjectKind,
  PlayerId,
  SealId,
  WorldMap,
} from '@auvergne/engine';

/**
 * Les genres de lieu qui peuvent passer sous une bannière.
 *
 * Relevé sur le moteur (voir l'en-tête). Ajouter un genre ici sans que le
 * moteur ne lui donne jamais de propriétaire dessinerait une bannière qui ne
 * peut pas apparaître ; l'oublier laisserait un lieu pris sans drapeau.
 */
export const PAVOISABLE: ReadonlySet<MapObjectKind> = new Set<MapObjectKind>([
  'ville',
  'village',
  'mine',
  'demeure',
  'belvedere',
  'sceau',
  'maison_tresor',
]);

/** Vrai si ce genre de lieu porte la bannière de son propriétaire. */
export function pavoise(kind: MapObjectKind): boolean {
  return PAVOISABLE.has(kind);
}

/**
 * La bannière que porte un lieu, ou `null` s'il est neutre.
 *
 * Trois sources, dans cet ordre — c'est l'ordre d'autorité du moteur :
 *
 *  1. `state.objects[uid].owner`, l'état vivant du lieu (le gabarit de
 *     `world.objects` n'est qu'un patron : il ne bouge jamais) ;
 *  2. pour une cité ou un village, le propriétaire de la **cité** liée par
 *     `data.townUid` — c'est `captureTown` qui le déplace, et l'objet de carte
 *     peut très bien ne pas avoir été touché (une cité prise par siège depuis
 *     l'écran de cité, par exemple) ;
 *  3. pour un sceau, le registre `state.seals`, qui fait foi pour la condition
 *     de victoire et que `visitSeal` tient à jour même quand l'objet n'est plus
 *     celui qu'on croit.
 */
export function proprietaireLieu(
  etat: GameState | null,
  objet: MapObject,
  pavoisDemo?: ReadonlyMap<string, PlayerId>,
): PlayerId | null {
  if (!pavoise(objet.kind)) return null;
  const vif = etat?.objects?.[objet.uid] ?? objet;
  if (vif.owner) return vif.owner;

  const townUid = vif.data?.townUid as string | undefined;
  if (townUid) {
    const cite = etat?.towns?.[townUid];
    if (cite?.owner) return cite.owner;
  }

  if (vif.kind === 'sceau') {
    const seal = vif.data?.seal as SealId | undefined;
    if (seal) {
      const tenu = etat?.seals?.[seal]?.owner ?? null;
      if (tenu) return tenu;
    }
  }

  /* Le pavois de démonstration ne parle qu'après le moteur, jamais à sa place. */
  return pavoisDemo?.get(objet.uid) ?? null;
}

/**
 * Rang héraldique d'une bannière, de 1 à 5.
 *
 * Les cinq gonfanons du jeu sont indexés par ce rang, dans `art/palette.ts`
 * comme dans les jetons du design system : `P3` porte l'or et le motif en
 * losanges partout où il paraît. Un identifiant inattendu retombe sur 1 plutôt
 * que de rendre `NaN`, qui produirait un drapeau blanc.
 */
export function rangBanniere(id: PlayerId): 1 | 2 | 3 | 4 | 5 {
  const n = Number.parseInt(String(id).replace(/^P/i, ''), 10);
  if (!Number.isFinite(n) || n < 1 || n > 5) return 1;
  return n as 1 | 2 | 3 | 4 | 5;
}

/* ═══════════════════ Pavois des routes de démonstration ═══════════════════ */

/**
 * Rayon d'influence d'une place tenue, en cases, pour le pavois de
 * démonstration. Trente-quatre cases, soit un peu plus de seize kilomètres à
 * l'échelle du Forez : de quoi montrer une frontière qui s'estompe, avec des
 * lieux pavoisés près des places et des lieux neutres au-delà. Un rayon infini
 * peindrait toute la carte en deux couleurs et l'on ne verrait plus jamais un
 * lieu neutre — c'est-à-dire plus la moitié de la démonstration demandée.
 */
export const RAYON_PAVOIS_DEMO = 34;

/**
 * Les genres que le pavois de démonstration se permet de planter.
 *
 * Sciemment plus étroit que `PAVOISABLE`. Une cité, un village, un sceau et la
 * Maison du Trésor possèdent chacun un **registre** que le moteur tient à part
 * — `state.towns`, `state.seals`, `state.claim` — et qu'une couleur d'affichage
 * contredirait : le drapeau annoncerait une place prise que la fiche, qui lit le
 * registre, déclarerait neutre. Restent les trois familles dont la propriété ne
 * vit que dans l'objet lui-même : gisements, demeures franches et belvédères.
 */
export const PAVOISABLE_DEMO: ReadonlySet<MapObjectKind> = new Set<MapObjectKind>([
  'mine',
  'demeure',
  'belvedere',
]);

/**
 * Quel lieu montre quelle bannière sur une route `#/demo/*`.
 *
 * ## Pourquoi cette fabrication existe
 *
 * `createGame` ouvre le **premier jour** d'une partie : aucun gisement n'a
 * encore changé de main. Mesuré sur `#/demo/carte` — graine 20250816, semaine 6,
 * jour 3 : **zéro** lieu possédé sur les quarante-cinq mines, trente-deux
 * demeures, quatre belvédères, cinq sceaux et quatre villages de la carte, et
 * une seule bannière dans tout le cadre photographié, celle de Cervières, cachée
 * derrière le jeton de Clotilde. La revue visuelle ne pouvait donc rien juger du
 * pavois.
 *
 * C'est le procédé déjà employé par `fogDemonstration` de `render/index.ts`, et
 * pour la même raison : **ouvrir la démonstration sans toucher à l'état du
 * moteur**. La table produite ne sert qu'à l'affichage et à la fiche, elle est
 * déterministe (deux exécutions donnent la même carte politique), et en partie
 * réelle elle n'est jamais construite.
 *
 * ## La règle
 *
 * Chaque lieu pavoisable encore neutre passe sous la bannière de la place ou du
 * héros **le plus proche**, s'il est à moins de `RAYON_PAVOIS_DEMO` cases. C'est
 * la carte politique qu'une semaine 6 produit d'elle-même : on tient ce qu'on
 * peut atteindre depuis chez soi.
 */
export function pavoisDemonstration(world: WorldMap, etat: GameState): Map<string, PlayerId> {
  const table = new Map<string, PlayerId>();

  const foyers: { player: PlayerId; col: number; row: number }[] = [];
  for (const id of (Object.keys(etat.players) as PlayerId[]).sort()) {
    const p = etat.players[id];
    if (!p || !p.alive) continue;
    for (const uid of p.towns) {
      const t = etat.towns[uid];
      if (t) foyers.push({ player: id, col: t.at.col, row: t.at.row });
    }
    for (const uid of p.heroes) {
      const h = etat.heroes[uid];
      if (h) foyers.push({ player: id, col: h.at.col, row: h.at.row });
    }
  }
  if (foyers.length === 0) return table;

  for (const objet of world.objects) {
    if (!PAVOISABLE_DEMO.has(objet.kind)) continue;
    /* Un lieu que le moteur a déjà donné à quelqu'un garde son maître. */
    if (proprietaireLieu(etat, objet)) continue;
    let meilleure = Number.POSITIVE_INFINITY;
    let qui: PlayerId | null = null;
    for (const f of foyers) {
      const d = Math.hypot(objet.at.col - f.col, objet.at.row - f.row);
      if (d < meilleure) {
        meilleure = d;
        qui = f.player;
      }
    }
    if (qui && meilleure <= RAYON_PAVOIS_DEMO) table.set(objet.uid, qui);
  }
  return table;
}
