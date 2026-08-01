import { useEffect, useRef, useState } from 'react'
import { Container, Rectangle, type FederatedPointerEvent } from 'pixi.js'
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
import { useCampaignSettings } from '../character/useCampaignSettings'
import { resolveTokenHp, computePassiveSkill } from '../character/rules'
import { footprintCells, rectanglesOverlap, tokenFootprintRect } from '../map/sizeCategory'
import { PERSONAL_VISION_RADIUS_CELLS, MAX_VISION_RADIUS_CELLS } from '../map/constants'
import { resolveCanvasSizeCells } from '../map/canvasSize'
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
import { MeasureLayer, type MeasureShape } from './MeasureLayer'
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
  /** Set while a spell's AoE template is armed (see components/
   * SpellCastPanel.tsx) — the next drag anywhere on the map (no Ctrl needed)
   * previews that exact shape/size instead of a free-hand one, then
   * auto-disarms via `onArmedTemplatePlaced` once placed. Same one-shot
   * override pattern as `onPlaceToken`/`onPlacePoi`. */
  armedTemplate?: { shape: MeasureShape; sizeFt: number } | null
  onArmedTemplatePlaced?: () => void
  /** Fires whenever a fresh extraction function becomes available (and with
   * `null` on unmount/teardown) — the 3D flat-plane view (canvas3d/Scene3D.tsx)
   * uses this to render its plane as a literal texture of this exact 2D
   * rendering (map, grid, walls, fog-of-war, tokens — everything this
   * canvas already draws correctly) instead of separately reimplementing
   * any of it. Requires this component to stay mounted (just visually
   * hidden) while the viewer is looking at the 3D view — see
   * screens/SessionScreen.tsx. */
  onBoardCanvasHandle?: (extract: (() => HTMLCanvasElement | null) | null) => void
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
  armedTemplate = null,
  onArmedTemplatePlaced,
  onBoardCanvasHandle,
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
  const { tokens, moveToken, setTokenHidden } = useTokens(doc, activeScene?.id ?? null)
  const { walls, createWall, updateWallEndpoint, deleteWall } = useWalls(doc, activeScene?.id ?? null)
  const { lights, createLight, moveLight, detachLight, deleteLight } = useLights(doc, activeScene?.id ?? null)
  const { exploredCells, revealCells } = useExploration(doc, activeScene?.id ?? null, effectiveViewerId)
  const { characters } = useCharacters(doc)
  const { settings: campaignSettings } = useCampaignSettings(doc)
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
  const measureLayerRef = useRef<MeasureLayer | null>(null)

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
    const measureLayer = new MeasureLayer()

    fogTarget.addChild(mapLayer.container, gridLayer.container, wallLayer.container)
    tokenTarget.addChild(tokenLayer.container)
    world.addChild(
      tokenTarget,
      fogTarget,
      annotationLayer.container,
      poiLayer.container,
      lightLayer.container,
      pingLayer.container,
      measureLayer.container,
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
    measureLayerRef.current = measureLayer

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
      measureLayer.destroy()
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
      measureLayerRef.current = null
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
      const imageSizeCells =
        mapLayer.size && activeScene
          ? { widthCells: mapLayer.size.width / activeScene.gridSizePx, heightCells: mapLayer.size.height / activeScene.gridSizePx }
          : null
      const sizeCells = resolveCanvasSizeCells(activeScene, imageSizeCells)
      const size = sizeCells && activeScene ? { width: sizeCells.widthCells * activeScene.gridSizePx, height: sizeCells.heightCells * activeScene.gridSizePx } : null
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
    // A hidden hazard token (trap) reveals itself the first time some other
    // token's footprint overlaps its own — a lightweight "trigger" that
    // doesn't try to guess or auto-apply the trap's actual effect (DM
    // resolves that manually with the same tools as any other damage/save,
    // same reasoning as the spell-cast flow's manual target checklist).
    // Hazards don't trigger each other.
    const handleMoveEnd = (tokenId: string, x: number, y: number) => {
      moveToken(tokenId, x, y)
      const movedToken = tokens.find((t) => t.id === tokenId)
      if (!movedToken || movedToken.hazardSize) return
      const size = footprintCells(movedToken.sizeCategory)
      const movedRect = tokenFootprintRect(x, y, size, size)
      for (const hazard of tokens) {
        if (!hazard.hazardSize || !hazard.hidden) continue
        const hazardRect = tokenFootprintRect(hazard.x, hazard.y, hazard.hazardSize.widthCells, hazard.hazardSize.heightCells)
        if (rectanglesOverlap(movedRect, hazardRect)) setTokenHidden(hazard.id, false)
      }
    }

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
        onMoveEnd: handleMoveEnd,
        onSelect: (tokenId) => onSelectToken?.(tokenId),
      },
    )
  }, [doc, tokens, characters, activeScene, isDmUnmasked, toolMode, selectedTokenId, moveToken, onSelectToken, setTokenHidden])

  // Keep the measure layer's grid-cell-to-pixel conversion in sync.
  useEffect(() => {
    measureLayerRef.current?.setGridSizePx(activeScene?.gridSizePx ?? 1)
  }, [activeScene?.gridSizePx])

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

    // Passive-perception auto-reveal: a hidden token with a set DC unhides
    // itself the moment this viewer's own live sight just reached its cell
    // and their passive Perception beats that DC — reusing the same
    // newly-explored-this-frame signal the persistent-fog reveal above
    // does, rather than a separate visibility recompute.
    if (campaignSettings.passivePerceptionEnabled && effectiveViewerId && newlyExplored.length > 0) {
      const myCharacter = characters.find((c) => c.ownerId === effectiveViewerId)
      if (myCharacter) {
        const passivePerception = computePassiveSkill(myCharacter, 'perception')
        const newlyExploredSet = new Set(newlyExplored)
        for (const token of tokens) {
          if (!token.hidden || token.perceptionDc === null) continue
          const width = token.hazardSize?.widthCells ?? footprintCells(token.sizeCategory)
          const height = token.hazardSize?.heightCells ?? footprintCells(token.sizeCategory)
          let spotted = false
          for (let dx = 0; dx < width && !spotted; dx++) {
            for (let dy = 0; dy < height && !spotted; dy++) {
              if (newlyExploredSet.has(`${Math.floor(token.x) + dx},${Math.floor(token.y) + dy}`)) spotted = true
            }
          }
          if (spotted && passivePerception >= token.perceptionDc) setTokenHidden(token.id, false)
        }
      }
    }
  }, [
    app,
    activeScene,
    mapSize,
    isDmUnmasked,
    effectiveViewerId,
    walls,
    lights,
    tokens,
    exploredCells,
    revealCells,
    campaignSettings.passivePerceptionEnabled,
    characters,
    setTokenHidden,
  ])

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

    // Ctrl-drag (any toolMode, any viewer — DM or player) measures distance;
    // Ctrl+Shift-drag previews a circle AoE template; Ctrl+Alt-drag previews
    // a cone. Checked ahead of the shift-drag annotation gesture so Ctrl
    // always wins if somehow both modifiers are held. Deliberately not
    // gated by toolMode/enableAnnotations — this is a personal ruler, not a
    // scene-editing tool, so it should work the same for everyone the same
    // way double-click-to-ping does.
    let measuring = false
    let measureShape: MeasureShape = 'line'
    let measureOrigin: { x: number; y: number } | null = null
    let measureLockedSizeFt: number | undefined
    let measuringArmedTemplate = false

    const onPointerDown = (event: FederatedPointerEvent) => {
      if (event.target !== app.stage || event.button !== 0) return

      // Armed spell template (see SpellCastPanel) takes priority over
      // everything else, same one-shot-override tier as place-tokens/
      // place-pois below — a click here places the spell's exact-sized
      // template rather than panning or starting any other gesture.
      if (armedTemplate) {
        const world = worldRef.current
        if (!world || !activeScene) return
        measuring = true
        measuringArmedTemplate = true
        measureShape = armedTemplate.shape
        measureLockedSizeFt = armedTemplate.sizeFt
        const local = world.toLocal(event.global)
        measureOrigin = { x: local.x / activeScene.gridSizePx, y: local.y / activeScene.gridSizePx }
        return
      }

      if (event.ctrlKey) {
        const world = worldRef.current
        if (!world || !activeScene) return
        measuring = true
        measuringArmedTemplate = false
        measureLockedSizeFt = undefined
        measureShape = event.shiftKey ? 'circle' : event.altKey ? 'cone' : 'line'
        const local = world.toLocal(event.global)
        measureOrigin = { x: local.x / activeScene.gridSizePx, y: local.y / activeScene.gridSizePx }
        return
      }

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
      if (measuring) {
        const world = worldRef.current
        if (!world || !activeScene || !measureOrigin) return
        const local = world.toLocal(event.global)
        const current = { x: local.x / activeScene.gridSizePx, y: local.y / activeScene.gridSizePx }
        measureLayerRef.current?.setPreview(measureShape, measureOrigin, current, measureLockedSizeFt)
        return
      }
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
      if (measuring) {
        measuring = false
        measureOrigin = null
        measureLayerRef.current?.setPreview('line', null, null)
        if (measuringArmedTemplate) {
          measuringArmedTemplate = false
          onArmedTemplatePlaced?.()
        }
        return
      }
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
    armedTemplate,
    onArmedTemplatePlaced,
  ])

  // Hands the caller a function that renders a fresh, flat, native-pixel-
  // scale image of exactly what this canvas currently shows on the board
  // (terrain — map/grid/walls, fog-masked — then tokens on top, live-fog-
  // masked) via Pixi's extract system, bypassing `world`'s own zoom/pan/
  // fit-to-viewport transform entirely (a `frame` matching the board's own
  // native size, rather than the on-screen viewport size, means the
  // extraction reads each container's content at 1:1 scale regardless of
  // however the DM currently has the 2D view zoomed/panned). See
  // MapCanvasProps.onBoardCanvasHandle's doc comment for why this exists.
  useEffect(() => {
    if (!onBoardCanvasHandle) return
    if (!app || !fogTargetRef.current || !tokenTargetRef.current || !lightLayerRef.current || !mapSize) {
      onBoardCanvasHandle(null)
      return
    }
    const fogTarget = fogTargetRef.current
    const tokenTarget = tokenTargetRef.current
    const lightLayerContainer = lightLayerRef.current.container
    const { width, height } = mapSize

    const extract = (): HTMLCanvasElement | null => {
      if (width <= 0 || height <= 0) return null
      const frame = new Rectangle(0, 0, width, height)
      const combined = document.createElement('canvas')
      combined.width = width
      combined.height = height
      const ctx = combined.getContext('2d')
      if (!ctx) return null
      const terrain = app.renderer.extract.canvas({ target: fogTarget, frame })
      const tokensCanvas = app.renderer.extract.canvas({ target: tokenTarget, frame })
      // lightLayer.container is never fog-masked (a lit torch/lamp is a
      // visible object, same as 2D shows it to everyone unmasked), so it's
      // safe to layer in here too — no DM-only info leaks to players.
      const lightsCanvas = app.renderer.extract.canvas({ target: lightLayerContainer, frame })
      ctx.drawImage(terrain as unknown as CanvasImageSource, 0, 0)
      ctx.drawImage(tokensCanvas as unknown as CanvasImageSource, 0, 0)
      ctx.drawImage(lightsCanvas as unknown as CanvasImageSource, 0, 0)
      return combined
    }

    onBoardCanvasHandle(extract)
    return () => onBoardCanvasHandle(null)
  }, [onBoardCanvasHandle, app, mapSize])

  return <div ref={containerRef} className="map-canvas" data-ready={app !== null} />
}
