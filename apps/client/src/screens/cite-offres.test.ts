/**
 * CE QU'ON PEUT BÂTIR ET RECRUTER — les gardes.
 *
 * Le défaut d'origine n'était pas un calcul faux, c'était une absence : le
 * client n'émettait ni `BuildInTown` ni `RecruitCreatures`, et l'on ne pouvait
 * donc rien faire grandir. Ces tests tiennent les décisions du panneau qui les
 * émet enfin.
 *
 * Ils n'énumèrent AUCUN bâtiment et AUCUNE créature à la main, et ne recopient
 * aucun coût : tout est comparé au moteur (`canBuild`, `canRecruit`). Un test
 * qui recopie la table qu'il garde descend avec elle.
 */
import { describe, expect, it } from 'vitest';
import { HERO_HIRE_COST, HERO_LIMIT, applyCommand, canBuild, canRecruit, createGame, upgradesOf } from '@auvergne/engine';
import type { CreatureId, GameState, TownState } from '@auvergne/engine';
import { buildWorld } from '@auvergne/map';
import { BUILDINGS } from '@auvergne/content';
import { setupDemo } from '../state/demo.js';
import {
  ameliorationsAbordables,
  apercuEchange,
  marcheOuvert,
  minimumUtile,
  taverneDe,
  destinataireRecrues,
  offresAmelioration,
  offresBatiments,
  offresRecrues,
  recruesAbordables,
} from './cite-offres.js';

function partie(): { game: GameState; cite: TownState } {
  const setup = setupDemo();
  const game = createGame(setup, buildWorld(setup.seed));
  const cite = Object.values(game.towns).find((t) => t.owner === 'P1');
  if (!cite) throw new Error('la bannière P1 doit posséder une cité au départ');
  return { game, cite };
}

describe('les bâtiments proposés au chantier', () => {
  it('ne propose jamais ce qui est déjà levé', () => {
    const { game, cite } = partie();
    expect(cite.built.length, 'une capitale part avec des bâtiments').toBeGreaterThan(0);
    const proposes = new Set(offresBatiments(game, cite).map((o) => o.id));
    for (const deja of cite.built) {
      expect(proposes.has(deja), `${deja} est déjà bâti`).toBe(false);
    }
  });

  it('ne propose jamais l’architecture de l’autre maison', () => {
    const { game, cite } = partie();
    for (const o of offresBatiments(game, cite)) {
      /* On interroge le moteur plutôt qu'une table locale : s'il ne refuse pas
         le bâtiment pour cause d'architecture, c'est qu'il appartient bien à
         cette maison. */
      const verdict = canBuild(game, cite, o.id);
      expect(
        verdict.reason ?? '',
        `${o.id} ne doit pas être refusé pour cause d'architecture`,
      ).not.toMatch(/architecture/i);
    }
  });

  it('dit la vérité du moteur sur chaque ligne, possible ou non', () => {
    const { game, cite } = partie();
    const offres = offresBatiments(game, cite);
    expect(offres.length, 'il doit rester des choses à bâtir au premier jour').toBeGreaterThan(0);
    for (const o of offres) {
      const verdict = canBuild(game, cite, o.id);
      expect(o.possible, `${o.id}`).toBe(verdict.ok);
      if (!verdict.ok) expect(o.refus).toBe(verdict.reason);
      else expect(o.refus).toBeNull();
    }
  });

  it('montre AUSSI ce qu’on ne peut pas encore s’offrir : c’est vers cela qu’on épargne', () => {
    const { game, cite } = partie();
    /* Bourse vidée : plus rien n'est finançable, et pourtant la liste doit
       rester pleine. Une liste qui se vide quand le trésor est bas cache au
       joueur ce vers quoi il économise. */
    game.players.P1.resources = { ecus: 0, bois: 0, granit: 0, fer: 0, sel: 0, essence: 0, filDor: 0 };
    const offres = offresBatiments(game, cite);
    expect(offres.length).toBeGreaterThan(0);
    expect(offres.every((o) => !o.possible), 'sans un écu, rien n’est possible').toBe(true);
    expect(offres.every((o) => o.refus !== null)).toBe(true);
  });

  it('met devant ce qui est faisable tout de suite', () => {
    const { game, cite } = partie();
    const offres = offresBatiments(game, cite);
    /* `findLastIndex` n'est pas dans la bibliothèque visée par le projet : on
       balaie à l'envers plutôt que de relever la cible pour une ligne. */
    let dernierPossible = -1;
    for (let i = offres.length - 1; i >= 0; i -= 1) {
      if (offres[i].possible) {
        dernierPossible = i;
        break;
      }
    }
    const premierImpossible = offres.findIndex((o) => !o.possible);
    if (dernierPossible >= 0 && premierImpossible >= 0) {
      expect(dernierPossible).toBeLessThan(premierImpossible);
    }
  });
});

