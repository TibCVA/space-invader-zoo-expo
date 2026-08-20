import { describe, expect, it } from 'vitest';

import { CADRAGE_DEMO, cadrageInitial } from './vues.js';
import { etatDemo } from '../state/demo.js';

/**
 * OÙ LA CAMÉRA S'OUVRE QUAND ON ENTRE DANS UNE PARTIE.
 *
 * **Le défaut, signalé par le propriétaire sur le site en production :** « la
 * dernière version n'affiche rien à l'écran sur la carte ». Reproduit deux
 * fois, sur bureau et sur iPhone, dans une vraie partie à deux bannières servie
 * par le vrai binaire du serveur : la carte s'ouvrait cadrée sur la Maison du
 * Trésor — colonne 64, ligne 50 — c'est-à-dire à quarante cases du départ
 * d'Arconsat, en plein territoire JAMAIS EXPLORÉ. Le brouillard de guerre y est
 * complet, donc l'écran rendait un aplat bleu nuit. Rien n'était cassé : on
 * regardait un endroit que le joueur n'a pas le droit de voir.
 *
 * La cause tenait au nom de la constante. `CADRAGE_DEMO` était passée en
 * `focus` sans condition, à la démonstration comme à la partie ; la légende
 * elle-même annonçait « caméra cadrée sur la Maison du Trésor » dans une vraie
 * partie, et personne ne l'avait lue comme un aveu.
 */
describe('le cadrage initial de la carte', () => {
  it("s'ouvre sur le héros du joueur, et non sur la Maison du Trésor", () => {
    const game = etatDemo();
    const joueur = game.players.P1;
    expect(joueur, 'la partie de démonstration a perdu sa bannière P1').toBeDefined();
    const premier = joueur.heroes[0];
    expect(premier, 'P1 n’a aucun héros : le décor du test a changé').toBeDefined();
    const heros = game.heroes[premier];
    expect(heros).toBeDefined();

    const vu = cadrageInitial(game, 'P1', false);
    expect(vu).toEqual(heros.at);
    /* Et c'est bien AILLEURS que le cadrage de démonstration : sans cette
       ligne, le test passerait par accident le jour où un héros naîtrait sur la
       Maison du Trésor. */
    expect(vu).not.toEqual(CADRAGE_DEMO);
  });

  it('garde la Maison du Trésor pour la démonstration', () => {
    /* La revue visuelle cadre volontairement au centre du pays : c'est là que
       le décor est le plus dense, et il n'y a pas de brouillard. */
    expect(cadrageInitial(etatDemo(), 'P1', true)).toEqual(CADRAGE_DEMO);
  });

  it("retombe sur la Maison du Trésor plutôt que de n'avoir aucun cadrage", () => {
    /* Une partie sans bannière locale — un spectateur, un état à moitié chargé
       — ne doit pas rendre une caméra indéfinie : le sprite du terrain se
       poserait à `NaN` et l'écran serait vraiment vide. */
    expect(cadrageInitial(null, null, false)).toEqual(CADRAGE_DEMO);
    expect(cadrageInitial(etatDemo(), null, false)).toEqual(CADRAGE_DEMO);
  });

  it('se rabat sur une cité si la bannière n’a plus de héros', () => {
    /*
     * Un joueur qui vient de perdre son dernier héros garde ses cités : la
     * caméra doit s'ouvrir sur l'une d'elles, jamais à quarante cases de là.
     */
    const game = etatDemo();
    const joueur = game.players.P1;
    const sansHeros = {
      ...game,
      players: { ...game.players, P1: { ...joueur, heroes: [] } },
    };
    const premiereCite = game.towns[joueur.towns[0]];
    expect(premiereCite, 'P1 n’a aucune cité : le décor du test a changé').toBeDefined();
    expect(cadrageInitial(sansHeros, 'P1', false)).toEqual(premiereCite.at);
  });
});
