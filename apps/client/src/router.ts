/**
 * Routeur par fragment d'URL (`location.hash`).
 *
 * Aucune dépendance : le client est une application à une seule page servie
 * avec un repli SPA, et `docs/03-ROUTES.md` impose un routage par fragment.
 * Toutes les routes du document y sont représentées, routes de démonstration
 * comprises.
 *
 * Le routeur est un magasin externe minuscule : `subscribeRoute` + `route()`
 * alimentent `useSyncExternalStore` sans provoquer de rendu superflu, car
 * `route()` renvoie **la même référence** tant que le fragment n'a pas changé.
 */

import type { HeroUid, TownUid } from '@auvergne/engine';

/* ─────────────────────────────── Le modèle ──────────────────────────────── */

/** Les deux cités jouables, seules valeurs acceptées par `#/demo/cite/:id`. */
export type DemoTownKey = 'granit' | 'ermitage';

export type Route =
  /* — Écrans hors partie — */
  | { readonly name: 'accueil' }
  | { readonly name: 'nouvelle-partie' }
  | { readonly name: 'charger' }
  | { readonly name: 'codex'; readonly section?: string }
  | { readonly name: 'options' }
  /* — Partie en cours — */
  | { readonly name: 'partie' }
  | { readonly name: 'partie-cite'; readonly uid: TownUid }
  | { readonly name: 'partie-heros'; readonly uid: HeroUid }
  | { readonly name: 'partie-royaume' }
  | { readonly name: 'partie-combat' }
  /* — Revue visuelle (docs/03-ROUTES.md §2) — */
  | { readonly name: 'demo-carte' }
  | { readonly name: 'demo-cite'; readonly town: DemoTownKey }
  | { readonly name: 'demo-combat' }
  | { readonly name: 'demo-heros' }
  | { readonly name: 'demo-royaume' }
  | { readonly name: 'demo-planche-art' }
  | { readonly name: 'demo-galerie' }
  | { readonly name: 'demo-sauvegardes' }
  /* — Repli — */
  | { readonly name: 'introuvable'; readonly fragment: string };

export type RouteName = Route['name'];

/** Vrai pour les routes de revue visuelle : état factice, aucune sauvegarde. */
export function isDemoRoute(route: Route): boolean {
  return route.name.startsWith('demo-');
}

/** Vrai pour les routes qui exigent une partie chargée. */
export function needsGame(route: Route): boolean {
  return route.name.startsWith('partie');
}

/** Vrai pour les routes dont le rendu passe par PixiJS. */
export function needsPixi(route: Route): boolean {
  switch (route.name) {
    case 'partie':
    case 'partie-cite':
    case 'partie-combat':
    case 'demo-carte':
    case 'demo-cite':
    case 'demo-combat':
    case 'demo-planche-art':
      return true;
    default:
      return false;
  }
}

/* ─────────────────────────────── Lecture ────────────────────────────────── */

function decode(part: string): string {
  try {
    return decodeURIComponent(part);
  } catch {
    return part;
  }
}

/** Découpe `#/a/b/c` en `['a','b','c']`, en ignorant les barres superflues. */
function segments(fragment: string): string[] {
  const brut = fragment.startsWith('#') ? fragment.slice(1) : fragment;
  const sansQuery = brut.split('?')[0] ?? '';
  return sansQuery
    .split('/')
    .map((s) => decode(s.trim()))
    .filter((s) => s.length > 0);
}

/** Analyse un fragment d'URL. Ne lève jamais : au pire `introuvable`. */
export function parseRoute(fragment: string): Route {
  const parts = segments(fragment);
  if (parts.length === 0) return { name: 'accueil' };

  if (parts[0] === 'demo') {
    switch (parts[1]) {
      case 'carte':
        return { name: 'demo-carte' };
      case 'cite':
        return {
          name: 'demo-cite',
          town: parts[2] === 'ermitage' ? 'ermitage' : 'granit',
        };
      case 'combat':
        return { name: 'demo-combat' };
      case 'heros':
        return { name: 'demo-heros' };
      case 'royaume':
        return { name: 'demo-royaume' };
      case 'planche-art':
        return { name: 'demo-planche-art' };
      case 'galerie':
        return { name: 'demo-galerie' };
      case 'sauvegardes':
        return { name: 'demo-sauvegardes' };
      default:
        return { name: 'introuvable', fragment };
    }
  }

  if (parts[0] === 'partie') {
    switch (parts[1]) {
      case undefined:
        return { name: 'partie' };
      case 'cite':
        return parts[2] ? { name: 'partie-cite', uid: parts[2] } : { name: 'introuvable', fragment };
      case 'heros':
        return parts[2] ? { name: 'partie-heros', uid: parts[2] } : { name: 'introuvable', fragment };
      case 'royaume':
        return { name: 'partie-royaume' };
      case 'combat':
        return { name: 'partie-combat' };
      default:
        return { name: 'introuvable', fragment };
    }
  }

  switch (parts[0]) {
    case 'nouvelle-partie':
      return { name: 'nouvelle-partie' };
    case 'charger':
      return { name: 'charger' };
    case 'codex':
      return parts[1] ? { name: 'codex', section: parts[1] } : { name: 'codex' };
    case 'options':
      return { name: 'options' };
    default:
      return { name: 'introuvable', fragment };
  }
}

