export type ChatChannel = 'ic' | 'ooc'

export interface ChatMessageRecord {
  id: string
  playerId: string
  playerName: string
  channel: ChatChannel
  text: string
  createdAt: number
}
