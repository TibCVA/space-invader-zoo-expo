/**
 * REGISTRE DES PORTRAITS PEINTS.
 *
 * Le design system dessine les 21 portraits en SVG vectoriel : c'est le repli,
 * il fonctionne toujours, hors ligne et sans le moindre fichier. Quand des
 * portraits peints existent (images générées, décrites par
 * `apps/client/public/img/manifeste.json`), l'application les enregistre ici au
 * démarrage et les composants les préfèrent.
 *
 * `packages/ui` ne lit jamais le réseau ni le disque : c'est l'application qui
 * pousse les adresses. Le paquet reste utilisable dans un test, dans une
 * galerie ou dans un rendu serveur sans dépendre d'un manifeste.
 */

const sources = new Map<string, string>();
const abonnes = new Set<() => void>();

/**
 * Enregistre les adresses des portraits peints.
 * Les clefs sont des identifiants de héros (`clotilde`) ou des clefs d'atlas
 * (`portrait_clotilde`) : les deux formes sont acceptées et normalisées.
 */
export function setPortraitSources(entrees: Record<string, string>): void {
  let change = false;
  for (const [clef, url] of Object.entries(entrees)) {
    if (typeof url !== 'string' || !url) continue;
    const id = clef.startsWith('portrait_') ? clef.slice('portrait_'.length) : clef;
    if (sources.get(id) === url) continue;
    sources.set(id, url);
    change = true;
  }
  if (change) for (const f of abonnes) f();
}

/** Adresse du portrait peint d'un héros, ou `null` s'il faut peindre le SVG. */
export function portraitSource(heroId: string): string | null {
  return sources.get(heroId) ?? null;
}

export function hasPaintedPortraits(): boolean {
  return sources.size > 0;
}

/** Oublie tout : utile en test. */
export function clearPortraitSources(): void {
  if (sources.size === 0) return;
  sources.clear();
  for (const f of abonnes) f();
}

/** S'abonner aux changements, pour que React se redessine à l'arrivée des images. */
export function subscribePortraitSources(listener: () => void): () => void {
  abonnes.add(listener);
  return () => {
    abonnes.delete(listener);
  };
}

/** Instantané servant de version au `useSyncExternalStore` des composants. */
export function portraitSourcesVersion(): number {
  return sources.size;
}
