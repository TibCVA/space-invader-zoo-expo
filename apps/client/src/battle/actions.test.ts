/**
 * LA BARRE DES SIX ACTIONS DOIT ÊTRE ENTIÈREMENT TOUCHABLE SUR UN IPHONE.
 *
 * L'audit l'avait relevé comme le défaut bloquant du combat au doigt, et la
 * capture le confirmait : sur `combat--iphone.png`, AUCUN des six boutons
 * n'était visible. Le correctif annoncé au `plan.md` ne corrigeait rien —
 * il posait la réserve de la barre de pouce en `padding-bottom` sur
 * `.jeu-scene`, alors que `.jeu-scene__toile` est `position:absolute;
 * inset:0` : le bloc conteneur d'un élément absolument positionné EST la
 * boîte de rembourrage, padding compris. `inset:0` s'étalait donc par-dessus
 * la réserve et la toile continuait de courir sous la barre d'or.
 * Ce versant-là est gardé par `pouce.test.ts`, qui mesure la feuille de style.
 *
 * Ici on garde le versant géométrie, et deux défauts mesurés sur la pose :
 *
 *  1. DÉBORDEMENT LATÉRAL. `bw = Math.max(56, …)` posait un plancher de 56
 *     points par bouton sans jamais vérifier que six boutons de 56 tenaient
 *     dans l'écran. Sur iPhone SE (375) la rangée mesurait 384 points, sur un
 *     petit Android (360) elle en mesurait toujours 384 : le sixième bouton —
 *     « Résoudre » — sortait de l'écran par la droite.
 *
 *  2. LA POIGNÉE MANGEAIT LE HAUT DES BOUTONS. Panneau rétracté, les boutons
 *     étaient posés à `y = 16` alors que la bande de bascule du panneau
 *     occupe les 26 premiers points. Les dix points supérieurs de CHAQUE
 *     bouton repliaient donc le panneau au `pointerdown`, ce qui reposait
 *     les boutons ailleurs, et le `pointertap` suivant tombait à côté.
 *
 * Le gabarit n'est pas recopié : il vient de `gabarit()`, celui-là même que
 * la vue utilise au redimensionnement.
 */
import { describe, expect, it } from 'vitest';
import { poserBoutonsActions, type CadreActions } from './amarrage.js';
import { gabarit } from './index.js';

/**
 * Écrans réels. Les hauteurs sont celles de la SCÈNE, barre de pouce déjà
 * retranchée : c'est ce que la toile Pixi reçoit une fois la feuille de style
 * correcte. On garde aussi la hauteur pleine, pour vérifier que la pose ne
 * dépend pas d'une taille d'écran particulière.
 */
const ECRANS: readonly { nom: string; largeur: number; hauteur: number }[] = [
  { nom: 'iPhone 14 · portrait', largeur: 390, hauteur: 844 },
  { nom: 'iPhone 14 · scène', largeur: 390, hauteur: 700 },
  { nom: 'iPhone SE · portrait', largeur: 375, hauteur: 667 },
  { nom: 'iPhone SE · scène', largeur: 375, hauteur: 540 },
  { nom: 'petit Android', largeur: 360, hauteur: 640 },
  { nom: 'bureau', largeur: 1440, hauteur: 900 },
];

/**
 * Six actions au maximum : Attaquer, Capacité, Grimoire, Défendre, Attendre,
 * Résoudre. On balaie de une à six, la barre en montre moins selon l'état.
 */
const ACTIONS_MAX = 6;

/** Le minimum d'Apple pour une cible tactile, en points. */
const TOUCHE_MINI = 44;

