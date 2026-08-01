import { useEffect, useRef } from 'react'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import type * as Y from 'yjs'
import { useSession } from '../session/useSession'
import { useScenes } from '../map/useScenes'
import { useTokens } from '../map/useTokens'
import { useWalls } from '../map/useWalls'
import { useLights } from '../map/useLights'
import { useExploration } from '../map/useExploration'
import { getOrCreatePlayerId } from '../session/lastSession'
import { useAssetUrl, subscribeAssetUrl } from '../map/assetSync'
import { resolveCanvasSizeCells, type CellDims } from '../map/canvasSize'
import { PERSONAL_VISION_RADIUS_CELLS, MAX_VISION_RADIUS_CELLS } from '../map/constants'
import { hasLineOfSight } from '../map/visibility'
import { footprintCells, renderScale, resolveModelHeight, resolveStlScale, snapToSlot } from '../map/sizeCategory'
import { getCachedModelGeometry, loadModelGeometry } from './modelCache'
import { getCachedImageTexture, loadImageTexture } from './imageTextureCache'
import { drawGridLines, drawWalls } from './gridTexture'
import { drawFogOverlay } from './fogTexture'
import type { GridType, LightRecord, TokenRecord, WallRecord } from '../map/types'

const PLACEHOLDER_COLOR = 0x6b6375
const HAZARD_COLOR = 0xcc5522
const STL_COLOR = 0xcfc9bd
const PLANE_BACKGROUND_COLOR = '#3a3226'
/** Internal texture resolution for the plane, in canvas px per grid cell —
 * independent of the scene's own gridSizePx (which can be arbitrarily small
 * or huge). Capped by PLANE_TEXTURE_MAX_DIMENSION_PX so a very large board
 * doesn't blow the texture budget. */
const PLANE_TEXTURE_PX_PER_CELL = 64
const PLANE_TEXTURE_MAX_DIMENSION_PX = 4096

interface PlaneGridConfig {
  gridSizePx: number
  gridOffsetX: number
  gridOffsetY: number
  gridVisible: boolean
  gridType: GridType
}

/** Non-null when this viewer's board should be fogged — omitted entirely
 * for an unmasked DM or a fogEnabled:false scene, same as
 * canvas/MapCanvas.tsx's isDmUnmasked/fogEnabled guard. */
interface PlaneFogConfig {
  lights: LightRecord[]
  tokens: TokenRecord[]
  ownTokenIds: string[]
  ambientBrightness: number
  exploredCells: Set<string>
  persistentFogEnabled: boolean
}

function choosePxPerCell(widthCells: number, heightCells: number): number {
  const largest = Math.max(widthCells, heightCells, 1)
  return Math.min(PLANE_TEXTURE_PX_PER_CELL, Math.max(1, Math.floor(PLANE_TEXTURE_MAX_DIMENSION_PX / largest)))
}

/** Builds the plane's full texture as a single flat canvas — background
 * color, the map image (if any) at its own cell-derived footprint, red wall
 * lines, grid lines, and finally a fog-of-war overlay, in that order (walls
 * and grid both stay visible in "remembered" fog areas, same as 2D's
 * masked map+grid+walls container) — since a MeshStandardMaterial only has
 * one `map`, this is the 3D view's answer to 2D's separate MapLayer +
 * GridLayer + WallLayer + FogLayer all layered together. Tokens are NOT
 * part of this texture — they stay real 3D objects positioned above the
 * plane (see updateToken), masked individually by fog visibility instead. */
