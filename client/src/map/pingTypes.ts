export interface PingRecord {
  id: string
  sceneId: string
  playerId: string
  playerName: string
  /** Grid-cell units, same convention as tokens/walls/lights. */
  x: number
  y: number
  createdAt: number
}
