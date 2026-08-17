/**
 * `apps/client/src/town` — TABLEAU DE CITÉ.
 *
 * ┌──────────────────────────────────────────────────────────────────────┐
 * │  SQUELETTE. Conforme au contrat de `apps/client/src/view-contract.ts`.│
 * │  Il se monte, se redimensionne, s'anime et affiche un panneau         │
 * │  « en construction » sur une esquisse de parallaxe à six plans.       │
 * │                                                                      │
 * │  L'agent des cités remplace le CORPS de `createTownView`, sans        │
 * │  toucher à la signature ni à l'interface `TownView`.                  │
 * └──────────────────────────────────────────────────────────────────────┘
 *
 * Attendu à la place (bible artistique §5) : six plans en parallaxe, dérive de
 * caméra de ±14 px, bâtiments qui se lèvent en 700 ms à la construction, trois
 * étalonnages lumineux (aube, midi, crépuscule) interpolés selon le jour de la
 * semaine, et une vie permanente — fumée de forge, bannières, oiseaux.
 */

import { Container, Graphics, Text, TextStyle } from 'pixi.js';
import type { BuildingId, TownState } from '@auvergne/engine';
import type { TownHour, TownView, TownViewDeps } from '../view-contract.js';

const PARCHEMIN = 0xe8dcc0;
const PARCHEMIN_OMBRE = 0xc9b996;
const ENCRE = 0x241c14;
const OR = 0xc9a227;
const OMBRE_BLEUTEE = 0x2a3242;

/** Étalonnages lumineux du tableau, interpolés par le rendu définitif. */
const ETALONNAGES: Record<TownHour, { ciel: [number, number]; sol: number; voile: number }> = {
  aube: { ciel: [0x3d4a5e, 0x8d7f6a], sol: 0x4a4e52, voile: 0.1 },
  midi: { ciel: [0x5d7d9a, 0xbfd0d8], sol: 0x5a5f63, voile: 0.05 },
  crepuscule: { ciel: [0x2b3a4a, 0xc08a3e], sol: 0x3a3d41, voile: 0.14 },
};

/* ─────────────────────────── Panneau de chantier ────────────────────────── */

function panneauChantier(titre: string, lignes: readonly string[]): Container {
  const racine = new Container();
  racine.label = 'chantier';

  const largeur = 560;
  const hauteur = 250;
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
  for (let i = 0; i < 210; i += 1) {
    const a = (i * 3266489917) % 4294967296;
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
      fontSize: 25,
      fontWeight: '700',
      letterSpacing: 2.2,
      fill: ENCRE,
      align: 'center',
      wordWrap: true,
      wordWrapWidth: largeur - 72,
    }),
  });
  texteTitre.anchor.set(0.5, 0);
  texteTitre.position.set(0, y + 30);
  racine.addChild(texteTitre);

  const filet = new Graphics();
  filet.moveTo(-52, y + 78).lineTo(52, y + 78).stroke({ color: OR, width: 1.4, alpha: 0.8 });
  filet.poly([0, y + 72, 7, y + 78, 0, y + 84, -7, y + 78]).fill({ color: OR, alpha: 0.9 });
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
  corps.position.set(0, y + 100);
  racine.addChild(corps);

  return racine;
}

/* ───────────────────────────── Le squelette ─────────────────────────────── */

class SqueletteCite implements TownView {
  readonly container = new Container();

  private readonly ciel = new Graphics();
  private readonly lointain = new Graphics();
  private readonly sol = new Graphics();
  private readonly chantier: Container;
  private town: TownState | null = null;
  private heure: TownHour;
  private largeur = 1;
  private hauteur = 1;
  private temps = 0;
  private parallaxe = { x: 0, y: 0 };
  private detruit = false;

  constructor(private readonly deps: TownViewDeps) {
    this.container.label = `cite-${deps.town}`;
    this.heure = deps.hour ?? 'midi';
    this.container.addChild(this.ciel, this.lointain, this.sol);

    const nom =
      deps.faction === 'granit' ? 'Châtellenie de Granit' : 'Ermitage des Bois Noirs';
    this.chantier = panneauChantier(nom, [
      'Le tableau de cité en parallaxe à six plans,',
      'la levée des bâtiments et les trois étalonnages du jour',
      'sont peints par le module des cités.',
    ]);
    this.container.addChild(this.chantier);
  }

  /* — Pilotage — */

  setTown(town: TownState): void {
    this.town = town;
  }

  setHour(hour: TownHour): void {
    if (hour === this.heure) return;
    this.heure = hour;
    this.peindre();
  }

  highlightBuilding(_building: BuildingId | null): void {
    /* Repris par le rendu définitif. */
  }

  async playBuild(_building: BuildingId): Promise<void> {
    /* Aucune levée à animer dans le squelette. */
  }

  setParallax(x: number, y: number): void {
    this.parallaxe = { x: Math.max(-1, Math.min(1, x)), y: Math.max(-1, Math.min(1, y)) };
  }

  /* — Cycle de vie — */

