/** A notable moment worth showing in the session recap that isn't itself a
 * roll or a chat message — currently just combat start/end (see
 * components/InitiativeTracker.tsx), logged at the UI layer that already
 * calls startCombat/endCombat rather than inside combat/useCombat.ts
 * itself, so this stays a recap-only concern. */
export interface SessionEventRecord {
  id: string
  label: string
  createdAt: number
}