function buildPlaneCanvas(image: HTMLImageElement | null, dims: CellDims, grid: PlaneGridConfig, walls: WallRecord[], fog: PlaneFogConfig | null): HTMLCanvasElement {
  const pxPerCell = choosePxPerCell(dims.widthCells, dims.heightCells)
  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, Math.round(dims.widthCells * pxPerCell))
  canvas.height = Math.max(1, Math.round(dims.heightCells * pxPerCell))
  const ctx = canvas.getContext('2d')
  if (!ctx) return canvas

  ctx.fillStyle = PLANE_BACKGROUND_COLOR
  ctx.fillRect(0, 0, canvas.width, canvas.height)

  if (image && grid.gridSizePx > 0) {
    const imageWidthPx = (image.naturalWidth / grid.gridSizePx) * pxPerCell
    const imageHeightPx = (image.naturalHeight / grid.gridSizePx) * pxPerCell
    ctx.drawImage(image, 0, 0, imageWidthPx, imageHeightPx)
  }

  if (grid.gridSizePx > 0) drawWalls(ctx, walls, pxPerCell, grid.gridSizePx)

  if (grid.gridVisible && grid.gridSizePx > 0) {
    drawGridLines(ctx, {
      widthCells: dims.widthCells,
      heightCells: dims.heightCells,
      pxPerCell,
      offsetXCells: grid.gridOffsetX / grid.gridSizePx,
      offsetYCells: grid.gridOffsetY / grid.gridSizePx,
      gridType: grid.gridType,
    })
  }

  if (fog && grid.gridSizePx > 0) {
    const fogCanvas = document.createElement('canvas')
    fogCanvas.width = canvas.width
    fogCanvas.height = canvas.height
    const fogCtx = fogCanvas.getContext('2d')
    if (fogCtx) {
      drawFogOverlay(fogCtx, canvas.width, canvas.height, {
        walls,
        lights: fog.lights,
        tokens: fog.tokens,
        gridSizePx: grid.gridSizePx,
        ownTokenIds: fog.ownTokenIds,
        personalVisionRadiusCells: PERSONAL_VISION_RADIUS_CELLS,
        maxVisionRadiusCells: MAX_VISION_RADIUS_CELLS,
        ambientBrightness: fog.ambientBrightness,
        exploredCells: fog.exploredCells,
        persistentFogEnabled: fog.persistentFogEnabled,
        pxPerCell,
      })
      ctx.globalCompositeOperation = 'destination-in'
      ctx.drawImage(fogCanvas, 0, 0)
      ctx.globalCompositeOperation = 'source-over'
    }
  }

  return canvas
}
/** Pointer movement (px) below which a press+release counts as a click
 * (select) rather than a drag — mirrors the click-vs-drag disambiguation
 * canvas/TokenSprite.ts already does for the 2D view. */
const DRAG_CLICK_THRESHOLD_PX = 6

// Shared, stateless geometry/materials reused across every token's
// placeholder or STL mesh — never disposed per-token (only per-token Mesh
// *instances* are created/removed; geometries/materials are cached module-
// level, same spirit as canvas3d/modelCache.ts caching loaded STL geometry).
const PLACEHOLDER_GEOMETRY = new THREE.ConeGeometry(1, 1, 12).translate(0, 0.5, 0)
const HAZARD_GEOMETRY = new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0)
const PLACEHOLDER_MATERIAL = new THREE.MeshStandardMaterial({ color: PLACEHOLDER_COLOR })
const HAZARD_MATERIAL = new THREE.MeshStandardMaterial({ color: HAZARD_COLOR })
const STL_MATERIAL = new THREE.MeshStandardMaterial({ color: STL_COLOR })

type TokenVisualMode = 'stl' | 'image' | 'placeholder'

interface TokenUserData {
  /** Which (modelAssetId or assetId) the group's current child was resolved
   * from — `stl:<id>` / `img:<id>` / `'placeholder'` — compared against a
   * freshly-computed key each update to decide whether to re-resolve. */
  resolvedKey: string | null
  unsubscribe: (() => void) | null
  mode: TokenVisualMode
}

function tokenResolveKey(token: TokenRecord): string {
  if (token.modelAssetId) return `stl:${token.modelAssetId}`
  if (token.assetId) return `img:${token.assetId}`
  return 'placeholder'
}

function footprintOf(token: TokenRecord): number {
  return token.hazardSize ? Math.max(token.hazardSize.widthCells, token.hazardSize.heightCells) : footprintCells(token.sizeCategory)
}

function positionGroup(group: THREE.Group, token: TokenRecord): void {
  const footprint = footprintOf(token)
  group.position.set(token.x + footprint / 2, token.z, token.y + footprint / 2)
}

function applyPlaceholderTransform(mesh: THREE.Mesh, token: TokenRecord): void {
  const height = resolveModelHeight(token)
  if (token.hazardSize) {
    mesh.scale.set(token.hazardSize.widthCells, height, token.hazardSize.heightCells)
  } else {
    const footprint = footprintCells(token.sizeCategory)
    const radius = Math.max(0.3, footprint * 0.4)
    mesh.scale.set(radius, height, radius)
  }
}

