import { useEffect, useRef, useState } from 'react'
import { Container, type FederatedPointerEvent } from 'pixi.js'
import { useSession } from '../session/useSession'
import { getOrCreatePlayerId } from '../session/lastSession'
import { useScenes } from '../map/useScenes'
import { useTokens } from '../map/useTokens'
import { useWalls } from '../map/useWalls'
import { useLights } from '../map/useLights'
import { useExploration } from '../map/useExploration'
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

const MIN_ZOOM = 0.2
const MAX_ZOOM = 5
const ZOOM_WHEEL_FACTOR = 1.1

interface MapCanvasProps {
  toolMode: ToolMode
  snapWalls: boolean
  onPlaceToken?: (x: number, y: number) => void
  /** DM-only: when set, the DM's own canvas renders exactly what this
   * player currently sees (their fog mask, their exploration memory)
   * instead of the DM's always-unmasked view. Always null for players. */
  previewPlayerId?: string | null
}

export function MapCanvas({ toolMode, snapWalls, onPlaceToken, previewPlayerId = null }: MapCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const app = usePixiApp(containerRef)

  const { session } = useSession()
  const doc = session?.doc ?? null
  const isDm = session?.role === 'dm'
  // The identity this canvas should render fog/vision as. Previewing (DM
  // only) overrides the viewer's real identity to the previewed player's;
  // otherwise a player renders as themselves and the DM renders unmasked.
  // isDmUnmasked — not bare isDm — is what should gate every DM-only
  // editing interaction (dragging tokens, drawing walls, placing lights)
  // below, so previewing a player also disables editing on their behalf.
  const effectiveViewerId = previewPlayerId ?? (isDm ? null : getOrCreatePlayerId())
  const isDmUnmasked = isDm && !previewPlayerId
  const { activeScene } = useScenes(doc)
  const mapUrl = useAssetUrl(doc, activeScene?.mapAssetId ?? null)
  const { tokens, moveToken } = useTokens(doc, activeScene?.id ?? null)
  const { walls, createWall, updateWallEndpoint, deleteWall } = useWalls(doc, activeScene?.id ?? null)
  const { lights, createLight, moveLight, detachLight, deleteLight } = useLights(doc, activeScene?.id ?? null)
  const { exploredCells, revealCells } = useExploration(doc, activeScene?.id ?? null, effectiveViewerId)

  const [mapSize, setMapSize] = useState<{ width: number; height: number } | null>(null)

  const cameraRef = useRef<Container | null>(null)
  const worldRef = useRef<Container | null>(null)
  const fogTargetRef = useRef<Container | null>(null)
  const tokenTargetRef = useRef<Container | null>(null)
  const mapLayerRef = useRef<MapLayer | null>(null)
  const gridLayerRef = useRef<GridLayer | null>(null)
  const tokenLayerRef = useRef<TokenLayer | null>(null)
  const wallLayerRef = useRef<WallLayer | null>(null)
  const lightLayerRef = useRef<LightLayer | null>(null)
  const fogLayerRef = useRef<FogLayer | null>(null)

  // Build the layer graph once the Pixi app is ready. fogTarget (map+grid+
  // walls) uses FogLayer's full mask — live sight plus remembered
  // exploration — since static terrain should stay revealed once seen.
  // tokenTarget (tokens only) uses the separate liveMask instead: a token
  // sitting in a room a player merely remembers, but isn't currently
  // looking at, shouldn't stay visible just because the terrain does. Both
  // get mask = null for the DM (see the fog effect below), so this never
  // hides anything from the DM's own editing view. tokenTarget is added
  // before fogTarget so walls keep painting over tokens, matching the
  // paint order the single combined container used to have. Lights stay a
  // direct child of world since their on-canvas icon is a DM editing aid,
  // not something a player should see at all.
  useEffect(() => {
    if (!app) return

    const camera = new Container()
    const world = new Container()
    const fogTarget = new Container()
    const tokenTarget = new Container()
    const mapLayer = new MapLayer()
    const gridLayer = new GridLayer()
    const tokenLayer = new TokenLayer()
    const wallLayer = new WallLayer()
    const lightLayer = new LightLayer()
    const fogLayer = new FogLayer()

    fogTarget.addChild(mapLayer.container, gridLayer.container, wallLayer.container)
    tokenTarget.addChild(tokenLayer.container)
    world.addChild(tokenTarget, fogTarget, lightLayer.container, fogLayer.mask, fogLayer.liveMask)
    camera.addChild(world)
    app.stage.addChild(camera)
    app.stage.eventMode = 'static'
    app.stage.hitArea = app.screen

    cameraRef.current = camera
    worldRef.current = world
    fogTargetRef.current = fogTarget
    tokenTargetRef.current = tokenTarget
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
      camera.destroy()
      cameraRef.current = null
      worldRef.current = null
      fogTargetRef.current = null
      tokenTargetRef.current = null
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
        gridType: activeScene?.gridType ?? 'square',
        width: size?.width ?? 0,
        height: size?.height ?? 0,
      })

      if (size && size.width > 0 && size.height > 0) {
        const scale = Math.min(app.screen.width / size.width, app.screen.height / size.height, 1)
        world.scale.set(scale)
        world.position.set((app.screen.width - size.width * scale) / 2, (app.screen.height - size.height * scale) / 2)
        wallLayerRef.current?.setViewScale(scale * (cameraRef.current?.scale.x ?? 1))
      }
    }

    mapLayer.setTexture(mapUrl, applySize)
    applySize()
  }, [app, mapUrl, activeScene])

  // Update tokens.
  useEffect(() => {
    if (!doc || !tokenLayerRef.current || !activeScene) return
    tokenLayerRef.current.update(doc, tokens, activeScene.gridSizePx, isDmUnmasked && toolMode === 'move', {
      onMove: moveToken,
      onMoveEnd: moveToken,
    })
  }, [doc, tokens, activeScene, isDmUnmasked, toolMode, moveToken])

  // Update walls.
  useEffect(() => {
    if (!wallLayerRef.current || !activeScene) return
    wallLayerRef.current.update(
      walls,
      activeScene.gridSizePx,
      mapSize,
      isDmUnmasked && toolMode === 'draw-walls',
      snapWalls,
      activeScene.gridType ?? 'square',
      {
        onCreateWall: (x1, y1, x2, y2) => createWall({ sceneId: activeScene.id, x1, y1, x2, y2 }),
        onUpdateWallEndpoint: updateWallEndpoint,
        onDeleteWall: deleteWall,
      },
    )
  }, [walls, activeScene, mapSize, isDmUnmasked, toolMode, snapWalls, createWall, updateWallEndpoint, deleteWall])

  // Update lights.
  useEffect(() => {
    if (!lightLayerRef.current || !activeScene) return
    lightLayerRef.current.update(lights, tokens, activeScene.gridSizePx, mapSize, isDmUnmasked && toolMode === 'place-lights', {
      onCreateLight: (x, y) => createLight({ sceneId: activeScene.id, x, y }),
      onMoveLight: moveLight,
      onDetachLight: detachLight,
      onDeleteLight: deleteLight,
    })
  }, [lights, tokens, activeScene, mapSize, isDmUnmasked, toolMode, createLight, moveLight, detachLight, deleteLight])

  // Update fog. DM always sees everything (no mask); players get one only
  // when the scene has fog enabled and the map is loaded.
  useEffect(() => {
    if (!app || !fogTargetRef.current || !tokenTargetRef.current || !fogLayerRef.current || !activeScene || !mapSize) return
    const fogTarget = fogTargetRef.current
    const tokenTarget = tokenTargetRef.current
    const fogLayer = fogLayerRef.current

    if (isDmUnmasked || !activeScene.fogEnabled) {
      fogTarget.mask = null
      tokenTarget.mask = null
      return
    }

    const ownTokenIds = (
      activeScene.sharedVisionEnabled ?? false
        ? tokens.filter((t) => t.ownerId !== null)
        : tokens.filter((t) => t.ownerId === effectiveViewerId)
    ).map((t) => t.id)

    const newlyExplored = fogLayer.update(app.renderer, {
      walls,
      lights,
      tokens,
      gridSizePx: activeScene.gridSizePx,
      mapSize,
      ownTokenIds,
      personalVisionRadiusCells: PERSONAL_VISION_RADIUS_CELLS,
      maxVisionRadiusCells: MAX_VISION_RADIUS_CELLS,
      ambientBrightness: activeScene.ambientBrightness ?? 1,
      exploredCells,
      persistentFogEnabled: activeScene.persistentFogEnabled ?? true,
    })
    fogTarget.mask = fogLayer.mask
    tokenTarget.mask = fogLayer.liveMask
    if (newlyExplored.length > 0) revealCells(newlyExplored)
  }, [app, activeScene, mapSize, isDmUnmasked, effectiveViewerId, walls, lights, tokens, exploredCells, revealCells])

  // Reset the zoom/pan camera whenever the active scene changes, so switching
  // scenes doesn't carry over an unrelated view.
  useEffect(() => {
    if (!cameraRef.current) return
    cameraRef.current.scale.set(1)
    cameraRef.current.position.set(0, 0)
    wallLayerRef.current?.setViewScale(worldRef.current?.scale.x ?? 1)
  }, [activeScene?.id])

  // Wheel-to-zoom (any mode) and drag-to-pan (Move mode, empty space only —
  // token drags and wall/light tool clicks take priority and stop propagation
  // reaching app.stage before this handler sees them).
  useEffect(() => {
    if (!app) return
    const camera = cameraRef.current
    if (!camera) return

    const onWheel = (event: WheelEvent) => {
      event.preventDefault()
      const rect = app.canvas.getBoundingClientRect()
      const cursorX = event.clientX - rect.left
      const cursorY = event.clientY - rect.top
      const oldScale = camera.scale.x
      const factor = event.deltaY < 0 ? ZOOM_WHEEL_FACTOR : 1 / ZOOM_WHEEL_FACTOR
      const newScale = Math.min(Math.max(oldScale * factor, MIN_ZOOM), MAX_ZOOM)
      const localX = (cursorX - camera.position.x) / oldScale
      const localY = (cursorY - camera.position.y) / oldScale
      camera.scale.set(newScale)
      camera.position.set(cursorX - localX * newScale, cursorY - localY * newScale)
      wallLayerRef.current?.setViewScale(newScale * (worldRef.current?.scale.x ?? 1))
    }
    app.canvas.addEventListener('wheel', onWheel, { passive: false })

    let panning = false
    let panStart = { x: 0, y: 0 }
    let cameraStart = { x: 0, y: 0 }

    const onPointerDown = (event: FederatedPointerEvent) => {
      if (event.target !== app.stage || event.button !== 0) return

      if (toolMode === 'place-tokens') {
        const world = worldRef.current
        if (!world || !onPlaceToken || !activeScene) return
        const local = world.toLocal(event.global)
        onPlaceToken(local.x / activeScene.gridSizePx, local.y / activeScene.gridSizePx)
        return
      }

      if (toolMode !== 'move') return
      panning = true
      panStart = { x: event.global.x, y: event.global.y }
      cameraStart = { x: camera.position.x, y: camera.position.y }
    }
    const onPointerMove = (event: FederatedPointerEvent) => {
      if (!panning) return
      camera.position.set(
        cameraStart.x + (event.global.x - panStart.x),
        cameraStart.y + (event.global.y - panStart.y),
      )
    }
    const onPointerUp = () => {
      panning = false
    }

    app.stage.on('pointerdown', onPointerDown)
    app.stage.on('globalpointermove', onPointerMove)
    app.stage.on('pointerup', onPointerUp)
    app.stage.on('pointerupoutside', onPointerUp)

    return () => {
      app.canvas.removeEventListener('wheel', onWheel)
      app.stage.off('pointerdown', onPointerDown)
      app.stage.off('globalpointermove', onPointerMove)
      app.stage.off('pointerup', onPointerUp)
      app.stage.off('pointerupoutside', onPointerUp)
    }
  }, [app, toolMode, activeScene, onPlaceToken])

  return <div ref={containerRef} className="map-canvas" data-ready={app !== null} />
}
