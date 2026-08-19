/**
 * Les schémas Zod sont la frontière du serveur autoritaire : rien ne rentre
 * sans y passer. Ces tests vérifient qu'ils acceptent exactement ce que le
 * contrat du moteur autorise, qu'ils refusent le reste, et que les messages
 * restent en français.
 */
import { describe, expect, it } from 'vitest';
import type { Command, GameSetup } from '@auvergne/engine';
import {
  CombatActionSchema,
  CommandEnvelopeSchema,
  CommandSchema,
  CreateGameSchema,
  GameSetupSchema,
  MapCoordSchema,
  ProfilePatchSchema,
  ProfileSchema,
  RenameSaveSchema,
  SaveSlotSchema,
  SaveUploadSchema,
  SlotIdSchema,
  ThumbnailSchema,
  defaultProfile,
  parseOrMessages,
} from './schemas.js';
import { ERROR_STATUS, MANUAL_SLOTS, MAX_SAVE_BYTES, versionsCompatibles } from './api.js';

const NOW = '2026-08-17T09:00:00.000Z';

function validSetup(): GameSetup {
  return {
    seed: 20260816,
    mapVersion: '1.0.0-forez',
    contentVersion: '1.0.0-forez',
    duration: 'standard',
    victory: 'couronne',
    players: [
      {
        id: 'P1',
        name: 'Châtellenie de Granit',
        faction: 'granit',
        kind: 'humain',
        start: 'arconsat',
        hero: 'thibaut',
      },
      {
        id: 'P2',
        name: 'Ermitage des Bois Noirs',
        faction: 'ermitage',
        kind: 'ia',
        aiProfile: 'equilibre',
        start: 'renaudie',
        hero: 'agathe',
      },
    ],
  };
}

function validSlot(over: Partial<Record<string, unknown>> = {}): Record<string, unknown> {
  return {
    id: 'emplacement-1',
    name: 'Marche du Forez',
    turn: 15,
    week: 3,
    players: [{ name: 'Granit', faction: 'granit', color: '#8C2230' }],
    createdAt: NOW,
    updatedAt: NOW,
    autosave: false,
    hash: '5631d03501bfb659',
    ...over,
  };
}

describe('GameSetupSchema', () => {
  it('accepte une mise en place valide', () => {
    const out = GameSetupSchema.safeParse(validSetup());
    expect(out.success).toBe(true);
  });

  it('refuse une seule bannière', () => {
    const setup = validSetup();
    setup.players = [setup.players[0]];
    const out = parseOrMessages(GameSetupSchema, setup);
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.messages.join(' ')).toContain('au moins deux bannières');
  });

  it('refuse deux bannières au même départ', () => {
    const setup = validSetup();
    setup.players[1].start = 'arconsat';
    const out = parseOrMessages(GameSetupSchema, setup);
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.messages.join(' ')).toContain('partent de arconsat');
  });

  it('refuse deux fois le même identifiant de bannière', () => {
    const setup = validSetup();
    setup.players[1].id = 'P1';
    const out = parseOrMessages(GameSetupSchema, setup);
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.messages.join(' ')).toContain("l'identifiant P1");
  });

  it('refuse une clef inconnue (mode strict)', () => {
    const setup = { ...validSetup(), triche: true };
    expect(GameSetupSchema.safeParse(setup).success).toBe(false);
  });

  it('refuse une graine non entière', () => {
    const setup = { ...validSetup(), seed: 1.5 };
    const out = parseOrMessages(GameSetupSchema, setup);
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.messages.join(' ')).toContain('entier');
  });

  it('accepte six bannières ? non : cinq au maximum', () => {
    const setup = validSetup();
    const base = setup.players[0];
    setup.players = [base, base, base, base, base, base];
    expect(GameSetupSchema.safeParse(setup).success).toBe(false);
  });
});

describe('CreateGameSchema', () => {
  it('enveloppe la mise en place', () => {
    expect(CreateGameSchema.safeParse({ setup: validSetup() }).success).toBe(true);
    expect(CreateGameSchema.safeParse({}).success).toBe(false);
  });
});