/** STL geometry is pre-normalized (canvas3d/modelCache.ts) to exactly unit
 * height with feet at y=0 and its own natural width/depth otherwise, so
 * sizing it is a uniform scale — but the FACTOR isn't just the target
 * height like the placeholder cone/box; resolveStlScale also keeps the
 * model from spilling outside the token's own grid footprint (see its doc
 * comment in map/sizeCategory.ts). */
function applyStlTransform(mesh: THREE.Mesh, token: TokenRecord): void {
  const box = mesh.geometry.boundingBox
  const localWidth = box ? box.max.x - box.min.x : 1
  const localDepth = box ? box.max.z - box.min.z : 1
  mesh.scale.setScalar(resolveStlScale(token, localWidth, localDepth))
}

function ensurePlaceholderChild(group: THREE.Group, token: TokenRecord): void {
  const mesh = new THREE.Mesh(token.hazardSize ? HAZARD_GEOMETRY : PLACEHOLDER_GEOMETRY, token.hazardSize ? HAZARD_MATERIAL : PLACEHOLDER_MATERIAL)
  group.clear()
  group.add(mesh)
  applyPlaceholderTransform(mesh, token)
}

/** A token without an uploaded 3D model shows its ordinary 2D token image
 * instead of the generic placeholder cone — a flat, always-camera-facing
 * billboard (THREE.Sprite), the 3D view's equivalent of the 2D map's token
 * art. Anchored at its bottom edge (`sprite.center.set(0.5, 0)`) so it
 * visually "stands" on the plane rather than floating centered on it. */
function applyBillboardTransform(sprite: THREE.Sprite, token: TokenRecord): void {
  sprite.center.set(0.5, 0)
  const texture = (sprite.material as THREE.SpriteMaterial).map
  const image = texture?.image as { width: number; height: number } | undefined
  const aspect = image ? image.height / image.width : 1
  const footprint = footprintCells(token.sizeCategory) * renderScale(token.sizeCategory)
  sprite.scale.set(footprint, footprint * aspect, 1)
}

/** Resolves (or re-resolves, on modelAssetId/assetId change) a token's
 * visual — an uploaded STL model takes priority, then the token's ordinary
 * 2D image as a billboard, then a generic placeholder cone/box as the last
 * resort — and keeps its transform current every call. The real resolved
 * visual is swapped in once its asset loads — async, but never blocks the
 * token from having *something* on the plane in the meantime. */
function updateToken(doc: Y.Doc, group: THREE.Group, token: TokenRecord): void {
  positionGroup(group, token)
  const data = group.userData as TokenUserData
  const key = tokenResolveKey(token)

  if (data.resolvedKey === key) {
    const child = group.children[0]
    if (child && data.mode === 'stl') applyStlTransform(child as THREE.Mesh, token)
    else if (child && data.mode === 'image') applyBillboardTransform(child as THREE.Sprite, token)
    else if (child) applyPlaceholderTransform(child as THREE.Mesh, token)
    return
  }

  data.unsubscribe?.()
  data.unsubscribe = null
  data.resolvedKey = key
  data.mode = 'placeholder'
  ensurePlaceholderChild(group, token)

  if (token.modelAssetId) {
    const assetId = token.modelAssetId
    data.unsubscribe = subscribeAssetUrl(doc, assetId, (url) => {
      if (data.resolvedKey !== key) return // superseded by a newer change
      const applyGeometry = (geometry: THREE.BufferGeometry) => {
        if (data.resolvedKey !== key) return
        const mesh = new THREE.Mesh(geometry, STL_MATERIAL)
        group.clear()
        group.add(mesh)
        data.mode = 'stl'
        applyStlTransform(mesh, token)
      }
      const cached = getCachedModelGeometry(url)
      if (cached) applyGeometry(cached)
      else void loadModelGeometry(url).then(applyGeometry)
    })
  } else if (token.assetId) {
    const assetId = token.assetId
    data.unsubscribe = subscribeAssetUrl(doc, assetId, (url) => {
      if (data.resolvedKey !== key) return
      const applyTexture = (texture: THREE.Texture) => {
        if (data.resolvedKey !== key) return
        const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, transparent: true }))
        const previousChild = group.children[0]
        group.clear()
        group.add(sprite)
        data.mode = 'image'
        applyBillboardTransform(sprite, token)
        if (previousChild instanceof THREE.Sprite) previousChild.material.dispose()
      }
      const cached = getCachedImageTexture(url)
      if (cached) applyTexture(cached)
      else void loadImageTexture(url).then(applyTexture)
    })
  }
}

