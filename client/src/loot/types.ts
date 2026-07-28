export type Currency = { pp: number; gp: number; ep: number; sp: number; cp: number }

/** An unclaimed item sitting in the shared party pool — freeform like
 * CharacterRecord.inventory (no mechanical stats), just not yet assigned to
 * anyone. Claiming one moves it into a specific character's own inventory
 * and removes it from this pool. */
export interface LootItemRecord {
  id: string
  name: string
  quantity: number
  notes: string
  createdAt: number
}
