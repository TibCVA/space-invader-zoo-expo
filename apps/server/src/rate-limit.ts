/**
 * Limitation de débit par identité, en mémoire.
 *
 * 120 requêtes par minute et par identité anonyme. La fenêtre est **glissante
 * pondérée** : on garde deux compteurs (fenêtre courante et précédente) et on
 * interpole. C'est aussi juste qu'une fenêtre glissante exacte pour un coût
 * constant en mémoire — deux entiers par identité — et sans le pic de trafic
 * qu'autorise une fenêtre fixe à cheval sur deux minutes.
 *
 * Le stockage est volontairement local au processus : le service tourne en un
 * seul réplica (`railway.json`), et une limitation approximative vaut mieux
 * qu'une dépendance à Redis pour un jeu solo.
 */
import { RATE_LIMIT_PER_MINUTE, RATE_LIMIT_WINDOW_MS } from '@auvergne/protocol';

interface Entry {
  /** Index de la fenêtre courante. */
  window: number;
  /** Requêtes comptées dans la fenêtre courante. */
  current: number;
  /** Requêtes comptées dans la fenêtre précédente. */
  previous: number;
  /** Dernier accès, pour le nettoyage. */
  seen: number;
}

export interface RateVerdict {
  /** Vrai si la requête est autorisée. */
  allowed: boolean;
  /** Plafond appliqué. */
  limit: number;
  /** Jetons restants dans la fenêtre, jamais négatif. */
  remaining: number;
  /** Secondes avant réouverture, arrondies au supérieur. */
  retryAfter: number;
}

export class RateLimiter {
  private readonly entries = new Map<string, Entry>();
  private lastSweep = 0;

  constructor(
    private readonly limit: number = RATE_LIMIT_PER_MINUTE,
    private readonly windowMs: number = RATE_LIMIT_WINDOW_MS,
    private readonly clock: () => number = () => Date.now(),
  ) {}

  /** Compte une requête et rend le verdict. */
  hit(key: string): RateVerdict {
    const now = this.clock();
    const window = Math.floor(now / this.windowMs);
    this.sweep(now);

    let entry = this.entries.get(key);
    if (entry === undefined) {
      entry = { window, current: 0, previous: 0, seen: now };
      this.entries.set(key, entry);
    } else if (entry.window !== window) {
      entry.previous = entry.window === window - 1 ? entry.current : 0;
      entry.current = 0;
      entry.window = window;
    }
    entry.seen = now;

    // Poids de la fenêtre précédente : 1 au tout début de la fenêtre
    // courante, 0 à la fin.
    const progress = (now % this.windowMs) / this.windowMs;
    const estimate = entry.previous * (1 - progress) + entry.current;

    if (estimate >= this.limit) {
      const retryAfter = Math.max(1, Math.ceil((this.windowMs - (now % this.windowMs)) / 1000));
      return { allowed: false, limit: this.limit, remaining: 0, retryAfter };
    }

    entry.current++;
    const remaining = Math.max(0, this.limit - Math.ceil(estimate) - 1);
    return { allowed: true, limit: this.limit, remaining, retryAfter: 0 };
  }

  /** Nombre d'identités suivies (diagnostic). */
  size(): number {
    return this.entries.size;
  }

  /** Vide le compteur. Réservé aux tests. */
  reset(): void {
    this.entries.clear();
    this.lastSweep = 0;
  }

  /**
   * Purge les identités inactives depuis plus de deux fenêtres.
   * Passe au plus une fois par fenêtre : le coût amorti reste négligeable et
   * la table ne peut pas croître indéfiniment sous un flux d'identités neuves.
   */
  private sweep(now: number): void {
    if (now - this.lastSweep < this.windowMs) return;
    this.lastSweep = now;
    const seuil = now - this.windowMs * 2;
    for (const [key, entry] of this.entries) {
      if (entry.seen < seuil) this.entries.delete(key);
    }
  }
}