interface Scene3DProps {
  selectedTokenId?: string | null
  onSelectToken?: (tokenId: string) => void
}

/**
 * Personal, per-viewer 3D "flat plane" alternative to the 2D map
 * (canvas/MapCanvas.tsx) — meant to show everything the 2D view does: the
 * map image, grid, walls (flat red lines, same as 2D), and fog-of-war are
 * all baked into the plane's own texture (see buildPlaneCanvas), while
 * tokens stay real 3D objects standing on top of it — an uploaded STL
 * (TokenRecord.modelAssetId) stands in as a real 3D mini, a token with no
 * model shows its ordinary 2D image as a flat camera-facing billboard, and
 * a token with neither gets a plain placeholder cone (or a flat box for
 * hazard/trap tokens).
 *
 * v1 scope, deliberately narrower than the 2D view:
 * - Fog-of-war hides a token itself (not just the terrain under it) using a
 *   simple line-of-sight + range check (map/visibility.ts's
 *   hasLineOfSight), same rule as 2D's live token mask — but unlike 2D,
 *   this view doesn't also grow the persisted exploration memory itself
 *   (map/useExploration.ts's revealCells); it reads whatever's already been
 *   explored (via 2D, or another player) rather than independently writing
 *   to it, and there's no DM preview-as-player support here yet either
 *   (isDm is the only masking toggle).
 * - Dragging a token is DM-only, matching 2D's existing convention (token
 *   dragging in the 2D view has always been DM-only).
 * - A drag only writes the token's final position once released — no
 *   continuous position broadcast mid-drag like 2D's onDragMove throttling.
 * - No selection highlight ring yet (selection still works functionally —
 *   clicking a token calls onSelectToken, opening the same side-panel
 *   editors the 2D view uses — it just isn't visually marked in 3D).
 * - Lights render only as illumination (baked into the fog texture, same as
 *   2D); annotations/pings/measuring have no 3D equivalent.
 */