/** Fragment canonique d'une route, prêt pour `location.hash`. */
export function formatRoute(route: Route): string {
  switch (route.name) {
    case 'accueil':
      return '#/';
    case 'nouvelle-partie':
      return '#/nouvelle-partie';
    case 'charger':
      return '#/charger';
    case 'codex':
      return route.section ? `#/codex/${encodeURIComponent(route.section)}` : '#/codex';
    case 'options':
      return '#/options';
    case 'partie':
      return '#/partie';
    case 'partie-cite':
      return `#/partie/cite/${encodeURIComponent(route.uid)}`;
    case 'partie-heros':
      return `#/partie/heros/${encodeURIComponent(route.uid)}`;
    case 'partie-royaume':
      return '#/partie/royaume';
    case 'partie-combat':
      return '#/partie/combat';
    case 'demo-carte':
      return '#/demo/carte';
    case 'demo-cite':
      return `#/demo/cite/${route.town}`;
    case 'demo-combat':
      return '#/demo/combat';
    case 'demo-heros':
      return '#/demo/heros';
    case 'demo-royaume':
      return '#/demo/royaume';
    case 'demo-planche-art':
      return '#/demo/planche-art';
    case 'demo-galerie':
      return '#/demo/galerie';
    case 'demo-sauvegardes':
      return '#/demo/sauvegardes';
    default:
      return '#/';
  }
}

/** Libellé français de la route, utilisé pour le titre du document. */
export function routeTitle(route: Route): string {
  switch (route.name) {
    case 'accueil':
      return 'Accueil';
    case 'nouvelle-partie':
      return 'Nouvelle partie';
    case 'charger':
      return 'Reprendre une partie';
    case 'codex':
      return 'Codex';
    case 'options':
      return 'Options';
    case 'partie':
      return "Carte d'aventure";
    case 'partie-cite':
    case 'demo-cite':
      return 'Cité';
    case 'partie-heros':
    case 'demo-heros':
      return 'Fiche de héros';
    case 'partie-royaume':
    case 'demo-royaume':
      return 'Royaume';
    case 'partie-combat':
    case 'demo-combat':
      return 'Combat';
    case 'demo-carte':
      return "Carte d'aventure";
    case 'demo-planche-art':
      return "Planche d'art";
    case 'demo-galerie':
      return 'Galerie du design system';
    case 'demo-sauvegardes':
      return 'Emplacements de sauvegarde';
    default:
      return 'Page introuvable';
  }
}

/* ────────────────────────────── Le magasin ──────────────────────────────── */

const listeners = new Set<() => void>();
let courante: Route = parseRoute(typeof location === 'undefined' ? '#/' : location.hash);
let fragmentConnu = typeof location === 'undefined' ? '#/' : location.hash;

function relire(): void {
  const fragment = location.hash;
  if (fragment === fragmentConnu) return;
  fragmentConnu = fragment;
  courante = parseRoute(fragment);
  for (const l of [...listeners]) l();
}

if (typeof window !== 'undefined') {
  window.addEventListener('hashchange', relire);
}

/** Route courante. Référence stable tant que le fragment ne change pas. */
export function route(): Route {
  return courante;
}

/** Abonnement au changement de route. Retourne la fonction de désabonnement. */
export function subscribeRoute(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/**
 * Change de route. `remplacer` évite d'empiler une entrée d'historique — utile
 * pour les redirections (par exemple `#/partie` sans partie chargée).
 */
export function navigate(cible: Route | string, remplacer = false): void {
  const fragment = typeof cible === 'string' ? cible : formatRoute(cible);
  if (typeof location === 'undefined') return;
  if (location.hash === fragment) {
    relire();
    return;
  }
  if (remplacer) {
    const url = `${location.pathname}${location.search}${fragment}`;
    history.replaceState(null, '', url);
    relire();
  } else {
    location.hash = fragment;
  }
}

/** Retour arrière, avec repli sur l'accueil quand l'historique est vide. */
export function goBack(): void {
  if (typeof history !== 'undefined' && history.length > 1) history.back();
  else navigate({ name: 'accueil' });
}
