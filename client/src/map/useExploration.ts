import { useCallback, useEffect, useState } from 'react'
import * as Y from 'yjs'

function explorationMap(doc: Y.Doc) {
  return doc.getMap<boolean>('exploration')
}

function keyFor(playerId: string, sceneId: string, cellKey: string): string {
  return `${playerId}|${sceneId}|${cellKey}`
}

export interface UseExplorationResult {
  /** Cell keys ("x,y" in grid-cell-integer units) this player has ever seen
   * on this scene, regardless of whether they're currently in view. */
  exploredCells: Set<string>
  revealCells: (cellKeys: string[]) => void
}

/** Persistent per-player "fog of exploration": once a player has seen a
 * grid cell, it stays remembered (dimly, via FogLayer/EXPLORED_MEMORY_BRIGHTNESS)
 * even after they leave it, rather than re-fogging every frame. Stored as
 * one flat boolean flag per player+scene+cell, keyed
 * `${playerId}|${sceneId}|${cellKey}`, so revealing new cells is a cheap
 * incremental write rather than rewriting the whole explored set each time. */
export function useExploration(
  doc: Y.Doc | null,
  sceneId: string | null,
  playerId: string | null,
): UseExplorationResult {
  const [exploredCells, setExploredCells] = useState<Set<string>>(new Set())

  useEffect(() => {
    if (!doc || !sceneId || !playerId) {
      setExploredCells(new Set())
      return
    }
    const explorationM = explorationMap(doc)
    const prefix = `${playerId}|${sceneId}|`
    const sync = () => {
      const next = new Set<string>()
      explorationM.forEach((_value, key) => {
        if (key.startsWith(prefix)) next.add(key.slice(prefix.length))
      })
      setExploredCells(next)
    }
    sync()
    explorationM.observe(sync)
    return () => explorationM.unobserve(sync)
  }, [doc, sceneId, playerId])

  const revealCells = useCallback(
    (cellKeys: string[]) => {
      if (!doc || !sceneId || !playerId || cellKeys.length === 0) return
      const explorationM = explorationMap(doc)
      doc.transact(() => {
        for (const cellKey of cellKeys) {
          const key = keyFor(playerId, sceneId, cellKey)
          if (!explorationM.has(key)) explorationM.set(key, true)
        }
      })
    },
    [doc, sceneId, playerId],
  )

  return { exploredCells, revealCells }
}

/** Purges every player's explored-cell memory for a scene — called when the
 * scene's map/walls are wiped (reset or delete), since old exploration data
 * would otherwise reference a layout that no longer exists. */
export function purgeExplorationForScene(doc: Y.Doc, sceneId: string): void {
  const explorationM = explorationMap(doc)
  const toDelete: string[] = []
  explorationM.forEach((_value, key) => {
    if (key.split('|')[1] === sceneId) toDelete.push(key)
  })
  for (const key of toDelete) explorationM.delete(key)
}
