import { createContext } from 'react'
import type * as Y from 'yjs'
import type { WebrtcProvider } from 'y-webrtc'
import type { SessionRole } from './types'

export interface SessionMeta {
  sessionName: string
  dmName: string
}

export interface SessionState {
  role: SessionRole
  joinCode: string
  roomName: string
  displayName: string
  doc: Y.Doc
  provider: WebrtcProvider
}

export interface SessionContextValue {
  session: SessionState | null
  sessionMeta: SessionMeta | null
  startSession: (dmName: string, opts?: { reuseCode?: string; sessionName?: string }) => void
  joinSession: (code: string, playerName: string) => void
  leaveSession: () => void
}

export const SessionContext = createContext<SessionContextValue | null>(null)
