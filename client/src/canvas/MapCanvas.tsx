import { useEffect, useRef, useState } from 'react'
import { Container } from 'pixi.js'
import { useSession } from '../session/useSession'
import { useScenes } from '../map/useScenes'
import { useTokens } from '../map/useTokens'
import { useWalls } from '../map/useWalls'
import { useLights } from '../map/useLights'
import { useAssetUrl } from '../map/assetSync'
import { usePixiApp } from './usePixiApp'
import { MapLayer } from './MapLayer'
import { GridLayer } from './GridLayer'
import { TokenLayer } from './TokenLayer'
import { WallLayer } from './WallLayer'
import { LightLayer } from './LightLayer'
import type { ToolMode } from './interactionMode'

export function MapCanvas({ toolMode }: { toolMode: ToolMode }) {
  const containerRef = useRef<HTMLDivElement>(null)
  const app = usePixiApp(containerRef)

  const { session } = useSession()
  const doc = session?.doc ?? null
  const isDm = session?.role === 'dm'
  const { activeScene } = useScenes(doc)
  const mapUrl = useAssetUrl(doc, activeScene?.mapAssetId ?? null)
  const { tokens, moveToken } = useTokens(doc, activeScene?.id ?? null)
  const { walls, createWall, deleteWall } = useWalls(doc, activeScene?.id ?? null)
  const { lights, createLight, moveLight, detachLight, deleteLight } = useLights(doc, activeScene?.id ?? null)

  const [mapSize, setMapSize] = useState<{ width: number; height: number } | null>(null)

  const worldRef = useRef<Container | null>(null)
  const mapLayerRef = useRef<MapLayer | null>(null)
  const gridLayerRef = useRef<GridLayer | null>(null)
  const tokenLayerRef = useRef<TokenLayer | null>(null)
  const wallLayerRef = useRef<WallLayer | null>(null)
  const lightLayerRef = useRef<LightLayer | null>(null)

  // Build the layer graph once the Pixi app is ready.
  useEffect(() => {
    if (!app) return

    const world = new Container()
    const mapLayer = new MapLayer()
    const gridLayer = new GridLayer()
    const tokenLayer = new TokenLayer()
    const wallLayer = new WallLayer()
    const lightLayer = new LightLayer()
    world.addChild(mapLayer.container)
    world.addChild(gridLayer.container)
    world.addChild(tokenLayer.container)
    world.addChild(wallLayer.container)
    world.addChild(lightLayer.container)
    app.stage.addChild(world)

    worldRef.current = world
    mapLayerRef.current = mapLayer
    gridLayerRef.current = gridLayer
    tokenLayerRef.current = tokenLayer
    wallLayerRef.current = wallLayer
    lightLayerRef.current = lightLayer

    return () => {
      mapLayer.destroy()
      gridLayer.destroy()
      tokenLayer.destroy()
      wallLayer.destroy()
      lightLayer.destroy()
      world.destroy()
      worldRef.current = null
      mapLayerRef.current = null
      gridLayerRef.current = null
      tokenLayerRef.current = null
      wallLayerRef.current = null
      lightLayerRef.current = null
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
      const size = mapLayer.size
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
    wallLayerRef.current.update(walls, activeScene.gridSizePx, mapSize, isDm && toolMode === 'draw-walls', {
      onCreateWall: (x1, y1, x2, y2) => createWall({ sceneId: activeScene.id, x1, y1, x2, y2 }),
      onDeleteWall: deleteWall,
    })
  }, [walls, activeScene, mapSize, isDm, toolMode, createWall, deleteWall])

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

  return <div ref={containerRef} className="map-canvas" data-ready={app !== null} />
}
