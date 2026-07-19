import { useCallback, useEffect, useState } from 'react'
import * as Y from 'yjs'
import { isAssetFullyLive, publishAsset, pruneAssetChunks, republishAssetFromCache } from './assetSync'
import { DEFAULT_GRID_SIZE_PX, MAP_IMAGE_MAX_DIMENSION, MAP_IMAGE_QUALITY } from './constants'
import { compressImage } from './imageCompress'
import type { LightRecord, SceneRecord, TokenRecord, WallRecord } from './types'

function scenesMap(doc: Y.Doc) {
  return doc.getMap<SceneRecord>('scenes')
}
function sessionMap(doc: Y.Doc) {
  return doc.getMap<string>('session')
}

type GridPatch = Partial<Pick<SceneRecord, 'gridSizePx' | 'gridOffsetX' | 'gridOffsetY' | 'gridVisible'>>

export interface UseScenesResult {
  scenes: SceneRecord[]
  activeSceneId: string | null
  activeScene: SceneRecord | null
  createScene: (name: string) => string
  switchToScene: (sceneId: string) => Promise<void>
  renameScene: (sceneId: string, name: string) => void
  deleteScene: (sceneId: string) => void
  setSceneMap: (sceneId: string, file: File) => Promise<void>
  updateGrid: (sceneId: string, patch: GridPatch) => void
  toggleFog: (sceneId: string, enabled: boolean) => void
}

export function useScenes(doc: Y.Doc | null): UseScenesResult {
  const [scenes, setScenes] = useState<SceneRecord[]>([])
  const [activeSceneId, setActiveSceneId] = useState<string | null>(null)

  useEffect(() => {
    if (!doc) {
      setScenes([])
      setActiveSceneId(null)
      return
    }
    const scenesM = scenesMap(doc)
    const sessionM = sessionMap(doc)

    const syncScenes = () => setScenes(Array.from(scenesM.values()).sort((a, b) => a.createdAt - b.createdAt))
    const syncActive = () => setActiveSceneId(sessionM.get('activeSceneId') ?? null)

    syncScenes()
    syncActive()
    scenesM.observe(syncScenes)
    sessionM.observe(syncActive)
    return () => {
      scenesM.unobserve(syncScenes)
      sessionM.unobserve(syncActive)
    }
  }, [doc])

  const createScene = useCallback(
    (name: string): string => {
      if (!doc) throw new Error('No active session.')
      const id = crypto.randomUUID()
      const record: SceneRecord = {
        id,
        name,
        mapAssetId: null,
        gridSizePx: DEFAULT_GRID_SIZE_PX,
        gridOffsetX: 0,
        gridOffsetY: 0,
        gridVisible: true,
        fogEnabled: false,
        createdAt: Date.now(),
      }
      scenesMap(doc).set(id, record)
      const sessionM = sessionMap(doc)
      if (!sessionM.get('activeSceneId')) {
        sessionM.set('activeSceneId', id)
      }
      return id
    },
    [doc],
  )

  const switchToScene = useCallback(
    async (sceneId: string) => {
      if (!doc) return
      const sessionM = sessionMap(doc)
      const scenesM = scenesMap(doc)
      const previousId = sessionM.get('activeSceneId')
      if (previousId === sceneId) return

      if (previousId) {
        const previous = scenesM.get(previousId)
        if (previous?.mapAssetId) pruneAssetChunks(doc, previous.mapAssetId)
      }

      sessionM.set('activeSceneId', sceneId)

      const next = scenesM.get(sceneId)
      if (next?.mapAssetId && !isAssetFullyLive(doc, next.mapAssetId)) {
        await republishAssetFromCache(doc, next.mapAssetId)
      }
    },
    [doc],
  )

  const renameScene = useCallback(
    (sceneId: string, name: string) => {
      if (!doc) return
      const scenesM = scenesMap(doc)
      const scene = scenesM.get(sceneId)
      if (!scene) return
      scenesM.set(sceneId, { ...scene, name })
    },
    [doc],
  )

  const deleteScene = useCallback(
    (sceneId: string) => {
      if (!doc) return
      const scenesM = scenesMap(doc)
      const scene = scenesM.get(sceneId)
      if (scene?.mapAssetId) pruneAssetChunks(doc, scene.mapAssetId)
      scenesM.delete(sceneId)

      const tokensM = doc.getMap<TokenRecord>('tokens')
      const wallsM = doc.getMap<WallRecord>('walls')
      const lightsM = doc.getMap<LightRecord>('lights')
      doc.transact(() => {
        tokensM.forEach((token, tokenId) => {
          if (token.sceneId === sceneId) tokensM.delete(tokenId)
        })
        wallsM.forEach((wall, wallId) => {
          if (wall.sceneId === sceneId) wallsM.delete(wallId)
        })
        lightsM.forEach((light, lightId) => {
          if (light.sceneId === sceneId) lightsM.delete(lightId)
        })
      })

      const sessionM = sessionMap(doc)
      if (sessionM.get('activeSceneId') === sceneId) {
        const remaining = Array.from(scenesM.keys())
        if (remaining.length > 0) {
          sessionM.set('activeSceneId', remaining[0])
        } else {
          sessionM.delete('activeSceneId')
        }
      }
    },
    [doc],
  )

  const setSceneMap = useCallback(
    async (sceneId: string, file: File) => {
      if (!doc) return
      const compressed = await compressImage(file, { maxDimension: MAP_IMAGE_MAX_DIMENSION, quality: MAP_IMAGE_QUALITY })
      const scenesM = scenesMap(doc)
      const scene = scenesM.get(sceneId)
      if (!scene) return
      if (scene.mapAssetId) pruneAssetChunks(doc, scene.mapAssetId)
      const { assetId } = await publishAsset(doc, 'map', compressed.blob, compressed)
      scenesM.set(sceneId, { ...scene, mapAssetId: assetId })
    },
    [doc],
  )

  const updateGrid = useCallback(
    (sceneId: string, patch: GridPatch) => {
      if (!doc) return
      const scenesM = scenesMap(doc)
      const scene = scenesM.get(sceneId)
      if (!scene) return
      scenesM.set(sceneId, { ...scene, ...patch })
    },
    [doc],
  )

  const toggleFog = useCallback(
    (sceneId: string, enabled: boolean) => {
      if (!doc) return
      const scenesM = scenesMap(doc)
      const scene = scenesM.get(sceneId)
      if (!scene) return
      scenesM.set(sceneId, { ...scene, fogEnabled: enabled })
    },
    [doc],
  )

  const activeScene = scenes.find((s) => s.id === activeSceneId) ?? null

  return {
    scenes,
    activeSceneId,
    activeScene,
    createScene,
    switchToScene,
    renameScene,
    deleteScene,
    setSceneMap,
    updateGrid,
    toggleFog,
  }
}
