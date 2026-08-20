import { describe, expect, it } from 'vitest';
import { buildWorld } from '@auvergne/map';
import { CREATURES } from '@auvergne/content';
import type { ResourceKey } from '@auvergne/engine';

/**
 * « IL FAUT SUFFISAMMENT DE MINES DE RESSOURCES POUR POUVOIR JOUER. »
 *
 * C'est une des dix demandes du propriétaire, et c'était la moins tenue de
 * toutes — sans que rien ne le dise, parce qu'aucune mesure ne regardait cette
 * question. Ce que la mesure a trouvé sur la graine de référence :
 *
 *   - la carte entière rendait TROIS essences par jour contre QUATORZE fers.
 *     L'essence est pourtant toute l'économie rare de l'Ermitage, comme le fer
 *     est celle du Granit : une maison sur deux ne pouvait pas lever ses hauts
 *     rangs. Trois causes cumulées : les gisements d'essence et de fil d'or
 *     étaient les SEULS de la carte à rendre 1 au lieu de 2, il n'y en avait que
 *     trois et deux, et les quatorze gisements tirés au sort prenaient leur
 *     ressource dans la table des TAS, où `ecus` pèse vingt-six sur cent et
 *     était reversé au fer — le fer récoltait donc quarante pour cent des
 *     filons et l'essence six ;
 *   - deux capitales sur cinq n'avaient pas accès à l'économie d'une des deux
 *     maisons : La Renaudie trouvait son essence à 59 cases et son sel à 112,
 *     Viscomtat son fer à 40 et son fil d'or à 55. Or la faction n'est jamais
 *     imposée par la géographie : le joueur la choisit sur l'écran de nouvelle
 *     partie. Il choisissait donc à pile ou face sans le savoir.
 *
 * Ces trois tests gardent la correction. Ils ne lisent AUCUNE constante du
 * semeur : les bornes sont écrites en toutes lettres, parce qu'un test qui lit
 * la constante qu'il garde descend avec elle.
 */

const GRAINES = [20250816, 7, 42] as const;
const RARES: readonly ResourceKey[] = ['essence', 'fer', 'filDor', 'sel'];
/** Cinq sièges, donc un cinquième de la carte par joueur si nul ne conquiert. */
const JOUEURS = 5;

interface Carte {
  /** Rendement journalier de la carte entière, par ressource. */
  readonly parJour: Record<string, number>;
  /** Distance de Tchebychev de chaque capitale au gisement le plus proche. */
  readonly portee: { capitale: string; ressource: string; cases: number }[];
}

function lire(graine: number): Carte {
  const w = buildWorld(graine);
  const parJour: Record<string, number> = {};
  const mines = w.objects.filter((o) => o.kind === 'mine');
  for (const o of mines) {
    const d = o.data as Record<string, unknown>;
    const r = String(d.resource);
    parJour[r] = (parJour[r] ?? 0) + Number(d.amount);
  }
  const portee: { capitale: string; ressource: string; cases: number }[] = [];
  for (const cap of w.objects.filter((o) => o.kind === 'ville')) {
    const nom = String((cap.data as Record<string, unknown>).name ?? '?');
    for (const r of RARES) {
      let best = Number.POSITIVE_INFINITY;
      for (const o of mines) {
        if ((o.data as Record<string, unknown>).resource !== r) continue;
        const d = Math.max(Math.abs(o.at.col - cap.at.col), Math.abs(o.at.row - cap.at.row));
        if (d < best) best = d;
      }
      portee.push({ capitale: nom, ressource: r, cases: best });
    }
  }
  return { parJour, portee };
}

/** Ce que coûte, par semaine, la croissance des trois hauts rangs d'une maison. */
function besoinHebdo(faction: string, ressource: ResourceKey): number {
  let total = 0;
  for (const c of Object.values(CREATURES) as { id: string; faction: string; tier: number; growth: number; cost: Record<string, number> }[]) {
    if (c.faction !== faction) continue;
    if (c.tier < 5) continue;
    /* Les rangs améliorés ne s'AJOUTENT pas à la base : un repaire amélioré
       remplace le repaire, on recrute l'un OU l'autre. Les compter tous les deux
       doublerait le besoin — c'est l'erreur que la première version de ce test a
       faite, et elle rendait 72 là où le barème vaut 31. On prend la version de
       base, la moins chère : ce test garde un plancher, pas un idéal. */
    if (c.id.endsWith('_up')) continue;
    if (c.cost[ressource] === undefined) continue;
    total += c.cost[ressource] * c.growth;
  }
  return total;
}

