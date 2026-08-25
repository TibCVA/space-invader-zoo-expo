/**
 * LES POLITIQUES ET L'ABANDON — les trois dernières commandes orphelines.
 *
 * `SetCharter` : le choix permanent d'un village (jamais la capitale, jamais
 * deux fois). `SetGabelle` : la politique du sel, fixée par le seul détenteur
 * de la Maison du Trésor. `Surrender` : la bannière s'abaisse et la partie
 * continue sans elle — la courtoisie du jeu par correspondance.
 *
 * Comme partout : chaque bloc se ferme par un `applyCommand` réel, et
 * l'aperçu de la gabelle est prouvé être LE calcul du noyau, pas une copie.
 */
import { beforeAll, describe, expect, it } from 'vitest';
/* Le code du menu se lit sur le disque pour les gardes de branchement.
   `node:fs` n'est pas dans les types du client — cf. battle/pouce.test.ts. */
// @ts-expect-error — types Node absents du tsconfig du client, cf. ci-dessus
import { readFileSync } from 'node:fs';
import { bootstrapEngine } from '@auvergne/game';
import { buildWorld } from '@auvergne/map';
import { applyCommand, createGame, gabelleIncome } from '@auvergne/engine';
import type { GameState, TownState, WorldMap } from '@auvergne/engine';
import { setupDemo } from '../state/demo.js';
import {
  CHARTES,
  charteOffrable,
  commandeDeCharte,
  commandeDeGabelle,
  gabelleDe,
} from './politiques.js';

let world: WorldMap;

beforeAll(() => {
  bootstrapEngine();
  world = buildWorld(setupDemo().seed);
});

function partie(): { jeu: GameState; capitale: TownState } {
  const jeu = createGame(setupDemo(), world);
  const capitale = Object.values(jeu.towns).find(
    (t) => t.owner === jeu.activePlayer && t.isCapital,
  );
  if (!capitale) throw new Error('le joueur actif doit avoir une capitale');
  return { jeu, capitale };
}

/** Un village (non capitale) confié au joueur actif, sans charte. */
function village(jeu: GameState): TownState {
  const v = Object.values(jeu.towns).find((t) => !t.isCapital);
  if (!v) throw new Error('la carte doit semer un village');
  v.owner = jeu.activePlayer;
  v.charter = null;
  if (!jeu.players[jeu.activePlayer].towns.includes(v.uid)) {
    jeu.players[jeu.activePlayer].towns.push(v.uid);
  }
  return v;
}

describe('la charte du village', () => {
  it('offrable sur un village vierge, jamais sur la capitale ni deux fois', () => {
    const { jeu, capitale } = partie();
    const v = village(jeu);
    expect(charteOffrable(v)).toBe(true);
    expect(charteOffrable(capitale)).toBe(false);
    v.charter = 'marchande';
    expect(charteOffrable(v)).toBe(false);
  });

  it('les trois chartes passent au moteur, et le choix est bien permanent', () => {
    for (const charte of CHARTES) {
      const { jeu } = partie();
      const v = village(jeu);
      const res = applyCommand(jeu, commandeDeCharte(v.uid, charte.id), world);
      expect(res.ok, `${charte.id} : ${res.error ?? ''}`).toBe(true);
      expect(res.state.towns[v.uid].charter).toBe(charte.id);
      /* Une seconde charte est refusée : c'est LA raison de la confirmation
         grave à l'écran. */
      const deux = applyCommand(res.state, commandeDeCharte(v.uid, 'militaire'), world);
      expect(deux.ok).toBe(false);
    }
  });

  it('la capitale est refusée par le moteur, comme l’écran le tait', () => {
    const { jeu, capitale } = partie();
    const res = applyCommand(jeu, commandeDeCharte(capitale.uid, 'marchande'), world);
    expect(res.ok).toBe(false);
  });
});

