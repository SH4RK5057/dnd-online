import { useEffect, useRef } from 'react'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import type * as Y from 'yjs'
import { useSession } from '../session/useSession'
import { useScenes } from '../map/useScenes'
import { useTokens } from '../map/useTokens'
import { useWalls } from '../map/useWalls'
import { getOrCreatePlayerId } from '../session/lastSession'
import { subscribeAssetUrl } from '../map/assetSync'
import { MAX_VISION_RADIUS_CELLS, BLANK_SCENE_WIDTH_CELLS, BLANK_SCENE_HEIGHT_CELLS } from '../map/constants'
import { hasLineOfSight } from '../map/visibility'
import { footprintCells, resolveModelHeight, resolveStlScale, snapToSlot } from '../map/sizeCategory'
import { getCachedModelGeometry, loadModelGeometry } from './modelCache'
import type { TokenRecord } from '../map/types'

const PLACEHOLDER_COLOR = 0x6b6375
const HAZARD_COLOR = 0xcc5522
const STL_COLOR = 0xcfc9bd
/** How often (ms) to re-pull a fresh frame from the 2D canvas's live
 * rendering into the plane's texture — see the component doc comment for
 * why the plane is textured this way instead of building its own separate
 * rendering. Not every animation frame: extraction is a real render pass
 * (Pixi docs call it "relatively expensive"), and this is a personal,
 * non-twitch-response view where a brief lag behind a token move or a
 * fog reveal is unnoticeable. */
const BOARD_REFRESH_INTERVAL_MS = 200
/** Pointer movement (px) below which a press+release counts as a click
 * (select) rather than a drag — mirrors the click-vs-drag disambiguation
 * canvas/TokenSprite.ts already does for the 2D view. */
const DRAG_CLICK_THRESHOLD_PX = 6

// Shared, stateless geometry/materials reused across every token's
// placeholder mesh — never disposed per-token (only per-token Mesh
// *instances* are created/removed; geometries/materials are cached module-
// level, same spirit as canvas3d/modelCache.ts caching loaded STL geometry).
const PLACEHOLDER_GEOMETRY = new THREE.ConeGeometry(1, 1, 12).translate(0, 0.5, 0)
const HAZARD_GEOMETRY = new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0)
const PLACEHOLDER_MATERIAL = new THREE.MeshStandardMaterial({ color: PLACEHOLDER_COLOR })
const HAZARD_MATERIAL = new THREE.MeshStandardMaterial({ color: HAZARD_COLOR })
const STL_MATERIAL = new THREE.MeshStandardMaterial({ color: STL_COLOR })

