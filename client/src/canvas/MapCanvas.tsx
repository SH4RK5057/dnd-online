import { useEffect, useRef, useState } from 'react'
import { Container, type FederatedPointerEvent } from 'pixi.js'
import { useSession } from '../session/useSession'
import { getOrCreatePlayerId } from '../session/lastSession'
import { useScenes } from '../map/useScenes'
import { useTokens } from '../map/useTokens'
import { useWalls } from '../map/useWalls'
import { useLights } from '../map/useLights'
import { useExploration } from '../map/useExploration'
import { usePings } from '../map/usePings'
import { useAnnotations } from '../map/useAnnotations'
import { colorForPlayerId } from '../map/annotationColor'
import { usePois } from '../map/usePois'
import { useAssetUrl } from '../map/assetSync'
import { useCharacters } from '../character/useCharacters'
import { resolveTokenHp } from '../character/rules'
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
import { PingLayer } from './PingLayer'
import { AnnotationLayer } from './AnnotationLayer'
import { PoiLayer } from './PoiLayer'
import type { Point } from '../map/annotationTypes'
import type { ToolMode } from './interactionMode'

const MIN_ZOOM = 0.2
const MAX_ZOOM = 5
const ZOOM_WHEEL_FACTOR = 1.1

interface MapCanvasProps {
  toolMode: ToolMode
  snapWalls: boolean
  wallThickness: number
  onPlaceToken?: (x: number, y: number) => void
  onPlacePoi?: (x: number, y: number) => void
  /** Double-click-to-ping and shift-drag annotations are live-session
   * communication aids, not scene-editing tools — Scene Builder's canvas
   * disables both (default true) so they can't fire mid-gesture while
   * drawing walls/lights, whose own click-handling already takes priority
   * via Pixi hit-testing but whose native dblclick detection isn't gated by
   * that at all, since it listens on the raw DOM canvas element. */
  enablePing?: boolean
  enableAnnotations?: boolean
  /** DM-only: when set, the DM's own canvas renders exactly what this
   * player currently sees (their fog mask, their exploration memory)
   * instead of the DM's always-unmasked view. Always null for players. */
  previewPlayerId?: string | null
  /** Currently-selected token (for the HP/condition editor panel, owned by
   * the caller since that panel lives outside the canvas), and the callback
   * fired when a token is clicked. */
  selectedTokenId?: string | null
  onSelectToken?: (tokenId: string) => void
}

