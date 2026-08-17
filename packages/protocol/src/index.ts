/**
 * `@auvergne/protocol` — contrat réseau partagé entre le client et le serveur.
 *
 * Trois responsabilités, et rien d'autre :
 *
 *  - `api.ts`       : routes, quotas, codes d'erreur ;
 *  - `schemas.ts`   : schémas Zod de toutes les entrées réseau ;
 *  - `serialize.ts` : `serializeState` / `deserializeState`, aller-retour à
 *                     hash constant malgré les `Uint8Array` du brouillard.
 *
 * Ce paquet ne contient aucune règle de jeu et n'importe ni Node, ni le DOM,
 * ni Fastify : il est chargeable tel quel dans le navigateur.
 */

export {
  API,
  PROTOCOL_VERSION,
  MAX_SAVE_BYTES,
  MAX_IDENTITY_BYTES,
  MANUAL_SLOTS,
  AUTOSAVE_SLOTS,
  MAX_SLOT_NAME,
  MAX_THUMBNAIL_CHARS,
  MAX_COMMANDS,
  RATE_LIMIT_PER_MINUTE,
  RATE_LIMIT_WINDOW_MS,
  IDENTITY_COOKIE,
  IDENTITY_COOKIE_MAX_AGE,
  ERROR_CODES,
  ERROR_STATUS,
  apiError,
  majorOf,
  versionsCompatibles,
} from './api.js';
export type {
  ApiError,
  ApiRoutes,
  ErrorCode,
  HealthPayload,
  IdentityPayload,
  VersionsPayload,
} from './api.js';

export {
  AccessibilitySchema,
  AiProfileSchema,
  ArmyHolderRefSchema,
  ArmyStackSchema,
  ArtifactSlotSchema,
  CharterSchema,
  ColorSchema,
  CombatActionSchema,
  CombatTargetSchema,
  CommandEnvelopeSchema,
  CommandLogSchema,
  CommandSchema,
  ContentIdSchema,
  CountSchema,
  CreateGameSchema,
  DisplaySchema,
  DurationSchema,
  FactionIdSchema,
  GabellePolicySchema,
  GameSetupSchema,
  GetSaveQuerySchema,
  HashSchema,
  HexCoordSchema,
  IntSchema,
  LastGameSchema,
  ListSavesQuerySchema,
  MapCoordSchema,
  PlayerIdSchema,
  PlayerKindSchema,
  ProfilePatchSchema,
  ProfileSchema,
  RenameSaveSchema,
  ResourceKeySchema,
  SaveBlobSchema,
  SaveSlotSchema,
  SaveUploadSchema,
  SealIdSchema,
  SerializedStateSchema,
  SetupPlayerSchema,
  SlotIdSchema,
  SlotNameSchema,
  SlotParamsSchema,
  SlotPlayerSchema,
  StartKeySchema,
  TerrainSchema,
  ThumbnailSchema,
  TimestampSchema,
  UidSchema,
  VersionSchema,
  VictorySchema,
  VolumesSchema,
  defaultProfile,
  parseOrMessages,
} from './schemas.js';
export type {
  CommandEnvelope,
  CreateGameRequest,
  IntegrityReport,
  ParseOutcome,
  Profile,
  ProfilePatch,
  RenameSaveRequest,
  SaveBlob,
  SaveSlot,
  SaveUpload,
} from './schemas.js';

export {
  SerializationError,
  TYPED_ARRAY_TAG,
  adoptState,
  base64ToBytes,
  bytesToBase64,
  decodeBinaries,
  deserializeState,
  encodeBinaries,
  roundTripPreservesHash,
  serializeState,
  stateHash,
  summarizeState,
  utf8Length,
  verifyStateHash,
} from './serialize.js';
export type { StateSummary } from './serialize.js';
