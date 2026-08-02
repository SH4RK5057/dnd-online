import { useCallback, useEffect, useRef, useState } from 'react'
import * as Y from 'yjs'
import type { BroadcastRecord } from './types'

const MAX_BROADCAST_LOG_ENTRIES = 100

function broadcastsMap(doc: Y.Doc) {
  return doc.getMap<BroadcastRecord>('broadcasts')
}

export interface UseBroadcastResult {
  notification: BroadcastRecord | null
  dismiss: () => void
  send: (text: string, monsterKey: string | null, visibleToPlayerIds: string[] | null) => void
  /** Every broadcast this viewer was allowed to see, newest first — a
   * persistent message log so a dismissed/missed banner can still be read
   * later (see components/BroadcastLog.tsx). The DM sees everything they
   * sent regardless of targeting; a player sees only untargeted broadcasts
   * or ones that targeted them. */
  history: BroadcastRecord[]
}

/** DM "push this right now" tool — distinct from Handouts' persistently-
 * toggled-visible sharing (useHandouts.ts) in *when* it's shown (a one-shot
 * transient banner on send vs. a revisitable toggled-on list), but every
 * sent broadcast is kept (capped at MAX_BROADCAST_LOG_ENTRIES, oldest
 * trimmed first, same DM-only-trims pattern as dice/useRollLog.ts) so
 * `history` gives players somewhere to refer back to a message after
 * dismissing its banner.
 *
 * The transient-banner half keeps the same baseline-then-diff "only fire on
 * a genuinely new record" logic as combat/useEncounterNotifications.ts, so
 * joining mid-session (or a page reload) doesn't replay the latest
 * broadcast as if it just happened. `dismiss()` is purely local (per-viewer)
 * — it never touches the shared record, so a late-joining player still sees
 * the current broadcast's banner once, then it's gone (though still in
 * `history`) until the DM sends another.
 *
 * `viewerId`/`isDm` gate both `notification` and `history` against a
 * targeted broadcast (BroadcastRecord.visibleToPlayerIds) — the DM always
 * sees their own broadcasts regardless of targeting (confirmation what went
 * out), a targeted player only sees ones they're in the list for. The
 * baseline dedup tracks the latest record's `sentAt` unconditionally
 * (independent of visibility), so a viewer who wasn't shown one broadcast
 * still correctly detects the next new one. */
export function useBroadcast(doc: Y.Doc | null, viewerId: string, isDm: boolean): UseBroadcastResult {
  const [all, setAll] = useState<BroadcastRecord[]>([])
  const [notification, setNotification] = useState<BroadcastRecord | null>(null)
  const seenSentAtRef = useRef<number | null | 'unset'>('unset')

  useEffect(() => {
    seenSentAtRef.current = 'unset'
    if (!doc) {
      setAll([])
      return
    }
    const m = broadcastsMap(doc)

    const sync = () => {
      const records = Array.from(m.values()).sort((a, b) => a.sentAt - b.sentAt)
      setAll(records)
      const latest = records[records.length - 1] ?? null
      const seen = seenSentAtRef.current
      seenSentAtRef.current = latest?.sentAt ?? null
      if (seen === 'unset') return // baseline pass — record state, don't notify
      if (!latest || latest.sentAt === seen) return
      const visible = isDm || latest.visibleToPlayerIds == null || latest.visibleToPlayerIds.includes(viewerId)
      if (visible) setNotification(latest)
    }

    sync()
    m.observe(sync)
    return () => m.unobserve(sync)
  }, [doc, viewerId, isDm])

  // DM-only trim once the log exceeds the cap — same reasoning as
  // dice/useRollLog.ts: every peer could add, but only the DM's own client
  // deletes old entries, so racing trims across clients isn't a concern.
  useEffect(() => {
    if (!doc || !isDm) return
    const excess = all.length - MAX_BROADCAST_LOG_ENTRIES
    if (excess <= 0) return
    const m = broadcastsMap(doc)
    const oldestFirst = [...all].sort((a, b) => a.sentAt - b.sentAt)
    doc.transact(() => {
      for (let i = 0; i < excess; i++) m.delete(oldestFirst[i].id)
    })
  }, [doc, isDm, all])

  const send = useCallback(
    (text: string, monsterKey: string | null, visibleToPlayerIds: string[] | null) => {
      if (!doc) return
      const id = crypto.randomUUID()
      broadcastsMap(doc).set(id, { id, text, monsterKey, visibleToPlayerIds, sentAt: Date.now() })
    },
    [doc],
  )

  const dismiss = useCallback(() => setNotification(null), [])

  const history = all.filter((r) => isDm || r.visibleToPlayerIds == null || r.visibleToPlayerIds.includes(viewerId)).slice().reverse()

  return { notification, dismiss, send, history }
}
