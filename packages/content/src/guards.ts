/**
 * Gabarits de gardes neutres, par anneau de distance au centre
 * (document maître §20.2).
 *
 *   anneau 1 — lisières et abords des capitales : rangs 1 à 3 ;
 *   anneau 2 — zones intermédiaires, mines et villages : rangs 3 à 5 ;
 *   anneau 3 — cœur des Bois Noirs, sceaux et reliques : rangs 5 à 7 ;
 *   anneau 4 — garde de la Maison du Trésor : armée mixte unique.
 *
 * `powerMin` / `powerMax` sont exprimés dans l'échelle de `CreatureDef.power`
 * calculée par `creatures.ts` : environ 37 pour un Manant, 6 600 pour une
 * Vouivre. Une garde d'anneau 1 se bat donc avec l'armée de départ d'un héros
 * (environ 1 200 de puissance), tandis que la garde de la Maison exige une
 * armée de fin de partie.
 *
 * Plusieurs gabarits par anneau : la carte en tire un par site, ce qui évite
 * que toutes les gardes d'un même anneau se ressemblent.
 */
import type { GuardTemplate } from '@auvergne/engine';

/** Note de codex associée à un gabarit, dans le même ordre que la table. */
export interface GuardNote {
  ring: 1 | 2 | 3 | 4;
  name: string;
  text: string;
}

export const NEUTRAL_GUARDS: readonly GuardTemplate[] = [
  // ── Anneau 1 : lisières, premiers gisements, bornes basses ──────────────
  { ring: 1, tiers: [1, 2], powerMin: 240, powerMax: 1200 },
  { ring: 1, tiers: [1, 2, 3], powerMin: 900, powerMax: 2600 },
  { ring: 1, tiers: [2, 3], powerMin: 2000, powerMax: 4200 },

  // ── Anneau 2 : vallée de la Durolle, cols, villages capturables ─────────
  { ring: 2, tiers: [3, 4], powerMin: 3500, powerMax: 8000 },
  { ring: 2, tiers: [3, 4, 5], powerMin: 7000, powerMax: 14000 },
  { ring: 2, tiers: [4, 5], powerMin: 12000, powerMax: 22000 },

  // ── Anneau 3 : Bois Noirs, Pamole, Sceaux des Marches ───────────────────
  { ring: 3, tiers: [5, 6], powerMin: 18000, powerMax: 34000 },
  { ring: 3, tiers: [5, 6, 7], powerMin: 30000, powerMax: 56000 },
  { ring: 3, tiers: [6, 7], powerMin: 48000, powerMax: 82000 },

  // ── Anneau 4 : garde de la Maison du Trésor ─────────────────────────────
  { ring: 4, tiers: [6, 7], powerMin: 72000, powerMax: 112000 },
  { ring: 4, tiers: [5, 6, 7], powerMin: 98000, powerMax: 155000 },
];

export const GUARD_NOTES: readonly GuardNote[] = [
  {
    ring: 1,
    name: 'Guet de lisière',
    text: "Quelques manants déserteurs et deux gabelous sans commission, installés au carrefour d'un layon. On les écarte avec l'armée de départ, à condition de ne pas s'y prendre à la légère.",
  },
  {
    ring: 1,
    name: 'Bande du chemin creux',
    text: "Une troupe mêlée qui rançonne les muletiers entre deux bornes. Elle tient un pont, un moulin ou une scierie, et elle a eu le temps de s'y organiser.",
  },
  {
    ring: 1,
    name: 'Compagnie franche',
    text: "Des arbalétriers licenciés après le dernier siège, qui ont gardé leurs armes et pris une carrière. Ils négocient volontiers, mais ils comptent d'abord vos rangs.",
  },
  {
    ring: 2,
    name: 'Garde de péage',
    text: "Un poste de contrôle en règle, sans autorité pour le tenir : la place est bonne et se défend. On n'y passe pas avec une armée de première semaine.",
  },
  {
    ring: 2,
    name: 'Meute des versants',
    text: "Loups, veneurs et ce qui suit les loups. Elle occupe une vallée entière et se replie dès qu'on la presse, pour revenir sur le flanc.",
  },
  {
    ring: 2,
    name: 'Ban seigneurial',
    text: "La levée d'une seigneurie qui n'a plus de seigneur, restée sur place faute d'ordre contraire. Bien équipée, mal commandée, très nombreuse.",
  },
  {
    ring: 3,
    name: 'Cercle des Colosses',
    text: "Neuf blocs debout dans la lande, qu'on prend pour un chaos naturel jusqu'à ce que l'un d'eux se retourne. Ils gardent une relique et n'ont aucune raison de discuter.",
  },
  {
    ring: 3,
    name: 'Vieille garde des sceaux',
    text: "Ce qui reste de la compagnie chargée par le dernier comte de veiller sur un Sceau des Marches. Elle a tenu, et elle tiendra encore contre vous.",
  },
  {
    ring: 3,
    name: 'Aire de Pamole',
    text: "Le vieux griffon couronné et sa suite, ou la vouivre et son bief. Un seul de ces animaux vaut une armée ; ils sont plusieurs.",
  },
  {
    ring: 4,
    name: 'Garde du Grand Livre',
    text: "La garde de la Maison du Trésor : ce que les deux traditions ont laissé ensemble pour que personne n'ouvre le coffre trop tôt. Bannerets et colosses côte à côte, ce qui ne s'était jamais vu.",
  },
  {
    ring: 4,
    name: 'Dernier ban des gabelous',
    text: "Tout ce qui portait la marque du sel s'est réuni là au soir de la mort du comte. Ils ne défendent pas un trésor : ils défendent une limite.",
  },
];

/** Gabarits d'un anneau donné, dans l'ordre croissant de puissance. */
export function guardsOfRing(ring: 1 | 2 | 3 | 4): GuardTemplate[] {
  return NEUTRAL_GUARDS.filter((g) => g.ring === ring);
}
