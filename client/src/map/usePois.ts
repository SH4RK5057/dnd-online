import { useCallback, useEffect, useState } from 'react'
import * as Y from 'yjs'
import type { PoiRecord } from './poiTypes'

function poisMap(doc: Y.Doc) {
  return doc.getMap<PoiRecord>('pois')
}

export interface UsePoisResult {
  /** This scene's POIs only. */
  pois: PoiRecord[]
  createPoi: (sceneId: string, name: string, x: number, y: number) => string
  deletePoi: (poiId: string) => void
  movePoi: (poiId: string, x: number, y: number) => void
  renamePoi: (poiId: string, name: string) => void
  setLinkedScene: (poiId: string, linkedSceneId: string | null) => void
  /** Adds a two-way connection between two POIs on the same scene —
   * "pathing" is just this adjacency graph. */
  connectPois: (poiIdA: string, poiIdB: string) => void
  disconnectPois: (poiIdA: string, poiIdB: string) => void
}

/** Points of Interest for town/landscape scene navigation
 * (map/types.ts SceneScale) — DM-placed locations connected into a simple
 * point-to-point pathing graph. Same flat-record, DM-authoritative-by-
 * convention pattern as every other entity in this app. */
export function usePois(doc: Y.Doc | null, sceneId: string | null): UsePoisResult {
  const [allPois, setAllPois] = useState<PoiRecord[]>([])

  useEffect(() => {
    if (!doc) {
      setAllPois([])
      return
    }
    const m = poisMap(doc)
    const sync = () => setAllPois(Array.from(m.values()))
    sync()
    m.observe(sync)
    return () => m.unobserve(sync)
  }, [doc])

  const patchPoi = useCallback(
    (poiId: string, patch: Partial<Omit<PoiRecord, 'id'>>) => {
      if (!doc) return
      const m = poisMap(doc)
      const poi = m.get(poiId)
      if (!poi) return
      m.set(poiId, { ...poi, ...patch })
    },
    [doc],
  )

  const createPoi = useCallback(
    (targetSceneId: string, name: string, x: number, y: number): string => {
      if (!doc) throw new Error('No active session.')
      const id = crypto.randomUUID()
      const record: PoiRecord = { id, sceneId: targetSceneId, name, x, y, connections: [], linkedSceneId: null, createdAt: Date.now() }
      poisMap(doc).set(id, record)
      return id
    },
    [doc],
  )

  const deletePoi = useCallback(
    (poiId: string) => {
      if (!doc) return
      const m = poisMap(doc)
      // Also remove this POI from every other POI's connections list, so
      // deleting one never leaves a dangling reference in the graph.
      doc.transact(() => {
        m.forEach((poi, id) => {
          if (poi.connections.includes(poiId)) m.set(id, { ...poi, connections: poi.connections.filter((c) => c !== poiId) })
        })
        m.delete(poiId)
      })
    },
    [doc],
  )

  const movePoi = useCallback((poiId: string, x: number, y: number) => patchPoi(poiId, { x, y }), [patchPoi])
  const renamePoi = useCallback((poiId: string, name: string) => patchPoi(poiId, { name }), [patchPoi])
  const setLinkedScene = useCallback(
    (poiId: string, linkedSceneId: string | null) => patchPoi(poiId, { linkedSceneId }),
    [patchPoi],
  )

  const connectPois = useCallback(
    (poiIdA: string, poiIdB: string) => {
      if (!doc || poiIdA === poiIdB) return
      const m = poisMap(doc)
      const a = m.get(poiIdA)
      const b = m.get(poiIdB)
      if (!a || !b) return
      doc.transact(() => {
        if (!a.connections.includes(poiIdB)) m.set(poiIdA, { ...a, connections: [...a.connections, poiIdB] })
        if (!b.connections.includes(poiIdA)) m.set(poiIdB, { ...b, connections: [...b.connections, poiIdA] })
      })
    },
    [doc],
  )

  const disconnectPois = useCallback(
    (poiIdA: string, poiIdB: string) => {
      if (!doc) return
      const m = poisMap(doc)
      const a = m.get(poiIdA)
      const b = m.get(poiIdB)
      doc.transact(() => {
        if (a) m.set(poiIdA, { ...a, connections: a.connections.filter((c) => c !== poiIdB) })
        if (b) m.set(poiIdB, { ...b, connections: b.connections.filter((c) => c !== poiIdA) })
      })
    },
    [doc],
  )

  const pois = sceneId ? allPois.filter((p) => p.sceneId === sceneId) : []

  return { pois, createPoi, deletePoi, movePoi, renamePoi, setLinkedScene, connectPois, disconnectPois }
}
