import { useCallback, useEffect, useState } from 'react'
import * as Y from 'yjs'
import type { WallRecord } from './types'

function wallsMap(doc: Y.Doc) {
  return doc.getMap<WallRecord>('walls')
}

export interface CreateWallInput {
  sceneId: string
  x1: number
  y1: number
  x2: number
  y2: number
}

export interface UseWallsResult {
  walls: WallRecord[]
  createWall: (input: CreateWallInput) => string
  updateWallEndpoint: (wallId: string, which: 'start' | 'end', x: number, y: number) => void
  deleteWall: (wallId: string) => void
}

/** Same DM-authoritative-by-convention note as useTokens.ts: Yjs enforces no
 * write permissions, only the DM's UI renders controls that call these. */
export function useWalls(doc: Y.Doc | null, sceneId: string | null): UseWallsResult {
  const [allWalls, setAllWalls] = useState<WallRecord[]>([])

  useEffect(() => {
    if (!doc) {
      setAllWalls([])
      return
    }
    const wallsM = wallsMap(doc)
    const sync = () => setAllWalls(Array.from(wallsM.values()))
    sync()
    wallsM.observe(sync)
    return () => wallsM.unobserve(sync)
  }, [doc])

  const createWall = useCallback(
    (input: CreateWallInput): string => {
      if (!doc) throw new Error('No active session.')
      const id = crypto.randomUUID()
      const record: WallRecord = {
        id,
        sceneId: input.sceneId,
        x1: input.x1,
        y1: input.y1,
        x2: input.x2,
        y2: input.y2,
        createdAt: Date.now(),
      }
      wallsMap(doc).set(id, record)
      return id
    },
    [doc],
  )

  const updateWallEndpoint = useCallback(
    (wallId: string, which: 'start' | 'end', x: number, y: number) => {
      if (!doc) return
      const wallsM = wallsMap(doc)
      const wall = wallsM.get(wallId)
      if (!wall) return
      wallsM.set(wallId, which === 'start' ? { ...wall, x1: x, y1: y } : { ...wall, x2: x, y2: y })
    },
    [doc],
  )

  const deleteWall = useCallback(
    (wallId: string) => {
      if (!doc) return
      wallsMap(doc).delete(wallId)
    },
    [doc],
  )

  const walls = sceneId ? allWalls.filter((w) => w.sceneId === sceneId) : []

  return { walls, createWall, updateWallEndpoint, deleteWall }
}
