/**
 * LA NAVIGATION DANS LA CITÉ : Y ENTRER, Y AGIR, EN RESSORTIR.
 *
 * Plainte du propriétaire, sur PC : « la navigation entre bâtiments et sortie
 * et recrutement est pas fluide ». Trois défauts distincts se cachaient
 * derrière cette phrase, et l'épreuve de bout en bout (`tools/e2e-solo.mjs`)
 * les a tous les trois mis au jour en cliquant là où il clique :
 *
 *  1. **la sortie disparaissait.** Le panneau de commandes remplace la barre
 *     où vit « Quitter la cité ». Une fois dedans, ressortir demandait de
 *     fermer d'abord, puis de viser un second bouton. L'épreuve a cherché la
 *     sortie pendant vingt secondes sans la trouver, sur les deux appareils ;
 *  2. **la ligne de recrue s'effondrait sur un téléphone.** Un seul rang
 *     souple : vignette, texte, compteur, bouton. Sur 390 points il restait
 *     une centaine de pixels au texte, et « 0 disponible · 55 écus l'unité »
 *     s'y empilait un mot par ligne — six cents pixels de haut pour UNE
 *     recrue, quand tout l'objet de l'écran est d'en comparer deux ;
 *  3. **« Fin du tour » tombait au milieu du panneau.** Elle vit à la racine
 *     de l'application, en `fixed`, au rang de collage. Sur un écran large
 *     elle est à gauche et le panneau à droite ; sur 390 points le panneau
 *     prend toute la largeur, et la commande lui passait par-dessus, sur une
 *     ligne de recrue.
 *
 * Ces gardes lisent la feuille et le composant. Elles ne remplacent pas
 * l'épreuve au clic — c'est elle qui a trouvé les défauts, et elle seule qui
 * prouve qu'un bouton répond. Elles empêchent qu'on les réintroduise sans
 * s'en apercevoir, ce qui est un autre métier.
 */
import { describe, expect, it } from 'vitest';
/* La feuille se lit sur le disque : Vitest remplace tout import de `.css` par
   un module vide, `?raw` compris. `node:fs` n'est pas dans les types du
   client — le `tsconfig` s'y limite à `vite/client` —, d'où l'exception. */
// @ts-expect-error — types Node absents du tsconfig du client, cf. ci-dessus
import { readFileSync } from 'node:fs';

const CSS: string = String(readFileSync(new URL('./screens.css', import.meta.url), 'utf8'));
/**
 * Le code d'un fichier, SES COMMENTAIRES RETIRÉS.
 *
 * Sans cela, une garde se laisse berner par sa propre documentation : la
 * première version cherchait « Quitter la cité » dans le panneau, et le
 * trouvait dans le commentaire qui explique pourquoi le bouton existe. Retirer
 * le bouton laissait donc la garde verte — un faux vert exemplaire, attrapé en
 * éprouvant la garde plutôt qu'en la relisant.
 */
function code(chemin: string): string {
  return String(readFileSync(new URL(chemin, import.meta.url), 'utf8'))
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, '')
    .replace(/^\s*\/\/.*$/gm, '');
}

const PANNEAU: string = code('./cite-commandes.tsx');
const VUES: string = code('./vues.tsx');

