import { useEffect, useRef, useState } from 'react'
import { Container } from 'pixi.js'
import { useSession } from '../session/useSession'
import { getOrCreatePlayerId } from '../session/lastSession'
import { useScenes } from '../map/useScenes'
import { useTokens } from '../map/useTokens'
import { useWalls } from '../map/useWalls'
import { useLights } from '../map/useLights'
import { useAssetUrl } from '../map/assetSync'
import {
  PERSONAL_VISION_RADIUS_CELLS,
  MAX_VISION_RADIUS_CELLS,
  BLANK_SCENE_WIDTH_CELLS,
  BLANK_SCENE_HEIGHT_CELLS,
} from '../map/constants'
import { usePixiApp } from './usePixiApp'
import { MapLayer } from './MapLayer'
import { GridLayer } from './GridLayer'
import { TokenLayer } from './TokenLayer'
import { WallLayer } from './WallLayer'
import { LightLayer } from './LightLayer'
import { FogLayer } from './FogLayer'
import type { ToolMode } from './interactionMode'

export function MapCanvas({ toolMode, snapWalls }: { toolMode: ToolMode; snapWalls: boolean }) {
  const containerRef = useRef<HTMLDivElement>(null)
  const app = usePixiApp(containerRef)

  const { session } = useSession()
  const doc = session?.doc ?? null
  const isDm = session?.role === 'dm'
  const { activeScene } = useScenes(doc)
  const mapUrl = useAssetUrl(doc, activeScene?.mapAssetId ?? null)
  const { tokens, moveToken } = useTokens(doc, activeScene?.id ?? null)
  const { walls, createWall, updateWallEndpoint, deleteWall } = useWalls(doc, activeScene?.id ?? null)
  const { lights, createLight, moveLight, detachLight, deleteLight } = useLights(doc, activeScene?.id ?? null)

  const [mapSize, setMapSize] = useState<{ width: number; height: number } | null>(null)

  const worldRef = useRef<Container | null>(null)
  const fogTargetRef = useRef<Container | null>(null)
  const mapLayerRef = useRef<MapLayer | null>(null)
  const gridLayerRef = useRef<GridLayer | null>(null)
  const tokenLayerRef = useRef<TokenLayer | null>(null)
  const wallLayerRef = useRef<WallLayer | null>(null)
  const lightLayerRef = useRef<LightLayer | null>(null)
  const fogLayerRef = useRef<FogLayer | null>(null)

  // Build the layer graph once the Pixi app is ready. fogTarget wraps
  // map+grid+token so FogLayer's mask can apply to all three at once,
  // without affecting the wall/light editing layers (the DM must always see
  // those un-fogged — moot anyway since fog only ever applies to players).
  useEffect(() => {
    if (!app) return

    const world = new Container()
    const fogTarget = new Container()
    const mapLayer = new MapLayer()
    const gridLayer = new GridLayer()
    const tokenLayer = new TokenLayer()
    const wallLayer = new WallLayer()
    const lightLayer = new LightLayer()
    const fogLayer = new FogLayer()

    fogTarget.addChild(mapLayer.container, gridLayer.container, tokenLayer.container)
    world.addChild(fogTarget, wallLayer.container, lightLayer.container, fogLayer.mask)
    app.stage.addChild(world)

    worldRef.current = world
    fogTargetRef.current = fogTarget
    mapLayerRef.current = mapLayer
    gridLayerRef.current = gridLayer
    tokenLayerRef.current = tokenLayer
    wallLayerRef.current = wallLayer
    lightLayerRef.current = lightLayer
    fogLayerRef.current = fogLayer

    return () => {
      mapLayer.destroy()
      gridLayer.destroy()
      tokenLayer.destroy()
      wallLayer.destroy()
      lightLayer.destroy()
      fogLayer.destroy()
      world.destroy()
      worldRef.current = null
      fogTargetRef.current = null
      mapLayerRef.current = null
      gridLayerRef.current = null
      tokenLayerRef.current = null
      wallLayerRef.current = null
      lightLayerRef.current = null
      fogLayerRef.current = null
    }
  }, [app])

  // Update map texture + grid, and fit the map to the viewport. The texture's
  // real dimensions aren't known synchronously (image decode is async), so
  // the fit/grid sizing happens in the onReady callback, which MapLayer fires
  // once dimensions are actually available (immediately, if already loaded).
  useEffect(() => {
    if (!app || !mapLayerRef.current || !gridLayerRef.current || !worldRef.current) return
    const mapLayer = mapLayerRef.current
    const gridLayer = gridLayerRef.current
    const world = worldRef.current

    const applySize = () => {
      const size =
        mapLayer.size ??
        (activeScene
          ? { width: BLANK_SCENE_WIDTH_CELLS * activeScene.gridSizePx, height: BLANK_SCENE_HEIGHT_CELLS * activeScene.gridSizePx }
          : null)
      setMapSize(size)
      gridLayer.update({
        gridSizePx: activeScene?.gridSizePx ?? 0,
        gridOffsetX: activeScene?.gridOffsetX ?? 0,
        gridOffsetY: activeScene?.gridOffsetY ?? 0,
        gridVisible: activeScene?.gridVisible ?? false,
        width: size?.width ?? 0,
        height: size?.height ?? 0,
      })

      if (size && size.width > 0 && size.height > 0) {
        const scale = Math.min(app.screen.width / size.width, app.screen.height / size.height, 1)
        world.scale.set(scale)
        world.position.set((app.screen.width - size.width * scale) / 2, (app.screen.height - size.height * scale) / 2)
      }
    }

    mapLayer.setTexture(mapUrl, applySize)
    applySize()
  }, [app, mapUrl, activeScene])

  // Update tokens.
  useEffect(() => {
    if (!doc || !tokenLayerRef.current || !activeScene) return
    tokenLayerRef.current.update(doc, tokens, activeScene.gridSizePx, isDm && toolMode === 'move', {
      onMove: moveToken,
      onMoveEnd: moveToken,
    })
  }, [doc, tokens, activeScene, isDm, toolMode, moveToken])

  // Update walls.
  useEffect(() => {
    if (!wallLayerRef.current || !activeScene) return
    wallLayerRef.current.update(walls, activeScene.gridSizePx, mapSize, isDm && toolMode === 'draw-walls', snapWalls, {
      onCreateWall: (x1, y1, x2, y2) => createWall({ sceneId: activeScene.id, x1, y1, x2, y2 }),
      onUpdateWallEndpoint: updateWallEndpoint,
      onDeleteWall: deleteWall,
    })
  }, [walls, activeScene, mapSize, isDm, toolMode, snapWalls, createWall, updateWallEndpoint, deleteWall])

  // Update lights.
  useEffect(() => {
    if (!lightLayerRef.current || !activeScene) return
    lightLayerRef.current.update(lights, tokens, activeScene.gridSizePx, mapSize, isDm && toolMode === 'place-lights', {
      onCreateLight: (x, y) => createLight({ sceneId: activeScene.id, x, y }),
      onMoveLight: moveLight,
      onDetachLight: detachLight,
      onDeleteLight: deleteLight,
    })
  }, [lights, tokens, activeScene, mapSize, isDm, toolMode, createLight, moveLight, detachLight, deleteLight])

  // Update fog. DM always sees everything (no mask); players get one only
  // when the scene has fog enabled and the map is loaded.
  useEffect(() => {
    if (!app || !fogTargetRef.current || !fogLayerRef.current || !activeScene || !mapSize) return
    const fogTarget = fogTargetRef.current
    const fogLayer = fogLayerRef.current

    if (isDm || !activeScene.fogEnabled) {
      fogTarget.mask = null
      return
    }

    const myPlayerId = getOrCreatePlayerId()
    const ownTokenIds = tokens.filter((t) => t.ownerId === myPlayerId).map((t) => t.id)

    fogLayer.update(app.renderer, {
      walls,
      lights,
      tokens,
      gridSizePx: activeScene.gridSizePx,
      mapSize,
      ownTokenIds,
      personalVisionRadiusCells: PERSONAL_VISION_RADIUS_CELLS,
      maxVisionRadiusCells: MAX_VISION_RADIUS_CELLS,
    })
    fogTarget.mask = fogLayer.mask
  }, [app, activeScene, mapSize, isDm, walls, lights, tokens])

  return <div ref={containerRef} className="map-canvas" data-ready={app !== null} />
}
