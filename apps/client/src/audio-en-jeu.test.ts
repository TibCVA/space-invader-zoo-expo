/**
 * LE JEU SONNE, chantier « ameliore tout » du 27/08.
 *
 * Le moteur audio existait, complet et entièrement synthétique — dix-huit
 * effets, sept thèmes, trois bus — et **seuls les écrans hors-jeu s'en
 * servaient** : le menu cliquait, le codex tournait ses pages, et la partie
 * elle-même était muette de bout en bout. Aucune ligne de `render/`,
 * `battle/`, `screens/` n'appelait le son.
 *
 * Ce qu'on a branché, et les règles qui vont avec :
 *
 *  - le pont (`landing/audio-bridge.ts`) reste LE seul canal : il ne lève
 *    jamais, n'attend jamais, et garde le module audio en chargement
 *    paresseux. Aucun import direct de `audio/index.js` dans les vues ;
 *  - rien ne sonne en mouvement réduit : la file de combat y est vidée d'un
 *    bloc et la carte joue tout d'un coup — une salve simultanée n'informe
 *    de rien ;
 *  - le premier appui réveille le contexte audio, qu'aucun navigateur
 *    n'ouvre sans geste : un joueur qui recharge en pleine partie n'est
 *    jamais passé par le clic de l'accueil.
 *
 * Gardes de source, code lu sans commentaires.
 */
import { describe, expect, it } from 'vitest';
/* `node:fs` n'est pas dans les types du client — cf. battle/pouce.test.ts. */
// @ts-expect-error — types Node absents du tsconfig du client, cf. ci-dessus
import { readFileSync } from 'node:fs';

function code(chemin: string): string {
  return String(readFileSync(new URL(chemin, import.meta.url), 'utf8'))
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '');
}

const PONT = code('./landing/audio-bridge.ts');
const CARTE = code('./render/index.ts');
const JETONS = code('./render/heroes.ts');
const COMBAT = code('./battle/anim.ts');
const SCENE = code('./screens/scene.tsx');
const VUES = code('./screens/vues.tsx');
const FIN = code('./screens/fin-de-tour.tsx');

describe('le pont reste le seul canal', () => {
  it('les vues de jeu passent par le pont, jamais par le moteur en direct', () => {
    for (const [nom, source] of [
      ['render/index.ts', CARTE],
      ['render/heroes.ts', JETONS],
      ['battle/anim.ts', COMBAT],
      ['screens/vues.tsx', VUES],
      ['screens/fin-de-tour.tsx', FIN],
      ['screens/scene.tsx', SCENE],
    ] as const) {
      expect(source, nom).toMatch(/from '\.\.?\/(\.\.\/)?landing\/audio-bridge\.js'/);
      /* Un import statique de `audio/index.js` ferait tomber tout le moteur
         audio dans le paquet initial et perdrait la garantie « ne lève
         jamais » du pont. */
      expect(source, nom).not.toMatch(/from '.*audio\/index\.js'/);
    }
  });

  it('le pont sait réveiller le contexte, sans jamais laisser filer d’erreur', () => {
    expect(PONT).toContain('export function eveillerAudio(): void');
    const i = PONT.indexOf('export function eveillerAudio');
    const bloc = PONT.slice(i, i + 340);
    expect(bloc).toContain('await moteur?.init()');
    expect(bloc).toMatch(/catch \{/);
  });
});

describe('le réveil au premier geste', () => {
  it('le premier appui sur une scène ouvre le contexte audio, une seule fois', () => {
    expect(SCENE).toMatch(
      /addEventListener\('pointerdown', eveillerAudio, \{ once: true, passive: true \}\)/,
    );
  });

  it('la fin de tour réveille aussi, et sonne la page du jour', () => {
    const i = FIN.indexOf('function rendreLaMain');
    expect(i).toBeGreaterThan(0);
    const bloc = FIN.slice(i, i + 220);
    expect(bloc).toContain('eveillerAudio()');
    expect(bloc).toContain("jouerEffet('page')");
    expect(bloc).toContain("dispatch({ type: 'EndTurn' })");
    /* Les trois chemins — bouton, barre d'espace, confirmation — passent par
       la même porte : un seul d'entre eux qui sonnerait serait pire que rien.
       (Quatre occurrences : les trois appels et la déclaration.) */
    expect(FIN.match(/rendreLaMain\(\)/g)?.length).toBe(4);
    expect(FIN).not.toMatch(/else dispatch\(\{ type: 'EndTurn' \}\)/);
    /* `EndTurn` n'est plus posté qu'à un seul endroit du fichier. */
    expect(FIN.match(/dispatch\(\{ type: 'EndTurn' \}\)/g)?.length).toBe(1);
  });
});

describe('la carte sonne ce qu’elle montre', () => {
  it('un pas par case franchie, au plus un par image', () => {
    const i = JETONS.indexOf('avancer(dtMs: number): void');
    expect(i).toBeGreaterThan(0);
    const bloc = JETONS.slice(i, i + 900);
    /* Le drapeau est posé DANS la boucle et lu APRÈS : plusieurs cases
       rattrapées après un gel d'onglet ne font qu'un seul pas sonore. */
    expect(bloc).toMatch(/aFranchi = true;\s*\}/);
    expect(bloc).toContain("if (aFranchi) jouerEffet('pas_terre')");
  });

  it('les gains, les conquêtes et les vignettes ont chacun leur son', () => {
    expect(CARTE).toMatch(/this\.gains\.montrer\(derniereCase, e\.delta\);\s*jouerEffet\('piece'\)/);
    expect(CARTE).toMatch(/case 'TownCaptured':[\s\S]{0,220}jouerEffet\('victoire'\)/);
    expect(CARTE).toMatch(/case 'SealTaken':[\s\S]{0,160}jouerEffet\('victoire'\)/);
    expect(CARTE).toContain("jouerEffet(e.severity === 'info' ? 'borne' : 'alerte')");
  });

  it('rien ne sonne en mouvement réduit — la carte y joue tout d’un bloc', () => {
    /* `immediat` vaut `deps.reducedMotion` en tête de `playEvents`. */
    expect(CARTE).toContain("if (!immediat && e.by === this.deps.localPlayer) jouerEffet('victoire')");
    expect(CARTE).toMatch(/if \(!immediat && e\.portee !== 'publique'\)/);
  });

  it('la manchette publique ne sonne pas deux fois', () => {
    /* La capture émet TownCaptured (cloches) puis une Notice publique : sans
       ce filtre, la même conquête sonnerait deux coups à la file. */
    expect(CARTE).toContain("e.portee !== 'publique'");
  });
});

