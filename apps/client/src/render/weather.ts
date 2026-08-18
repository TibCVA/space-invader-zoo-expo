/**
 * `render/weather.ts` — le temps qu'il fait sur le Forez.
 *
 * Cinq climats, cinq couches de particules tirées de l'atlas d'effets, plus un
 * voile coloré très léger qui accorde l'ensemble : la pluie refroidit, la brume
 * bleuit et mange les lointains, le givre pique de blanc, le vent emporte des
 * feuilles, l'éclaircie ne laisse que des poussières dorées.
 *
 * Rien n'est violent : la loi n°7 impose un mouvement permanent mais discret.
 * `reducedMotion` coupe tout, sauf le voile.
 */

import { Container, Graphics } from 'pixi.js';
import type { WeatherKind } from '@auvergne/engine';
import type { ArtAtlas } from '../art/index.js';
import type { Effet } from '../art/effects.js';
import type { ViewQuality } from '../view-contract.js';
import { LIGHT, PALETTE, melanger } from '../art/palette.js';

interface Reglage {
  effets: { kind: Parameters<ArtAtlas['effet']>[0]; intensite: number }[];
  voile: number;
  alpha: number;
}

const CLIMATS: Readonly<Record<WeatherKind, Reglage>> = {
  eclaircie: { effets: [{ kind: 'poussiere', intensite: 0.5 }], voile: LIGHT.chaude, alpha: 0.045 },
  pluie: {
    effets: [
      { kind: 'pluie', intensite: 1.1 },
      { kind: 'brume', intensite: 0.4 },
    ],
    voile: melanger(PALETTE.bleuProfond, PALETTE.bleuBrume, 0.4),
    alpha: 0.14,
  },
  brume: {
    effets: [{ kind: 'brume', intensite: 1 }],
    voile: PALETTE.bleuBrume,
    alpha: 0.13,
  },
  givre: {
    effets: [{ kind: 'givre', intensite: 0.9 }],
    voile: melanger(PALETTE.bleuBrume, LIGHT.chaude, 0.25),
    alpha: 0.1,
  },
  vent: {
    effets: [
      { kind: 'feuilles', intensite: 0.9 },
      { kind: 'poussiere', intensite: 0.6 },
    ],
    voile: melanger(PALETTE.ocre, PALETTE.bleuBrume, 0.5),
    alpha: 0.06,
  },
};

export class Meteo {
  readonly couche = new Container();
  private readonly voile = new Graphics();
  private readonly effets: Effet[] = [];
  private climat: WeatherKind | null = null;
  private largeur = 1;
  private hauteur = 1;

  constructor(
    private readonly atlas: ArtAtlas,
    private readonly quality: ViewQuality,
    private readonly reducedMotion: boolean,
  ) {
    this.couche.label = 'meteo';
    this.couche.addChild(this.voile);
  }

  redimensionner(largeur: number, hauteur: number): void {
    this.largeur = Math.max(1, largeur);
    this.hauteur = Math.max(1, hauteur);
    const climat = this.climat;
    this.peindreVoile();
    if (climat) {
      this.climat = null;
      this.poser(climat);
    }
  }

  poser(climat: WeatherKind): void {
    if (climat === this.climat) return;
    this.climat = climat;
    for (const e of this.effets) e.destroy({ children: true });
    this.effets.length = 0;
    this.peindreVoile();
    if (this.reducedMotion) return;
    const reglage = CLIMATS[climat];
    const force = this.quality === 'basse' ? 0.4 : this.quality === 'moyenne' ? 0.7 : 1;
    for (const def of reglage.effets) {
      const effet = this.atlas.effet(def.kind, {
        largeur: this.largeur * 1.1,
        hauteur: this.hauteur * 1.1,
        intensite: def.intensite * force,
        duree: 0,
        graine: 20250816 + def.kind.length,
      });
      effet.position.set(this.largeur / 2, this.hauteur / 2);
      this.couche.addChild(effet);
      this.effets.push(effet);
    }
  }

  private peindreVoile(): void {
    const g = this.voile;
    g.clear();
    if (!this.climat) return;
    const r = CLIMATS[this.climat];
    /* Jamais un aplat : le voile est plus dense en bas, comme l'air chargé
       d'une vallée, et respecte l'éclairage venu du nord-ouest. */
    const bandes = 16;
    for (let i = 0; i < bandes; i += 1) {
      const t = i / (bandes - 1);
      g.rect(0, (this.hauteur * i) / bandes, this.largeur, this.hauteur / bandes + 1).fill({
        color: r.voile,
        alpha: r.alpha * (0.55 + t * 0.9),
      });
    }
    g.poly([0, 0, this.largeur * 0.6, 0, 0, this.hauteur * 0.66]).fill({
      color: LIGHT.chaude,
      alpha: r.alpha * 0.35,
    });
  }

  animer(dtMs: number): void {
    if (this.reducedMotion) return;
    for (const e of this.effets) e.update(dtMs);
  }

  destroy(): void {
    for (const e of this.effets) e.destroy({ children: true });
    this.effets.length = 0;
    this.couche.destroy({ children: true });
  }
}