describe('la gabelle', () => {
  /** Confie la Maison du Trésor au joueur actif. */
  function detenirLeTresor(jeu: GameState): void {
    for (const o of Object.values(jeu.objects)) {
      if (o.kind === 'maison_tresor') o.owner = jeu.activePlayer;
    }
  }

  it('sans la Maison du Trésor, on lit sans fixer — et le moteur refuse pareil', () => {
    const { jeu } = partie();
    const g = gabelleDe(jeu, jeu.activePlayer);
    expect(g.detenteur).toBe(false);
    const autre = g.offres.find((o) => !o.enVigueur);
    expect(autre).toBeDefined();
    if (!autre) return;
    const res = applyCommand(jeu, commandeDeGabelle(autre.id), world);
    expect(res.ok).toBe(false);
  });

  it('l’aperçu de chaque régime EST le calcul du noyau — au chiffre près', () => {
    const { jeu } = partie();
    const g = gabelleDe(jeu, jeu.activePlayer);
    expect(g.offres.length).toBe(3);
    for (const o of g.offres) {
      expect(o.apercu).toEqual(gabelleIncome({ ...jeu, gabelle: o.id }));
    }
    /* Et la ligne « en vigueur » est l'état réel, pas un souvenir. */
    expect(g.offres.filter((o) => o.enVigueur).map((o) => o.id)).toEqual([jeu.gabelle]);
  });

  it('le détenteur décrète, le régime change, le même régime est refusé', () => {
    const { jeu } = partie();
    detenirLeTresor(jeu);
    const g = gabelleDe(jeu, jeu.activePlayer);
    expect(g.detenteur).toBe(true);
    const autre = g.offres.find((o) => !o.enVigueur);
    expect(autre).toBeDefined();
    if (!autre) return;
    const res = applyCommand(jeu, commandeDeGabelle(autre.id), world);
    expect(res.ok, res.error).toBe(true);
    expect(res.state.gabelle).toBe(autre.id);
    const rejoue = applyCommand(res.state, commandeDeGabelle(autre.id), world);
    expect(rejoue.ok).toBe(false);
  });
});

describe('rendre les armes', () => {
  it('la bannière s’abaisse : cités rendues, héros dispersés, la partie continue', () => {
    const { jeu } = partie();
    const moi = jeu.activePlayer;
    const mesCites = jeu.players[moi].towns.slice();
    expect(mesCites.length).toBeGreaterThan(0);

    const res = applyCommand(jeu, { type: 'Surrender' }, world);
    expect(res.ok, res.error).toBe(true);
    expect(res.state.players[moi].alive).toBe(false);
    expect(res.state.players[moi].heroes).toEqual([]);
    for (const uid of mesCites) {
      expect(res.state.towns[uid].owner).toBeNull();
    }
    /* La courtoisie du jeu par correspondance : la main est passée — les
       cousins continuent sans attendre un joueur parti. */
    if (res.state.phase !== 'termine') {
      expect(res.state.activePlayer).not.toBe(moi);
    }
  });
});

/**
 * LE BRANCHEMENT DE L'ABANDON — gardes de source, code lu sans commentaires
 * (la leçon du faux vert de « Quitter la cité »). Une commande parfaitement
 * jugée par le moteur qu'aucun bouton n'émettrait resterait orpheline.
 */
describe('le branchement de « Rendre les armes »', () => {
  const PANNEAUX: string = String(readFileSync(new URL('./panneaux.tsx', import.meta.url), 'utf8'))
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, '')
    .replace(/^\s*\/\/.*$/gm, '');

  it('le menu porte l’abandon, derrière une confirmation grave', () => {
    expect(PANNEAUX).toContain("dispatch({ type: 'Surrender' })");
    expect(PANNEAUX).toContain('setReddition(true)');
    expect(PANNEAUX).toMatch(/grave/);
    /* Jamais en démonstration : une bannière de démonstration n'a rien à
       abaisser. */
    expect(PANNEAUX).toMatch(/\{!demo \? \(\s*reddition \?/);
  });

  it('le dispatch ne part QUE du chemin confirmé', () => {
    /* Un seul site d'émission, dans onConfirm : pas de second chemin qui
       contournerait la confirmation. */
    const sites = PANNEAUX.match(/dispatch\(\{ type: 'Surrender' \}\)/g) ?? [];
    expect(sites.length).toBe(1);
    const i = PANNEAUX.indexOf("dispatch({ type: 'Surrender' })");
    const avant = PANNEAUX.slice(Math.max(0, i - 300), i);
    expect(avant).toContain('onConfirm');
  });
});
