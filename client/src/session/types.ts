export type SessionRole = 'dm' | 'player'

export type ConnectionStatus =
  | 'idle'
  | 'connecting'
  | 'connected'
  | 'reconnecting'
  | 'failed'

export interface PeerAwarenessState {
  playerId: string
  role: SessionRole
  name: string
  joinedAt: number
}

export interface PeerInfo extends PeerAwarenessState {
  clientId: number
  isLocal: boolean
  connectionState: 'connected' | 'reconnecting'
}

export interface LastSession {
  code: string
  sessionName: string
  dmName: string
  timestamp: number
}

export interface ConnectionFailureInfo {
  reason: 'signaling-unreachable' | 'no-peers'
  message: string
}
