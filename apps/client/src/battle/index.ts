/**
 * `apps/client/src/battle` — RENDU DU COMBAT TACTIQUE.
 *
 * ┌──────────────────────────────────────────────────────────────────────┐
 * │  SQUELETTE. Conforme au contrat de `apps/client/src/view-contract.ts`,│
 * │  monté et animé pour de vrai : il dessine la grille hexagonale        │
 * │  15 × 11 et un panneau « en construction ».                           │
 * │                                                                      │
 * │  L'agent du rendu de combat remplace le CORPS de `createBattleView`,  │
 * │  sans toucher à la signature ni à l'interface `BattleView`.           │
 * └──────────────────────────────────────────────────────────────────────┘
 *
 * Attendu à la place : les sept piles par camp montées sur `atlas.creatureRig`,
 * la barre d'initiative, la prévisualisation d'attaque chiffrée par
 * `damageRange`, les ripostes, les sièges. Aucune règle n'est calculée ici :
 * les nombres viennent tous du moteur.
 */

import { Container, Graphics, Text, TextStyle } from 'pixi.js';
import { HEX_COLS, HEX_ROWS } from '@auvergne/engine';
import type { CombatState, GameEvent, HexCoord } from '@auvergne/engine';
import type { AttackPreview, BattleView, BattleViewDeps } from '../view-contract.js';

const PARCHEMIN = 0xe8dcc0;
const PARCHEMIN_OMBRE = 0xc9b996;
const ENCRE = 0x241c14;
const OR = 0xc9a227;
const OMBRE_BLEUTEE = 0x2a3242;
const HERBE = 0x4a6138;

/* ─────────────────────────── Panneau de chantier ────────────────────────── */

function panneauChantier(titre: string, lignes: readonly string[]): Container {
  const racine = new Container();
  racine.label = 'chantier';

  const largeur = 560;
  const hauteur = 240;
  const x = -largeur / 2;
  const y = -hauteur / 2;

  const fond = new Graphics();
  fond.roundRect(x + 6, y + 8, largeur, hauteur, 3).fill({ color: OMBRE_BLEUTEE, alpha: 0.34 });
  fond.roundRect(x, y, largeur, hauteur, 3).fill(PARCHEMIN);
  for (let i = 0; i < 14; i += 1) {
    const t = i / 13;
    fond
      .rect(x, y + t * hauteur, largeur, hauteur / 14 + 1)
      .fill({ color: PARCHEMIN_OMBRE, alpha: 0.06 + t * 0.1 });
  }
  for (let i = 0; i < 200; i += 1) {
    const a = (i * 2246822519) % 4294967296;
    fond.rect(x + ((a >>> 8) % largeur), y + ((a >>> 3) % hauteur), 1, 1).fill({ color: ENCRE, alpha: 0.05 });
  }
  fond.rect(x, y, largeur, 2).fill({ color: 0xffe9c2, alpha: 0.5 });
  fond.rect(x, y + hauteur - 2, largeur, 2).fill({ color: OMBRE_BLEUTEE, alpha: 0.4 });
  fond.roundRect(x, y, largeur, hauteur, 3).stroke({ color: OR, width: 2, alpha: 0.75 });
  fond.roundRect(x + 7, y + 7, largeur - 14, hauteur - 14, 2).stroke({ color: OR, width: 1, alpha: 0.5 });
  racine.addChild(fond);

  const texteTitre = new Text({
    text: titre.toUpperCase(),
    style: new TextStyle({
      fontFamily: 'Cinzel, Georgia, serif',
      fontSize: 26,
      fontWeight: '700',
      letterSpacing: 2.2,
      fill: ENCRE,
      align: 'center',
    }),
  });
  texteTitre.anchor.set(0.5, 0);
  texteTitre.position.set(0, y + 30);
  racine.addChild(texteTitre);

  const filet = new Graphics();
  filet.moveTo(-52, y + 72).lineTo(52, y + 72).stroke({ color: OR, width: 1.4, alpha: 0.8 });
  filet.poly([0, y + 66, 7, y + 72, 0, y + 78, -7, y + 72]).fill({ color: OR, alpha: 0.9 });
  racine.addChild(filet);

  const corps = new Text({
    text: lignes.join('\n'),
    style: new TextStyle({
      fontFamily: '"EB Garamond", Georgia, serif',
      fontSize: 18,
      fill: 0x4c3f2f,
      align: 'center',
      wordWrap: true,
      wordWrapWidth: largeur - 88,
      lineHeight: 27,
    }),
  });
  corps.anchor.set(0.5, 0);
  corps.position.set(0, y + 94);
  racine.addChild(corps);

  return racine;
}

/* ───────────────────────────── Le squelette ─────────────────────────────── */

class SqueletteCombat implements BattleView {
  readonly container = new Container();

  private readonly fond = new Graphics();
  private readonly grille = new Graphics();
  private readonly chantier: Container;
  private combat: CombatState;
  private largeur = 1;
  private hauteur = 1;
  private temps = 0;
  private cote = 46;
  private origine = { x: 0, y: 0 };
  private detruit = false;

  constructor(private readonly deps: BattleViewDeps) {
    this.container.label = 'combat-tactique';
    this.combat = deps.combat;
    this.container.addChild(this.fond, this.grille);
    this.chantier = panneauChantier('Combat tactique', [
      'La grille hexagonale 15 × 11 est en place.',
      'Piles, initiative, ripostes et prévisualisation de dégâts',
      'sont peints par le module de rendu de combat.',
    ]);
    this.container.addChild(this.chantier);
  }

