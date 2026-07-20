import { useEffect, useRef, useState } from 'react'
import * as Y from 'yjs'
import type { CombatStateRecord } from './types'
import type { SceneRecord } from '../map/types'

function combatMap(doc: Y.Doc) {
  return doc.getMap<CombatStateRecord>('combat')
}

export interface EncounterNotification {
  sceneId: string
  sceneName: string
  startedAt: number
}

/** Watches every scene's combat state (not just the currently-viewed one) for
 * a fresh `startCombat` call, so a player looking at a different part of the
 * map — or a different scene entirely — still finds out an encounter began
 * and where. Fires only for a genuine new start (a `startedAt` newer than
 * the last one seen for that scene), never for the initial sync on mount
 * (which would otherwise "notify" about every already-active fight the
 * moment a player joins) or for unrelated combat updates (advancing a turn,
 * ending combat). `dismiss()` clears the current notification; a fresh one
 * always replaces whatever's showing rather than queuing. */
export function useEncounterNotifications(doc: Y.Doc | null, scenes: SceneRecord[]): {
  notification: EncounterNotification | null
  dismiss: () => void
} {
  const [notification, setNotification] = useState<EncounterNotification | null>(null)
  const seenStartedAtRef = useRef<Map<string, number> | null>(null)
  const scenesRef = useRef<SceneRecord[]>(scenes)
  scenesRef.current = scenes

  useEffect(() => {
    seenStartedAtRef.current = null
    if (!doc) return
    const combatM = combatMap(doc)

    const sync = () => {
      const seen = seenStartedAtRef.current
      const current = new Map<string, number>()
      let latestNew: CombatStateRecord | null = null

      combatM.forEach((record) => {
        if (record.startedAt !== null) current.set(record.sceneId, record.startedAt)
        if (!seen) return // baseline pass — record state, don't notify
        const previous = seen.get(record.sceneId) ?? null
        if (record.startedAt !== null && record.startedAt !== previous) {
          if (!latestNew || record.startedAt > latestNew.startedAt!) latestNew = record
        }
      })

      seenStartedAtRef.current = current
      if (latestNew) {
        const record = latestNew as CombatStateRecord
        const scene = scenesRef.current.find((s) => s.id === record.sceneId)
        setNotification({ sceneId: record.sceneId, sceneName: scene?.name ?? 'a scene', startedAt: record.startedAt! })
      }
    }

    sync()
    combatM.observe(sync)
    return () => combatM.unobserve(sync)
  }, [doc])

  return { notification, dismiss: () => setNotification(null) }
}