describe('CommandSchema', () => {
  const bonnes: Command[] = [
    { type: 'EndTurn' },
    { type: 'Surrender' },
    { type: 'AutoResolveCombat' },
    { type: 'MoveHero', hero: 'H3', to: { col: 64, row: 50 } },
    { type: 'HeroInteract', hero: 'H3', object: 'O_1042' },
    { type: 'BuildInTown', town: 'T_cervieres', building: 'granit_demeure_3' },
    { type: 'RecruitCreatures', town: 'T_cervieres', creature: 'granit_t1', count: 12 },
    {
      type: 'RecruitCreatures',
      town: 'T_cervieres',
      creature: 'granit_t1',
      count: 12,
      toHero: 'H3',
    },
    { type: 'UpgradeCreatures', town: 'T_cervieres', from: 'granit_t2', count: 4 },
    { type: 'HireHero', town: 'T_cervieres', hero: 'roxane' },
    {
      type: 'SwapArmy',
      a: { kind: 'hero', uid: 'H3' },
      b: { kind: 'garrison', uid: 'T_cervieres' },
      slotA: 0,
      slotB: 6,
      count: 3,
    },
    { type: 'EquipArtifact', hero: 'H3', artifact: 'anneau_des_sagnes', slot: 'anneau1' },
    { type: 'UnequipArtifact', hero: 'H3', slot: 'relique' },
    { type: 'CastAdventureSpell', hero: 'H3', spell: 'brumes_4', target: { col: 10, row: 20 } },
    { type: 'ChooseLevelUp', hero: 'H3', skill: 'logistique' },
    { type: 'SetCharter', town: 'T_cervieres', charter: 'marchande' },
    { type: 'SetGabelle', policy: 'mesure' },
    { type: 'TradeResources', give: 'bois', giveAmount: 20, take: 'fer' },
    { type: 'UseBorne', hero: 'H3', to: 'O_88' },
    { type: 'CombatAction', action: { kind: 'wait', unit: 'A1' } },
    { type: 'CombatAction', action: { kind: 'move', unit: 'A1', to: { col: 7, row: 5 } } },
    { type: 'CombatAction', action: { kind: 'attack', unit: 'A1', target: 'B2' } },
    {
      type: 'CombatAction',
      action: { kind: 'attack', unit: 'A1', target: 'B2', from: { col: 6, row: 5 } },
    },
    { type: 'CombatAction', action: { kind: 'shoot', unit: 'A1', target: 'B2' } },
    { type: 'CombatAction', action: { kind: 'defend', unit: 'A1' } },
    { type: 'CombatAction', action: { kind: 'ability', unit: 'A1' } },
    { type: 'CombatAction', action: { kind: 'ability', unit: 'A1', target: 'B2' } },
    {
      type: 'CombatAction',
      action: { kind: 'ability', unit: 'A1', target: { col: 3, row: 3 } },
    },
    { type: 'CombatAction', action: { kind: 'cast', spell: 'braises_2', target: 'B2' } },
    { type: 'CombatAction', action: { kind: 'surrender' } },
    { type: 'StartGame', setup: validSetup() },
  ];

  it('accepte chaque forme de commande du contrat', () => {
    for (const cmd of bonnes) {
      const out = CommandSchema.safeParse(cmd);
      expect(out.success, `${cmd.type} refusée`).toBe(true);
    }
  });

  it('couvre les vingt formes de commande du moteur', () => {
    const types = new Set(bonnes.map((c) => c.type));
    expect(types.size).toBe(20);
  });

  it('refuse un type de commande inventé', () => {
    expect(CommandSchema.safeParse({ type: 'DonneMoiTout' }).success).toBe(false);
  });

  it('refuse une case hors carte', () => {
    const out = parseOrMessages(CommandSchema, {
      type: 'MoveHero',
      hero: 'H3',
      to: { col: 999, row: 0 },
    });
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.messages.join(' ')).toContain('hors carte');
  });

  it('refuse un hexagone hors champ de bataille', () => {
    const out = parseOrMessages(CombatActionSchema, {
      kind: 'move',
      unit: 'A1',
      to: { col: 40, row: 0 },
    });
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.messages.join(' ')).toContain('hors champ');
  });

  it('refuse une quantité négative', () => {
    expect(
      CommandSchema.safeParse({
        type: 'RecruitCreatures',
        town: 'T_a',
        creature: 'granit_t1',
        count: -5,
      }).success,
    ).toBe(false);
  });

  it('refuse un emplacement de pile hors des sept', () => {
    expect(
      CommandSchema.safeParse({
        type: 'SwapArmy',
        a: { kind: 'hero', uid: 'H1' },
        b: { kind: 'hero', uid: 'H2' },
        slotA: 0,
        slotB: 7,
      }).success,
    ).toBe(false);
  });

  it("refuse une injection dans un identifiant d'objet", () => {
    expect(
      CommandSchema.safeParse({
        type: 'HeroInteract',
        hero: 'H3',
        object: "O_1; DROP TABLE saves;--",
      }).success,
    ).toBe(false);
  });
});