function cadres(): { nom: string; c: CadreActions; hauteur: number }[] {
  const out: { nom: string; c: CadreActions; hauteur: number }[] = [];
  for (const e of ECRANS) {
    const plan = gabarit(e.largeur, e.hauteur);
    for (const replie of [true, false]) {
      /* Déplié, le panneau prend la hauteur que la vue lui donne. */
      const panneauBas = plan.compact
        ? replie
          ? plan.bas
          : Math.min(e.hauteur * 0.52, 320)
        : plan.bas;
      for (let n = 1; n <= ACTIONS_MAX; n += 1) {
        out.push({
          nom: `${e.nom} · ${replie ? 'replié' : 'déplié'} · ${String(n)} boutons`,
          hauteur: e.hauteur,
          c: {
            largeur: e.largeur,
            panneauBas,
            gauche: plan.gauche,
            droite: plan.droite,
            compact: plan.compact,
            replie,
            nombre: n,
          },
        });
      }
    }
  }
  return out;
}

describe('barre d’actions du combat', () => {
  it('ne sort jamais de l’écran par les côtés', () => {
    for (const { nom, c } of cadres()) {
      const pose = poserBoutonsActions(c);
      for (const [i, r] of pose.rectangles.entries()) {
        expect(r.x, `${nom} · bouton ${String(i)} · bord gauche`).toBeGreaterThanOrEqual(0);
        expect(r.x + r.w, `${nom} · bouton ${String(i)} · bord droit`).toBeLessThanOrEqual(
          c.largeur,
        );
      }
    }
  });

  it('tient entièrement dans le panneau, donc dans la scène', () => {
    for (const { nom, c, hauteur } of cadres()) {
      const pose = poserBoutonsActions(c);
      const hautDuPanneau = hauteur - c.panneauBas;
      for (const [i, r] of pose.rectangles.entries()) {
        expect(r.y, `${nom} · bouton ${String(i)} · haut`).toBeGreaterThanOrEqual(0);
        expect(r.y + r.h, `${nom} · bouton ${String(i)} · bas`).toBeLessThanOrEqual(c.panneauBas);
        /* le même invariant, dit en coordonnées écran */
        expect(
          hautDuPanneau + r.y + r.h,
          `${nom} · bouton ${String(i)} · bas d’écran`,
        ).toBeLessThanOrEqual(hauteur);
      }
    }
  });

  it('laisse la bande de bascule du panneau libre de tout bouton', () => {
    for (const { nom, c } of cadres()) {
      const pose = poserBoutonsActions(c);
      if (c.compact) {
        /* Littéral voulu : une bande de bascule plus courte que 26 points
           redeviendrait intouchable au pouce. */
        expect(pose.zonePoignee, `${nom} · bande de bascule`).toBeGreaterThanOrEqual(26);
      }
      for (const [i, r] of pose.rectangles.entries()) {
        expect(r.y, `${nom} · bouton ${String(i)} sous la poignée`).toBeGreaterThanOrEqual(
          pose.zonePoignee,
        );
      }
    }
  });

  it('garde des cibles tactiles d’au moins 44 points', () => {
    for (const { nom, c } of cadres()) {
      for (const [i, r] of poserBoutonsActions(c).rectangles.entries()) {
        expect(r.w, `${nom} · bouton ${String(i)} · largeur`).toBeGreaterThanOrEqual(TOUCHE_MINI);
        expect(r.h, `${nom} · bouton ${String(i)} · hauteur`).toBeGreaterThanOrEqual(TOUCHE_MINI);
      }
    }
  });

  it('ne fait pas se chevaucher deux boutons voisins', () => {
    for (const { nom, c } of cadres()) {
      const r = poserBoutonsActions(c).rectangles;
      for (let i = 1; i < r.length; i += 1) {
        expect(r[i].x, `${nom} · boutons ${String(i - 1)} et ${String(i)}`).toBeGreaterThanOrEqual(
          r[i - 1].x + r[i - 1].w,
        );
      }
    }
  });

  it('aligne les boutons sur une seule rangée, à la même hauteur', () => {
    for (const { nom, c } of cadres()) {
      const r = poserBoutonsActions(c).rectangles;
      for (const b of r) {
        expect(b.y, nom).toBe(r[0].y);
        expect(b.h, nom).toBe(r[0].h);
        expect(b.w, nom).toBe(r[0].w);
      }
    }
  });
});
