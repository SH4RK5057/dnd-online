import { useCallback, useEffect, useState } from 'react'
import * as Y from 'yjs'
import type { SessionEventRecord } from './types'

const MAX_EVENTS = 200

function eventsMap(doc: Y.Doc) {
  return doc.getMap<SessionEventRecord>('sessionEvents')
}

export interface UseSessionEventsResult {
  events: SessionEventRecord[]
  logEvent: (label: string) => void
}

/** Same shared-doc-map + client-side-sort + DM-only-trims pattern as
 * dice/useRollLog.ts and chat/useChat.ts — the third of the three logs the
 * session recap panel merges into one timeline. */
export function useSessionEvents(doc: Y.Doc | null, isDm: boolean): UseSessionEventsResult {
  const [events, setEvents] = useState<SessionEventRecord[]>([])

  useEffect(() => {
    if (!doc) {
      setEvents([])
      return
    }
    const m = eventsMap(doc)
    const sync = () => setEvents(Array.from(m.values()).sort((a, b) => a.createdAt - b.createdAt))
    sync()
    m.observe(sync)
    return () => m.unobserve(sync)
  }, [doc])

  useEffect(() => {
    if (!doc || !isDm) return
    const excess = events.length - MAX_EVENTS
    if (excess <= 0) return
    const m = eventsMap(doc)
    const oldestFirst = [...events].sort((a, b) => a.createdAt - b.createdAt)
    doc.transact(() => {
      for (let i = 0; i < excess; i++) m.delete(oldestFirst[i].id)
    })
  }, [doc, isDm, events])

  const logEvent = useCallback(
    (label: string) => {
      if (!doc) return
      const id = crypto.randomUUID()
      eventsMap(doc).set(id, { id, label, createdAt: Date.now() })
    },
    [doc],
  )

  return { events, logEvent }
}
