/**
 * L'ANNONCE DE ROUND, chantier « ameliore tout » du 27/08.
 *
 * Le combat changeait de round en silence : la seule trace en était le
 * cartouche de la barre d'initiative, qui se contentait de changer de chiffre
 * — un joueur regardant ses piles ne voyait rien passer.
 *
 * Trois pièges, tous documentés dans le code et gardés ici :
 *
 *  1. L'ÉTAT EST EN AVANCE SUR LE VISUEL. `relire()` applique `this.combat`
 *     dès l'arrivée des événements, alors que les gestes du round précédent
 *     se jouent encore. Keyer l'annonce sur `this.combat.round` la ferait
 *     paraître au milieu des coups d'avant. Le seul canal en phase est
 *     `pousserJournal`, que la file appelle au démarrage de chaque geste.
 *  2. LE ROUND I N'A PAS DE LIGNE DE JOURNAL — `openFirstRound` n'en émet
 *     pas. Sans amorçage à l'ouverture de la scène, la première bataille
 *     n'annoncerait rien avant le round II.
 *  3. LE REDIMENSIONNEMENT NE DOIT PAS RÉ-ANNONCER. Il purge la file, vide
 *     les effets et rappelle `appliquer(true)` ; l'idempotence tient au
 *     numéro de round retenu, jamais au site d'appel.
 *
 * Garde de source, code lu sans commentaires.
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

const VUE = code('./index.ts');

describe('le round s’annonce, une fois et au bon instant', () => {
  it('le signal vient du journal, en phase avec les animations', () => {
    const i = VUE.indexOf('private pousserJournal(e: CombatLogEntry): void {');
    expect(i).toBeGreaterThan(0);
    const bloc = VUE.slice(i, i + 200);
    expect(bloc).toContain('this.annoncerRound(e.round)');
  });

  it('jamais depuis l’état du moteur, qui court devant l’écran', () => {
    /* `appliquer()` et `relire()` voient le nouveau round avant que l'écran
       n'ait fini de jouer l'ancien : l'annonce n'a rien à y faire. */
    for (const site of ['private appliquer(', 'private relire(']) {
      const i = VUE.indexOf(site);
      expect(i, site).toBeGreaterThan(0);
      expect(VUE.slice(i, i + 900), site).not.toContain('annoncerRound');
    }
  });

  it('le round d’ouverture est annoncé à l’ouverture de la scène', () => {
    const i = VUE.indexOf('ouvrirScene(): void {');
    expect(i).toBeGreaterThan(0);
    const bloc = VUE.slice(i, i + 260);
    expect(bloc).toContain('this.annoncerRound(this.combat.round)');
    /* AVANT les retours anticipés : `ouvrirScene` abandonne s'il n'y a plus
       de pile active ou plus d'ennemi, et le round I serait perdu avec. */
    expect(bloc.indexOf('this.annoncerRound')).toBeLessThan(bloc.indexOf('if (!u) return'));
  });

  it('une annonce par round : le numéro retenu ferme la porte', () => {
    const i = VUE.indexOf('private annoncerRound(round: number): void {');
    expect(i).toBeGreaterThan(0);
    const bloc = VUE.slice(i, i + 200);
    expect(bloc).toContain('if (round <= 0 || round <= this.dernierRoundAnnonce) return');
    expect(bloc).toContain('this.dernierRoundAnnonce = round');
  });

  it('le redimensionnement REPLACE le cartouche, il ne le tue pas', () => {
    /*
     * Le défaut trouvé à l'épreuve au clic : `resize` effaçait le bandeau, et
     * l'hôte de scène redimensionne TOUJOURS juste après avoir construit la
     * vue — l'annonce d'ouverture mourait dans la milliseconde, à chaque
     * bataille, et n'était jamais rejouée puisque son round était retenu.
     */
    const i = VUE.indexOf('resize(width: number, height: number): void {');
    expect(i).toBeGreaterThan(0);
    const bloc = VUE.slice(i, i + 2600);
    expect(bloc).toContain('this.replacerBandeau()');
    expect(bloc).not.toContain('this.effacerBandeau()');
    /* Ni remise à zéro du compteur, ni ré-annonce : sinon chaque rotation de
       téléphone rejouerait le round en cours. */
    expect(bloc).not.toContain('dernierRoundAnnonce = 0');
    expect(bloc).not.toContain('annoncerRound');
  });

  it('replacer repeint l’annonce en vol et n’efface que s’il n’y en a plus', () => {
    const i = VUE.indexOf('private replacerBandeau(): void {');
    expect(i).toBeGreaterThan(0);
    const bloc = VUE.slice(i, i + 220);
    expect(bloc).toContain('if (!a) {');
    expect(bloc).toContain('this.effacerBandeau()');
    /* Le texte est retenu dans l'annonce : on le repeint tel quel, sans
       relire le round (qui a pu avancer derrière les animations). */
    expect(bloc).toContain('this.peindreBandeau(a.texte, a.note)');
    expect(VUE).toContain('this.annonce = { ms: 0, texte, note }');
  });
});

