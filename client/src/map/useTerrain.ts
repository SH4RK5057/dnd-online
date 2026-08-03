import { useCallback, useEffect, useState } from 'react'
import * as Y from 'yjs'
import type { AreaEffect } from './areaEffects'
import type { TerrainRecord, TerrainType } from './types'

function terrainMap(doc: Y.Doc) {
  return doc.getMap<TerrainRecord>('terrain')
}

export interface CreateTerrainInput {
  sceneId: string
  x: number
  y: number
  widthCells: number
  heightCells: number
  terrainType: TerrainType
  /** See TerrainRecord.effect. */
  effect?: AreaEffect | null
}

export interface UseTerrainResult {
  terrain: TerrainRecord[]
  createTerrain: (input: CreateTerrainInput) => string
  deleteTerrain: (id: string) => void
}

/** Same DM-authoritative-by-convention note as useWalls.ts: Yjs enforces no
 * write permissions, only the DM's UI renders controls that call these. */
export function useTerrain(doc: Y.Doc | null, sceneId: string | null): UseTerrainResult {
  const [allTerrain, setAllTerrain] = useState<TerrainRecord[]>([])

  useEffect(() => {
    if (!doc) {
      setAllTerrain([])
      return
    }
    const m = terrainMap(doc)
    const sync = () => setAllTerrain(Array.from(m.values()))
    sync()
    m.observe(sync)
    return () => m.unobserve(sync)
  }, [doc])

  const createTerrain = useCallback(
    (input: CreateTerrainInput): string => {
      if (!doc) throw new Error('No active session.')
      const id = crypto.randomUUID()
      const record: TerrainRecord = {
        id,
        sceneId: input.sceneId,
        x: input.x,
        y: input.y,
        widthCells: input.widthCells,
        heightCells: input.heightCells,
        terrainType: input.terrainType,
        effect: input.effect ?? null,
        createdAt: Date.now(),
      }
      terrainMap(doc).set(id, record)
      return id
    },
    [doc],
  )

  const deleteTerrain = useCallback(
    (id: string) => {
      if (!doc) return
      terrainMap(doc).delete(id)
    },
    [doc],
  )

  const terrain = sceneId ? allTerrain.filter((t) => t.sceneId === sceneId) : []

  return { terrain, createTerrain, deleteTerrain }
}
