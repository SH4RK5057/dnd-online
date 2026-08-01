import { useCallback, useEffect, useState } from 'react'
import * as Y from 'yjs'
import { isAssetFullyLive, publishAsset, pruneAssetChunks, republishAssetFromCache } from './assetSync'
import { DEFAULT_GRID_SIZE_PX, MAP_IMAGE_MAX_DIMENSION, MAP_IMAGE_QUALITY } from './constants'
import { compressImage } from './imageCompress'
import { purgeExplorationForScene } from './useExploration'
import type { ConsensusMode, LightRecord, NavigationMode, SceneRecord, SceneScale, TokenRecord, WallRecord } from './types'
import type { CombatStateRecord } from '../combat/types'

function scenesMap(doc: Y.Doc) {
  return doc.getMap<SceneRecord>('scenes')
}
function sessionMap(doc: Y.Doc) {
  return doc.getMap<string>('session')
}

type GridPatch = Partial<
  Pick<SceneRecord, 'gridSizePx' | 'gridOffsetX' | 'gridOffsetY' | 'gridVisible' | 'gridType' | 'blankWidthCells' | 'blankHeightCells'>
>

export interface UseScenesResult {
  scenes: SceneRecord[]
  activeSceneId: string | null
  activeScene: SceneRecord | null
  createScene: (name: string) => string
  switchToScene: (sceneId: string) => Promise<void>
  renameScene: (sceneId: string, name: string) => void
  deleteScene: (sceneId: string) => void
  resetScene: (sceneId: string) => void
  setSceneMap: (sceneId: string, file: File) => Promise<void>
  updateGrid: (sceneId: string, patch: GridPatch) => void
  toggleFog: (sceneId: string, enabled: boolean) => void
  publishScene: (sceneId: string, published: boolean) => void
  setAmbientBrightness: (sceneId: string, ambientBrightness: number) => void
  togglePersistentFog: (sceneId: string, enabled: boolean) => void
  resetExploration: (sceneId: string) => void
  toggleSharedVision: (sceneId: string, enabled: boolean) => void
  setSceneScale: (sceneId: string, scale: SceneScale) => void
  setNavigationMode: (sceneId: string, mode: NavigationMode) => void
  setConsensusMode: (sceneId: string, mode: ConsensusMode) => void
  setPartyLeader: (sceneId: string, playerId: string | null) => void
  setCurrentPoi: (sceneId: string, poiId: string | null) => void
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
        gridType: 'square',
        fogEnabled: false,
        ambientBrightness: 1,
        persistentFogEnabled: true,
        sharedVisionEnabled: false,
        published: false,
        scale: 'dungeon',
        navigationMode: 'group',
        consensusMode: 'vote',
        partyLeaderId: null,
        currentPoiId: null,
        blankWidthCells: null,
        blankHeightCells: null,
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
      purgeExplorationForScene(doc, sceneId)
      doc.getMap<CombatStateRecord>('combat').delete(sceneId)

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

  const resetScene = useCallback(
    (sceneId: string) => {
      if (!doc) return
      const scenesM = scenesMap(doc)
      const scene = scenesM.get(sceneId)
      if (!scene) return
      if (scene.mapAssetId) pruneAssetChunks(doc, scene.mapAssetId)
      scenesM.set(sceneId, { ...scene, mapAssetId: null })

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
      purgeExplorationForScene(doc, sceneId)
      doc.getMap<CombatStateRecord>('combat').delete(sceneId)
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

  const publishScene = useCallback(
    (sceneId: string, published: boolean) => {
      if (!doc) return
      const scenesM = scenesMap(doc)
      const scene = scenesM.get(sceneId)
      if (!scene) return
      scenesM.set(sceneId, { ...scene, published })
    },
    [doc],
  )

  const setAmbientBrightness = useCallback(
    (sceneId: string, ambientBrightness: number) => {
      if (!doc) return
      const scenesM = scenesMap(doc)
      const scene = scenesM.get(sceneId)
      if (!scene) return
      scenesM.set(sceneId, { ...scene, ambientBrightness: Math.min(1, Math.max(0, ambientBrightness)) })
    },
    [doc],
  )

  const togglePersistentFog = useCallback(
    (sceneId: string, enabled: boolean) => {
      if (!doc) return
      const scenesM = scenesMap(doc)
      const scene = scenesM.get(sceneId)
      if (!scene) return
      scenesM.set(sceneId, { ...scene, persistentFogEnabled: enabled })
    },
    [doc],
  )

  const resetExploration = useCallback(
    (sceneId: string) => {
      if (!doc) return
      purgeExplorationForScene(doc, sceneId)
    },
    [doc],
  )

  const toggleSharedVision = useCallback(
    (sceneId: string, enabled: boolean) => {
      if (!doc) return
      const scenesM = scenesMap(doc)
      const scene = scenesM.get(sceneId)
      if (!scene) return
      scenesM.set(sceneId, { ...scene, sharedVisionEnabled: enabled })
    },
    [doc],
  )

  const setSceneScale = useCallback(
    (sceneId: string, scale: SceneScale) => {
      if (!doc) return
      const scenesM = scenesMap(doc)
      const scene = scenesM.get(sceneId)
      if (!scene) return
      scenesM.set(sceneId, { ...scene, scale })
    },
    [doc],
  )

  const setNavigationMode = useCallback(
    (sceneId: string, mode: NavigationMode) => {
      if (!doc) return
      const scenesM = scenesMap(doc)
      const scene = scenesM.get(sceneId)
      if (!scene) return
      scenesM.set(sceneId, { ...scene, navigationMode: mode })
    },
    [doc],
  )

  const setConsensusMode = useCallback(
    (sceneId: string, mode: ConsensusMode) => {
      if (!doc) return
      const scenesM = scenesMap(doc)
      const scene = scenesM.get(sceneId)
      if (!scene) return
      scenesM.set(sceneId, { ...scene, consensusMode: mode })
    },
    [doc],
  )

  const setPartyLeader = useCallback(
    (sceneId: string, playerId: string | null) => {
      if (!doc) return
      const scenesM = scenesMap(doc)
      const scene = scenesM.get(sceneId)
      if (!scene) return
      scenesM.set(sceneId, { ...scene, partyLeaderId: playerId })
    },
    [doc],
  )

  const setCurrentPoi = useCallback(
    (sceneId: string, poiId: string | null) => {
      if (!doc) return
      const scenesM = scenesMap(doc)
      const scene = scenesM.get(sceneId)
      if (!scene) return
      scenesM.set(sceneId, { ...scene, currentPoiId: poiId })
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
    resetScene,
    setSceneMap,
    updateGrid,
    toggleFog,
    publishScene,
    setAmbientBrightness,
    togglePersistentFog,
    resetExploration,
    toggleSharedVision,
    setSceneScale,
    setNavigationMode,
    setConsensusMode,
    setPartyLeader,
    setCurrentPoi,
  }
}
