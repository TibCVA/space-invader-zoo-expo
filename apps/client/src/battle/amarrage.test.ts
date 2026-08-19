/**
 * La carte d'aperçu ne recouvre jamais la barre d'actions.
 *
 * C'était le défaut bloquant du combat sur iPhone, relevé par l'audit puis
 * confirmé par capture : la carte d'attaque, amarrée au bas de l'écran,
 * mangeait les six boutons d'action — un bouton dépassait derrière elle, les
 * cinq autres avaient disparu. Un combat dont on ne peut plus toucher les
 * actions n'est pas jouable.
 *
 * La faute tenait à une borne posée du mauvais côté : la carte était placée
 * à `bas − hauteur`, bornée **par le haut** à la barre d'initiative. Dès
 * qu'elle dépassait la bande disponible, la borne du haut gagnait et le bas
 * débordait sur les actions.
 *
 * Le test balaie les tailles d'écran réelles et toutes les hauteurs de carte
 * de zéro à deux fois l'écran : l'invariant doit tenir partout, y compris
 * dans les cas absurdes où la carte est plus grande que le téléphone.
 */
import { describe, expect, it } from 'vitest';
import { poserCarteAmarree, type CadreAmarrage } from './amarrage.js';

/** Écrans réels : iPhone SE, iPhone 14, iPhone 14 Pro Max, petit Android. */
const ECRANS: readonly { nom: string; largeur: number; hauteur: number }[] = [
  { nom: 'iPhone SE', largeur: 375, hauteur: 667 },
  { nom: 'iPhone 14', largeur: 390, hauteur: 844 },
  { nom: 'iPhone 14 Pro Max', largeur: 430, hauteur: 932 },
  { nom: 'petit Android', largeur: 360, hauteur: 640 },
];

/** Hauteurs de panneau bas possibles : rétracté (74) et déployé (jusqu'à 320). */
const PANNEAUX: readonly number[] = [74, 160, 240, 320];

function cadre(
  e: { largeur: number; hauteur: number },
  panneauBas: number,
  hauteurCarte: number,
  repliee: boolean,
): CadreAmarrage {
  return {
    hauteur: e.hauteur,
    largeur: e.largeur,
    barre: 68,
    panneauBas,
    largeurCarte: 320,
    hauteurCarte,
    entete: 46,
    repliee,
  };
}

describe('amarrage de la carte d’aperçu', () => {
  it('ne mord jamais sur la barre d’actions, quelle que soit la carte', () => {
    for (const e of ECRANS) {
      for (const panneauBas of PANNEAUX) {
        for (let h = 0; h <= e.hauteur * 2; h += 37) {
          for (const repliee of [false, true]) {
            const c = cadre(e, panneauBas, h, repliee);
            const pose = poserCarteAmarree(c);
            const hautDesActions = e.hauteur - panneauBas;
            expect(
              pose.y + pose.hauteurVisible,
              `${e.nom} · panneau ${String(panneauBas)} · carte ${String(h)} · ${repliee ? 'repliée' : 'dépliée'}`,
            ).toBeLessThanOrEqual(hautDesActions);
          }
        }
      }
    }
  });

  it('ne passe jamais sous la barre d’initiative non plus', () => {
    for (const e of ECRANS) {
      for (const panneauBas of PANNEAUX) {
        for (let h = 0; h <= e.hauteur * 2; h += 53) {
          const pose = poserCarteAmarree(cadre(e, panneauBas, h, false));
          expect(pose.y, `${e.nom} · carte ${String(h)}`).toBeGreaterThanOrEqual(68);
        }
      }
    }
  });

  it('montre la carte entière quand la place suffit, et le dit quand elle rogne', () => {
    const e = ECRANS[1];
    const petite = poserCarteAmarree(cadre(e, 74, 200, false));
    expect(petite.hauteurVisible).toBe(200);
    expect(petite.rognee).toBe(false);

    const enorme = poserCarteAmarree(cadre(e, 320, 900, false));
    expect(enorme.rognee).toBe(true);
    expect(enorme.hauteurVisible).toBeLessThan(900);
    expect(enorme.hauteurVisible).toBeGreaterThan(0);
  });

  it('reste centrée horizontalement et dans l’écran', () => {
    for (const e of ECRANS) {
      const pose = poserCarteAmarree(cadre(e, 74, 240, false));
      expect(pose.x).toBeGreaterThanOrEqual(0);
      const largeurUtile = Math.min(320, e.largeur - 16);
      expect(pose.x + largeurUtile).toBeLessThanOrEqual(e.largeur);
    }
  });

  it('rétractée, elle ne montre que sa coiffe', () => {
    const e = ECRANS[1];
    const pose = poserCarteAmarree(cadre(e, 74, 600, true));
    expect(pose.hauteurVisible).toBe(46);
  });
});
