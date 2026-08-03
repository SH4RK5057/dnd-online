import { useCallback, useEffect, useState } from 'react'
import * as Y from 'yjs'
import type { TriggerAction, TriggerRecord } from './types'

function triggersMap(doc: Y.Doc) {
  return doc.getMap<TriggerRecord>('triggers')
}

export interface CreateTriggerInput {
  sceneId: string
  name: string
  x: number
  y: number
  widthCells: number
  heightCells: number
  hidden: boolean
  perceptionDc: number | null
  oneShot: boolean
  actions: TriggerAction[]
}

export interface UseTriggersResult {
  triggers: TriggerRecord[]
  createTrigger: (input: CreateTriggerInput) => string
  updateTriggerActions: (id: string, actions: TriggerAction[]) => void
  markFired: (id: string) => void
  revealTrigger: (id: string) => void
  deleteTrigger: (id: string) => void
}

/** Same DM-authoritative-by-convention note as useWalls.ts: Yjs enforces no
 * write permissions, only the DM's UI renders controls that call these. */
export function useTriggers(doc: Y.Doc | null, sceneId: string | null): UseTriggersResult {
  const [allTriggers, setAllTriggers] = useState<TriggerRecord[]>([])

  useEffect(() => {
    if (!doc) {
      setAllTriggers([])
      return
    }
    const m = triggersMap(doc)
    const sync = () => setAllTriggers(Array.from(m.values()))
    sync()
    m.observe(sync)
    return () => m.unobserve(sync)
  }, [doc])

  const createTrigger = useCallback(
    (input: CreateTriggerInput): string => {
      if (!doc) throw new Error('No active session.')
      const id = crypto.randomUUID()
      const record: TriggerRecord = {
        id,
        sceneId: input.sceneId,
        name: input.name,
        x: input.x,
        y: input.y,
        widthCells: input.widthCells,
        heightCells: input.heightCells,
        hidden: input.hidden,
        perceptionDc: input.perceptionDc,
        oneShot: input.oneShot,
        firedAt: null,
        actions: input.actions,
        createdAt: Date.now(),
      }
      triggersMap(doc).set(id, record)
      return id
    },
    [doc],
  )

  const updateTriggerActions = useCallback(
    (id: string, actions: TriggerAction[]) => {
      if (!doc) return
      const m = triggersMap(doc)
      const trigger = m.get(id)
      if (!trigger) return
      m.set(id, { ...trigger, actions })
    },
    [doc],
  )

  const markFired = useCallback(
    (id: string) => {
      if (!doc) return
      const m = triggersMap(doc)
      const trigger = m.get(id)
      if (!trigger) return
      m.set(id, { ...trigger, firedAt: Date.now(), hidden: false })
    },
    [doc],
  )

  const revealTrigger = useCallback(
    (id: string) => {
      if (!doc) return
      const m = triggersMap(doc)
      const trigger = m.get(id)
      if (!trigger) return
      m.set(id, { ...trigger, hidden: false })
    },
    [doc],
  )

  const deleteTrigger = useCallback(
    (id: string) => {
      if (!doc) return
      triggersMap(doc).delete(id)
    },
    [doc],
  )

  const triggers = sceneId ? allTriggers.filter((t) => t.sceneId === sceneId) : []

  return { triggers, createTrigger, updateTriggerActions, markFired, revealTrigger, deleteTrigger }
}
