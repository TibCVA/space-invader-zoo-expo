/**
 * Limitation de débit : fenêtre glissante pondérée, isolation entre clefs,
 * purge des entrées inactives.
 *
 * L'horloge est injectée : aucun test n'attend une vraie minute.
 */
import { describe, expect, it } from 'vitest';
import { RATE_LIMIT_PER_MINUTE, RATE_LIMIT_WINDOW_MS } from '@auvergne/protocol';
import { RateLimiter } from './rate-limit.js';

function horloge(): { now: () => number; avance(ms: number): void } {
  let t = 1_700_000_000_000;
  return {
    now: () => t,
    avance(ms: number) {
      t += ms;
    },
  };
}

describe('RateLimiter', () => {
  it('laisse passer exactement le plafond puis refuse', () => {
    const h = horloge();
    const limiter = new RateLimiter(5, 1000, h.now);
    for (let i = 0; i < 5; i++) {
      expect(limiter.hit('a').allowed, `requête ${i}`).toBe(true);
    }
    const refus = limiter.hit('a');
    expect(refus.allowed).toBe(false);
    expect(refus.remaining).toBe(0);
    expect(refus.retryAfter).toBeGreaterThan(0);
  });

  it('décrémente le solde annoncé', () => {
    const h = horloge();
    const limiter = new RateLimiter(3, 1000, h.now);
    expect(limiter.hit('a').remaining).toBe(2);
    expect(limiter.hit('a').remaining).toBe(1);
    expect(limiter.hit('a').remaining).toBe(0);
  });

  it('rouvre une fois les deux fenêtres écoulées', () => {
    const h = horloge();
    const limiter = new RateLimiter(2, 1000, h.now);
    limiter.hit('a');
    limiter.hit('a');
    expect(limiter.hit('a').allowed).toBe(false);
    // Au tout début de la fenêtre suivante, la précédente pèse encore de tout
    // son poids : c'est précisément ce que la fenêtre glissante empêche.
    h.avance(1000);
    expect(limiter.hit('a').allowed).toBe(false);
    h.avance(1000);
    expect(limiter.hit('a').allowed).toBe(true);
  });

  it('lisse le passage d’une fenêtre à l’autre', () => {
    const h = horloge();
    const limiter = new RateLimiter(10, 1000, h.now);
    for (let i = 0; i < 10; i++) limiter.hit('a');
    // À un dixième de la fenêtre suivante, la précédente pèse encore 90 % :
    // il ne reste qu'un jeton, là où une fenêtre fixe en rendrait dix.
    h.avance(1100);
    expect(limiter.hit('a').allowed).toBe(true);
    expect(limiter.hit('a').allowed).toBe(false);
    // Aux neuf dixièmes, le crédit est presque entièrement revenu.
    h.avance(800);
    expect(limiter.hit('a').allowed).toBe(true);
  });

  it('compte séparément chaque identité', () => {
    const h = horloge();
    const limiter = new RateLimiter(2, 1000, h.now);
    limiter.hit('a');
    limiter.hit('a');
    expect(limiter.hit('a').allowed).toBe(false);
    expect(limiter.hit('b').allowed).toBe(true);
  });

  it('purge les identités inactives', () => {
    const h = horloge();
    const limiter = new RateLimiter(5, 1000, h.now);
    for (let i = 0; i < 40; i++) limiter.hit(`identite-${i}`);
    expect(limiter.size()).toBe(40);
    h.avance(5000);
    limiter.hit('nouvelle');
    expect(limiter.size()).toBe(1);
  });

  it('se remet à zéro sur demande', () => {
    const limiter = new RateLimiter(1, 1000);
    limiter.hit('a');
    expect(limiter.hit('a').allowed).toBe(false);
    limiter.reset();
    expect(limiter.size()).toBe(0);
    expect(limiter.hit('a').allowed).toBe(true);
  });

  it('applique 120 requêtes par minute par défaut', () => {
    const h = horloge();
    const limiter = new RateLimiter(undefined, undefined, h.now);
    for (let i = 0; i < RATE_LIMIT_PER_MINUTE; i++) {
      expect(limiter.hit('a').allowed).toBe(true);
    }
    const refus = limiter.hit('a');
    expect(refus.allowed).toBe(false);
    expect(refus.limit).toBe(120);
    expect(refus.retryAfter).toBeLessThanOrEqual(RATE_LIMIT_WINDOW_MS / 1000);
  });
});
