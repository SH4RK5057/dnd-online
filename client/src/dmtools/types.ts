export interface DmNoteRecord {
  id: string
  title: string
  body: string
  createdAt: number
}

export interface HandoutRecord {
  id: string
  name: string
  assetId: string | null
  /** Freeform text content — a handout can be an image, text, or both (e.g.
   * a scanned letter prop plus a typed-out transcription). */
  text: string
  /** DM-controlled visibility, same "on demand" idea as SceneRecord.published
   * — created privately, then revealed to players when the DM is ready. */
  shownToPlayers: boolean
  /** Restricts an otherwise-shown handout to a subset of players (null =
   * every connected player, the original behavior; a non-empty array = only
   * those player ids). Only checked while `shownToPlayers` is true —
   * toggling visibility off still hides it from everyone regardless of this
   * field. */
  visibleToPlayerIds: string[] | null
  createdAt: number
}

/** A one-shot "push this right now" — distinct from HandoutRecord's
 * persistently-toggled-visible sharing in *when* it's shown (a transient
 * banner on send, vs. a revisitable toggled-on list), but every sent
 * broadcast is still kept (capped, see useBroadcast.ts's
 * MAX_BROADCAST_LOG_ENTRIES) as a message log players can refer back to
 * even after dismissing the banner. */
export interface BroadcastRecord {
  id: string
  text: string
  /** Optional compendium monster key to show a full StatBlockCard alongside
   * the text — covers the "send a stat block" half of this feature without
   * a separate data shape. Null for a text-only broadcast. */
  monsterKey: string | null
  /** Same targeting convention as HandoutRecord.visibleToPlayerIds — null =
   * every connected player (the original, only, behavior), a non-empty
   * array = only those player ids. The DM's own viewer always sees a
   * broadcast they sent, regardless of this field (see useBroadcast.ts). */
  visibleToPlayerIds: string[] | null
  sentAt: number
}