describe('les recrues proposées', () => {
  it('ne rend jamais plus de recrues abordables que le moteur n’en accepte', () => {
    const { game, cite } = partie();
    const demeures = Object.keys(cite.available) as CreatureId[];
    expect(demeures.length, 'une capitale part avec au moins une demeure').toBeGreaterThan(0);
    for (const id of demeures) {
      const n = recruesAbordables(game, cite, id);
      if (n > 0) expect(canRecruit(game, cite, id, n).ok, `${id} × ${String(n)}`).toBe(true);
      /* Et c'est bien le MAXIMUM : une de plus doit être refusée. */
      const plafond = cite.available[id] ?? 0;
      if (n < plafond) expect(canRecruit(game, cite, id, n + 1).ok).toBe(false);
    }
  });

  it('tombe à zéro quand la bourse est vide, sans jamais devenir négatif', () => {
    const { game, cite } = partie();
    game.players.P1.resources = { ecus: 0, bois: 0, granit: 0, fer: 0, sel: 0, essence: 0, filDor: 0 };
    for (const o of offresRecrues(game, cite)) {
      expect(o.abordables, o.id).toBe(0);
    }
  });

  it('garde la ligne d’une demeure dont la portée est épuisée', () => {
    const { game, cite } = partie();
    const id = (Object.keys(cite.available) as CreatureId[])[0];
    cite.available[id] = 0;
    const offre = offresRecrues(game, cite).find((o) => o.id === id);
    expect(offre, 'la demeure existe : sa ligne doit rester').toBeTruthy();
    expect(offre?.disponibles).toBe(0);
    expect(offre?.abordables).toBe(0);
  });

  it('range les recrues du rang le plus bas au plus haut', () => {
    const { game, cite } = partie();
    const rangs = offresRecrues(game, cite).map((o) => o.rang);
    expect([...rangs].sort((a, b) => a - b)).toEqual(rangs);
  });
});

describe('la destination des recrues', () => {
  it('préfère le héros présent dans la cité', () => {
    const { cite } = partie();
    cite.visitingHero = 'H9' as never;
    cite.garrisonHero = null;
    expect(destinataireRecrues(cite)).toBe('H9');
  });

  it('retombe sur le héros de garnison, puis sur la garnison elle-même', () => {
    const { cite } = partie();
    cite.visitingHero = null;
    cite.garrisonHero = 'H4' as never;
    expect(destinataireRecrues(cite)).toBe('H4');
    cite.garrisonHero = null;
    expect(destinataireRecrues(cite)).toBeNull();
  });
});

/**
 * LES PROMOTIONS — le rendez-vous hebdomadaire de HMM3 qui manquait.
 *
 * Mesuré avant le correctif : `UpgradeCreatures` n'était émis nulle part.
 * Les bâtiments d'amélioration se levaient (ils sont dans l'onglet Bâtir
 * depuis le début) et les créatures restaient au rang de base pour toujours.
 *
 * Comme partout : la logique décide de ce qu'on PROPOSE, le moteur reste seul
 * juge de ce qui PASSE — chaque bloc se ferme par un `applyCommand` réel.
 */
