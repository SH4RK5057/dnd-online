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
  send: (text: string, monsterKey: string | null) => void
}

/** DM "push this right now" tool — distinct from Handouts' persistently-
 * toggled-visible sharing (useHandouts.ts): this is a one-shot transient
 * banner, same baseline-then-diff "only fire on a genuinely new record"
 * logic as combat/useEncounterNotifications.ts, so joining mid-session (or
 * a page reload) doesn't replay the last broadcast as if it just happened.
 * `dismiss()` is purely local (per-viewer) — it never touches the shared
 * record, so a late-joining player still sees the current broadcast once,
 * then it's gone until the DM sends another. */
export function useBroadcast(doc: Y.Doc | null): UseBroadcastResult {
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
      if (record && record.sentAt !== seen) setNotification(record)
    }

    sync()
    m.observe(sync)
    return () => m.unobserve(sync)
  }, [doc])

  const send = useCallback(
    (text: string, monsterKey: string | null) => {
      if (!doc) return
      broadcastMap(doc).set(BROADCAST_KEY, { text, monsterKey, sentAt: Date.now() })
    },
    [doc],
  )

  const dismiss = useCallback(() => setNotification(null), [])

  return { notification, dismiss, send }
}
