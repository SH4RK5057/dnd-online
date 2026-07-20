export type RollMode = 'normal' | 'advantage' | 'disadvantage'

export interface RollTerm {
  sign: 1 | -1
  sides: number
  count: number
  /** Every die actually rolled for this term, in roll order. For the lone d20
   * term under advantage/disadvantage, this has 2 entries (both rolls);
   * every other term has exactly `count` entries. */
  results: number[]
  /** The subset of `results` that actually counted toward the total —
   * equal to `results` except for an advantage/disadvantage d20 term,
   * where only the kept (higher/lower) roll is here. */
  kept: number[]
}

export interface RollRecord {
  id: string
  playerId: string
  playerName: string
  /** e.g. "Athletics", "Fireball", or blank for a freeform roll. */
  label: string
  notation: string
  mode: RollMode
  terms: RollTerm[]
  modifier: number
  total: number
  /** Set when this roll fulfilled a DM roll request (see useRollRequests) —
   * the requesting DM's playerId, purely informational. */
  requestedBy: string | null
  /** Private rolls are still written to the same shared log (this app has
   * no server-side filtering — see components/RollLog.tsx for the
   * UI-level visibility check) but only rendered for the roller and the
   * DM; everyone else's client just doesn't show the entry. */
  private: boolean
  createdAt: number
}

/** A DM-initiated prompt asking a specific player to make a roll — "players
 * communicate intent via chat/voice, and the DM sends an official roll
 * request through the app UI." Cleared once the player rolls (or the DM
 * cancels it), not itself part of the roll log. */
export interface RollRequestRecord {
  id: string
  targetPlayerId: string
  requestedBy: string
  /** e.g. "Perception check", "Fireball save" — shown to the player as the prompt. */
  label: string
  /** Suggested notation, e.g. "1d20+3" — the player can still roll freeform instead. */
  suggestedNotation: string | null
  createdAt: number
}