  /* — Pilotage — */

  setCombat(combat: CombatState): void {
    this.combat = combat;
  }

  setActiveUnit(_unitId: string | null): void {
    /* Repris par le rendu définitif. */
  }

  setReachable(_hexes: readonly HexCoord[]): void {
    /* Repris par le rendu définitif. */
  }

  setMovePreview(_path: readonly HexCoord[] | null): void {
    /* Repris par le rendu définitif. */
  }

  setAttackPreview(_preview: AttackPreview | null): void {
    /* Repris par le rendu définitif. */
  }

  setSpellTargets(_hexes: readonly HexCoord[] | null): void {
    /* Repris par le rendu définitif. */
  }

  async playEvents(_events: readonly GameEvent[]): Promise<void> {
    /* Aucune animation dans le squelette. */
  }

  /* — Conversions — */

  hexAt(x: number, y: number): HexCoord | null {
    const row = Math.round((y - this.origine.y) / (this.cote * 0.86));
    if (row < 0 || row >= HEX_ROWS) return null;
    const decalage = row % 2 === 1 ? this.cote / 2 : 0;
    const col = Math.round((x - this.origine.x - decalage) / this.cote);
    if (col < 0 || col >= HEX_COLS) return null;
    return { col, row };
  }

  screenOf(hex: HexCoord): { x: number; y: number } {
    const decalage = hex.row % 2 === 1 ? this.cote / 2 : 0;
    return {
      x: this.origine.x + hex.col * this.cote + decalage,
      y: this.origine.y + hex.row * this.cote * 0.86,
    };
  }

  /* — Cycle de vie — */

  resize(width: number, height: number): void {
    this.largeur = Math.max(1, width);
    this.hauteur = Math.max(1, height);
    this.cote = Math.max(22, Math.min((this.largeur - 96) / (HEX_COLS + 0.5), (this.hauteur - 140) / (HEX_ROWS * 0.86)));
    const largeurGrille = this.cote * (HEX_COLS + 0.5);
    const hauteurGrille = this.cote * 0.86 * (HEX_ROWS - 1);
    this.origine = {
      x: (this.largeur - largeurGrille) / 2 + this.cote / 2,
      y: (this.hauteur - hauteurGrille) / 2,
    };
    this.chantier.position.set(this.largeur / 2, this.hauteur / 2);
    this.peindre();
  }

  update(dtMs: number): void {
    if (this.detruit || this.deps.reducedMotion) return;
    this.temps += dtMs;
    this.chantier.y = this.hauteur / 2 + Math.sin(this.temps / 2900) * 2;
  }

  destroy(): void {
    if (this.detruit) return;
    this.detruit = true;
    this.container.destroy({ children: true });
  }

  /* — Peinture — */

  private peindre(): void {
    const f = this.fond;
    f.clear();
    const bandes = 20;
    for (let i = 0; i < bandes; i += 1) {
      const t = i / (bandes - 1);
      const r = Math.round(0x2f * (1 - t) + 0x1e * t);
      const v = Math.round(0x3b * (1 - t) + 0x32 * t);
      const b = Math.round(0x2e * (1 - t) + 0x26 * t);
      f.rect(0, (this.hauteur * i) / bandes, this.largeur, this.hauteur / bandes + 1).fill(
        (r << 16) | (v << 8) | b,
      );
    }
    f.poly([0, 0, this.largeur * 0.6, 0, 0, this.hauteur * 0.66]).fill({ color: 0xffe9c2, alpha: 0.045 });

    const g = this.grille;
    g.clear();
    const r = this.cote / 2;
    for (let row = 0; row < HEX_ROWS; row += 1) {
      for (let col = 0; col < HEX_COLS; col += 1) {
        const { x, y } = this.screenOf({ col, row });
        const points: number[] = [];
        for (let k = 0; k < 6; k += 1) {
          const angle = (Math.PI / 180) * (60 * k - 30);
          points.push(x + r * 0.98 * Math.cos(angle), y + r * 0.98 * Math.sin(angle));
        }
        const teinte = (col + row) % 2 === 0 ? 0.1 : 0.16;
        g.poly(points).fill({ color: HERBE, alpha: teinte });
        g.poly(points, true).stroke({ color: OR, width: 1, alpha: 0.2 });
      }
    }
    /* Repère du round en cours, en haut à gauche de la grille. */
    const legende = new Text({
      text: `Round ${this.combat.round ?? 1}`,
      style: new TextStyle({
        fontFamily: 'Cinzel, Georgia, serif',
        fontSize: 16,
        letterSpacing: 1.6,
        fill: 0xede3ce,
      }),
    });
    legende.position.set(this.origine.x - this.cote / 2, Math.max(12, this.origine.y - 34));
    /* Un seul exemplaire : on remplace celui de la passe précédente. */
    const ancien = this.container.getChildByLabel?.('legende-round');
    if (ancien) ancien.destroy();
    legende.label = 'legende-round';
    this.container.addChild(legende);
  }
}

/* ────────────────────────────── La fabrique ─────────────────────────────── */

/**
 * Fabrique du combat tactique. **Signature imposée** par
 * `apps/client/src/view-contract.ts` : ne pas la changer.
 */
export async function createBattleView(deps: BattleViewDeps): Promise<BattleView> {
  const vue = new SqueletteCombat(deps);
  vue.resize(deps.width, deps.height);
  return vue;
}

export type { BattleView, BattleViewDeps } from '../view-contract.js';
