import { useCallback, useEffect, useState } from 'react'
import * as Y from 'yjs'
import { colorForPlayerId } from './annotationColor'
import type { AnnotationRecord, Point } from './annotationTypes'

/** How long a freehand annotation stays on the map before the DM's client
 * sweeps it away — "temporary annotations," not a permanent drawing layer. */
const ANNOTATION_LIFETIME_MS = 60_000
const SWEEP_INTERVAL_MS = 5000

function annotationsMap(doc: Y.Doc) {
  return doc.getMap<AnnotationRecord>('annotations')
}

export interface UseAnnotationsResult {
  /** This scene's currently-active annotations only. */
  annotations: AnnotationRecord[]
  createAnnotation: (playerId: string, points: Point[]) => void
  /** DM-only in the UI (not enforced here, same convention as everywhere
   * else) — wipes every annotation on this scene immediately, instead of
   * waiting for the timed sweep. */
  clearAll: () => void
}

/** Freehand shift-drag drawing on the map — same time-based-expiry,
 * DM-only-sweeps convention as map/usePings.ts, just a longer lifetime
 * (a sketch is more likely to still be relevant a minute later than a
 * one-off location flash). */
export function useAnnotations(doc: Y.Doc | null, sceneId: string | null, isDm: boolean): UseAnnotationsResult {
  const [allAnnotations, setAllAnnotations] = useState<AnnotationRecord[]>([])

  useEffect(() => {
    if (!doc) {
      setAllAnnotations([])
      return
    }
    const m = annotationsMap(doc)
    const sync = () => setAllAnnotations(Array.from(m.values()))
    sync()
    m.observe(sync)
    return () => m.unobserve(sync)
  }, [doc])

  useEffect(() => {
    if (!doc || !isDm) return
    const sweep = () => {
      const m = annotationsMap(doc)
      const cutoff = Date.now() - ANNOTATION_LIFETIME_MS
      const expired: string[] = []
      m.forEach((annotation, id) => {
        if (annotation.createdAt < cutoff) expired.push(id)
      })
      if (expired.length === 0) return
      doc.transact(() => {
        for (const id of expired) m.delete(id)
      })
    }
    const interval = setInterval(sweep, SWEEP_INTERVAL_MS)
    return () => clearInterval(interval)
  }, [doc, isDm])

  const createAnnotation = useCallback(
    (playerId: string, points: Point[]) => {
      if (!doc || !sceneId || points.length < 2) return
      const id = crypto.randomUUID()
      annotationsMap(doc).set(id, { id, sceneId, playerId, points, color: colorForPlayerId(playerId), createdAt: Date.now() })
    },
    [doc, sceneId],
  )

  const clearAll = useCallback(() => {
    if (!doc || !sceneId) return
    const m = annotationsMap(doc)
    const toDelete: string[] = []
    m.forEach((annotation, id) => {
      if (annotation.sceneId === sceneId) toDelete.push(id)
    })
    doc.transact(() => {
      for (const id of toDelete) m.delete(id)
    })
  }, [doc, sceneId])

  const annotations = sceneId ? allAnnotations.filter((a) => a.sceneId === sceneId) : []

  return { annotations, createAnnotation, clearAll }
}
