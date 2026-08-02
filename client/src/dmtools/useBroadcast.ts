import { useCallback, useEffect, useRef, useState } from 'react'
import * as Y from 'yjs'
import type { BroadcastRecord } from './types'

const BROADCAST_KEY = 'current'

function broadcastMap(doc: Y.Doc) {
  return doc.getMap<BroadcastRecord>('broadcast')
}

export interface UseBroadcastResult {
  notification: BroadcastRecord | null
  dismiss: () => void
  send: (text: string, monsterKey: string | null, visibleToPlayerIds: string[] | null) => void
}

/** DM "push this right now" tool — distinct from Handouts' persistently-
 * toggled-visible sharing (useHandouts.ts): this is a one-shot transient
 * banner, same baseline-then-diff "only fire on a genuinely new record"
 * logic as combat/useEncounterNotifications.ts, so joining mid-session (or
 * a page reload) doesn't replay the last broadcast as if it just happened.
 * `dismiss()` is purely local (per-viewer) — it never touches the shared
 * record, so a late-joining player still sees the current broadcast once,
 * then it's gone until the DM sends another.
 *
 * `viewerId`/`isDm` gate whether *this* viewer's `notification` fires at all
 * for a targeted broadcast (BroadcastRecord.visibleToPlayerIds) — the DM
 * always sees their own broadcast regardless of targeting (confirmation
 * it went out), a targeted player only sees it if they're in the list. The
 * shared `seenSentAtRef` dedup still tracks every record's `sentAt`
 * unconditionally, so a viewer who wasn't shown one broadcast still
 * correctly detects the next new one. */
export function useBroadcast(doc: Y.Doc | null, viewerId: string, isDm: boolean): UseBroadcastResult {
  const [notification, setNotification] = useState<BroadcastRecord | null>(null)
  const seenSentAtRef = useRef<number | null | 'unset'>('unset')

  useEffect(() => {
    seenSentAtRef.current = 'unset'
    if (!doc) return
    const m = broadcastMap(doc)

    const sync = () => {
      const record = m.get(BROADCAST_KEY) ?? null
      const seen = seenSentAtRef.current
      seenSentAtRef.current = record?.sentAt ?? null
      if (seen === 'unset') return // baseline pass — record state, don't notify
      if (!record || record.sentAt === seen) return
      const visible = isDm || record.visibleToPlayerIds == null || record.visibleToPlayerIds.includes(viewerId)
      if (visible) setNotification(record)
    }

    sync()
    m.observe(sync)
    return () => m.unobserve(sync)
  }, [doc, viewerId, isDm])

  const send = useCallback(
    (text: string, monsterKey: string | null, visibleToPlayerIds: string[] | null) => {
      if (!doc) return
      broadcastMap(doc).set(BROADCAST_KEY, { text, monsterKey, visibleToPlayerIds, sentAt: Date.now() })
    },
    [doc],
  )

  const dismiss = useCallback(() => setNotification(null), [])

  return { notification, dismiss, send }
}
