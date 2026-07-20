import { useCallback, useEffect, useState } from 'react'
import * as Y from 'yjs'
import type { RollRequestRecord } from './types'

function requestsMap(doc: Y.Doc) {
  return doc.getMap<RollRequestRecord>('rollRequests')
}

export interface UseRollRequestsResult {
  /** All open requests, any target — the DM's UI needs the full list to
   * show what's pending; players filter to their own. */
  requests: RollRequestRecord[]
  createRequest: (targetPlayerId: string, requestedBy: string, label: string, suggestedNotation: string | null) => void
  /** Called once a player actually rolls in response — clears the prompt. */
  clearRequest: (requestId: string) => void
}

export function useRollRequests(doc: Y.Doc | null): UseRollRequestsResult {
  const [requests, setRequests] = useState<RollRequestRecord[]>([])

  useEffect(() => {
    if (!doc) {
      setRequests([])
      return
    }
    const requestsM = requestsMap(doc)
    const sync = () => setRequests(Array.from(requestsM.values()).sort((a, b) => a.createdAt - b.createdAt))
    sync()
    requestsM.observe(sync)
    return () => requestsM.unobserve(sync)
  }, [doc])

  const createRequest = useCallback(
    (targetPlayerId: string, requestedBy: string, label: string, suggestedNotation: string | null) => {
      if (!doc) return
      const id = crypto.randomUUID()
      const record: RollRequestRecord = {
        id,
        targetPlayerId,
        requestedBy,
        label,
        suggestedNotation,
        createdAt: Date.now(),
      }
      requestsMap(doc).set(id, record)
    },
    [doc],
  )

  const clearRequest = useCallback(
    (requestId: string) => {
      if (!doc) return
      requestsMap(doc).delete(requestId)
    },
    [doc],
  )

  return { requests, createRequest, clearRequest }
}
