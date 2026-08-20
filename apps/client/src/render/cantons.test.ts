import { describe, expect, it } from 'vitest';
import { REGIONS, TERRAINS } from '@auvergne/engine';

import { CANTONS, accepte, cantonDe, gelDePays } from './cantons.js';
import { PALETTE, melanger } from '../art/palette.js';
import { PROPS, type PropKey } from '../art/props.js';

/**
 * « Il faut que la carte soit très jolie avec beaucoup de détails (même si items
 * non jouables) et les différentes zones bien délimitées visuellement. »
 *
 * Ce que ce test garde n'est pas une impression : c'est que les douze pays
 * existent bel et bien dans les données du rendu, qu'ils diffèrent assez pour se
 * voir, et que la différence ne peut pas produire d'absurdité — un muret dans une
 * tourbière, une ferme dans une falaise.
 *
 * Le rendu lui-même se juge sur capture ; ces tests-ci gardent les invariants
 * qu'une capture ne montre pas : la couverture des douze cantons, la présence de
 * chaque silhouette dans l'atlas, l'écart de densité entre le pays le plus dense
 * et le plus clairsemé.
 */
/** Teinte, saturation et clarté d'une couleur — la clarté sur 255, comme la palette. */
function hsl(c: number): { h: number; s: number; l: number } {
  const r = ((c >> 16) & 255) / 255;
  const g = ((c >> 8) & 255) / 255;
  const b = (c & 255) / 255;
  const mx = Math.max(r, g, b);
  const mn = Math.min(r, g, b);
  const d = mx - mn;
  const l = (mx + mn) / 2;
  const s = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1));
  let h = 0;
  if (d !== 0) {
    if (mx === r) h = 60 * (((g - b) / d) % 6);
    else if (mx === g) h = 60 * ((b - r) / d + 2);
    else h = 60 * ((r - g) / d + 4);
  }
  return { h: (h + 360) % 360, s: s * 100, l: l * 255 };
}

