import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import * as Y from 'yjs'
import { WebrtcProvider } from 'y-webrtc'
import { IndexeddbPersistence } from 'y-indexeddb'
import { SIGNALING_URLS } from './constants'
import { generateJoinCode, isValidJoinCode, joinCodeToRoomName, normalizeJoinCode } from './roomCode'
import { getOrCreatePlayerId, saveLastSession } from './lastSession'
import { SessionContext, type SessionMeta, type SessionState } from './context'
import type { SessionRole } from './types'

interface Cleanup {
  provider: WebrtcProvider
  persistence: IndexeddbPersistence
}

export function SessionProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<SessionState | null>(null)
  const [sessionMeta, setSessionMeta] = useState<SessionMeta | null>(null)
  const cleanupRef = useRef<Cleanup | null>(null)

  const teardown = useCallback(() => {
    if (cleanupRef.current) {
      cleanupRef.current.provider.destroy()
      void cleanupRef.current.persistence.destroy()
      cleanupRef.current = null
    }
  }, [])

  useEffect(() => teardown, [teardown])

  const openRoom = useCallback(
    (role: SessionRole, code: string, displayName: string): SessionState => {
      teardown()

      const roomName = joinCodeToRoomName(code)
      const doc = new Y.Doc()
      const persistence = new IndexeddbPersistence(roomName, doc)
      const provider = new WebrtcProvider(roomName, doc, {
        signaling: SIGNALING_URLS,
        password: normalizeJoinCode(code),
      })

      provider.awareness.setLocalState({
        playerId: getOrCreatePlayerId(),
        role,
        name: displayName,
        joinedAt: Date.now(),
      })

      cleanupRef.current = { provider, persistence }

      return { role, joinCode: code, roomName, displayName, doc, provider }
    },
    [teardown],
  )

  const startSession = useCallback(
    (dmName: string, opts?: { reuseCode?: string; sessionName?: string }) => {
      const code = opts?.reuseCode ?? generateJoinCode()
      const next = openRoom('dm', code, dmName)
      const meta = next.doc.getMap<string>('session')
      // Only seed on a fresh room; a resumed room already has this from before.
      if (!meta.get('sessionName')) {
        meta.set('sessionName', opts?.sessionName ?? `${dmName}'s Campaign`)
      }
      meta.set('dmName', dmName)
      setSession(next)
      saveLastSession({
        code,
        sessionName: meta.get('sessionName') ?? `${dmName}'s Campaign`,
        dmName,
        timestamp: Date.now(),
      })
    },
    [openRoom],
  )

  const joinSession = useCallback(
    (code: string, playerName: string) => {
      if (!isValidJoinCode(code)) {
        throw new Error('That join code doesn’t look right — double check it and try again.')
      }
      const next = openRoom('player', normalizeJoinCode(code), playerName)
      setSession(next)
    },
    [openRoom],
  )

  const leaveSession = useCallback(() => {
    teardown()
    setSession(null)
    setSessionMeta(null)
  }, [teardown])

  useEffect(() => {
    if (!session) return
    const meta = session.doc.getMap<string>('session')
    const sync = () => {
      const sessionName = meta.get('sessionName')
      const dmName = meta.get('dmName')
      if (sessionName && dmName) {
        setSessionMeta({ sessionName, dmName })
      }
    }
    sync()
    meta.observe(sync)
    return () => meta.unobserve(sync)
  }, [session])

  return (
    <SessionContext.Provider value={{ session, sessionMeta, startSession, joinSession, leaveSession }}>
      {children}
    </SessionContext.Provider>
  )
}
