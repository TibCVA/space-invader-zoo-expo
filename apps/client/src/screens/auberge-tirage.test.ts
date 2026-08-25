/**
 * LA PRÉVISION DE L'AUBERGE EST LE TIRAGE DU MOTEUR — séquence complète.
 *
 * Le défaut que cette garde fige, trouvé par l'épreuve au clic : le panneau
 * annonçait « lise », le moteur tirait « ines » et refusait l'engagement.
 * Même dé des deux côtés — mais DEUX implémentations homonymes de
 * `drawTavernOffers` : celle du repli (`core/fallback-world`, poids 10/40),
 * importée EN DUR par `apply.ts` ; celle du monde complet (`world/objects`,
 * poids 14/40 et verrou du héros neutre), servie par le baril public que lit
 * le client. Le tirage passe maintenant par la couture `worldModule()`, comme
 * `heroStats` et `visitObject`.
 *
 * La garde de `cite-offres.test.ts` engageait dès la création de partie et
 * passait AVANT le correctif : au premier tirage, les deux barèmes tombaient
 * par hasard sur les mêmes capitaines. Celle-ci rejoue la séquence de
 * l'épreuve — fin de tour, bâtir, recruter, PUIS engager — où les dés ont
 * assez tourné pour que les barèmes divergent, et c'est elle qui rougissait.
 */
import { beforeAll, expect, it } from 'vitest';
import { bootstrapEngine } from '@auvergne/game';
import { buildWorld } from '@auvergne/map';
import { applyCommand, createGame } from '@auvergne/engine';
import { HEROES } from '@auvergne/content';
import { setupDemo } from '../state/demo.js';
import { taverneDe } from './cite-offres.js';

/* Le moteur complet, comme dans l'application (`boot.ts:113`) : sans lui,
   `worldModule()` rend le REPLI — et c'est précisément la divergence
   repli/monde que cette garde fige. */
beforeAll(() => {
  bootstrapEngine();
});

it('après une vraie journée de jeu, le moteur engage le capitaine annoncé', () => {
  const setup = setupDemo();
  const world = buildWorld(setup.seed);
  let game = createGame(setup, world);
  const moi = game.activePlayer;

  const joue = (cmd: Parameters<typeof applyCommand>[1]): void => {
    const r = applyCommand(game, cmd, world);
    expect(r.ok, `${cmd.type} : ${r.error ?? ''}`).toBe(true);
    if (r.ok) game = r.state;
  };

  /* Une journée comme celle de l'épreuve : la main fait le tour, on bâtit,
     on recrute. Chaque geste consomme du dé — c'est ce qui sépare les deux
     barèmes et faisait mentir la prévision. */
  joue({ type: 'EndTurn' });
  let garde = 0;
  while (game.activePlayer !== moi && garde++ < 20) {
    const r = applyCommand(game, { type: 'EndTurn' }, world);
    if (!r.ok) break;
    game = r.state;
  }
  expect(game.activePlayer).toBe(moi);

  const cite = Object.values(game.towns).find((t) => t.owner === moi);
  expect(cite).toBeDefined();
  if (!cite) return;
  joue({ type: 'BuildInTown', town: cite.uid, building: 'palissade' as never });
  const dispo = Object.entries(cite.available).find(([, n]) => (n ?? 0) > 0);
  if (dispo) {
    joue({ type: 'RecruitCreatures', town: cite.uid, creature: dispo[0] as never, count: 1 });
  }

  /* La prévision du panneau, puis l'engagement : ils doivent coïncider. */
  const t = taverneDe(game, Object.values(game.towns).find((c) => c.owner === moi)!);
  expect(t.ouverte).toBe(true);
  expect(t.refus).toBeNull();
  expect(t.offres.length).toBeGreaterThan(0);
  const elu = t.offres[0];

  const avant = game.players[moi].resources.ecus;
  joue({ type: 'HireHero', town: cite.uid, hero: elu.id });
  expect(game.players[moi].heroes.length).toBe(2);
  expect(avant - game.players[moi].resources.ecus).toBe(2500);

  /* Et la prévision brute du baril coïncide avec ce que le moteur a rangé :
     une seule implémentation, par la couture. */
  const enJeu = new Set(Object.values(game.heroes).map((h) => h.def));
  expect(enJeu.has(elu.id)).toBe(true);
});

/*
 * LE TIRAGE VIDE N'ENGAGE PERSONNE.
 *
 * Le test d'inclusion de `HireHero` ne s'appliquait que « si le tirage a
 * offert quelqu'un » : tout le vivier en lice, le tirage revenait vide, et
 * N'IMPORTE QUEL capitaine du camp d'en face devenait engageable pour 2500
 * écus — en ligne, le serveur aurait validé pareil. Personne au tirage,
 * personne à engager.
 */
it('un tirage revenu vide n’engage personne — pas même un capitaine d’en face', () => {
  const setup = setupDemo();
  const world = buildWorld(setup.seed);
  const game = createGame(setup, world);
  const moi = game.activePlayer;
  const mienne = game.players[moi].faction;
  const cite = Object.values(game.towns).find((t) => t.owner === moi);
  expect(cite).toBeDefined();
  if (!cite) return;

  /* Tout le vivier en lice : chaque capitaine de ma faction — et les neutres —
     reçoit un porteur fictif. Le tirage ne peut plus rien offrir. */
  const modele = Object.values(game.heroes)[0];
  expect(modele).toBeDefined();
  let n = 0;
  for (const id of Object.keys(HEROES)) {
    const def = HEROES[id as keyof typeof HEROES];
    if (def.faction !== mienne && def.faction !== 'neutre') continue;
    if (Object.values(game.heroes).some((h) => h.def === id)) continue;
    n += 1;
    game.heroes[`HX${n}`] = { ...modele, uid: `HX${n}`, def: id as never };
  }
  game.players[moi].tavernOffers = [];
  game.players[moi].resources.ecus = 9_999;
  /* La cité se vide pour que SEULE l'inclusion puisse refuser : avant le
     correctif, cet engagement passait. */
  cite.visitingHero = null;

  const adverse = Object.keys(HEROES).find(
    (id) =>
      HEROES[id as keyof typeof HEROES].faction !== mienne &&
      HEROES[id as keyof typeof HEROES].faction !== 'neutre' &&
      !Object.values(game.heroes).some((h) => h.def === id),
  );
  expect(adverse, 'il faut un capitaine du camp d’en face resté libre').toBeDefined();
  if (!adverse) return;

  const res = applyCommand(game, { type: 'HireHero', town: cite.uid, hero: adverse as never }, world);
  expect(res.ok).toBe(false);
  expect(res.error).toContain('ne se présente pas');
});
