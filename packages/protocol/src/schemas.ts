/**
 * Schémas Zod de **toutes** les entrées réseau, et types déduits.
 *
 * Règle du serveur autoritaire (`docs/90-DOCUMENT-MAITRE.md` §18.2) : le client
 * n'envoie qu'une intention. Rien de ce qui arrive par le réseau n'est cru sur
 * parole ; chaque corps de requête traverse un schéma défini ici, en mode
 * **strict** (toute clef inconnue est refusée).
 *
 * Les messages d'erreur produits par ces schémas sont en français : ils sont
 * repris tels quels dans l'enveloppe `{ erreur, code }`.
 */
import { z } from 'zod';
import {
  HEX_COLS,
  HEX_ROWS,
  MAP_COLS,
  MAP_ROWS,
  RESOURCE_KEYS,
  TERRAINS,
  type ArmyHolderRef,
  type Command,
  type CombatAction,
  type GameSetup,
  type MapCoord,
} from '@auvergne/engine';
import { MAX_COMMANDS, MAX_SLOT_NAME, MAX_THUMBNAIL_CHARS } from './api.js';

/* ── Primitives ─────────────────────────────────────────────────────────── */

/** Entier signé sûr. Toute valeur simulée est entière (brief §2, règle 3). */
export const IntSchema = z
  .number({ invalid_type_error: 'Un nombre entier est attendu.' })
  .int('Un nombre entier est attendu.')
  .finite('Un nombre fini est attendu.');

/** Entier positif ou nul. */
export const CountSchema = IntSchema.min(0, 'Une quantité négative est refusée.');

/** Identifiant de contenu : lettres minuscules, chiffres et tirets bas. */
export const ContentIdSchema = z
  .string()
  .min(1, 'Identifiant vide.')
  .max(64, 'Identifiant trop long.')
  .regex(/^[a-z0-9_]+$/, 'Identifiant de contenu invalide.');

/** Identifiant d'instance créé par le moteur (`H3`, `T_cervieres`, `O_1042`). */
export const UidSchema = z
  .string()
  .min(1, 'Identifiant vide.')
  .max(80, 'Identifiant trop long.')
  .regex(/^[A-Za-z0-9_.-]+$/, "Identifiant d'instance invalide.");

export const PlayerIdSchema = z.enum(['P1', 'P2', 'P3', 'P4', 'P5'], {
  errorMap: () => ({ message: 'Bannière inconnue (P1 à P5 attendus).' }),
});

export const FactionIdSchema = z.enum(['granit', 'ermitage'], {
  errorMap: () => ({ message: 'Faction inconnue : « granit » ou « ermitage » attendus.' }),
});

export const StartKeySchema = z.enum(
  ['arconsat', 'viscomtat', 'cervieres', 'noiretable', 'renaudie'],
  { errorMap: () => ({ message: 'Position de départ inconnue.' }) },
);

export const AiProfileSchema = z.enum(['prudent', 'equilibre', 'agressif', 'expert'], {
  errorMap: () => ({ message: "Profil d'adversaire inconnu." }),
});

export const PlayerKindSchema = z.enum(['humain', 'ia'], {
  errorMap: () => ({ message: 'Type de joueur inconnu : « humain » ou « ia ».' }),
});

export const DurationSchema = z.enum(['eclair', 'standard', 'saga'], {
  errorMap: () => ({ message: 'Durée de partie inconnue.' }),
});

export const VictorySchema = z.enum(
  ['couronne', 'derniere_banniere', 'maitre_marches', 'chronique'],
  { errorMap: () => ({ message: 'Condition de victoire inconnue.' }) },
);

export const ResourceKeySchema = z.enum(RESOURCE_KEYS, {
  errorMap: () => ({ message: 'Ressource inconnue.' }),
});

export const TerrainSchema = z.enum(TERRAINS, {
  errorMap: () => ({ message: 'Terrain inconnu.' }),
});

export const CharterSchema = z.enum(['marchande', 'militaire', 'spirituelle'], {
  errorMap: () => ({ message: 'Charte de cité inconnue.' }),
});

export const GabellePolicySchema = z.enum(['franchise', 'mesure', 'forte'], {
  errorMap: () => ({ message: 'Politique de gabelle inconnue.' }),
});