describe("CommandEnvelopeSchema (clef d'idempotence)", () => {
  it('accepte une enveloppe complète', () => {
    expect(
      CommandEnvelopeSchema.safeParse({
        gameId: 'partie-123',
        playerId: 'P2',
        command: { type: 'EndTurn' },
        expectedTurn: 184,
        idempotencyKey: '0f1e2d3c-4b5a-6978',
      }).success,
    ).toBe(true);
  });

  it("refuse une clef d'idempotence trop courte", () => {
    const out = parseOrMessages(CommandEnvelopeSchema, {
      gameId: 'partie-123',
      playerId: 'P2',
      command: { type: 'EndTurn' },
      idempotencyKey: 'abc',
    });
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.messages.join(' ')).toContain('idempotence');
  });
});

describe('SlotIdSchema', () => {
  it('accepte des identifiants sobres', () => {
    for (const id of ['auto-1', 'emplacement_3', 'a', '2026-08-17']) {
      expect(SlotIdSchema.safeParse(id).success, id).toBe(true);
    }
  });

  it('refuse toute tentative de traversée de répertoire', () => {
    for (const id of ['../etc/passwd', 'a/b', 'A', 'é', '-debut', '', 'a'.repeat(65)]) {
      expect(SlotIdSchema.safeParse(id).success, id).toBe(false);
    }
  });
});

describe('ThumbnailSchema', () => {
  it('accepte une data-url image', () => {
    expect(ThumbnailSchema.safeParse('data:image/png;base64,iVBORw0KGgo=').success).toBe(true);
    expect(ThumbnailSchema.safeParse('data:image/webp;base64,UklGRg==').success).toBe(true);
  });

  it("refuse une ressource distante ou un script", () => {
    for (const v of [
      'https://exemple.test/vignette.png',
      'javascript:alert(1)',
      'data:text/html;base64,PHNjcmlwdD4=',
      '<img src=x onerror=alert(1)>',
    ]) {
      expect(ThumbnailSchema.safeParse(v).success, v).toBe(false);
    }
  });
});

describe('SaveSlotSchema', () => {
  it('accepte un emplacement complet', () => {
    expect(SaveSlotSchema.safeParse(validSlot()).success).toBe(true);
  });

  it('refuse un hash mal formé', () => {
    const out = parseOrMessages(SaveSlotSchema, validSlot({ hash: 'ZZZ' }));
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.messages.join(' ')).toContain('Empreinte');
  });

  it('refuse un horodatage libre', () => {
    expect(SaveSlotSchema.safeParse(validSlot({ updatedAt: 'hier' })).success).toBe(false);
  });

  it('refuse une couleur invalide', () => {
    expect(
      SaveSlotSchema.safeParse(
        validSlot({ players: [{ name: 'X', faction: 'granit', color: 'rouge' }] }),
      ).success,
    ).toBe(false);
  });

  it("refuse un nom d'emplacement vide", () => {
    const out = parseOrMessages(SaveSlotSchema, validSlot({ name: '   ' }));
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.messages.join(' ')).toContain('ne peut pas être vide');
  });
});

