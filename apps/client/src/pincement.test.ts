/**
 * Le pincer-zoomer : deux doigts agrandissent, un doigt joue.
 *
 * Exigence du propriétaire : « il faut aussi pouvoir zoomer dans la capitale
 * et dans les combats sur l'iPhone ». La carte d'aventure avait son geste ;
 * la cité et le champ de bataille n'en avaient aucun, alors qu'un hexagone
 * de combat fait une vingtaine de pixels sur un écran de 390 points.
 *
 * Deux propriétés se testent ici, et elles sont toutes deux des règles de
 * jeu déguisées en géométrie :
 *
 *  - **un seul doigt n'est jamais un zoom.** Sinon le geste de viser une
 *    pile deviendrait un grossissement, et l'on perdrait un tour.
 *  - **la butée ne fait pas glisser l'image.** Arrivé au grossissement
 *    maximal, le facteur RÉELLEMENT appliqué est 1 : une scène qui
 *    corrigerait son décalage avec le facteur *demandé* verrait le point
 *    pincé fuir sous les doigts.
 */
import { describe, expect, it, vi } from 'vitest';
import { brancherPincement, echelleBornee, type GestePincement } from './pincement.js';

/** Un élément minimal : `brancherPincement` n'a besoin que de ces trois-là. */
function faussElement(): HTMLElement & { emettre: (type: string, e: object) => void } {
  const ecoute = new Map<string, ((e: never) => void)[]>();
  const el = {
    getBoundingClientRect: () => ({ left: 0, top: 0 }),
    addEventListener: (t: string, f: (e: never) => void) => {
      ecoute.set(t, [...(ecoute.get(t) ?? []), f]);
    },
    removeEventListener: (t: string, f: (e: never) => void) => {
      ecoute.set(t, (ecoute.get(t) ?? []).filter((g) => g !== f));
    },
    emettre: (t: string, e: object) => {
      for (const f of ecoute.get(t) ?? []) (f as (x: object) => void)(e);
    },
  };
  return el as unknown as HTMLElement & { emettre: (type: string, e: object) => void };
}

function doigt(id: number, x: number, y: number): object {
  return { pointerId: id, pointerType: 'touch', clientX: x, clientY: y, preventDefault: () => {} };
}

describe('pincer-zoomer', () => {
  it('un seul doigt ne zoome jamais', () => {
    const el = faussElement();
    const surPincement = vi.fn();
    brancherPincement(el, { surPincement });

    el.emettre('pointerdown', doigt(1, 100, 100));
    el.emettre('pointermove', doigt(1, 200, 260));
    el.emettre('pointerup', doigt(1, 200, 260));
    expect(surPincement).not.toHaveBeenCalled();
  });

  it('deux doigts qui s’écartent donnent un facteur supérieur à un', () => {
    const el = faussElement();
    const gestes: GestePincement[] = [];
    brancherPincement(el, { surPincement: (g) => gestes.push(g) });

    el.emettre('pointerdown', doigt(1, 100, 200));
    el.emettre('pointerdown', doigt(2, 200, 200)); // écart 100
    el.emettre('pointermove', doigt(2, 300, 200)); // écart 200
    expect(gestes).toHaveLength(1);
    expect(gestes[0].facteur).toBeCloseTo(2, 5);
    /* Le milieu part de 150 et arrive à 200 : le déplacement est de 50. */
    expect(gestes[0].centreX).toBe(200);
    expect(gestes[0].deplaceX).toBe(50);
  });

  it('deux doigts qui se rapprochent donnent un facteur inférieur à un', () => {
    const el = faussElement();
    const gestes: GestePincement[] = [];
    brancherPincement(el, { surPincement: (g) => gestes.push(g) });

    el.emettre('pointerdown', doigt(1, 100, 200));
    el.emettre('pointerdown', doigt(2, 300, 200)); // écart 200
    el.emettre('pointermove', doigt(2, 200, 200)); // écart 100
    expect(gestes[0].facteur).toBeCloseTo(0.5, 5);
  });

  it('la souris ne pince pas : le geste est tactile', () => {
    const el = faussElement();
    const surPincement = vi.fn();
    brancherPincement(el, { surPincement });
    el.emettre('pointerdown', { pointerId: 1, pointerType: 'mouse', clientX: 0, clientY: 0 });
    el.emettre('pointerdown', { pointerId: 2, pointerType: 'mouse', clientX: 100, clientY: 0 });
    el.emettre('pointermove', {
      pointerId: 2,
      pointerType: 'mouse',
      clientX: 300,
      clientY: 0,
      preventDefault: () => {},
    });
    expect(surPincement).not.toHaveBeenCalled();
  });

  it('le débranchement retire réellement les écouteurs', () => {
    const el = faussElement();
    const surPincement = vi.fn();
    const debrancher = brancherPincement(el, { surPincement });
    debrancher();
    el.emettre('pointerdown', doigt(1, 100, 200));
    el.emettre('pointerdown', doigt(2, 200, 200));
    el.emettre('pointermove', doigt(2, 400, 200));
    expect(surPincement).not.toHaveBeenCalled();
  });

  it('prévient quand le second doigt se lève', () => {
    const el = faussElement();
    const surFin = vi.fn();
    brancherPincement(el, { surPincement: () => {}, surFin });
    el.emettre('pointerdown', doigt(1, 100, 200));
    el.emettre('pointerdown', doigt(2, 200, 200));
    el.emettre('pointerup', doigt(2, 200, 200));
    expect(surFin).toHaveBeenCalledTimes(1);
  });
});

describe('échelle bornée', () => {
  it('applique le facteur tant qu’on est dans les bornes', () => {
    const r = echelleBornee(1, 1.5, 1, 3);
    expect(r.echelle).toBe(1.5);
    expect(r.applique).toBeCloseTo(1.5, 6);
  });

  it('en butée haute, le facteur appliqué retombe à un', () => {
    /* Sans cela, la scène corrigerait son décalage d'un facteur qu'elle n'a
       pas appliqué : le point pincé fuirait sous les doigts. */
    const r = echelleBornee(3, 2, 1, 3);
    expect(r.echelle).toBe(3);
    expect(r.applique).toBe(1);
  });

  it('en butée basse, on ne descend jamais sous le plein cadre', () => {
    const r = echelleBornee(1, 0.4, 1, 3);
    expect(r.echelle).toBe(1);
    expect(r.applique).toBe(1);
  });

  it('le facteur appliqué est toujours le rapport réel des échelles', () => {
    for (const depart of [1, 1.3, 2, 2.9, 3]) {
      for (const facteur of [0.5, 0.9, 1, 1.1, 4]) {
        const r = echelleBornee(depart, facteur, 1, 3);
        expect(r.applique).toBeCloseTo(r.echelle / depart, 6);
        expect(r.echelle).toBeGreaterThanOrEqual(1);
        expect(r.echelle).toBeLessThanOrEqual(3);
      }
    }
  });
});