describe('les promotions proposées', () => {
  /** Lève le bâtiment d'amélioration et poste des créatures promouvables. */
  function citePromouvante(): {
    game: GameState;
    cite: TownState;
    de: CreatureId;
    vers: CreatureId;
  } {
    /* La cité de la bannière QUI A LA MAIN : `applyCommand` joue toujours au
       nom du joueur actif, et une cité d'un autre serait refusée d'office —
       « ne porte pas votre bannière », le premier rouge de cette garde. */
    const { game } = partie();
    const cite = Object.values(game.towns).find((t) => t.owner === game.activePlayer);
    if (!cite) throw new Error('le joueur actif doit posséder une cité au départ');
    cite.built.push(`${cite.faction}_amelioration_1` as never);
    const table = upgradesOf(cite);
    expect(table.size, 'le bâtiment d’amélioration doit octroyer une promotion').toBeGreaterThan(0);
    const [de, vers] = [...table.entries()][0];
    cite.garrison[0] = { creature: de, count: 9 };
    return { game, cite, de, vers };
  }

  it('sans créature présente, aucune ligne — même bâtiment levé', () => {
    const { game, cite } = partie();
    cite.built.push(`${cite.faction}_amelioration_1` as never);
    for (let i = 0; i < cite.garrison.length; i += 1) cite.garrison[i] = null;
    expect(offresAmelioration(game, cite)).toEqual([]);
  });

  it('sans bâtiment d’amélioration, aucune ligne — même créature présente', () => {
    const { game, cite } = partie();
    expect(upgradesOf(cite).size).toBe(0);
    expect(offresAmelioration(game, cite)).toEqual([]);
  });

  it('la ligne dit qui devient quoi, combien sont là, et ce que ça change', () => {
    const { game, cite, de, vers } = citePromouvante();
    const offres = offresAmelioration(game, cite);
    expect(offres.length).toBe(1);
    const o = offres[0];
    expect(o.de).toBe(de);
    expect(o.vers).toBe(vers);
    expect(o.presentes).toBe(9);
    /* Le gain chiffré est la raison de payer : une promotion qui n'améliore
       RIEN serait un défaut de contenu, et la ligne le montrerait. */
    expect(o.gain.length).toBeGreaterThan(0);
    expect(Object.keys(o.coutUnitaire).length).toBeGreaterThan(0);
  });

  it('les créatures du héros DE PASSAGE comptent — c’est lui qu’on vient promouvoir', () => {
    const { game, cite, de } = citePromouvante();
    for (let i = 0; i < cite.garrison.length; i += 1) cite.garrison[i] = null;
    const heros = game.heroes[game.players[cite.owner!].heroes[0]];
    heros.at = { ...cite.at };
    heros.inTown = cite.uid;
    cite.visitingHero = heros.uid;
    heros.army[0] = { creature: de, count: 4 };
    const offres = offresAmelioration(game, cite);
    expect(offres.length).toBe(1);
    expect(offres[0].presentes).toBe(4);
  });

  it('abordables suit la bourse, et le moteur promeut ce nombre exactement', () => {
    const { game, cite, de, vers } = citePromouvante();
    const abordables = ameliorationsAbordables(game, cite, de, 9);
    expect(abordables).toBeGreaterThan(0);

    const res = applyCommand(
      game,
      { type: 'UpgradeCreatures', town: cite.uid, from: de, count: abordables },
      buildWorld(setupDemo().seed),
    );
    expect(res.ok, res.error).toBe(true);
    const apres = res.state.towns[cite.uid];
    const promues = apres.garrison
      .filter((s): s is NonNullable<typeof s> => s !== null && s.creature === vers)
      .reduce((somme, s) => somme + s.count, 0);
    expect(promues).toBe(abordables);
  });

  it('un de plus que la bourse, et le moteur refuse — la bisection est au bord exact', () => {
    const { game, cite, de } = citePromouvante();
    /* Appauvrir la bannière pour que la bourse ne couvre pas les neuf. */
    const bourse = game.players[cite.owner!].resources;
    for (const clef of Object.keys(bourse) as (keyof typeof bourse)[]) {
      bourse[clef] = Math.min(bourse[clef], 60);
    }
    const abordables = ameliorationsAbordables(game, cite, de, 9);
    expect(abordables).toBeLessThan(9);
    if (abordables === 0) return;
    const res = applyCommand(
      game,
      { type: 'UpgradeCreatures', town: cite.uid, from: de, count: abordables + 1 },
      buildWorld(setupDemo().seed),
    );
    expect(res.ok).toBe(false);
  });
});

/**
 * L'AUBERGE — `HireHero` n'était émis nulle part : jamais de second héros,
 * donc ni chaînes, ni éclaireur, ni porteur de recrues. Tout HMM3 tient aux
 * héros multiples, et le jeu n'en offrait qu'un pour toute la partie.
 *
 * La subtilité gardée ici : le moteur tire les capitaines du jour
 * PARESSEUSEMENT, au premier `HireHero`. Le panneau les montre AVANT toute
 * commande, en prévoyant le tirage sur une COPIE du rng. La garde du milieu
 * prouve les deux moitiés du contrat : la prévision ne consomme pas le dé, et
 * ce qu'elle annonce est EXACTEMENT ce que le moteur tire ensuite.
 */
