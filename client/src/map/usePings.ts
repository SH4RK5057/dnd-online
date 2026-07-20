import { useCallback, useEffect, useState } from 'react'
import * as Y from 'yjs'
import type { PingRecord } from './pingTypes'

/** How long a ping stays visible before the DM's client sweeps it away. */
const PING_LIFETIME_MS = 4000
const SWEEP_INTERVAL_MS = 1000

function pingsMap(doc: Y.Doc) {
  return doc.getMap<PingRecord>('pings')
}

export interface UsePingsResult {
  /** This scene's currently-active pings only. */
  pings: PingRecord[]
  createPing: (playerId: string, playerName: string, x: number, y: number) => void
}

/** "Flash a visual ripple/label on the map for their peers" — anyone
 * (DM or player) can create one; it's visible to everyone, then expires on
 * its own. Time-based expiry (rather than expiry-on-next-write, like the
 * roll log's count-based trim) needs a periodic sweep even when nobody's
 * actively doing anything else, so — same DM-only-does-the-deleting
 * convention as every other trimmed collection in this app — only the DM's
 * client runs the interval. */
export function usePings(doc: Y.Doc | null, sceneId: string | null, isDm: boolean): UsePingsResult {
  const [allPings, setAllPings] = useState<PingRecord[]>([])

  useEffect(() => {
    if (!doc) {
      setAllPings([])
      return
    }
    const m = pingsMap(doc)
    const sync = () => setAllPings(Array.from(m.values()))
    sync()
    m.observe(sync)
    return () => m.unobserve(sync)
  }, [doc])

  useEffect(() => {
    if (!doc || !isDm) return
    const sweep = () => {
      const m = pingsMap(doc)
      const cutoff = Date.now() - PING_LIFETIME_MS
      const expired: string[] = []
      m.forEach((ping, id) => {
        if (ping.createdAt < cutoff) expired.push(id)
      })
      if (expired.length === 0) return
      doc.transact(() => {
        for (const id of expired) m.delete(id)
      })
    }
    const interval = setInterval(sweep, SWEEP_INTERVAL_MS)
    return () => clearInterval(interval)
  }, [doc, isDm])

  const createPing = useCallback(
    (playerId: string, playerName: string, x: number, y: number) => {
      if (!doc || !sceneId) return
      const id = crypto.randomUUID()
      pingsMap(doc).set(id, { id, sceneId, playerId, playerName, x, y, createdAt: Date.now() })
    },
    [doc, sceneId],
  )

  const pings = sceneId ? allPings.filter((p) => p.sceneId === sceneId) : []

  return { pings, createPing }
}