export function Scene3D({ selectedTokenId = null, onSelectToken }: Scene3DProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const { session } = useSession()
  const doc = session?.doc ?? null
  const isDm = session?.role === 'dm'
  const { activeScene } = useScenes(doc)
  const mapUrl = useAssetUrl(doc, activeScene?.mapAssetId ?? null)
  const { tokens, moveToken } = useTokens(doc, activeScene?.id ?? null)
  const { walls } = useWalls(doc, activeScene?.id ?? null)
  const { lights } = useLights(doc, activeScene?.id ?? null)
  // No DM preview-as-player support in 3D yet (see doc comment) — a real
  // player viewer's own stable id, or null for the DM (who's always
  // unmasked) or when there's no session at all.
  const viewerId = isDm ? null : getOrCreatePlayerId()
  const { exploredCells } = useExploration(doc, activeScene?.id ?? null, viewerId)

  // Mutable "latest" ref so the imperative pointer handlers (created once,
  // in the mount effect below) always see fresh data without needing to be
  // recreated — same reasoning as canvas/TokenLayer.ts's update() pattern,
  // just via a ref instead of a class method.
  const latestRef = useRef({ tokens, isDm, moveToken, onSelectToken })
  latestRef.current = { tokens, isDm, moveToken, onSelectToken }

  const sceneRef = useRef<THREE.Scene | null>(null)
  const planeRef = useRef<THREE.Mesh | null>(null)
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null)
  const controlsRef = useRef<OrbitControls | null>(null)
  const tokenGroupsRef = useRef(new Map<string, THREE.Group>())
  // Avoids re-fetching/re-decoding the map image (via `new Image()`) every
  // time an unrelated grid setting changes and re-runs the effect below —
  // only reloaded when mapUrl itself actually changes.
  const loadedImageRef = useRef<{ url: string; image: HTMLImageElement } | null>(null)

  // Mount: renderer/scene/camera/controls/lights/plane + pointer handlers +
  // render loop. Runs once for the life of this component instance.
  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    // Captured once — the Map instance itself never changes identity across
    // this component's life (the other effects mutate it in place), so this
    // is safe to reuse below instead of re-reading tokenGroupsRef.current.
    const tokenGroups = tokenGroupsRef.current

    const scene = new THREE.Scene()
    scene.background = new THREE.Color(0x1a1712)
    sceneRef.current = scene

    const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 1000)
    cameraRef.current = camera

    const renderer = new THREE.WebGLRenderer({ antialias: true })
    renderer.outputColorSpace = THREE.SRGBColorSpace
    renderer.domElement.style.touchAction = 'none'
    container.appendChild(renderer.domElement)

    const controls = new OrbitControls(camera, renderer.domElement)
    controls.enableDamping = true
    controls.maxPolarAngle = Math.PI / 2 - 0.02
    controls.minDistance = 2
    controls.maxDistance = 300
    controlsRef.current = controls

    scene.add(new THREE.AmbientLight(0xffffff, 0.7))
    const dirLight = new THREE.DirectionalLight(0xffffff, 0.9)
    dirLight.position.set(10, 20, 10)
    scene.add(dirLight)

    const planeGeometry = new THREE.PlaneGeometry(1, 1)
    planeGeometry.rotateX(-Math.PI / 2)
    const planeMaterial = new THREE.MeshStandardMaterial({ color: 0x3a3226 })
    const plane = new THREE.Mesh(planeGeometry, planeMaterial)
    scene.add(plane)
    planeRef.current = plane

    const resize = () => {
      const { clientWidth, clientHeight } = container
      if (clientWidth === 0 || clientHeight === 0) return
      renderer.setSize(clientWidth, clientHeight)
      camera.aspect = clientWidth / clientHeight
      camera.updateProjectionMatrix()
    }
    resize()
    const resizeObserver = new ResizeObserver(resize)
    resizeObserver.observe(container)

    // Pointer interaction: raycast against token meshes on pointerdown to
    // pick which one to select/drag, then against the plane on pointermove
    // to find the new grid cell while dragging. Only the final position (on
    // release) is written — see the component doc comment's v1 scope note.
    const raycaster = new THREE.Raycaster()
    let draggingTokenId: string | null = null
    let pointerDownPos: { x: number; y: number } | null = null
    let pointerDownTokenId: string | null = null

    const pointerNdc = (event: PointerEvent): THREE.Vector2 => {
      const rect = container.getBoundingClientRect()
      return new THREE.Vector2(((event.clientX - rect.left) / rect.width) * 2 - 1, -((event.clientY - rect.top) / rect.height) * 2 + 1)
    }

    const hitTokenId = (event: PointerEvent): string | null => {
      raycaster.setFromCamera(pointerNdc(event), camera)
      const candidates: { id: string; mesh: THREE.Object3D }[] = []
      for (const [id, group] of tokenGroups) {
        const mesh = group.children[0]
        if (mesh) candidates.push({ id, mesh })
      }
      const intersects = raycaster.intersectObjects(
        candidates.map((c) => c.mesh),
        false,
      )
      if (intersects.length === 0) return null
      return candidates.find((c) => c.mesh === intersects[0].object)?.id ?? null
    }

    const hitPlanePoint = (event: PointerEvent): THREE.Vector3 | null => {
      raycaster.setFromCamera(pointerNdc(event), camera)
      const intersects = raycaster.intersectObject(plane, false)
      return intersects[0]?.point ?? null
    }

    const onPointerDown = (event: PointerEvent) => {
      pointerDownPos = { x: event.clientX, y: event.clientY }
      pointerDownTokenId = hitTokenId(event)
      if (pointerDownTokenId && latestRef.current.isDm) {
        draggingTokenId = pointerDownTokenId
        controls.enabled = false
      }
    }

    const onPointerMove = (event: PointerEvent) => {
      if (!draggingTokenId) return
      const point = hitPlanePoint(event)
      const group = point && tokenGroups.get(draggingTokenId)
      if (group && point) {
        group.position.x = point.x
        group.position.z = point.z
      }
    }

    const onPointerUp = (event: PointerEvent) => {
      const movedPx = pointerDownPos ? Math.hypot(event.clientX - pointerDownPos.x, event.clientY - pointerDownPos.y) : 0
      if (draggingTokenId) {
        const point = hitPlanePoint(event)
        const token = latestRef.current.tokens.find((t) => t.id === draggingTokenId)
        if (point && token) {
          const footprint = footprintOf(token)
          latestRef.current.moveToken(draggingTokenId, snapToSlot(point.x, footprint), snapToSlot(point.z, footprint))
        }
        draggingTokenId = null
        controls.enabled = true
      } else if (movedPx < DRAG_CLICK_THRESHOLD_PX && pointerDownTokenId) {
        latestRef.current.onSelectToken?.(pointerDownTokenId)
      }
      pointerDownPos = null
      pointerDownTokenId = null
    }

    renderer.domElement.addEventListener('pointerdown', onPointerDown)
    window.addEventListener('pointermove', onPointerMove)
    window.addEventListener('pointerup', onPointerUp)

    let animationFrame = 0
    const animate = () => {
      controls.update()
      renderer.render(scene, camera)
      animationFrame = requestAnimationFrame(animate)
    }
    animate()

    return () => {
      cancelAnimationFrame(animationFrame)
      resizeObserver.disconnect()
      renderer.domElement.removeEventListener('pointerdown', onPointerDown)
      window.removeEventListener('pointermove', onPointerMove)
      window.removeEventListener('pointerup', onPointerUp)
      controls.dispose()
      for (const group of tokenGroups.values()) {
        ;(group.userData as TokenUserData).unsubscribe?.()
      }
      tokenGroups.clear()
      planeGeometry.dispose()
      planeMaterial.dispose()
      renderer.dispose()
      container.removeChild(renderer.domElement)
      sceneRef.current = null
      planeRef.current = null
      cameraRef.current = null
      controlsRef.current = null
    }
    // Mount-once: pointer handlers close over `latestRef` (always current)
    // rather than the props/state that would otherwise need to be listed
    // here, so this intentionally never re-runs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Sizes, grids, and textures the plane — the 3D view's equivalent of 2D's
  // MapLayer + GridLayer combined, since a MeshStandardMaterial only has one
  // `map` (see buildPlaneCanvas). Reframes the camera to match every time
  // the plane's actual dimensions change: first an immediate best-guess
  // from the blank-canvas dims (also the DM's floor for extending the play
  // area past the map image — see map/canvasSize.ts's resolveCanvasSizeCells,
  // shared with MapCanvas.tsx so both views always agree on the board size),
  // then a correction once the real map image loads and its true size is
  // known. OrbitControls still lets the viewer reframe manually afterward
  // regardless.
  useEffect(() => {
    const plane = planeRef.current
    const camera = cameraRef.current
    const controls = controlsRef.current
    if (!plane || !camera || !controls || !activeScene) return
    let cancelled = false
    const grid: PlaneGridConfig = {
      gridSizePx: activeScene.gridSizePx,
      gridOffsetX: activeScene.gridOffsetX,
      gridOffsetY: activeScene.gridOffsetY,
      gridVisible: activeScene.gridVisible,
      gridType: activeScene.gridType ?? 'square',
    }
    const material = plane.material as THREE.MeshStandardMaterial

    const applyDims = (dims: CellDims) => {
      plane.scale.set(dims.widthCells, 1, dims.heightCells)
      const cx = dims.widthCells / 2
      const cz = dims.heightCells / 2
      plane.position.set(cx, 0, cz)
      const dist = Math.max(dims.widthCells, dims.heightCells)
      camera.position.set(cx, dist * 0.9, cz + dist * 0.9)
      controls.target.set(cx, 0, cz)
      controls.update()
    }

    const fog: PlaneFogConfig | null =
      !isDm && activeScene.fogEnabled
        ? {
            lights,
            tokens,
            ownTokenIds: (activeScene.sharedVisionEnabled ?? false ? tokens.filter((t) => t.ownerId !== null) : tokens.filter((t) => t.ownerId === viewerId)).map((t) => t.id),
            ambientBrightness: activeScene.ambientBrightness,
            exploredCells,
            persistentFogEnabled: activeScene.persistentFogEnabled ?? true,
          }
        : null

    const applyTexture = (image: HTMLImageElement | null, dims: CellDims) => {
      const canvas = buildPlaneCanvas(image, dims, grid, walls, fog)
      const texture = new THREE.CanvasTexture(canvas)
      texture.colorSpace = THREE.SRGBColorSpace
      const previousMap = material.map
      material.map = texture
      material.color.set(0xffffff)
      material.transparent = !!fog
      material.needsUpdate = true
      previousMap?.dispose()
    }

    // scene is checked truthy above, and a null imageSizeCells always
    // resolves to a concrete size — never null here.
    const blankOnlyDims = resolveCanvasSizeCells(activeScene, null) as CellDims
    applyDims(blankOnlyDims)
    applyTexture(null, blankOnlyDims)

    if (!mapUrl) {
      loadedImageRef.current = null
    } else {
      const applyFromImage = (image: HTMLImageElement) => {
        const imageSizeCells: CellDims = {
          widthCells: image.naturalWidth / grid.gridSizePx,
          heightCells: image.naturalHeight / grid.gridSizePx,
        }
        const dims = resolveCanvasSizeCells(activeScene, imageSizeCells) as CellDims
        applyDims(dims)
        applyTexture(image, dims)
      }

      const cached = loadedImageRef.current?.url === mapUrl ? loadedImageRef.current.image : null
      if (cached) {
        applyFromImage(cached)
      } else {
        const image = new Image()
        image.onload = () => {
          if (cancelled) return
          loadedImageRef.current = { url: mapUrl, image }
          applyFromImage(image)
        }
        image.src = mapUrl
      }
    }

    return () => {
      cancelled = true
    }
    // Deliberately narrower than "activeScene" as a whole — this should
    // only re-run when the map image or these specific board-appearance
    // fields change, not on every unrelated scene-settings edit. `tokens`
    // is included because fog visibility is computed from each owned
    // token's current position.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    mapUrl,
    activeScene?.gridSizePx,
    activeScene?.gridOffsetX,
    activeScene?.gridOffsetY,
    activeScene?.gridVisible,
    activeScene?.gridType,
    activeScene?.blankWidthCells,
    activeScene?.blankHeightCells,
    activeScene?.fogEnabled,
    activeScene?.ambientBrightness,
    activeScene?.persistentFogEnabled,
    activeScene?.sharedVisionEnabled,
    walls,
    lights,
    tokens,
    exploredCells,
    isDm,
    viewerId,
  ])

  // Diffs the token list against the live Group map — add/remove/update,
  // mirroring canvas/TokenLayer.ts's update() pattern for the 2D view. Also
  // gates each non-owned token's visibility by live line-of-sight when fog
  // is active — the same "dynamic content only shows within current-frame
  // live sight" rule as 2D's dual fog mask (a creature standing in a
  // "remembered" room shouldn't stay visible just because the terrain is
  // remembered), just via a direct hasLineOfSight+range check per token
  // rather than a rendered mask, since tokens are ordinary 3D objects here.
  useEffect(() => {
    const scene = sceneRef.current
    if (!scene || !doc || !activeScene) return
    const groups = tokenGroupsRef.current
    const visibleTokens = isDm ? tokens : tokens.filter((t) => !t.hidden)
    const seen = new Set<string>()

    const fogActive = !isDm && activeScene.fogEnabled
    const ownTokenIds = new Set(
      (activeScene.sharedVisionEnabled ?? false ? tokens.filter((t) => t.ownerId !== null) : tokens.filter((t) => t.ownerId === viewerId)).map((t) => t.id),
    )
    const wallSegments = walls.map((w) => ({ x1: w.x1, y1: w.y1, x2: w.x2, y2: w.y2 }))
    const ownPositions = tokens.filter((t) => ownTokenIds.has(t.id)).map((t) => ({ x: t.x + footprintOf(t) / 2, y: t.y + footprintOf(t) / 2 }))

    const inLiveSight = (token: TokenRecord): boolean => {
      if (!fogActive || ownTokenIds.has(token.id)) return true
      const pos = { x: token.x + footprintOf(token) / 2, y: token.y + footprintOf(token) / 2 }
      return ownPositions.some((from) => Math.hypot(from.x - pos.x, from.y - pos.y) <= MAX_VISION_RADIUS_CELLS && hasLineOfSight(from, pos, wallSegments))
    }

    for (const token of visibleTokens) {
      seen.add(token.id)
      let group = groups.get(token.id)
      if (!group) {
        group = new THREE.Group()
        group.userData = { resolvedKey: null, unsubscribe: null, mode: 'placeholder' } satisfies TokenUserData
        scene.add(group)
        groups.set(token.id, group)
      }
      group.visible = inLiveSight(token)
      updateToken(doc, group, token)
    }

    for (const [id, group] of groups) {
      if (seen.has(id)) continue
      ;(group.userData as TokenUserData).unsubscribe?.()
      scene.remove(group)
      groups.delete(id)
    }
  }, [doc, tokens, isDm, activeScene, walls, viewerId])

  void selectedTokenId // see doc comment: no visual highlight yet, kept for API parity with MapCanvas

  return <div ref={containerRef} className="map-canvas scene3d" data-ready="true" />
}