describe('la carte nourrit les deux maisons', () => {
  it("rend autant d'essence que de fer, à un cinquième près", () => {
    /*
     * L'invariant central, et celui qui manquait. L'essence est à l'Ermitage ce
     * que le fer est au Granit : si l'une des deux est trois fois plus rare que
     * l'autre, la moitié des joueurs jouent une maison estropiée.
     *
     * Mesuré après correction, sur quatre graines : essence 110 par semaine,
     * fer 105. Avant : essence 21, fer 98 — un rapport de 4,7.
     */
    for (const graine of GRAINES) {
      const { parJour } = lire(graine);
      const essence = parJour.essence ?? 0;
      const fer = parJour.fer ?? 0;
      expect(essence, `graine ${String(graine)} : aucune essence`).toBeGreaterThan(0);
      expect(fer, `graine ${String(graine)} : aucun fer`).toBeGreaterThan(0);
      const rapport = Math.max(essence, fer) / Math.min(essence, fer);
      expect(
        rapport,
        `graine ${String(graine)} : essence ${String(essence)}/jour contre fer ${String(fer)}/jour`,
      ).toBeLessThanOrEqual(1.25);
    }
  });

  it('donne à chaque maison de quoi lever la moitié de ses hauts rangs', () => {
    /*
     * Le barème : la croissance hebdomadaire des rangs 5, 6 et 7 coûte 31
     * essences à l'Ermitage et 33 fers au Granit. Un joueur qui ne tiendrait
     * qu'un cinquième de la carte doit pouvoir en financer au moins la MOITIÉ —
     * le reste se prend sur l'adversaire, et c'est le jeu. En dessous, les
     * hauts rangs deviennent décoratifs et la partie se joue en rang 3.
     *
     * Mesuré après correction : 22,1 essences et 21,0 fers par joueur et par
     * semaine, contre 31 et 33 de besoin, soit 71 % et 64 %. Avant : 4,2 % pour
     * l'essence.
     */
    const cas: [string, ResourceKey][] = [
      ['ermitage', 'essence'],
      ['granit', 'fer'],
    ];
    for (const graine of GRAINES) {
      const { parJour } = lire(graine);
      for (const [faction, r] of cas) {
        const offre = ((parJour[r] ?? 0) * 7) / JOUEURS;
        const besoin = besoinHebdo(faction, r);
        expect(besoin, `${faction} ne dépense pas de ${r} : le barème a bougé`).toBeGreaterThan(20);
        expect(
          offre / besoin,
          `graine ${String(graine)} · ${faction} : ${offre.toFixed(1)} ${r} par semaine et par joueur pour ${String(besoin)} de besoin`,
        ).toBeGreaterThanOrEqual(0.5);
      }
    }
  });

  it('met les quatre ressources rares à portée de CHAQUE capitale', () => {
    /*
     * La faction n'est jamais imposée par la géographie : le joueur la choisit.
     * Chaque siège doit donc pouvoir jouer l'une ou l'autre maison, ce qui veut
     * dire avoir les quatre rares à distance de campagne.
     *
     * Trente-six cases, c'est environ trois jours de marche d'un héros de départ
     * sur route, davantage en montagne : assez loin pour qu'il faille aller le
     * chercher, assez près pour que ce soit un objectif et non un rêve.
     *
     * Mesuré après correction sur cinq graines et vingt-cinq capitales : pire
     * cas 24 (essence), 22 (fer), 28 (fil d'or), 32 (sel). Avant : 59, 40, 66
     * et 112 — La Renaudie ne pouvait pas jouer Ermitage, Viscomtat ne pouvait
     * pas jouer Granit.
     */
    const trop: string[] = [];
    for (const graine of GRAINES) {
      for (const p of lire(graine).portee) {
        if (p.cases > 36) {
          trop.push(`graine ${String(graine)} · ${p.capitale} → ${p.ressource} à ${String(p.cases)} cases`);
        }
      }
    }
    expect(trop).toEqual([]);
  });
});