/** Le corps d'une règle, commentaires retirés — ils parlent de ce qu'on teste. */
function regle(selecteur: string, source = CSS): string {
  const sans = source.replace(/\/\*[\s\S]*?\*\//g, '');
  const i = sans.indexOf(`${selecteur} {`);
  if (i < 0) return '';
  return sans.slice(i, sans.indexOf('}', i));
}

describe('navigation dans la cité', () => {
  it('on peut quitter la cité SANS refermer le panneau', () => {
    /* Le panneau porte ses deux issues, et la vue les branche. On exige les
       BOUTONS eux-mêmes, pas la mention du mot : le code est lu sans ses
       commentaires, et le rappel doit être appelé, pas seulement déclaré. */
    expect(PANNEAU).toMatch(/onClick=\{onQuitter\}/);
    expect(PANNEAU).toMatch(/onClick=\{onQuitter\}>\s*Quitter la cité/);
    expect(PANNEAU).toMatch(/onClick=\{onFermer\}>\s*Fermer/);
    expect(VUES).toContain('onQuitter={');
  });

  it('la sortie du panneau mène bien à la carte', () => {
    /* Deux sorties dans la vue : celle de la barre et celle du panneau. Toutes
       deux vers la partie — une sortie qui ne sort pas n'est pas une sortie. */
    const sorties = VUES.match(/onQuitter=\{\(\): void => navigate\(\{ name: 'partie' \}\)\}/g) ?? [];
    expect(sorties.length).toBe(1);
  });

  it('sur un téléphone, la prise descend d’un rang au lieu d’écraser le texte', () => {
    const ligne = regle('.cite-cmd__ligne');
    expect(ligne).toContain('display: grid');
    /* Deux rangs nommés : le texte garde toute la largeur restante. */
    expect(ligne).toContain("'vignette texte'");
    expect(ligne).toContain("'prise    prise'");
    /* `minmax(0, 1fr)` et non `1fr` : sans le zéro, une colonne de grille ne
       descend jamais sous la taille de son contenu et déborde au lieu de
       replier. C'est la faute classique, et elle rendrait la règle inutile. */
    expect(ligne).toContain('minmax(0, 1fr)');
  });

  it('dès qu’il y a la place, la ligne redevient un seul rang', () => {
    const sans = CSS.replace(/\/\*[\s\S]*?\*\//g, '');
    const i = sans.indexOf('@media (min-width: 560px)');
    expect(i, 'aucune reprise en un rang').toBeGreaterThan(0);
    expect(sans.slice(i, i + 400)).toContain("'vignette texte prise'");
  });

  it('une ligne de bâtiment, qui n’a pas de vignette, tient sur un rang', () => {
    expect(PANNEAU).toContain('cite-cmd__ligne--bati');
    expect(regle('.cite-cmd__ligne--bati')).toContain("'texte prise'");
    /* Portée par le composant, pas déduite d'un `:has()` : la règle doit tenir
       sur le navigateur d'un cousin qui ne met pas son téléphone à jour. */
    expect(CSS).not.toMatch(/:has\([^)]*\)\s*\{/);
  });

  it('« Fin du tour » ne tombe plus au milieu du panneau', () => {
    /* La commande est au rang de collage ; le panneau doit passer devant. */
    expect(regle('.jeu-fin-tour')).toContain('z-index: var(--hmm-z-colle)');
    const panneau = regle('.cite-cmd');
    expect(panneau).toContain('z-index: calc(var(--hmm-z-colle) + 1)');
    /* L'ancienne valeur, explicitement interdite : `z-index: 3` passait sous
       la fin de tour et c'est exactement le défaut mesuré. */
    expect(panneau).not.toMatch(/z-index:\s*3\s*;/);
  });
});

/**
 * LA PASTILLE DE SAUVEGARDE NE DOIT PAS S'ASSEOIR SUR LE TRÉSOR.
 *
 * Trouvée en regardant une capture, pas en lisant le code. La pastille est en
 * position fixe en haut à droite, au rang des bulles — exactement là où le
 * bandeau range la barre des sept ressources dès 720 points. Mesuré en
 * 1440 × 900 : les deux dernières ressources disparaissaient dessous.
 *
 * Le piège de diagnostic mérite d'être noté : la barre elle-même ne débordait
 * PAS — 478 pixels pour 478, ses sept ressources bien présentes. Chercher la
 * panne dans la barre n'aurait rien donné ; c'est la pastille qui passait
 * devant.
 */
describe('pastille de sauvegarde', () => {
  const APP: string = code('../App.tsx');

  it('le bandeau lui réserve sa place sur un écran large', () => {
    const sans = CSS.replace(/\/\*[\s\S]*?\*\//g, '');
    const i = sans.indexOf('.jeu-racine--enregistre .jeu-bandeau');
    expect(i, 'aucune réserve pour la pastille').toBeGreaterThan(0);
    expect(sans.slice(i, i + 160)).toContain('padding-right: var(--jeu-reserve-etat)');
    /* Sous 720 points la barre est sur sa propre ligne : la réserve n'a pas
       lieu d'être, et elle rognerait le titre. */
    const media = sans.lastIndexOf('@media (min-width: 720px)', i);
    expect(media, 'la réserve n’est pas bornée aux écrans larges').toBeGreaterThan(0);
    expect(media).toBeLessThan(i);
  });

  it('la réserve tient le plus long des cinq libellés', () => {
    const reserve = Number(/--jeu-reserve-etat:\s*(\d+)px/.exec(CSS)?.[1] ?? 0);
    /* Mesurés dans la vraie page : 142, 190, 144, 143 et 153 pixels. */
    expect(reserve).toBeGreaterThanOrEqual(190);
  });

  it('la réserve et la pastille apparaissent ENSEMBLE', () => {
    /* Deux conditions séparées finiraient par diverger, et le bandeau garderait
       son trou sur tous les écrans. Une seule vérité, lue deux fois. */
    expect(APP).toContain('const montrerSauvegarde =');
    expect((APP.match(/montrerSauvegarde/g) ?? []).length).toBe(3);
    expect(APP).toContain("'jeu-racine--enregistre'");
    /* L'ancienne condition en double, explicitement interdite. */
    expect((APP.match(/etat\.save\.status !== 'repos'/g) ?? []).length).toBe(1);
  });
});

/**
 * ÉCHAP — le réflexe d'annulation de HMM3 : la touche referme toujours ce qui
 * est au premier plan. Gardes de branchement, code lu SANS commentaires — la
 * leçon du faux vert de « Quitter la cité » (voir `code()` plus haut).
 */
describe('échap referme le premier plan', () => {
  it('le panneau de la cité écoute Échap et appelle onFermer', () => {
    expect(PANNEAU).toMatch(/e\.key !== 'Escape'/);
    expect(PANNEAU).toMatch(/onFermer\(\);/);
    expect(PANNEAU).toContain("window.addEventListener('keydown'");
  });

  it('sur la carte : le chemin en attente d’abord, la fiche ensuite', () => {
    const i = VUES.indexOf("e.key === 'Escape'");
    expect(i, 'aucun Échap sur la carte').toBeGreaterThan(0);
    const bloc = VUES.slice(i, i + 400);
    /* L'ordre EST la règle : annuler un chemin sans fermer la fiche qu'on
       lit, puis fermer la fiche au coup suivant. */
    expect(bloc.indexOf('annulerChemin()')).toBeGreaterThan(0);
    expect(bloc.indexOf('setCible(null)')).toBeGreaterThan(bloc.indexOf('annulerChemin()'));
  });
});