describe('l’auberge des Bannières', () => {
  function citeAvecAuberge(): { game: GameState; cite: TownState } {
    const { game } = partie();
    const cite = Object.values(game.towns).find((t) => t.owner === game.activePlayer);
    if (!cite) throw new Error('le joueur actif doit posséder une cité au départ');
    if (!cite.built.includes('taverne' as never)) cite.built.push('taverne' as never);
    return { game, cite };
  }

  it('fermée tant que le bâtiment n’est pas levé', () => {
    /* La cité de départ naît AVEC son auberge (premier rouge de cette garde,
       et une bonne nouvelle : l'onglet existe dès le premier jour). On la
       démolit donc explicitement pour éprouver la fermeture. */
    const { game, cite } = citeAvecAuberge();
    cite.built = cite.built.filter(
      (id) => !(BUILDINGS[id]?.grants.some((g) => g.kind === 'tavern')),
    ) as typeof cite.built;
    const t = taverneDe(game, cite);
    expect(t.ouverte).toBe(false);
    expect(t.offres).toEqual([]);
  });

  it('des capitaines se présentent, de la maison ou de nulle part, jamais déjà en jeu', () => {
    const { game, cite } = citeAvecAuberge();
    const t = taverneDe(game, cite);
    expect(t.ouverte).toBe(true);
    expect(t.offres.length).toBeGreaterThan(0);
    expect(t.offres.length).toBeLessThanOrEqual(2);
    const enJeu = new Set(Object.values(game.heroes).map((h) => h.def));
    for (const o of t.offres) {
      expect(enJeu.has(o.id)).toBe(false);
      expect(o.nom.length).toBeGreaterThan(0);
      expect(o.caracteristiques).toMatch(/Vai \d/);
    }
  });

  it('la prévision ne consomme pas le dé, et le moteur engage CELUI qu’elle annonce', () => {
    const { game, cite } = citeAvecAuberge();
    const de_avant = JSON.stringify(game.rng);
    const t = taverneDe(game, cite);
    expect(JSON.stringify(game.rng), 'le dé a été consommé par la prévision').toBe(de_avant);
    expect(t.refus).toBeNull();
    const elu = t.offres[0];

    const res = applyCommand(
      game,
      { type: 'HireHero', town: cite.uid, hero: elu.id },
      buildWorld(setupDemo().seed),
    );
    expect(res.ok, res.error).toBe(true);
    const engages = Object.values(res.state.heroes).filter((h) => h.def === elu.id);
    expect(engages.length).toBe(1);
    expect(engages[0].inTown).toBe(cite.uid);
    /* Le prix annoncé est le prix payé. */
    const avant = game.players[game.activePlayer].resources.ecus;
    const apres = res.state.players[game.activePlayer].resources.ecus;
    expect(avant - apres).toBe(HERO_HIRE_COST);
  });

  it('quatre héros, et l’auberge s’explique au lieu de griser en silence', () => {
    const { game, cite } = citeAvecAuberge();
    const joueur = game.players[game.activePlayer];
    while (joueur.heroes.length < HERO_LIMIT) joueur.heroes.push(`H_fictif_${joueur.heroes.length}`);
    const t = taverneDe(game, cite);
    expect(t.refus).toContain('Quatre héros');
  });

  it('un visiteur occupe la cité : l’auberge le dit avec les mots du moteur', () => {
    const { game, cite } = citeAvecAuberge();
    const heros = game.heroes[game.players[game.activePlayer].heroes[0]];
    cite.visitingHero = heros.uid;
    const t = taverneDe(game, cite);
    expect(t.refus).toContain('occupe déjà');
  });

  it('un capitaine engagé entre-temps par un AUTRE se dit sur sa ligne', () => {
    /* Les tirages de deux bannières peuvent se recouper : le capitaine
       affiché chez moi peut être engagé par le cousin pendant mon attente.
       Le moteur refuserait (« déjà engagé dans la partie ») — la ligne le
       dit AVANT le geste au lieu de laisser un bouton actif échouer. */
    const { game, cite } = citeAvecAuberge();
    const tire = taverneDe(game, cite).offres[0];
    expect(tire).toBeDefined();
    game.players[game.activePlayer].tavernOffers = [tire.id];
    const modele = Object.values(game.heroes)[0];
    game.heroes.HX_cousin = { ...modele, uid: 'HX_cousin', def: tire.id, owner: 'P2' };

    const t = taverneDe(game, cite);
    expect(t.offres.length).toBe(1);
    expect(t.offres[0].id).toBe(tire.id);
    expect(t.offres[0].engage).toBe(true);
  });
});

