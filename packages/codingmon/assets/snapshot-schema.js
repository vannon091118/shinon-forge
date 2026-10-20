/**
 * WAS HIER NICHT STEHT: keine Grenze nach zeitlicher Gueltigkeit, kein BigInt,
 * keine Deutung. Unbekannte Felder fallen weg (Zod-Objekt ohne `.passthrough`)
 * — wer mehr schickt als der Vertrag nennt, schickt es ins Leere.
 *
 * FASSUNGEN: EIN Client->Host-Vertrag. Fassung 2 bleibt lesbar (Migration),
 * Fassung 3 verlangt den vollstaendigen Zucht-Roster und das Ei-Ledger.
 */
import { z } from 'zod';

const UInt32 = z.number().int().min(0).max(0xffffffff);
const CreatureId = z.string().regex(/^c[1-9]\d*$/);
const EggId = z.string().regex(/^e[1-9]\d*$/);
const BonusSchema = z.object({
  slot: z.number().int().nonnegative(),
  id: z.string().min(1),
  effect: z.enum(['statMod', 'hatchPoints', 'lootLuck']),
  value: z.number().int().nonnegative(),
});
const CreatureSchema = z.object({
  id: CreatureId,
  species: z.string().min(1),
  xp: z.number().nonnegative(),
  bxp: z.number().int().nonnegative(),
  gen: z.number().int().min(1),
  bonuses: z.array(BonusSchema),
  clutch: z.number().int().nonnegative(),
  wins: z.number().int().nonnegative(),
  losses: z.number().int().nonnegative(),
  round: z.number().int().nonnegative(),
  hits: z.number().int().nonnegative(),
  damageTotal: z.string().regex(/^\d+$/),
  hp: z.number().nonnegative(),
});
const EggSchema = z.object({
  id: EggId,
  seed: UInt32,
  parents: z.array(CreatureId).length(2),
  species: z.string().min(1),
  gen: z.number().int().min(2),
  bonuses: z.array(BonusSchema),
  bp: z.number().int().nonnegative(),
});
const BreedingSchema = z.object({
  schemaVersion: z.literal(3),
  seed: UInt32,
  nextId: z.number().int().min(1),
  active: CreatureId.nullable(),
  creatures: z.array(CreatureSchema).min(1),
  eggs: z.array(EggSchema),
  completions: z.number().int().nonnegative(),
}).superRefine((state, ctx) => {
  const ids = new Set();
  let maxId = 0;
  for (const item of [...state.creatures, ...state.eggs]) {
    if (ids.has(item.id)) ctx.addIssue({ code: 'custom', path: ['creatures'], message: `Duplicate creature/egg ID: ${item.id}` });
    ids.add(item.id);
    maxId = Math.max(maxId, Number(item.id.slice(1)) || 0);
  }
  const creatureIds = new Set(state.creatures.map((creature) => creature.id));
  if (state.active !== null && !creatureIds.has(state.active)) {
    ctx.addIssue({ code: 'custom', path: ['active'], message: 'active must refer to an existing creature' });
  }
  for (const [index, egg] of state.eggs.entries()) {
    if (egg.parents[0] === egg.parents[1]) {
      ctx.addIssue({ code: 'custom', path: ['eggs', index, 'parents'], message: 'egg parents must differ' });
    }
    for (const parent of egg.parents) {
      if (!creatureIds.has(parent)) ctx.addIssue({ code: 'custom', path: ['eggs', index, 'parents'], message: `missing parent ${parent}` });
    }
  }
  if (state.nextId <= maxId) ctx.addIssue({ code: 'custom', path: ['nextId'], message: 'nextId must exceed every stored creature/egg ID' });
});

const SnapshotBaseSchema = z.object({
  schemaVersion: z.number().int().nonnegative(),
  species: z.string().min(1),
  xp: z.number().nonnegative(),
  wins: z.number().int().nonnegative(),
  losses: z.number().int().nonnegative(),
  round: z.number().int().nonnegative(),
  damageTotal: z.string().regex(/^\d+$/, 'damageTotal must be a decimal string'),
  hits: z.number().int().nonnegative(),
  loot: z.object({
    schrott: z.number().int().nonnegative(),
    brauchbar: z.number().int().nonnegative(),
    shiny: z.number().int().nonnegative(),
  }),
  savedAt: z.string().optional(),
  completions: z.number().int().nonnegative().default(0),
  wild: z.object({
    speciesId: z.string().min(1),
    level: z.number().int().min(1),
    hp: z.number().nonnegative(),
    maxHp: z.number().positive(),
  }).nullable().default(null),
  breeding: BreedingSchema.optional(),
});
function requireBreedingForV3(value, ctx) {
  if (value.schemaVersion >= 3 && value.breeding === undefined) {
    ctx.addIssue({ code: 'custom', path: ['breeding'], message: 'snapshot v3 requires the complete breeding state' });
  }
}
export const SnapshotSchema = SnapshotBaseSchema.superRefine(requireBreedingForV3);
export const StoredSnapshotSchema = SnapshotBaseSchema.extend({ storedAt: z.string() }).superRefine(requireBreedingForV3);
export const ActivitySchema = z.object({
  completions: z.number().int().nonnegative(),
  running: z.boolean(),
  at: z.string(),
});
export const SnapshotAckSchema = z.object({
  storedAt: z.string(),
  level: z.number().int().nonnegative(),
  xp: z.number().nonnegative(),
});