export const ArtifactSlotSchema = z.enum(
  [
    'tete',
    'cou',
    'torse',
    'mains',
    'anneau1',
    'anneau2',
    'ceinture',
    'pieds',
    'banniere',
    'relique',
  ],
  { errorMap: () => ({ message: "Emplacement d'artefact inconnu." }) },
);

export const SealIdSchema = z.enum(
  ['hautes_futaies', 'farges', 'pamole', 'hermitage', 'brumes'],
  { errorMap: () => ({ message: 'Sceau inconnu.' }) },
);

/** Case de la carte d'aventure, bornée à la grille 256 × 416. */
export const MapCoordSchema = z
  .object({
    col: IntSchema.min(0, 'Colonne hors carte.').max(MAP_COLS - 1, 'Colonne hors carte.'),
    row: IntSchema.min(0, 'Ligne hors carte.').max(MAP_ROWS - 1, 'Ligne hors carte.'),
  })
  .strict();

/** Hexagone du champ de bataille, borné à la grille 15 × 11. */
export const HexCoordSchema = z
  .object({
    col: IntSchema.min(0, 'Hexagone hors champ.').max(HEX_COLS - 1, 'Hexagone hors champ.'),
    row: IntSchema.min(0, 'Hexagone hors champ.').max(HEX_ROWS - 1, 'Hexagone hors champ.'),
  })
  .strict();

/** Couleur de bannière au format hexadécimal RVB. */
export const ColorSchema = z
  .string()
  .regex(/^#[0-9a-fA-F]{6}$/, 'Couleur de bannière invalide (format #RRGGBB attendu).');

/** Hash d'état : 16 chiffres hexadécimaux minuscules (FNV-1a 64 bits). */
export const HashSchema = z
  .string()
  .regex(/^[0-9a-f]{16}$/, "Empreinte d'état invalide.");

/** Horodatage ISO 8601 en UTC. */
export const TimestampSchema = z
  .string()
  .min(20, 'Horodatage invalide.')
  .max(40, 'Horodatage invalide.')
  .regex(
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,6})?Z$/,
    'Horodatage invalide (format ISO 8601 UTC attendu).',
  );

/** Version de moteur, de contenu ou de carte. */
export const VersionSchema = z
  .string()
  .min(1, 'Version vide.')
  .max(40, 'Version trop longue.')
  .regex(/^[0-9A-Za-z._-]+$/, 'Version invalide.');

/** Pile de créatures. */
export const ArmyStackSchema = z
  .object({
    creature: ContentIdSchema,
    count: CountSchema.max(1_000_000, 'Pile trop nombreuse.'),
  })
  .strict();

/* ── Mise en place d'une partie ─────────────────────────────────────────── */

export const SetupPlayerSchema = z
  .object({
    id: PlayerIdSchema,
    name: z
      .string()
      .trim()
      .min(1, 'Le nom de la bannière ne peut pas être vide.')
      .max(40, 'Le nom de la bannière est trop long (40 caractères au maximum).'),
    faction: FactionIdSchema,
    kind: PlayerKindSchema,
    aiProfile: AiProfileSchema.optional(),
    start: StartKeySchema,
    hero: ContentIdSchema,
  })
  .strict();

