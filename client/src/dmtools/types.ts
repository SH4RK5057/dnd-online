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
  createdAt: number
}
