export type MonsterInitiativeMode = 'individual' | 'group'

/**
 * Deliberately has NO stored turn-order array — the sequence is always
 * derived on the fly from each token's own `initiative` field (see
 * combat/rules.ts computeInitiativeOrder), sorted fresh every time it's
 * needed. `currentTokenId` is the only anchor persisted: advancing a turn
 * recomputes the live order from current tokens and finds the next id after
 * it, so a token added/removed/re-scened mid-combat can never leave a
 * stored array referencing something that no longer exists.
 */
export interface CombatStateRecord {
  /** Also the map key. */
  sceneId: string
  active: boolean
  round: number
  currentTokenId: string | null
  /** Individual: every monster token rolls its own initiative. Group: monster
   * tokens are grouped by name (a reasonable proxy for "enemy type" — there's
   * no separate monster-type field yet), one roll per group, applied to every
   * token in it. Player-owned tokens always roll individually either way. */
  monsterInitiativeMode: MonsterInitiativeMode
}
