/**
 * `render/gains.ts` — LES GAINS FLOTTANTS : « +5 bois » au pas du héros.
 *
 * **Le manque.** Le propriétaire : « je veux […] des animations et de vrais
 * déplacements ». Le ramassage n'avait AUCUN geste : le héros marchait sur un
 * coffre, l'objet disparaissait au `sync()` suivant, et le trésor changeait
 * dans le bandeau sans qu'aucun fil ne relie les deux. Dans HMM3, chaque
 * ramassage se voit — c'est la moitié du plaisir d'explorer.
 *
 * **Le geste.** Une étiquette par ressource gagnée — « +5 bois », « +300
 * écus » — naît sur la case du gain, dérive vers le haut et s'éteint. Trois
 * étiquettes au plus par gain (au-delà, la pile devient un tableau) ; les
 * pertes ne flottent pas — payer est un choix, pas un événement.
 *
 * La couche suit la caméra comme toutes les autres (`majVue(v)`), donc les
 * étiquettes restent collées à leur case pendant que la carte glisse — elles
 * appartiennent au MONDE, pas à l'écran.
 */
import { Container, Text, TextStyle } from 'pixi.js';
import type { MapCoord, Resources } from '@auvergne/engine';
import { xEcran, yEcran } from './commun.js';
import type { Cadrage } from './commun.js';

/** Durée de vie d'une étiquette, en secondes. */
const VIE_S = 1.5;
/** Dérive verticale totale, en pixels d'écran. */
const DERIVE_PX = 44;
/** Étiquettes simultanées au plus — au-delà, on n'écrit que les premières. */
const ETIQUETTES_MAX = 12;

const NOMS: Readonly<Record<string, string>> = {
  ecus: 'écus',
  bois: 'bois',
  granit: 'granit',
  fer: 'fer',
  sel: 'sel',
  essence: 'essence',
  filDor: 'fil d’or',
};

interface Etiquette {
  readonly at: MapCoord;
  readonly texte: Text;
  /** décalage de rang, quand un gain porte plusieurs ressources */
  readonly rang: number;
  /** âge, en secondes */
  age: number;
}

export class GainsFlottants {
  readonly couche = new Container();
  private vives: Etiquette[] = [];

  constructor() {
    this.couche.label = 'gains';
    /* Au-dessus des jetons, sous la météo : un gain se lit par-dessus le
       héros qui le ramasse, jamais par-dessus la pluie. */
    this.couche.eventMode = 'none';
  }

  /**
   * Fait naître les étiquettes d'un gain. Seules les entrées POSITIVES
   * flottent ; un délta entièrement négatif ne produit rien.
   */
  montrer(at: MapCoord, delta: Partial<Resources>): void {
    if (this.vives.length >= ETIQUETTES_MAX) return;
    const gains = Object.entries(delta)
      .filter(([, v]) => typeof v === 'number' && v > 0)
      .slice(0, 3);
    gains.forEach(([clef, valeur], rang) => {
      const texte = new Text({
        text: `+${valeur} ${NOMS[clef] ?? clef}`,
        style: new TextStyle({
          fontFamily: 'Cinzel, Georgia, serif',
          fontSize: 15,
          fontWeight: '700',
          letterSpacing: 0.8,
          fill: 0xf3e3b8,
          stroke: { color: 0x1a1f26, width: 3.5, join: 'round' },
        }),
      });
      texte.anchor.set(0.5, 1);
      this.couche.addChild(texte);
      this.vives.push({ at, texte, rang, age: 0 });
    });
  }

  /** Avance et replace les étiquettes ; à `reducedMotion`, rien ne vit ici. */
  majVue(v: Cadrage, dtS: number): void {
    if (this.vives.length === 0) return;
    const mortes: Etiquette[] = [];
    for (const e of this.vives) {
      e.age += dtS;
      if (e.age >= VIE_S) {
        mortes.push(e);
        continue;
      }
      const t = e.age / VIE_S;
      /* Départ vif, fin douce : la courbe d'un objet lancé, pas un ascenseur. */
      const monte = 1 - (1 - t) * (1 - t);
      e.texte.position.set(
        xEcran(v, e.at.col + 0.5),
        yEcran(v, e.at.row + 0.2) - monte * DERIVE_PX - e.rang * 16,
      );
      /* Pleine encre les deux premiers tiers, fondu sur le dernier. */
      e.texte.alpha = t < 0.66 ? 1 : 1 - (t - 0.66) / 0.34;
    }
    for (const e of mortes) {
      e.texte.destroy();
      this.vives = this.vives.filter((x) => x !== e);
    }
  }

  detruire(): void {
    for (const e of this.vives) e.texte.destroy();
    this.vives = [];
    this.couche.destroy({ children: true });
  }
}
