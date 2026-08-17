/**
 * Tests de la progression : courbe d'expérience, montées de niveau,
 * propositions de compétence et cumul des effets.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { GameState, HeroInstance } from '../types.js';
import { cloneRng } from '../rng.js';
import {
  BASE_MOVEMENT,
  MAX_LEVEL,
  applyBp,
  registerContent,
  registerWorldModule,
  resetEngineModules,
} from '../core/index.js';
import { newGame } from '../core/test-helpers.js';
import { worldModulePack } from './index.js';
import {
  LEVELING_TUNING,
  XP_TABLE,
  grantXp,
  applyLevelChoice,
  levelForXp,
  rollSkillOffers,
  skillCandidates,
  xpForLevel,
  xpStep,
} from './leveling.js';
import { activeEffects, heroStats, skillRank } from './hero-stats.js';
import { acquireArtifact, artifactEffects, equipArtifact, setProgress } from './artifacts.js';
import { combineEffectBp } from './common.js';

function fixture(): { state: GameState; hero: HeroInstance } {
  const { state } = newGame(4242, 2);
  const uid = state.players.P1.heroes[0];
  return { state, hero: state.heroes[uid] };
}

describe('courbe d’expérience', () => {
  it('est entière, strictement croissante et reproductible jusqu’au niveau 30', () => {
    expect(xpForLevel(0)).toBe(0);
    expect(xpForLevel(1)).toBe(0);

    let previous = -1;
    for (let level = 1; level <= MAX_LEVEL; level++) {
      const value = xpForLevel(level);
      expect(Number.isInteger(value)).toBe(true);
      expect(value).toBeGreaterThan(previous);
      previous = value;
    }

    // La table close et la formule fermée disent exactement la même chose.
    let cumulative = 0;
    for (let level = 2; level <= MAX_LEVEL; level++) {
      cumulative += xpStep(level);
      expect(XP_TABLE[level]).toBe(cumulative);
      expect(xpForLevel(level)).toBe(cumulative);
    }

    // Ancrages de la courbe : lente au début, exigeante à la fin.
    expect(xpForLevel(2)).toBe(LEVELING_TUNING.xpBase);
    expect(xpForLevel(10)).toBe(23_100);
    expect(xpForLevel(20)).toBe(114_475);
    expect(xpForLevel(MAX_LEVEL)).toBe(323_350);

    // Prolongement monotone au-delà du plafond, sans exception.
    expect(xpForLevel(MAX_LEVEL + 1)).toBeGreaterThan(xpForLevel(MAX_LEVEL));

    // `levelForXp` est bien l'inverse de `xpForLevel`.
    for (let level = 1; level <= MAX_LEVEL; level++) {
      expect(levelForXp(xpForLevel(level))).toBe(level);
      if (level > 1) expect(levelForXp(xpForLevel(level) - 1)).toBe(level - 1);
    }
  });

  it('fait franchir exactement les paliers attendus, sans dépasser le niveau 30', () => {
    const { state, hero } = fixture();
    hero.skills = [];
    hero.artifacts = {};
    expect(hero.level).toBe(1);

    grantXp(state, hero, xpForLevel(5) - 1);
    expect(hero.level).toBe(4);

    grantXp(state, hero, 1);
    expect(hero.level).toBe(5);

    grantXp(state, hero, 10_000_000);
    expect(hero.level).toBe(MAX_LEVEL);
    expect(hero.xp).toBe(xpForLevel(MAX_LEVEL));

    // Le niveau plafonné ne produit plus aucune montée.
    const events = grantXp(state, hero, 50_000);
    expect(events.filter((e) => e.type === 'HeroLeveled')).toHaveLength(0);
  });

  it('rejoue à l’identique depuis le même état de générateur', () => {
    const { state, hero } = fixture();
    const snapshot = cloneRng(state.rng);
    const xpSnapshot = hero.xp;
    const levelSnapshot = hero.level;

    const first = grantXp(state, hero, 30_000);

    state.rng = cloneRng(snapshot);
    hero.xp = xpSnapshot;
    hero.level = levelSnapshot;
    hero.vaillance = 0;
    hero.garde = 0;
    hero.mystique = 0;
    hero.savoir = 0;
    hero.pendingLevelUp = null;
    const second = grantXp(state, hero, 30_000);

    expect(JSON.stringify(second.map((e) => e.type))).toBe(
      JSON.stringify(first.map((e) => e.type)),
    );
  });
});

describe('propositions de niveau', () => {
  it('offre toujours deux compétences distinctes, autorisées par le contenu', () => {
    const { state, hero } = fixture();
    for (let i = 0; i < 60; i++) {
      const [a, b] = rollSkillOffers(state, hero);
      const candidates = skillCandidates(hero);
      if (candidates.length >= 2) {
        expect(a.skill).not.toBe(b.skill);
      }
      for (const offer of [a, b]) {
        expect(offer.rank).toBeGreaterThanOrEqual(1);
        expect(offer.rank).toBeLessThanOrEqual(3);
      }
      // On applique l'une des deux pour faire évoluer le héros.
      hero.pendingLevelUp = { choices: [a, b], primary: 'vaillance' };
      applyLevelChoice(state, hero, a.skill);
      expect(hero.skills.length).toBeLessThanOrEqual(LEVELING_TUNING.maxSkills);
    }
  });

  it('propose au moins une montée de rang dès qu’une montée est possible', () => {
    const { state, hero } = fixture();
    // Héros déjà bien pourvu : huit compétences au rang Novice.
    hero.skills = [
      { skill: 'logistique', rank: 1 },
      { skill: 'cartographie', rank: 1 },
      { skill: 'seigneurie', rank: 1 },
      { skill: 'intendance', rank: 1 },
      { skill: 'diplomatie', rank: 1 },
      { skill: 'reconnaissance', rank: 1 },
      { skill: 'commerce', rank: 1 },
      { skill: 'fortune', rank: 1 },
    ];
    const known = new Set(hero.skills.map((s) => s.skill));
    for (let i = 0; i < 30; i++) {
      const [a, b] = rollSkillOffers(state, hero);
      // Plafond atteint : toutes les propositions sont des montées de rang.
      expect(known.has(a.skill)).toBe(true);
      expect(known.has(b.skill)).toBe(true);
    }
  });

  it('applique le choix, monte le rang et rafraîchit les valeurs dérivées', () => {
    const { state, hero } = fixture();
    hero.skills = [{ skill: 'logistique', rank: 1 }];
    hero.artifacts = {};
    const before = heroStats(state, hero).movementMax;

    hero.pendingLevelUp = {
      choices: [
        { skill: 'logistique', rank: 2 },
        { skill: 'seigneurie', rank: 1 },
      ],
      primary: 'garde',
    };
    const events = applyLevelChoice(state, hero, 'logistique');

    expect(skillRank(hero, 'logistique')).toBe(2);
    expect(hero.pendingLevelUp).toBeNull();
    expect(hero.movementMax).toBe(heroStats(state, hero).movementMax);
    expect(hero.movementMax).toBeGreaterThan(before);
    expect(events.some((e) => e.type === 'Notice')).toBe(true);
  });
});

describe('cumul des effets', () => {
  beforeEach(() => {
    registerWorldModule(worldModulePack());
  });
  afterEach(() => {
    resetEngineModules();
  });

  it('additionne compétences et artefacts autour de la neutralité, en entiers', () => {
    const { state, hero } = fixture();
    hero.skills = [{ skill: 'logistique', rank: 1 }]; // movement_bp 10800
    hero.artifacts = {};
    hero.backpack = [];

    const withSkillOnly = heroStats(state, hero);
    expect(withSkillOnly.movementMax).toBe(applyBp(BASE_MOVEMENT + 300, 10800));

    // La Carte du sénéchal : movement_bp 10800 et vision +1.
    hero.backpack.push('carte_du_senechal');
    equipArtifact(state, hero, 'carte_du_senechal');
    // Les Chausses du colporteur : movement +200 (additif).
    hero.backpack.push('chausses_du_colporteur');
    equipArtifact(state, hero, 'chausses_du_colporteur');

    const effects = activeEffects(state, hero);
    // 10800 (Logistique) + 10800 (Carte) composés additivement → 11600.
    expect(combineEffectBp(effects, 'movement_bp')).toBe(11600);

    const stats = heroStats(state, hero);
    // Thibaut porte la spécialité « Maître des chemins » : +300 de marche.
    expect(stats.movementMax).toBe(applyBp(BASE_MOVEMENT + 300 + 200, 11600));
    expect(Number.isInteger(stats.movementMax)).toBe(true);
    expect(Number.isInteger(stats.manaMax)).toBe(true);
    expect(stats.vision).toBe(heroStats(state, hero).vision);
  });

  it('ajoute les caractéristiques primaires portées et borne moral et fortune', () => {
    const { state, hero } = fixture();
    hero.skills = [
      { skill: 'seigneurie', rank: 3 }, // moral +3
      { skill: 'fortune', rank: 3 }, // fortune +3
    ];
    hero.artifacts = {};
    hero.backpack = ['haubert_dardoise', 'banniere_grenat', 'anneau_de_fortune'];
    equipArtifact(state, hero, 'haubert_dardoise'); // Garde +2
    equipArtifact(state, hero, 'banniere_grenat'); // moral +1
    equipArtifact(state, hero, 'anneau_de_fortune'); // fortune +1

    const stats = heroStats(state, hero);
    expect(stats.garde).toBe(hero.garde + 2);
    // Bornes du document maître : ±3, jamais davantage.
    expect(stats.morale).toBeLessThanOrEqual(3);
    expect(stats.fortune).toBeLessThanOrEqual(3);
    expect(stats.morale).toBe(3);
    expect(stats.fortune).toBe(3);
  });

  it('n’accorde la prime d’ensemble qu’au palier atteint, et l’ajoute aux effets', () => {
    const { state, hero } = fixture();
    const piece = (
      id: string,
      slot: 'tete' | 'cou' | 'ceinture' | 'pieds',
      name: string,
    ) => ({
      id,
      name,
      slot,
      rarity: 'commun' as const,
      effects: [],
      setId: 'attirail_gabelou',
      lore: 'Inventaire de la halle.',
      icon: `artefact_${id}`,
    });
    registerContent({
      ARTIFACTS: {
        chapeau: piece('chapeau', 'tete', 'Chapeau ciré du gabelou'),
        sifflet: piece('sifflet', 'cou', 'Sifflet de la halle'),
        ceinture: piece('ceinture', 'ceinture', 'Ceinture aux douze bourses'),
        bottes: piece('bottes', 'pieds', 'Bottes du chemin de sel'),
      },
    });

    hero.skills = [];
    hero.artifacts = {};
    hero.backpack = ['chapeau', 'sifflet', 'ceinture', 'bottes'];

    equipArtifact(state, hero, 'chapeau');
    expect(setProgress(hero)[0].pieces).toBe(1);
    expect(setProgress(hero)[0].effects).toHaveLength(0);

    equipArtifact(state, hero, 'sifflet');
    expect(setProgress(hero)[0].pieces).toBe(2);
    expect(combineEffectBp(artifactEffects(hero), 'income_bp')).toBe(10400);

    equipArtifact(state, hero, 'ceinture');
    expect(combineEffectBp(artifactEffects(hero), 'income_bp')).toBe(10700);

    equipArtifact(state, hero, 'bottes');
    const complete = setProgress(hero)[0];
    expect(complete.pieces).toBe(4);
    expect(complete.name).toBe('Attirail du Gabelou');
    expect(combineEffectBp(artifactEffects(hero), 'income_bp')).toBe(11000);
    expect(combineEffectBp(artifactEffects(hero), 'trade_bp')).toBe(11000);
    // Les effets d'ensemble entrent bien dans les effets actifs du héros.
    expect(combineEffectBp(activeEffects(state, hero), 'income_bp')).toBe(11000);
  });

  it('ramasse un artefact, le porte automatiquement et cumule les primes d’ensemble', () => {
    const { state, hero } = fixture();
    hero.artifacts = {};
    hero.backpack = [];

    const events = acquireArtifact(state, hero, 'lorgnette_de_belvedere');
    expect(events.length).toBeGreaterThan(0);
    expect(hero.artifacts.tete).toBe('lorgnette_de_belvedere');
    expect(artifactEffects(hero).some((e) => e.kind === 'vision')).toBe(true);

    // Sans `setId` dans le contenu de secours, aucun ensemble ne se forme.
    expect(setProgress(hero)).toHaveLength(0);
  });
});