describe('les douze pays du Forez', () => {
  it('donne un caractère à CHAQUE canton, sans repli muet', () => {
    for (const id of REGIONS) {
      expect(CANTONS[id], id).toBeDefined();
    }
    /* Et pas de canton fantôme dans la table. */
    for (const id of Object.keys(CANTONS)) {
      expect(REGIONS as readonly string[]).toContain(id);
    }
  });

  it('retombe sur un pays neutre pour un index hors table', () => {
    const neutre = cantonDe(200);
    expect(neutre.dose).toBe(0);
    expect(neutre.signature).toEqual([]);
    expect(neutre.bati).toEqual([]);
  });

  it('tient la teinte de pays sous un cinquième', () => {
    for (const id of REGIONS) {
      expect(CANTONS[id].dose, id).toBeGreaterThan(0);
      expect(CANTONS[id].dose, id).toBeLessThanOrEqual(0.22);
    }
  });

  /*
   * La teinte de pays se mesure, elle ne se décrète pas — et la première série
   * a été RÉFUTÉE par la mesure.
   *
   * Elle était bâtie sur des mélanges voisins du biome : « estive » = hêtre ×
   * ocre, « hétraie » = hêtre × fougère. Résultat mesuré sur les trois sols de
   * référence : de zéro à quatre degrés de déplacement de teinte, deux points de
   * clarté. Autrement dit, rien du tout — ce qu'on lisait sur la capture comme
   * une délimitation de zones était le terrain, prairie contre forêt contre
   * roche, et pas le pays. Les ancres sont donc allées chercher l'ocre à 35°, le
   * sapin à 144°, le bleu de brume à 206°, le grenat à 352°, loin du sol du
   * Forez qui vit entre 79° et 90°.
   *
   * Deux bornes, dans les deux sens :
   *
   *   - un pays doit SE VOIR : au moins dix sur douze déplacent la teinte de six
   *     degrés ou la clarté de six points sur au moins un des trois sols ;
   *   - un pays ne doit pas se lire comme un défaut d'éclairage : jamais plus de
   *     quatorze points de clarté ni neuf points de saturation d'écart. C'est ce
   *     qui a fait retirer le bleu de brume pur, qui vaut 163 de clarté contre 90
   *     au sol et délavait l'estive de seize points.
   */
  it('déplace assez la couleur du sol pour se voir, sans la délaver', () => {
    const sols = [
      melanger(
        melanger(PALETTE.vertHetre, PALETTE.ocre, 0.18),
        melanger(melanger(PALETTE.vertHetre, PALETTE.ocre, 0.14), PALETTE.bleuBrume, 0.12),
        0.8,
      ),
      melanger(melanger(PALETTE.vertSapin, PALETTE.vertHetre, 0.54), PALETTE.brunFougere, 0.16),
      melanger(
        melanger(PALETTE.granitAnthracite, PALETTE.brunFougere, 0.3),
        melanger(PALETTE.bleuBrume, PALETTE.bleuProfond, 0.5),
        0.7,
      ),
    ];
    let visibles = 0;
    for (const id of REGIONS) {
      const c = CANTONS[id];
      let vu = false;
      for (const sol of sols) {
        const a = hsl(sol);
        const b = hsl(gelDePays(sol, c.teinte, c.dose));
        const dTeinte = Math.abs(((b.h - a.h + 540) % 360) - 180);
        const dLum = Math.abs(b.l - a.l);
        const dSat = Math.abs(b.s - a.s);
        expect(dLum, `${id} : ${dLum.toFixed(1)} points de clarté`).toBeLessThanOrEqual(14);
        expect(dSat, `${id} : ${dSat.toFixed(1)} points de saturation`).toBeLessThanOrEqual(9);
        /*
         * Trois axes, pas un. Un pays peut se signaler par sa TEINTE — mais un
         * sol presque gris laisse la teinte basculer de cent degrés pour un
         * changement invisible, donc on n'y croit qu'au-dessus de quatorze pour
         * cent de chroma —, par sa CLARTÉ, ou par sa CHROMA : la gorge de la
         * Durolle est le même vert que le sol, en plus vif de six points, et
         * cela se voit très bien. Ne compter que la teinte aurait fait passer la
         * Durolle pour invisible et poussé à lui donner une couleur qu'elle n'a
         * pas.
         */
        if ((b.s > 14 && dTeinte >= 6) || dLum >= 6 || dSat >= 4.5) vu = true;
      }
      if (vu) visibles++;
    }
    expect(visibles, `${String(visibles)} pays sur douze se voient`).toBeGreaterThanOrEqual(10);
  });

  it('creuse un écart de densité qui se voit', () => {
    const densites = REGIONS.map((id) => CANTONS[id].densite);
    const min = Math.min(...densites);
    const max = Math.max(...densites);
    /* Le Cœur des Bois Noirs contre les Hauts d'Arconsat : il faut au moins un
       rapport de deux pour qu'on sente qu'on change de pays sans lire son nom. */
    expect(max / min).toBeGreaterThanOrEqual(2);
    /* Mais jamais de désert ni de mur : le semis reste jouable. */
    expect(min).toBeGreaterThanOrEqual(0.5);
    expect(max).toBeLessThanOrEqual(1.6);
  });

  it('ne nomme que des silhouettes que l’atlas sait dessiner', () => {
    for (const id of REGIONS) {
      for (const k of [...CANTONS[id].signature, ...CANTONS[id].bati]) {
        expect(PROPS[k], `${id} → ${k}`).toBeDefined();
      }
    }
  });

  it('n’accepte une silhouette que sur un terrain qui la porte', () => {
    /* La règle métier, écrite plutôt que supposée : rien ne pousse sur l'eau,
       et un bâti ne se plante ni dans un lac ni dans une falaise. */
    const eau = TERRAINS.indexOf('eau');
    const falaise = TERRAINS.indexOf('falaise');
    for (const k of Object.keys(PROPS) as PropKey[]) {
      expect(accepte(k, eau), `${k} sur l'eau`).toBe(false);
    }
    for (const k of ['ferme', 'moulin', 'chapelle'] as PropKey[]) {
      expect(accepte(k, falaise), `${k} sur une falaise`).toBe(false);
    }
    /* Et l'inverse : une aiguille de granit a bien le droit d'être sur du roc. */
    expect(accepte('aiguille', TERRAINS.indexOf('rocher'))).toBe(true);
    expect(accepte('souche', TERRAINS.indexOf('humide'))).toBe(true);
    expect(accepte('muret', TERRAINS.indexOf('prairie'))).toBe(true);
    expect(accepte('muret', TERRAINS.indexOf('humide'))).toBe(false);
  });

  it('pose du bâti de décor dans chaque pays, et rarement', () => {
    /*
     * Quatre silhouettes bâties dormaient dans l'atlas — ferme, moulin,
     * chapelle, tour — que le semis n'a jamais posées : la carte ne portait
     * aucun hameau, aucun clocher, aucune tour de guet. C'est la réponse la plus
     * directe à « beaucoup de détails, même si items non jouables ».
     *
     * Rarement : au-delà de deux pour cent des cases éligibles, un pays se
     * couvre de fermes et l'on ne distingue plus les lieux visitables du décor.
     */
    const bâtis = new Set<PropKey>();
    for (const id of REGIONS) {
      const c = CANTONS[id];
      expect(c.bati.length, id).toBeGreaterThan(0);
      expect(c.chanceBati, id).toBeGreaterThan(0);
      expect(c.chanceBati, id).toBeLessThanOrEqual(0.02);
      for (const k of c.bati) bâtis.add(k);
    }
    /* Les quatre silhouettes servent toutes : aucune ne dort plus. */
    expect([...bâtis].sort()).toEqual(['chapelle', 'ferme', 'moulin', 'tour']);
  });

  it('donne à chaque pays une signature qui lui ressemble', () => {
    /* Trois cas nommés, parce qu'un test qui n'énonce rien ne garde rien : le
       pays des carriers a ses aiguilles, les sagnes leurs souches, la route du
       sel ses bornes. */
    expect(CANTONS.vollore_pamole.signature).toContain('aiguille');
    expect(CANTONS.lac_sagnes.signature).toContain('souche');
    expect(CANTONS.grande_chaussee.signature).toContain('borne');
    expect(CANTONS.coeur_bois_noirs.signature).toContain('sapin');
    /* Et le pays le plus dense est bien la sapinière. */
    const plusDense = REGIONS.reduce((a, b) =>
      CANTONS[a].densite >= CANTONS[b].densite ? a : b,
    );
    expect(plusDense).toBe('coeur_bois_noirs');
  });
});