describe('SaveUploadSchema', () => {
  const bon = {
    slot: validSlot(),
    setup: validSetup(),
    state: '{"engineVersion":"1.0.0-noyau"}',
    commands: [{ type: 'EndTurn' }],
  };

  it('accepte un dépôt complet', () => {
    expect(SaveUploadSchema.safeParse(bon).success).toBe(true);
  });

  it("refuse un état qui n'est pas une chaîne JSON", () => {
    expect(SaveUploadSchema.safeParse({ ...bon, state: { turn: 1 } }).success).toBe(false);
    expect(SaveUploadSchema.safeParse({ ...bon, state: 'bonjour' }).success).toBe(false);
  });

  it('refuse une commande invalide dans le journal', () => {
    expect(
      SaveUploadSchema.safeParse({ ...bon, commands: [{ type: 'Triche' }] }).success,
    ).toBe(false);
  });
});

describe('RenameSaveSchema', () => {
  it("nettoie les espaces autour du nom", () => {
    const out = RenameSaveSchema.parse({ name: '  Col des Sagnes  ' });
    expect(out.name).toBe('Col des Sagnes');
  });

  it('refuse un nom trop long', () => {
    expect(RenameSaveSchema.safeParse({ name: 'a'.repeat(200) }).success).toBe(false);
  });
});

describe('Profil', () => {
  it('le profil par défaut se valide lui-même', () => {
    const p = defaultProfile(NOW);
    expect(ProfileSchema.safeParse(p).success).toBe(true);
    expect(p.volumes.musique).toBe(70);
    expect(p.accessibilite.motifsBannieres).toBe(true);
    expect(p.dernierePartie).toBeNull();
  });

  it('accepte une mise à jour partielle', () => {
    const out = ProfilePatchSchema.safeParse({ volumes: { musique: 0 } });
    expect(out.success).toBe(true);
  });

  it('refuse un volume hors bornes', () => {
    const out = parseOrMessages(ProfilePatchSchema, { volumes: { musique: 300 } });
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.messages.join(' ')).toContain('Volume maximal');
  });

  it('refuse une option inconnue', () => {
    expect(ProfilePatchSchema.safeParse({ tricherie: true }).success).toBe(false);
    expect(
      ProfilePatchSchema.safeParse({ accessibilite: { inconnu: true } }).success,
    ).toBe(false);
  });

  it('accepte la remise à zéro de la dernière partie', () => {
    expect(ProfilePatchSchema.safeParse({ dernierePartie: null }).success).toBe(true);
  });
});

describe('constantes et versions', () => {
  it('les quotas correspondent au cahier des charges', () => {
    expect(MAX_SAVE_BYTES).toBe(24 * 1024 * 1024);
    expect(MANUAL_SLOTS).toBe(12);
  });

  it('la compatibilité de version se joue sur la majeure', () => {
    expect(versionsCompatibles('1.0.0-noyau', '1.0.0-noyau')).toBe(true);
    expect(versionsCompatibles('1.0.0-noyau', '1.4.2-forez')).toBe(true);
    expect(versionsCompatibles('1.0.0', '2.0.0')).toBe(false);
    expect(versionsCompatibles('inconnu', '1.0.0')).toBe(false);
  });

  it('chaque code d’erreur a un statut HTTP', () => {
    expect(ERROR_STATUS.sauvegarde_introuvable).toBe(404);
    expect(ERROR_STATUS.trop_de_requetes).toBe(429);
    expect(ERROR_STATUS.charge_trop_lourde).toBe(413);
  });
});

describe('MapCoordSchema', () => {
  it('refuse une coordonnée non entière', () => {
    expect(MapCoordSchema.safeParse({ col: 1.5, row: 2 }).success).toBe(false);
  });
  it('refuse une clef supplémentaire', () => {
    expect(MapCoordSchema.safeParse({ col: 1, row: 2, z: 3 }).success).toBe(false);
  });
});
