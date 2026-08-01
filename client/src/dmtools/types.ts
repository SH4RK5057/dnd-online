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
  /** Restricts an otherwise-shown handout to a single player (null = every
   * connected player, the original behavior). Only checked while
   * `shownToPlayers` is true — toggling visibility off still hides it from
   * everyone regardless of this field. */
  visibleToPlayerId: string | null
  createdAt: number
}