export function MapCanvas({
  toolMode,
  snapWalls,
  wallThickness,
  onPlaceToken,
  onPlacePoi,
  enablePing = true,
  enableAnnotations = true,
  previewPlayerId = null,
  selectedTokenId = null,
  onSelectToken,
}: MapCanvasProps) {
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
  const { characters } = useCharacters(doc)
  const { pings, createPing } = usePings(doc, activeScene?.id ?? null, isDm)
  const { annotations, createAnnotation } = useAnnotations(doc, activeScene?.id ?? null, isDm)
  const { pois } = usePois(doc, activeScene?.id ?? null)

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
  const pingLayerRef = useRef<PingLayer | null>(null)
  const annotationLayerRef = useRef<AnnotationLayer | null>(null)
  const poiLayerRef = useRef<PoiLayer | null>(null)

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
    const pingLayer = new PingLayer(app)
    const annotationLayer = new AnnotationLayer()
    const poiLayer = new PoiLayer()

    fogTarget.addChild(mapLayer.container, gridLayer.container, wallLayer.container)
    tokenTarget.addChild(tokenLayer.container)
    world.addChild(
      tokenTarget,
      fogTarget,
      annotationLayer.container,
      poiLayer.container,
      lightLayer.container,
      pingLayer.container,
      fogLayer.mask,
      fogLayer.liveMask,
    )
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
    pingLayerRef.current = pingLayer
    annotationLayerRef.current = annotationLayer
    poiLayerRef.current = poiLayer

    return () => {
      mapLayer.destroy()
      gridLayer.destroy()
      tokenLayer.destroy()
      wallLayer.destroy()
      lightLayer.destroy()
      fogLayer.destroy()
      pingLayer.destroy()
      annotationLayer.destroy()
      poiLayer.destroy()
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
      pingLayerRef.current = null
      annotationLayerRef.current = null
      poiLayerRef.current = null
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
          ? {
              width: (activeScene.blankWidthCells ?? BLANK_SCENE_WIDTH_CELLS) * activeScene.gridSizePx,
              height: (activeScene.blankHeightCells ?? BLANK_SCENE_HEIGHT_CELLS) * activeScene.gridSizePx,
            }
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

    // usePixiApp's ResizeObserver keeps the renderer itself in sync with the
    // container's size (e.g. entering/leaving fullscreen), but that alone
    // doesn't re-fit the map into the new dimensions — app.screen.width/
    // height above are only read once, at mount. Re-running applySize on
    // every renderer resize keeps the map correctly scaled/centered no
    // matter how the container is resized, without disturbing the camera's
    // own zoom/pan (world.scale/position here is the base fit-to-viewport
    // transform the camera then multiplies on top of).
    app.renderer.on('resize', applySize)
    return () => {
      app.renderer.off('resize', applySize)
    }
  }, [app, mapUrl, activeScene])

  // Update tokens. Selection is allowed only in Move mode, same as dragging —
  // otherwise a click meant for the active drawing tool (walls/lights) could
  // be intercepted by a token sprite sitting on top of it instead.
  useEffect(() => {
    if (!doc || !tokenLayerRef.current || !activeScene) return
    // Hidden tokens (traps, mimics, stealthy enemies) render only for the
    // real, unmasked DM — independent of fog-of-war, and also hidden during
    // DM preview-as-player so preview genuinely shows what that player sees.
    const visibleTokens = isDmUnmasked ? tokens : tokens.filter((t) => !t.hidden)
    const charactersById = new Map(characters.map((c) => [c.id, c]))
    const resolvedHpByTokenId = new Map(visibleTokens.map((t) => [t.id, resolveTokenHp(t, charactersById)]))
    tokenLayerRef.current.update(
      doc,
      visibleTokens,
      activeScene.gridSizePx,
      isDmUnmasked && toolMode === 'move',
      toolMode === 'move',
      selectedTokenId,
      resolvedHpByTokenId,
      {
        onMove: moveToken,
        onMoveEnd: moveToken,
        onSelect: (tokenId) => onSelectToken?.(tokenId),
      },
    )
  }, [doc, tokens, characters, activeScene, isDmUnmasked, toolMode, selectedTokenId, moveToken, onSelectToken])

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
      wallThickness,
      {
        onCreateWall: (x1, y1, x2, y2, thickness) => createWall({ sceneId: activeScene.id, x1, y1, x2, y2, thickness }),
        onUpdateWallEndpoint: updateWallEndpoint,
        onDeleteWall: deleteWall,
      },
    )
  }, [walls, activeScene, mapSize, isDmUnmasked, toolMode, snapWalls, wallThickness, createWall, updateWallEndpoint, deleteWall])

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

  // Update pings.
  useEffect(() => {
    if (!pingLayerRef.current || !activeScene) return
    pingLayerRef.current.update(pings, activeScene.gridSizePx)
  }, [pings, activeScene])

  // Update annotations.
  useEffect(() => {
    if (!annotationLayerRef.current || !activeScene) return
    annotationLayerRef.current.update(annotations, activeScene.gridSizePx)
  }, [annotations, activeScene])

  // Update POIs.
  useEffect(() => {
    if (!poiLayerRef.current || !activeScene) return
    poiLayerRef.current.update(pois, activeScene.currentPoiId ?? null, activeScene.gridSizePx)
  }, [pois, activeScene])

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

    // Double-click anywhere to ping that location — available regardless of
    // toolMode (and to players, who have no toolMode UI at all), since it's
    // a communication aid, not an editing tool. A native DOM listener rather
    // than a Pixi one, same reasoning as the wheel handler above: it's not
    // tied to any particular interactive object, just "wherever the cursor
    // is on the canvas" — which also means it's NOT gated by Pixi's own
    // hit-testing the way wall/light tool clicks are, so it has to be
    // disabled outright (enablePing=false, Scene Builder) rather than relying
    // on toolMode to keep it from firing mid-gesture while drawing.
    const onDblClick = (event: MouseEvent) => {
      const world = worldRef.current
      if (!world || !activeScene) return
      const rect = app.canvas.getBoundingClientRect()
      const local = world.toLocal({ x: event.clientX - rect.left, y: event.clientY - rect.top })
      createPing(getOrCreatePlayerId(), session?.displayName ?? 'Player', local.x / activeScene.gridSizePx, local.y / activeScene.gridSizePx)
    }
    if (enablePing) app.canvas.addEventListener('dblclick', onDblClick)

    let panning = false
    let panStart = { x: 0, y: 0 }
    let cameraStart = { x: 0, y: 0 }

    // Shift-drag (empty space, any toolMode) draws a freehand annotation —
    // checked first, ahead of the mode-specific branches below, so it works
    // the same way for players (who have no toolMode UI at all, effectively
    // always "move") as it does for the DM in any tool. Points are collected
    // locally and only committed to the shared doc once, on release — see
    // AnnotationLayer.ts's doc comment for why this lives here rather than
    // as that layer's own hit-tested interaction.
    let annotating = false
    let annotationPoints: Point[] = []

    const onPointerDown = (event: FederatedPointerEvent) => {
      if (event.target !== app.stage || event.button !== 0) return

      if (event.shiftKey && enableAnnotations) {
        const world = worldRef.current
        if (!world || !activeScene) return
        annotating = true
        const local = world.toLocal(event.global)
        annotationPoints = [{ x: local.x / activeScene.gridSizePx, y: local.y / activeScene.gridSizePx }]
        return
      }

      if (toolMode === 'place-tokens') {
        const world = worldRef.current
        if (!world || !onPlaceToken || !activeScene) return
        const local = world.toLocal(event.global)
        onPlaceToken(local.x / activeScene.gridSizePx, local.y / activeScene.gridSizePx)
        return
      }

      if (toolMode === 'place-pois') {
        const world = worldRef.current
        if (!world || !onPlacePoi || !activeScene) return
        const local = world.toLocal(event.global)
        onPlacePoi(local.x / activeScene.gridSizePx, local.y / activeScene.gridSizePx)
        return
      }

      if (toolMode !== 'move') return
      panning = true
      panStart = { x: event.global.x, y: event.global.y }
      cameraStart = { x: camera.position.x, y: camera.position.y }
    }
    const onPointerMove = (event: FederatedPointerEvent) => {
      if (annotating) {
        const world = worldRef.current
        if (!world || !activeScene) return
        const local = world.toLocal(event.global)
        annotationPoints.push({ x: local.x / activeScene.gridSizePx, y: local.y / activeScene.gridSizePx })
        annotationLayerRef.current?.setPreview(annotationPoints, colorForPlayerId(getOrCreatePlayerId()))
        return
      }
      if (!panning) return
      camera.position.set(
        cameraStart.x + (event.global.x - panStart.x),
        cameraStart.y + (event.global.y - panStart.y),
      )
    }
    const onPointerUp = () => {
      if (annotating) {
        annotating = false
        if (annotationPoints.length >= 2) createAnnotation(getOrCreatePlayerId(), annotationPoints)
        annotationPoints = []
        annotationLayerRef.current?.setPreview([], 0)
        return
      }
      panning = false
    }

    app.stage.on('pointerdown', onPointerDown)
    app.stage.on('globalpointermove', onPointerMove)
    app.stage.on('pointerup', onPointerUp)
    app.stage.on('pointerupoutside', onPointerUp)

    return () => {
      app.canvas.removeEventListener('wheel', onWheel)
      app.canvas.removeEventListener('dblclick', onDblClick)
      app.stage.off('pointerdown', onPointerDown)
      app.stage.off('globalpointermove', onPointerMove)
      app.stage.off('pointerup', onPointerUp)
      app.stage.off('pointerupoutside', onPointerUp)
    }
  }, [
    app,
    toolMode,
    activeScene,
    onPlaceToken,
    onPlacePoi,
    enablePing,
    enableAnnotations,
    createPing,
    createAnnotation,
    session?.displayName,
  ])

  return <div ref={containerRef} className="map-canvas" data-ready={app !== null} />
}