  resize(width: number, height: number): void {
    this.largeur = Math.max(1, width);
    this.hauteur = Math.max(1, height);
    this.chantier.position.set(this.largeur / 2, this.hauteur / 2);
    this.peindre();
  }

  update(dtMs: number): void {
    if (this.detruit) return;
    this.temps += dtMs;
    /* Dérive de caméra : ±14 px, amortie, coupée si le mouvement est réduit. */
    const cible = this.deps.reducedMotion ? 0 : this.parallaxe.x * 14;
    this.lointain.x += (cible * 0.4 - this.lointain.x) * 0.06;
    this.sol.x += (cible - this.sol.x) * 0.06;
    if (!this.deps.reducedMotion) {
      this.chantier.y = this.hauteur / 2 + Math.sin(this.temps / 3100) * 2;
    }
  }

  destroy(): void {
    if (this.detruit) return;
    this.detruit = true;
    this.container.destroy({ children: true });
  }

  /* — Peinture — */

  private peindre(): void {
    const cal = ETALONNAGES[this.heure];

    const c = this.ciel;
    c.clear();
    const bandes = 26;
    for (let i = 0; i < bandes; i += 1) {
      const t = i / (bandes - 1);
      const haut = cal.ciel[0];
      const bas = cal.ciel[1];
      const r = Math.round(((haut >> 16) & 255) * (1 - t) + ((bas >> 16) & 255) * t);
      const v = Math.round(((haut >> 8) & 255) * (1 - t) + ((bas >> 8) & 255) * t);
      const b = Math.round((haut & 255) * (1 - t) + (bas & 255) * t);
      c.rect(0, (this.hauteur * 0.72 * i) / bandes, this.largeur, (this.hauteur * 0.72) / bandes + 1).fill(
        (r << 16) | (v << 8) | b,
      );
    }

    /* Plan lointain : la ligne des Bois Noirs, désaturée vers le bleu de brume. */
    const l = this.lointain;
    l.clear();
    const base = this.hauteur * 0.72;
    for (let couche = 0; couche < 3; couche += 1) {
      const points: number[] = [-40, base + couche * 18];
      const amplitude = 70 - couche * 18;
      for (let x = -40; x <= this.largeur + 40; x += 46) {
        const onde =
          Math.sin((x + couche * 137) / 190) * amplitude + Math.sin((x + couche * 61) / 73) * (amplitude / 4);
        points.push(x, base - 40 + couche * 26 - onde * 0.5);
      }
      points.push(this.largeur + 40, base + 120, -40, base + 120);
      const melange = 0.2 + couche * 0.24;
      const teinte = melangeCouleur(0x1e3226, 0x8fa6b8, 1 - melange);
      l.poly(points).fill({ color: teinte, alpha: 0.92 });
    }

    /* Plan principal : le sol pavé, avec grain et joints. */
    const s = this.sol;
    s.clear();
    s.rect(0, base + 60, this.largeur, this.hauteur - base - 60).fill(cal.sol);
    for (let i = 0; i < 26; i += 1) {
      const y = base + 66 + i * 14;
      s.moveTo(-20, y).lineTo(this.largeur + 20, y).stroke({
        color: OMBRE_BLEUTEE,
        width: 1,
        alpha: 0.16,
      });
    }
    s.rect(0, base + 60, this.largeur, 3).fill({ color: 0xffe9c2, alpha: 0.22 });
    /* Voile atmosphérique global. */
    s.rect(0, 0, this.largeur, this.hauteur).fill({ color: 0x8fa6b8, alpha: cal.voile });

    const nomCite = this.town?.name ?? '';
    const ancien = this.container.getChildByLabel?.('cartouche-cite');
    if (ancien) ancien.destroy();
    if (nomCite) {
      const cartouche = new Text({
        text: nomCite.toUpperCase(),
        style: new TextStyle({
          fontFamily: 'Cinzel, Georgia, serif',
          fontSize: 18,
          letterSpacing: 3,
          fill: 0xede3ce,
        }),
      });
      cartouche.label = 'cartouche-cite';
      cartouche.position.set(24, 20);
      this.container.addChild(cartouche);
    }
  }
}

/** Mélange linéaire de deux couleurs entières. */
function melangeCouleur(a: number, b: number, t: number): number {
  const r = Math.round(((a >> 16) & 255) * (1 - t) + ((b >> 16) & 255) * t);
  const v = Math.round(((a >> 8) & 255) * (1 - t) + ((b >> 8) & 255) * t);
  const bl = Math.round((a & 255) * (1 - t) + (b & 255) * t);
  return (r << 16) | (v << 8) | bl;
}

/* ────────────────────────────── La fabrique ─────────────────────────────── */

/**
 * Fabrique du tableau de cité. **Signature imposée** par
 * `apps/client/src/view-contract.ts` : ne pas la changer.
 */
export async function createTownView(deps: TownViewDeps): Promise<TownView> {
  const vue = new SqueletteCite(deps);
  const etat = deps.store.get().game?.towns[deps.town];
  if (etat) vue.setTown(etat);
  vue.resize(deps.width, deps.height);
  return vue;
}

export type { TownView, TownViewDeps, TownHour } from '../view-contract.js';