describe('ce que le bandeau dit, et à qui', () => {
  it('le chiffre est romain, comme la chronique du combat', () => {
    expect(VUE).toContain("import { BarreInitiative, romain } from './initiative.js'");
    expect(VUE).toMatch(/const texte = `Round \$\{romain\(round\)\}`/);
  });

  it('« à vous » ne s’affiche jamais quand le joueur n’a pas de camp', () => {
    /* Combat observé ou démonstration : `campDuJoueur` rend `null`, et
       prétendre que la main est au joueur serait un mensonge. */
    const i = VUE.indexOf('private annoncerRound(round: number): void {');
    const bloc = VUE.slice(i, i + 600);
    expect(bloc).toContain('this.deps.demo || aMoi === null');
    expect(bloc).toContain('? null');
    expect(bloc).toContain('À vous d’ouvrir');
    expect(bloc).toContain('L’adversaire ouvre');
  });
});

describe('le cartouche vit puis meurt', () => {
  it('montée, tenue, descente : trois durées, une seule horloge', () => {
    expect(VUE).toContain('private static readonly BANDEAU_MONTEE = 150');
    expect(VUE).toContain('private static readonly BANDEAU_TENUE = 900');
    expect(VUE).toContain('private static readonly BANDEAU_DESCENTE = 350');
    /* Une seule boucle fait vivre la scène : le bandeau y est branché à côté
       du maintien et du tour adverse. */
    expect(VUE).toMatch(/this\.avancerAdversaire\(dt\);\s*this\.avancerBandeau\(dt\);/);
  });

  it('en mouvement réduit, pas de fondu — mais la tenue reste', () => {
    const i = VUE.indexOf('private avancerBandeau(dt: number): void {');
    expect(i).toBeGreaterThan(0);
    const bloc = VUE.slice(i, i + 700);
    expect(bloc).toContain('if (this.deps.reducedMotion) {');
    expect(bloc).toContain('if (a.ms >= montee + tenue) this.effacerBandeau()');
    /* Le texte informatif s'affiche toujours : le mouvement réduit coupe le
       mouvement, pas l'information (même règle que `vfx.mention`). */
    expect(VUE).toContain('this.bandeau.alpha = this.deps.reducedMotion ? 1 : 0');
  });

  it('les textes du cartouche sont détruits, jamais seulement retirés', () => {
    /* `Graphics.clear()` ne détruit pas les enfants : la fuite de `Text` déjà
       trouvée ailleurs dans la vue ne doit pas renaître ici. */
    const i = VUE.indexOf('private effacerBandeau(): void {');
    expect(i).toBeGreaterThan(0);
    const bloc = VUE.slice(i, i + 240);
    expect(bloc).toContain('this.bandeau.removeChildren().forEach((c) => c.destroy({ children: true }))');
  });

  it('le bandeau n’est pas figé en texture — son alpha doit pouvoir bouger', () => {
    /* `figer()` pose `cacheAsTexture` : un sous-arbre figé garderait l'alpha
       de sa capture. Le bandeau ne passe jamais par là. */
    expect(VUE).not.toMatch(/this\.figer\(this\.bandeau\)/);
  });

  it('il se pose sous le grimoire et la carte : rien d’interactif recouvert', () => {
    const i = VUE.indexOf('this.ihm.addChild(');
    expect(i).toBeGreaterThan(0);
    const bloc = VUE.slice(i, i + 400);
    expect(bloc.indexOf('this.bandeau')).toBeGreaterThan(bloc.indexOf('this.aide'));
    expect(bloc.indexOf('this.bandeau')).toBeLessThan(bloc.indexOf('this.grimoire.container'));
  });
});