describe('le combat sonne ses gestes', () => {
  it('l’épée, le trait, l’impact, la mort et le sort', () => {
    expect(COMBAT).toContain("if (!distant) this.son('epee')");
    expect(COMBAT).toContain("this.son('arc')");
    /* Deux impacts : le coup d'une pile et la volée de tour. */
    expect(COMBAT.match(/this\.son\('impact'\)/g)?.length).toBe(2);
    expect(COMBAT).toContain("this.son('mort')");
    expect(COMBAT).toContain("this.son('sort')");
  });

  it('les sons vivent dans les gestes de la file, jamais dans playEvents', () => {
    /* `battle/index.ts` n'enfile rien (cf. marche.test.ts) : y émettre un son
       le jouerait avant l'animation, ou deux fois. */
    const VUE = code('./battle/index.ts');
    const i = VUE.indexOf('async playEvents(');
    expect(i).toBeGreaterThan(0);
    expect(VUE.slice(i, i + 600)).not.toContain('jouerEffet');
  });

  it('la fin sonne selon le camp du joueur, cloches ou glas', () => {
    expect(COMBAT).toContain("this.son(campLocal !== null && campLocal !== camp ? 'defaite' : 'victoire')");
    /* Le camp vient de la vue, seule à connaître le joueur local. */
    expect(code('./battle/index.ts')).toContain(
      'campLocal: () => campDuJoueur(this.combat, this.deps.localPlayer)',
    );
  });

  it('la file muette en mouvement réduit : une seule porte, gardée', () => {
    const i = COMBAT.indexOf('private son(cle: CleEffet): void');
    expect(i).toBeGreaterThan(0);
    const bloc = COMBAT.slice(i, i + 140);
    expect(bloc).toContain('if (this.ctx.reducedMotion) return');
    expect(bloc).toContain('jouerEffet(cle)');
    /* Tous les gestes passent par `this.son` : un `jouerEffet` direct dans
       une tâche échapperait à la garde. Le fichier n'en compte donc que DEUX
       occurrences — l'import, et l'appel unique de `son()` lui-même. */
    expect(COMBAT.match(/jouerEffet/g)?.length).toBe(2);
  });
});

describe('chaque écran porte son thème', () => {
  it('aventure sur la carte, cité selon la faction, tambours au combat', () => {
    expect(VUES).toMatch(/demarrerTheme\('aventure'\)/);
    expect(VUES).toContain("demarrerTheme(factionCible === 'ermitage' ? 'cite_ermitage' : 'cite_granit')");
    expect(VUES).toMatch(/demarrerTheme\('combat'\)/);
  });
});