interface TokenUserData {
  /** The modelAssetId currently loaded/loading for this token's mesh. A
   * group only exists at all for tokens that have one — see the
   * token-diffing effect — so this is never null for a live group. */
  modelAssetId: string
  unsubscribe: (() => void) | null
  /** Whether the group's current child is the resolved STL mesh (true) or
   * a placeholder shown while it loads (false). */
  usingStl: boolean
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

/** Resolves (or re-resolves, on modelAssetId change) a token's STL mesh and
 * keeps its transform current every call. A placeholder shows immediately
 * and is swapped for the real STL mesh once it resolves — async, but never
 * blocks the token from having *something* standing on the plane in the
 * meantime. Only ever called for tokens that have a modelAssetId — see the
 * token-diffing effect, which doesn't even create a group otherwise (a
 * token with no model is already visible via its ordinary 2D image, baked
 * into the plane's own texture — see the component doc comment). */
function updateToken(doc: Y.Doc, group: THREE.Group, token: TokenRecord, modelAssetId: string): void {
  positionGroup(group, token)
  const data = group.userData as TokenUserData

  if (data.modelAssetId !== modelAssetId) {
    data.unsubscribe?.()
    data.modelAssetId = modelAssetId
    data.usingStl = false
    ensurePlaceholderChild(group, token)
    data.unsubscribe = subscribeAssetUrl(doc, modelAssetId, (url) => {
      if (data.modelAssetId !== modelAssetId) return // superseded by a newer change
      const applyGeometry = (geometry: THREE.BufferGeometry) => {
        if (data.modelAssetId !== modelAssetId) return
        const mesh = new THREE.Mesh(geometry, STL_MATERIAL)
        group.clear()
        group.add(mesh)
        data.usingStl = true
        applyStlTransform(mesh, token)
      }
      const cached = getCachedModelGeometry(url)
      if (cached) applyGeometry(cached)
      else void loadModelGeometry(url).then(applyGeometry)
    })
  } else {
    const mesh = group.children[0] as THREE.Mesh | undefined
    if (mesh) (data.usingStl ? applyStlTransform : applyPlaceholderTransform)(mesh, token)
  }
}

interface Scene3DProps {
  /** Reads a fresh, flat, native-pixel-scale render of exactly what the 2D
   * map (canvas/MapCanvas.tsx) currently shows — map image, grid, walls,
   * fog-of-war, and tokens, already correctly composed and fog-masked —
   * for use as the plane's own texture. Supplied by screens/SessionScreen.tsx,
   * which keeps a MapCanvas mounted (just visually hidden) even while this
   * view is active so there's always something live to read. Null (or a
   * function returning null) is treated as "nothing to show yet". */
  getBoardCanvas?: () => HTMLCanvasElement | null
  selectedTokenId?: string | null
  onSelectToken?: (tokenId: string) => void
}

/**
 * Personal, per-viewer 3D "flat plane" alternative to the 2D map
 * (canvas/MapCanvas.tsx). The plane is textured with a literal, continuously
 * refreshed render of the 2D map itself (via `getBoardCanvas`) — map image,
 * grid, walls, fog-of-war, and every token's ordinary 2D image, all exactly
 * as 2D shows them, since this view intentionally does not reimplement any
 * of that rendering a second time. The one thing 3D adds on top: a token
 * with an uploaded STL model (TokenRecord.modelAssetId) also gets a real
 * standing 3D mini positioned above its own spot on the plane — "the 3D
 * minis are just on top of the 2D map". A token with no model has no
 * separate 3D object at all; its ordinary 2D image (already baked into the
 * plane texture) is its entire 3D representation.
 *
 * v1 scope, deliberately narrower than the 2D view:
 * - Only a token's separate 3D mini (not the flat image baked into the
 *   plane texture, which 2D's own fog masking already handles correctly)
 *   needs its own visibility gate here: a simple line-of-sight + range
 *   check (map/visibility.ts's hasLineOfSight), the same rule as 2D's live
 *   token mask, so a mini doesn't keep standing there once its token
 *   scrolls out of live sight. There's no DM preview-as-player support in
 *   3D yet — isDm is the only masking toggle.
 * - Dragging a token's mini is DM-only, matching 2D's existing convention
 *   (token dragging in the 2D view has always been DM-only), and only
 *   tokens with a mini are draggable in 3D at all — a token with no model
 *   has nothing here to click on; drag it from the 2D view instead.
 * - A drag only writes the token's final position once released — no
 *   continuous position broadcast mid-drag like 2D's onDragMove throttling.
 * - No selection highlight ring yet (selection still works functionally —
 *   clicking a mini calls onSelectToken, opening the same side-panel
 *   editors the 2D view uses — it just isn't visually marked in 3D).
 */
export function Scene3D({ getBoardCanvas, selectedTokenId = null, onSelectToken }: Scene3DProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const { session } = useSession()
  const doc = session?.doc ?? null
  const isDm = session?.role === 'dm'
  const { activeScene } = useScenes(doc)
  const { tokens, moveToken } = useTokens(doc, activeScene?.id ?? null)
  const { walls } = useWalls(doc, activeScene?.id ?? null)
  // No DM preview-as-player support in 3D yet (see doc comment) — a real
  // player viewer's own stable id, or null for the DM (who's always
  // unmasked) or when there's no session at all.
  const viewerId = isDm ? null : getOrCreatePlayerId()

  // Mutable "latest" ref so the imperative pointer handlers and the RAF
  // board-refresh loop (both created once, in the mount effect below)
  // always see fresh data without needing to be recreated — same reasoning
  // as canvas/TokenLayer.ts's update() pattern, just via a ref instead of a
  // class method.
  const latestRef = useRef({ tokens, isDm, moveToken, onSelectToken, getBoardCanvas, activeScene })
  latestRef.current = { tokens, isDm, moveToken, onSelectToken, getBoardCanvas, activeScene }

  const sceneRef = useRef<THREE.Scene | null>(null)
  const planeRef = useRef<THREE.Mesh | null>(null)
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null)
  const controlsRef = useRef<OrbitControls | null>(null)
  const tokenGroupsRef = useRef(new Map<string, THREE.Group>())

  // Mount: renderer/scene/camera/controls/lights/plane + pointer handlers +
  // render loop (which also periodically refreshes the plane's texture from
  // getBoardCanvas). Runs once for the life of this component instance.
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

