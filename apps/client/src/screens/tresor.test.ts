/**
 * LE REVENU QUE LA BARRE DU TRÉSOR AFFICHE.
 *
 * La barre a une seule ligne d'arithmétique, et c'est celle qui peut mentir :
 * `playerIncomeOf` rend le revenu BRUT. L'écran du royaume peut se le
 * permettre, il montre l'entretien juste à côté sur sa propre ligne. La barre
 * du bandeau n'a pas cette place — un joueur qui lit « +15 » à côté de son or
 * alors qu'il paie 20 d'entretien par jour se retrouve en dette sans avoir vu
 * venir.
 *
 * Ces tests ne lisent AUCUNE constante de `tresor.tsx` : ils construisent une
 * partie, mesurent le brut et l'entretien avec le moteur, et exigent que la
 * barre affiche la différence. Un test qui recopie la formule qu'il garde
 * descend avec elle.
 */
import { describe, expect, it } from 'vitest';
import { createGame, playerIncomeOf, upkeepOf, RESOURCE_KEYS } from '@auvergne/engine';
import type { GameState, PlayerId } from '@auvergne/engine';
import { buildWorld } from '@auvergne/map';
import { setupDemo } from '../state/demo.js';
import { revenuNet } from './tresor.js';

/**
 * Une vraie partie sur la vraie carte, montée par le moteur.
 *
 * On passe par `setupDemo()` et `createGame` — le baril public — plutôt que
 * par les fabriques de test du moteur : celles-ci ne sont pas exportées, et
 * `vitest.config.ts` n'ouvre volontairement qu'un seul chemin profond.
 */
function partie(): { game: GameState; joueur: PlayerId } {
  const setup = setupDemo();
  return { game: createGame(setup, buildWorld(setup.seed)), joueur: 'P1' };
}

/**
 * Donne au joueur un gisement de chaque ressource autre que les écus.
 *
 * **Sans cela le test le plus important ne teste rien**, et il a fallu le
 * mettre en échec pour s'en apercevoir : au premier jour, le revenu brut d'une
 * bannière vaut exactement `{ ecus: 1000 }` — les cités rendent de l'or, et
 * aucun gisement n'est encore pris. « Le bois ne bouge pas » comparait alors
 * zéro à zéro, et une version fautive qui retranchait l'entretien de TOUTES
 * les ressources passait au vert.
 */
function donnerUnGisementDeChaque(game: GameState, joueur: PlayerId): Set<string> {
  const servies = new Set<string>();
  for (const obj of Object.values(game.objects)) {
    if (obj.kind !== 'mine') continue;
    const r = String((obj.data as Record<string, unknown>).resource);
    if (r === 'ecus' || servies.has(r)) continue;
    obj.owner = joueur;
    servies.add(r);
  }
  return servies;
}

/**
 * Grossit l'armée jusqu'à ce qu'elle coûte quelque chose, et rend ce coût.
 *
 * Au premier jour l'entretien vaut ZÉRO : le moteur laisse une puissance
 * franche avant de facturer quoi que ce soit. Un test qui vérifie une
 * soustraction sur une valeur nulle ne vérifie rien. On grossit donc, et on
 * s'arrête dès que le MOTEUR dit que ça coûte — plutôt que de recopier ici un
 * facteur choisi à la main, qui deviendrait faux le jour où le seuil bouge.
 */
function faireCouterLEntretien(game: GameState, joueur: PlayerId): number {
  for (let essai = 0; essai < 20; essai += 1) {
    const cout = upkeepOf(game, joueur);
    if (cout > 0) return cout;
    for (const uid of game.players[joueur].heroes) {
      for (const pile of game.heroes[uid].army) {
        if (pile) pile.count *= 2;
      }
    }
  }
  return upkeepOf(game, joueur);
}

describe('le revenu affiché par la barre du trésor', () => {
  it('déduit l’entretien des écus, et de rien d’autre', () => {
    const { game, joueur } = partie();
    const servies = donnerUnGisementDeChaque(game, joueur);
    faireCouterLEntretien(game, joueur);
    const brut = playerIncomeOf(game, joueur);
    const entretien = upkeepOf(game, joueur);
    const net = revenuNet(game, joueur);

    /* Le garde-fou du garde-fou : si le revenu brut ne portait que des écus,
       les comparaisons ci-dessous seraient toutes des « 0 vaut 0 ». */
    expect(entretien, 'une armée de départ doit coûter quelque chose').toBeGreaterThan(0);
    for (const k of RESOURCE_KEYS) {
      if (k === 'ecus') continue;
      expect(servies.has(k), `la carte doit porter un gisement de ${k}`).toBe(true);
      expect(brut[k] ?? 0, `le revenu brut doit porter du ${k}`).toBeGreaterThan(0);
    }

    expect(net.ecus ?? 0).toBe((brut.ecus ?? 0) - entretien);
    for (const k of RESOURCE_KEYS) {
      if (k === 'ecus') continue;
      expect(net[k] ?? 0, `${k} ne doit pas bouger`).toBe(brut[k] ?? 0);
    }
  });

  it('ne cache jamais une dette : entretien plus lourd que le revenu ⇒ nombre négatif', () => {
    const { game, joueur } = partie();
    const brut = playerIncomeOf(game, joueur);
    /*
     * On force l'entretien en gonflant l'armée du héros, plutôt qu'en
     * bricolant la fonction : c'est bien la vraie chaîne du moteur qu'on
     * veut voir répercutée.
     */
    const uid = game.players[joueur].heroes[0];
    const heros = game.heroes[uid];
    expect(heros, 'la bannière doit avoir un héros au départ').toBeTruthy();
    for (const pile of heros.army) {
      if (pile) pile.count *= 5000;
    }

    const entretien = upkeepOf(game, joueur);
    expect(entretien, "l'armée gonflée doit coûter plus que le revenu").toBeGreaterThan(
      brut.ecus ?? 0,
    );
    expect(revenuNet(game, joueur).ecus ?? 0).toBeLessThan(0);
  });

  it('rend le brut tel quel quand rien n’est entretenu', () => {
    const { game, joueur } = partie();
    const uid = game.players[joueur].heroes[0];
    game.heroes[uid].army = game.heroes[uid].army.map(() => null);
    expect(upkeepOf(game, joueur)).toBe(0);
    expect(revenuNet(game, joueur)).toEqual(playerIncomeOf(game, joueur));
  });
});