/**
 * LE MARCHÉ — `TradeResources` n'était émis nulle part : une bannière riche
 * en bois et pauvre en fer restait bloquée devant sa forge. Le comptoir ne
 * recalcule AUCUN taux : l'aperçu appelle `tradeOutcome`, la fonction même
 * qu'`applyCommand` consulte — ce qui s'affiche est ce qui se paie, et la
 * garde du milieu le prouve au chiffre près.
 */
describe('le comptoir du marché', () => {
  function citeMarchande(): { game: GameState; cite: TownState } {
    const { game } = partie();
    const cite = Object.values(game.towns).find((t) => t.owner === game.activePlayer);
    if (!cite) throw new Error('le joueur actif doit posséder une cité au départ');
    if (!marcheOuvert(cite)) cite.built.push('marche' as never);
    return { game, cite };
  }

  it('fermé sans le bâtiment, ouvert avec', () => {
    const { game } = partie();
    const cite = Object.values(game.towns).find((t) => t.owner === game.activePlayer);
    if (!cite) throw new Error('cité absente');
    const sans = cite.built.filter(
      (id) => !BUILDINGS[id]?.grants.some((g) => g.kind === 'market'),
    ) as typeof cite.built;
    cite.built = sans;
    expect(marcheOuvert(cite)).toBe(false);
    cite.built = [...sans, 'marche'] as typeof cite.built;
    expect(marcheOuvert(cite)).toBe(true);
    void game;
  });

  it('l’aperçu annonce EXACTEMENT ce que le moteur verse', () => {
    const { game } = citeMarchande();
    const joueur = game.activePlayer;
    game.players[joueur].resources.bois = 40;

    const apercu = apercuEchange(game, joueur, 'bois', 20, 'ecus');
    expect(apercu.ok).toBe(true);
    if (!apercu.ok) return;
    expect(apercu.recu).toBeGreaterThan(0);

    const res = applyCommand(
      game,
      { type: 'TradeResources', give: 'bois', giveAmount: 20, take: 'ecus' },
      buildWorld(setupDemo().seed),
    );
    expect(res.ok, res.error).toBe(true);
    const avant = game.players[joueur].resources;
    const apres = res.state.players[joueur].resources;
    expect(avant.bois - apres.bois).toBe(20);
    expect(apres.ecus - avant.ecus).toBe(apercu.recu);
  });

  it('un échange qui ne rapporterait rien est refusé avec la phrase du moteur', () => {
    const { game } = citeMarchande();
    const joueur = game.activePlayer;
    game.players[joueur].resources.bois = 40;
    /* Un seul bois contre du fil d'or : la valeur ne suffit pas. */
    const apercu = apercuEchange(game, joueur, 'bois', 1, 'filDor');
    expect(apercu.ok).toBe(false);
    if (apercu.ok) return;
    expect(apercu.raison.length).toBeGreaterThan(0);
  });

  it('le prix d’appel est au bord exact : lui passe, un de moins échoue', () => {
    const { game } = citeMarchande();
    const joueur = game.activePlayer;
    game.players[joueur].resources.bois = 500;
    const appel = minimumUtile(game, joueur, 'bois', 'filDor');
    expect(appel).not.toBeNull();
    if (appel === null) return;
    expect(apercuEchange(game, joueur, 'bois', appel, 'filDor').ok).toBe(true);
    if (appel > 1) {
      expect(apercuEchange(game, joueur, 'bois', appel - 1, 'filDor').ok).toBe(false);
    }
  });

  it('bourse vide : pas de prix d’appel, pas de mensonge', () => {
    const { game } = citeMarchande();
    const joueur = game.activePlayer;
    game.players[joueur].resources.essence = 0;
    expect(minimumUtile(game, joueur, 'essence', 'ecus')).toBeNull();
  });
});