export const GameSetupSchema = z
  .object({
    seed: IntSchema,
    mapVersion: VersionSchema,
    contentVersion: VersionSchema,
    duration: DurationSchema,
    victory: VictorySchema,
    players: z
      .array(SetupPlayerSchema)
      .min(2, 'Il faut au moins deux bannières.')
      .max(5, 'Cinq bannières au maximum.'),
  })
  .strict()
  .superRefine((setup, ctx) => {
    const ids = new Set<string>();
    const starts = new Set<string>();
    for (const p of setup.players) {
      if (ids.has(p.id)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Deux bannières portent l'identifiant ${p.id}.`,
          path: ['players'],
        });
      }
      ids.add(p.id);
      if (starts.has(p.start)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Deux bannières partent de ${p.start}.`,
          path: ['players'],
        });
      }
      starts.add(p.start);
    }
  });

/** Corps de la création de partie. */
export const CreateGameSchema = z
  .object({
    setup: GameSetupSchema,
  })
  .strict();

export type CreateGameRequest = z.infer<typeof CreateGameSchema>;

/* ── Commandes ──────────────────────────────────────────────────────────── */

export const ArmyHolderRefSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('hero'), uid: UidSchema }).strict(),
  z.object({ kind: z.literal('garrison'), uid: UidSchema }).strict(),
]);

/** Cible d'une capacité ou d'un sort de combat : un hexagone ou un uid de pile. */
export const CombatTargetSchema = z.union([HexCoordSchema, UidSchema]);

export const CombatActionSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('move'), unit: UidSchema, to: HexCoordSchema }).strict(),
  z
    .object({
      kind: z.literal('attack'),
      unit: UidSchema,
      target: UidSchema,
      from: HexCoordSchema.optional(),
    })
    .strict(),
  z.object({ kind: z.literal('shoot'), unit: UidSchema, target: UidSchema }).strict(),
  z.object({ kind: z.literal('wait'), unit: UidSchema }).strict(),
  z.object({ kind: z.literal('defend'), unit: UidSchema }).strict(),
  z
    .object({
      kind: z.literal('ability'),
      unit: UidSchema,
      target: CombatTargetSchema.optional(),
    })
    .strict(),
  z
    .object({
      kind: z.literal('cast'),
      spell: ContentIdSchema,
      target: CombatTargetSchema.optional(),
    })
    .strict(),
  z.object({ kind: z.literal('surrender') }).strict(),
]);

export const CommandSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('StartGame'), setup: GameSetupSchema }).strict(),
  z.object({ type: z.literal('MoveHero'), hero: UidSchema, to: MapCoordSchema }).strict(),
  z
    .object({ type: z.literal('HeroInteract'), hero: UidSchema, object: UidSchema })
    .strict(),
  z
    .object({ type: z.literal('BuildInTown'), town: UidSchema, building: ContentIdSchema })
    .strict(),
  z
    .object({
      type: z.literal('RecruitCreatures'),
      town: UidSchema,
      creature: ContentIdSchema,
      count: CountSchema.max(1_000_000, 'Quantité de recrutement irréaliste.'),
      toHero: UidSchema.optional(),
    })
    .strict(),
  z
    .object({
      type: z.literal('UpgradeCreatures'),
      town: UidSchema,
      from: ContentIdSchema,
      count: CountSchema.max(1_000_000, 'Quantité irréaliste.'),
    })
    .strict(),
  z.object({ type: z.literal('HireHero'), town: UidSchema, hero: ContentIdSchema }).strict(),
  z
    .object({
      type: z.literal('SwapArmy'),
      a: ArmyHolderRefSchema,
      b: ArmyHolderRefSchema,
      slotA: IntSchema.min(0, 'Emplacement invalide.').max(6, 'Emplacement invalide.'),
      slotB: IntSchema.min(0, 'Emplacement invalide.').max(6, 'Emplacement invalide.'),
      count: CountSchema.max(1_000_000, 'Quantité irréaliste.').optional(),
    })
    .strict(),
  z
    .object({
      type: z.literal('EquipArtifact'),
      hero: UidSchema,
      artifact: ContentIdSchema,
      slot: ArtifactSlotSchema,
    })
    .strict(),
  z
    .object({ type: z.literal('UnequipArtifact'), hero: UidSchema, slot: ArtifactSlotSchema })
    .strict(),
  z
    .object({
      type: z.literal('CastAdventureSpell'),
      hero: UidSchema,
      spell: ContentIdSchema,
      target: MapCoordSchema.optional(),
    })
    .strict(),
  z
    .object({ type: z.literal('ChooseLevelUp'), hero: UidSchema, skill: ContentIdSchema })
    .strict(),
  z.object({ type: z.literal('SetCharter'), town: UidSchema, charter: CharterSchema }).strict(),
  z.object({ type: z.literal('SetGabelle'), policy: GabellePolicySchema }).strict(),
  z
    .object({
      type: z.literal('TradeResources'),
      give: ResourceKeySchema,
      giveAmount: CountSchema.max(10_000_000, 'Quantité irréaliste.'),
      take: ResourceKeySchema,
    })
    .strict(),
  z.object({ type: z.literal('UseBorne'), hero: UidSchema, to: UidSchema }).strict(),
  z.object({ type: z.literal('CombatAction'), action: CombatActionSchema }).strict(),
  z.object({ type: z.literal('AutoResolveCombat') }).strict(),
  z.object({ type: z.literal('EndTurn') }).strict(),
  z.object({ type: z.literal('Surrender') }).strict(),
]);

/**
 * Enveloppe d'une commande envoyée au serveur autoritaire.
 * `idempotencyKey` permet à une reconnexion mobile de rejouer l'envoi sans
 * appliquer deux fois la même action (`docs/90-DOCUMENT-MAITRE.md` §18.4).
 */
export const CommandEnvelopeSchema = z
  .object({
    gameId: UidSchema,
    playerId: PlayerIdSchema,
    command: CommandSchema,
    expectedTurn: IntSchema.min(1, 'Numéro de jour invalide.').optional(),
    idempotencyKey: z
      .string()
      .min(8, "Clef d'idempotence trop courte.")
      .max(64, "Clef d'idempotence trop longue.")
      .regex(/^[A-Za-z0-9_-]+$/, "Clef d'idempotence invalide."),
  })
  .strict();

export type CommandEnvelope = z.infer<typeof CommandEnvelopeSchema>;

/* ── Emplacements de sauvegarde ─────────────────────────────────────────── */

/**
 * Identifiant d'emplacement. Volontairement restreint : il apparaît dans une
 * URL, dans un nom de fichier du repli disque et dans une clef SQL.
 */
export const SlotIdSchema = z
  .string()
  .min(1, "L'identifiant d'emplacement est vide.")
  .max(64, "L'identifiant d'emplacement est trop long (64 caractères au maximum).")
  .regex(
    /^[a-z0-9][a-z0-9_-]*$/,
    "L'identifiant d'emplacement n'accepte que des minuscules, des chiffres, « - » et « _ ».",
  );

/** Nom affiché d'un emplacement. */
export const SlotNameSchema = z
  .string()
  .trim()
  .min(1, "Le nom de l'emplacement ne peut pas être vide.")
  .max(MAX_SLOT_NAME, `Le nom de l'emplacement dépasse ${MAX_SLOT_NAME} caractères.`);

/**
 * Vignette : uniquement une data-url d'image. Aucune URL distante n'est
 * acceptée — le jeu n'embarque aucun asset externe (brief §2, règle 5).
 */
export const ThumbnailSchema = z
  .string()
  .max(MAX_THUMBNAIL_CHARS, 'La vignette est trop lourde.')
  .regex(
    /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/]+={0,2}$/,
    "La vignette doit être une image encodée en data-url (aucune ressource distante n'est acceptée).",
  );

export const SlotPlayerSchema = z
  .object({
    name: z.string().trim().min(1, 'Nom de bannière vide.').max(40, 'Nom de bannière trop long.'),
    faction: FactionIdSchema,
    color: ColorSchema,
  })
  .strict();

/** Descripteur d'un emplacement, tel que défini par `docs/02-API.md`. */
export const SaveSlotSchema = z
  .object({
    id: SlotIdSchema,
    name: SlotNameSchema,
    turn: IntSchema.min(1, 'Numéro de jour invalide.'),
    week: IntSchema.min(1, 'Numéro de semaine invalide.'),
    players: z
      .array(SlotPlayerSchema)
      .min(1, 'Une sauvegarde comporte au moins une bannière.')
      .max(5, 'Cinq bannières au maximum.'),
    updatedAt: TimestampSchema,
    createdAt: TimestampSchema,
    thumbnail: ThumbnailSchema.optional(),
    autosave: z.boolean(),
    hash: HashSchema,
  })
  .strict();

export type SaveSlot = z.infer<typeof SaveSlotSchema>;

/** État sérialisé par `serializeState`. */
export const SerializedStateSchema = z
  .string()
  .min(2, "L'état sérialisé est vide.")
  .startsWith('{', "L'état sérialisé doit être un objet JSON.");

export const CommandLogSchema = z
  .array(CommandSchema)
  .max(MAX_COMMANDS, 'Le journal des commandes est trop long.');

/**
 * Corps accepté par `PUT /api/saves/:id`. L'état arrive **sérialisé** : le
 * serveur ne fait confiance ni à sa forme ni à son hash avant de l'avoir
 * désérialisé lui-même.
 */
export const SaveUploadSchema = z
  .object({
    slot: SaveSlotSchema,
    setup: GameSetupSchema,
    state: SerializedStateSchema,
    commands: CommandLogSchema,
  })
  .strict();

export type SaveUpload = z.infer<typeof SaveUploadSchema>;

/**
 * `SaveBlob` du contrat public (`docs/02-API.md`) : l'état y est typé
 * `unknown`, car le client peut manipuler soit la chaîne sérialisée, soit
 * l'objet déjà désérialisé.
 */
export interface SaveBlob {
  slot: SaveSlot;
  setup: GameSetup;
  state: unknown;
  commands: Command[];
}

/** Schéma tolérant de `SaveBlob`, utilisé pour un import de fichier local. */
export const SaveBlobSchema = z
  .object({
    slot: SaveSlotSchema,
    setup: GameSetupSchema,
    state: z.union([SerializedStateSchema, z.record(z.string(), z.unknown())]),
    commands: CommandLogSchema,
  })
  .strict();

/** Corps de `POST /api/saves/:id/rename`. */
export const RenameSaveSchema = z.object({ name: SlotNameSchema }).strict();
export type RenameSaveRequest = z.infer<typeof RenameSaveSchema>;

/** Paramètre de route `:id`. */
export const SlotParamsSchema = z.object({ id: SlotIdSchema }).strict();

/** Filtres de `GET /api/saves`. */
export const ListSavesQuerySchema = z
  .object({
    autosave: z.enum(['0', '1', 'true', 'false']).optional(),
  })
  .strict();

/** Options de `GET /api/saves/:id`. */
export const GetSaveQuerySchema = z
  .object({
    /** `1` pour charger malgré une incompatibilité de version signalée. */
    force: z.enum(['0', '1']).optional(),
  })
  .strict();

/** Rapport d'intégrité renvoyé au chargement d'une sauvegarde. */
export interface IntegrityReport {
  ok: boolean;
  hashAttendu: string;
  hashObtenu: string;
  versions: {
    moteur: { sauvegarde: string; serveur: string; compatible: boolean };
    contenu: { sauvegarde: string; serveur: string; compatible: boolean };
    carte: { sauvegarde: string; serveur: string; compatible: boolean };
  };
  /** Messages français prêts à l'affichage. Vide si tout va bien. */
  avertissements: string[];
}

/* ── Profil du joueur ───────────────────────────────────────────────────── */

const VolumeSchema = IntSchema.min(0, 'Volume minimal : 0.').max(100, 'Volume maximal : 100.');

/**
 * Volumes des trois bus audio imposés par `docs/02-API.md`
 * (`AudioEngine.setBus('musique'|'effets'|'ambiance', …)`).
 */
export const VolumesSchema = z
  .object({
    musique: VolumeSchema,
    effets: VolumeSchema,
    ambiance: VolumeSchema,
  })
  .strict();

export const AccessibilitySchema = z
  .object({
    /** Contraste renforcé sur les panneaux et le texte. */
    contrasteEleve: z.boolean(),
    /** Corps de texte agrandi. */
    texteAgrandi: z.boolean(),
    /** Réduit les animations et les transitions. */
    animationsReduites: z.boolean(),
    /** Motifs de bannière en plus de la couleur, pour le daltonisme. */
    motifsBannieres: z.boolean(),
    /** Correction colorimétrique appliquée à l'interface. */
    daltonisme: z.enum(['aucun', 'protanopie', 'deuteranopie', 'tritanopie'], {
      errorMap: () => ({ message: 'Mode daltonisme inconnu.' }),
    }),
    /** Désactive le minuteur de tour. */
    minuteurDesactive: z.boolean(),
    /** Affiche systématiquement les info-bulles au toucher. */
    infobullesPersistantes: z.boolean(),
  })
  .strict();

export const DisplaySchema = z
  .object({
    /** Grille de la carte d'aventure. */
    grille: z.boolean(),
    /** Vitesse d'animation en pourcentage (100 = vitesse nominale). */
    vitesseAnimation: IntSchema.min(25, 'Vitesse trop lente.').max(400, 'Vitesse trop rapide.'),
    /** Déplacements adverses joués coup par coup. */
    animerAdversaires: z.boolean(),
    /** Chiffres des piles affichés en permanence. */
    effectifsVisibles: z.boolean(),
  })
  .strict();

export const LastGameSchema = z
  .object({
    saveId: SlotIdSchema,
    at: TimestampSchema,
    turn: IntSchema.min(1, 'Numéro de jour invalide.'),
  })
  .strict();

/** Options complètes d'un joueur. */
export const ProfileSchema = z
  .object({
    volumes: VolumesSchema,
    accessibilite: AccessibilitySchema,
    affichage: DisplaySchema,
    /** Dernière partie ouverte, pour le bouton « Reprendre ». */
    dernierePartie: LastGameSchema.nullable(),
    updatedAt: TimestampSchema,
  })
  .strict();

export type Profile = z.infer<typeof ProfileSchema>;

/** Corps de `PUT /api/profil` : mise à jour partielle. */
export const ProfilePatchSchema = z
  .object({
    volumes: VolumesSchema.partial().strict().optional(),
    accessibilite: AccessibilitySchema.partial().strict().optional(),
    affichage: DisplaySchema.partial().strict().optional(),
    dernierePartie: LastGameSchema.nullable().optional(),
  })
  .strict();

export type ProfilePatch = z.infer<typeof ProfilePatchSchema>;

/** Profil par défaut d'un nouveau joueur. */
export function defaultProfile(now: string): Profile {
  return {
    volumes: { musique: 70, effets: 85, ambiance: 60 },
    accessibilite: {
      contrasteEleve: false,
      texteAgrandi: false,
      animationsReduites: false,
      motifsBannieres: true,
      daltonisme: 'aucun',
      minuteurDesactive: false,
      infobullesPersistantes: false,
    },
    affichage: {
      grille: false,
      vitesseAnimation: 100,
      animerAdversaires: true,
      effectifsVisibles: true,
    },
    dernierePartie: null,
    updatedAt: now,
  };
}

/* ── Aide à la validation ───────────────────────────────────────────────── */

/** Résultat d'une validation : soit la valeur, soit des messages français. */
export type ParseOutcome<T> =
  | { ok: true; value: T }
  | { ok: false; messages: string[]; champs: string[] };

/**
 * Analyse une valeur et transforme les erreurs Zod en messages français
 * prêts à être renvoyés dans `{ erreur, code }`.
 */
export function parseOrMessages<T>(schema: z.ZodType<T>, value: unknown): ParseOutcome<T> {
  const result = schema.safeParse(value);
  if (result.success) return { ok: true, value: result.data };
  const messages: string[] = [];
  const champs: string[] = [];
  for (const issue of result.error.issues) {
    const chemin = issue.path.join('.');
    if (chemin.length > 0 && !champs.includes(chemin)) champs.push(chemin);
    const texte = chemin.length > 0 ? `${chemin} : ${issue.message}` : issue.message;
    if (!messages.includes(texte)) messages.push(texte);
  }
  if (messages.length === 0) messages.push('Requête invalide.');
  return { ok: false, messages, champs };
}

/* ── Contrôles de conformité au contrat du moteur ───────────────────────── */

/**
 * Ces alias ne produisent aucun code : ils échouent à la compilation si un
 * schéma dérive du contrat verrouillé de `packages/engine/src/types.ts`.
 */
type Extends<A, B> = [A] extends [B] ? true : false;

const _setupMatchesEngine: Extends<z.infer<typeof GameSetupSchema>, GameSetup> = true;
const _commandMatchesEngine: Extends<z.infer<typeof CommandSchema>, Command> = true;
const _combatActionMatchesEngine: Extends<z.infer<typeof CombatActionSchema>, CombatAction> =
  true;
const _holderMatchesEngine: Extends<z.infer<typeof ArmyHolderRefSchema>, ArmyHolderRef> = true;
const _coordMatchesEngine: Extends<z.infer<typeof MapCoordSchema>, MapCoord> = true;

void _setupMatchesEngine;
void _commandMatchesEngine;
void _combatActionMatchesEngine;
void _holderMatchesEngine;
void _coordMatchesEngine;