    // Persistent texture source: getBoardCanvas() hands back a brand-new
    // canvas element every call, so instead of recreating the Three.js
    // texture each refresh, its content is copied into one long-lived
    // canvas that a single CanvasTexture wraps — cheaper, and avoids
    // texture/material churn.
    const boardCanvas = document.createElement('canvas')
    boardCanvas.width = 1
    boardCanvas.height = 1
    const boardTexture = new THREE.CanvasTexture(boardCanvas)
    boardTexture.colorSpace = THREE.SRGBColorSpace
    planeMaterial.map = boardTexture
    planeMaterial.needsUpdate = true

    let lastWidthCells = 0
    let lastHeightCells = 0
    let lastSceneId: string | null = null

    const applyDims = (widthCells: number, heightCells: number) => {
      plane.scale.set(widthCells, 1, heightCells)
      const cx = widthCells / 2
      const cz = heightCells / 2
      plane.position.set(cx, 0, cz)
      const dist = Math.max(widthCells, heightCells)
      camera.position.set(cx, dist * 0.9, cz + dist * 0.9)
      controls.target.set(cx, 0, cz)
      controls.update()
    }
    // A reasonable default framing before the first real board extraction
    // arrives (MapCanvas needs at least one render pass first).
    applyDims(BLANK_SCENE_WIDTH_CELLS, BLANK_SCENE_HEIGHT_CELLS)

    const refreshBoard = () => {
      const { getBoardCanvas: getBoard, activeScene: scene2 } = latestRef.current
      const extracted = getBoard?.()
      if (!extracted || extracted.width <= 0 || extracted.height <= 0 || !scene2 || scene2.gridSizePx <= 0) return

      boardCanvas.width = extracted.width
      boardCanvas.height = extracted.height
      const ctx = boardCanvas.getContext('2d')
      if (!ctx) return
      ctx.clearRect(0, 0, extracted.width, extracted.height)
      ctx.drawImage(extracted, 0, 0)
      boardTexture.needsUpdate = true

      const widthCells = extracted.width / scene2.gridSizePx
      const heightCells = extracted.height / scene2.gridSizePx
      if (widthCells !== lastWidthCells || heightCells !== lastHeightCells || scene2.id !== lastSceneId) {
        lastWidthCells = widthCells
        lastHeightCells = heightCells
        lastSceneId = scene2.id
        applyDims(widthCells, heightCells)
      }
    }

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
    let lastBoardRefresh = 0
    const animate = (time: number) => {
      controls.update()
      if (time - lastBoardRefresh >= BOARD_REFRESH_INTERVAL_MS) {
        lastBoardRefresh = time
        refreshBoard()
      }
      renderer.render(scene, camera)
      animationFrame = requestAnimationFrame(animate)
    }
    animationFrame = requestAnimationFrame(animate)

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
      boardTexture.dispose()
      planeGeometry.dispose()
      planeMaterial.dispose()
      renderer.dispose()
      container.removeChild(renderer.domElement)
      sceneRef.current = null
      planeRef.current = null
      cameraRef.current = null
      controlsRef.current = null
    }
    // Mount-once: pointer handlers and the board-refresh loop close over
    // `latestRef` (always current) rather than the props/state that would
    // otherwise need to be listed here, so this intentionally never re-runs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Diffs the token list against the live Group map — add/remove/update,
  // mirroring canvas/TokenLayer.ts's update() pattern for the 2D view. Only
  // tokens with an uploaded STL model get a group at all (see the component
  // doc comment — a token with no model is already shown via its ordinary
  // 2D image, baked into the plane's own texture). Also gates each mini's
  // visibility by live line-of-sight when fog is active — the same
  // "dynamic content only shows within current-frame live sight" rule as
  // 2D's live token mask (a creature standing in a "remembered" room
  // shouldn't stay visible just because the terrain is remembered), via a
  // direct hasLineOfSight+range check per token rather than a rendered
  // mask, since minis are ordinary 3D objects here.
  useEffect(() => {
    const scene = sceneRef.current
    if (!scene || !doc || !activeScene) return
    const groups = tokenGroupsRef.current
    const visibleTokens = (isDm ? tokens : tokens.filter((t) => !t.hidden)).filter((t) => !!t.modelAssetId)
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
        group.userData = { modelAssetId: '', unsubscribe: null, usingStl: false } satisfies TokenUserData
        scene.add(group)
        groups.set(token.id, group)
      }
      group.visible = inLiveSight(token)
      // token.modelAssetId is guaranteed non-null by the visibleTokens filter above.
      updateToken(doc, group, token, token.modelAssetId as string)
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
