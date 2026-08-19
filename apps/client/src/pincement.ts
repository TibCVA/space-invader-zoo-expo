/**
 * `pincement.ts` — le geste de pincer-zoomer, une fois pour toutes.
 *
 * Exigence du propriétaire : « il faut aussi pouvoir zoomer dans la capitale
 * et dans les combats sur l'iPhone ». La carte d'aventure avait son propre
 * pincement, écrit dans sa caméra ; la cité et le champ de bataille n'en
 * avaient aucun — sur un écran de 390 points, une pile de créatures fait
 * trente pixels et un bâtiment de cité guère plus. On ne joue pas ce qu'on
 * ne voit pas.
 *
 * Ce module ne connaît ni Pixi ni les scènes : il traduit des événements de
 * pointeur en deux gestes — **pincer** (facteur d'échelle autour d'un point)
 * et **glisser à deux doigts** (translation) — et laisse l'appelant décider
 * ce qu'il en fait. La scène reste maîtresse de ses bornes.
 *
 * Le geste à un seul doigt n'est jamais capté : il appartient au jeu (choisir
 * une case, viser une pile), et c'est la règle qui évite qu'un zoom mange une
 * touche.
 */

export interface GestePincement {
  /** facteur d'échelle depuis la dernière notification (1 = inchangé) */
  facteur: number;
  /** milieu des deux doigts, en coordonnées de l'élément */
  centreX: number;
  centreY: number;
  /** translation du milieu depuis la dernière notification */
  deplaceX: number;
  deplaceY: number;
}

export interface OptionsPincement {
  /** appelée à chaque mouvement à deux doigts */
  surPincement: (g: GestePincement) => void;
  /** appelée quand le second doigt se lève : la scène peut ranger son état */
  surFin?: () => void;
}

interface Doigt {
  x: number;
  y: number;
}

/**
 * Branche le pincement sur un élément. Rend la fonction de débranchement —
 * une vue qui se détruit sans l'appeler laisserait des écouteurs derrière
 * elle, et le harnais de captures le verrait en console.
 */
export function brancherPincement(cible: HTMLElement, o: OptionsPincement): () => void {
  const doigts = new Map<number, Doigt>();
  let ecart = 0;
  let centre: { x: number; y: number } | null = null;

  const pointDe = (e: PointerEvent): Doigt => {
    const r = cible.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };

  const mesure = (): { ecart: number; x: number; y: number } | null => {
    if (doigts.size !== 2) return null;
    const [a, b] = [...doigts.values()];
    return {
      ecart: Math.hypot(a.x - b.x, a.y - b.y),
      x: (a.x + b.x) / 2,
      y: (a.y + b.y) / 2,
    };
  };

  const surDown = (e: PointerEvent): void => {
    if (e.pointerType !== 'touch') return;
    doigts.set(e.pointerId, pointDe(e));
    const m = mesure();
    if (m) {
      ecart = m.ecart;
      centre = { x: m.x, y: m.y };
    }
  };

  const surMove = (e: PointerEvent): void => {
    if (e.pointerType !== 'touch') return;
    const d = doigts.get(e.pointerId);
    if (!d) return;
    const p = pointDe(e);
    d.x = p.x;
    d.y = p.y;
    const m = mesure();
    if (!m || ecart <= 0 || !centre) {
      if (m) {
        ecart = m.ecart;
        centre = { x: m.x, y: m.y };
      }
      return;
    }
    /* Un pincement en cours n'est plus un appui : la scène ne doit pas le
       prendre pour une visée. On empêche donc le défilement de la page et
       l'on notifie, à charge pour l'appelant d'ignorer le prochain relâché. */
    e.preventDefault();
    o.surPincement({
      facteur: m.ecart / ecart,
      centreX: m.x,
      centreY: m.y,
      deplaceX: m.x - centre.x,
      deplaceY: m.y - centre.y,
    });
    ecart = m.ecart;
    centre = { x: m.x, y: m.y };
  };

  const surUp = (e: PointerEvent): void => {
    if (!doigts.delete(e.pointerId)) return;
    if (doigts.size < 2) {
      ecart = 0;
      centre = null;
      o.surFin?.();
    }
  };

  cible.addEventListener('pointerdown', surDown, { passive: true });
  cible.addEventListener('pointermove', surMove, { passive: false });
  cible.addEventListener('pointerup', surUp, { passive: true });
  cible.addEventListener('pointercancel', surUp, { passive: true });

  return () => {
    cible.removeEventListener('pointerdown', surDown);
    cible.removeEventListener('pointermove', surMove);
    cible.removeEventListener('pointerup', surUp);
    cible.removeEventListener('pointercancel', surUp);
    doigts.clear();
  };
}

/**
 * Applique un facteur à une échelle en la maintenant entre deux bornes, et
 * rend le facteur RÉELLEMENT appliqué — celui dont la scène doit corriger
 * son décalage pour que le point pincé ne bouge pas sous les doigts. Sans
 * cette distinction, arriver en butée fait glisser l'image sous le doigt.
 */
export function echelleBornee(
  actuelle: number,
  facteur: number,
  min: number,
  max: number,
): { echelle: number; applique: number } {
  const voulue = actuelle * facteur;
  const echelle = Math.max(min, Math.min(max, voulue));
  return { echelle, applique: actuelle === 0 ? 1 : echelle / actuelle };
}
