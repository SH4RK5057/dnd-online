import { useEffect, useRef } from 'react'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import type * as Y from 'yjs'
import { useSession } from '../session/useSession'
import { useScenes } from '../map/useScenes'
import { useTokens } from '../map/useTokens'
import { useAssetUrl, subscribeAssetUrl } from '../map/assetSync'
import { resolveCanvasSizeCells, type CellDims } from '../map/canvasSize'
import { footprintCells, resolveModelHeight, resolveStlScale, snapToSlot } from '../map/sizeCategory'
import { getCachedModelGeometry, loadModelGeometry } from './modelCache'
import { drawGridLines } from './gridTexture'
import type { GridType, TokenRecord } from '../map/types'

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

function choosePxPerCell(widthCells: number, heightCells: number): number {
  const largest = Math.max(widthCells, heightCells, 1)
  return Math.min(PLANE_TEXTURE_PX_PER_CELL, Math.max(1, Math.floor(PLANE_TEXTURE_MAX_DIMENSION_PX / largest)))
}

/** Builds the plane's full texture as a single flat canvas — background
 * color, then the map image (if any) at its own cell-derived footprint
 * within the shared canvas, then grid lines on top — since a
 * MeshStandardMaterial only has one `map`, this is the 3D view's answer to
 * 2D's separate MapLayer + GridLayer: everything the 2D view shows on the
 * board (short of walls/lights/tokens, which stay real 3D objects) gets
 * baked into one texture here instead. */
function buildPlaneCanvas(image: HTMLImageElement | null, dims: CellDims, grid: PlaneGridConfig): HTMLCanvasElement {
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

interface TokenUserData {
  /** The modelAssetId currently loaded/loading for this token's mesh, or
   * null while showing the placeholder because none is set. */
  modelAssetId: string | null
  unsubscribe: (() => void) | null
  /** Whether the group's current child is the resolved STL mesh (true) or
   * a placeholder shown while one loads or because none is set (false). */
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

/** Resolves (or re-resolves, on modelAssetId change) a token's mesh and
 * keeps its transform current every call. Placeholder shown immediately
 * and swapped for the real STL mesh once it resolves — async, but never
 * blocks the token from having *something* on the plane in the meantime. */
function updateToken(doc: Y.Doc, group: THREE.Group, token: TokenRecord): void {
  positionGroup(group, token)
  const data = group.userData as TokenUserData

  if (token.modelAssetId) {
    if (data.modelAssetId !== token.modelAssetId) {
      data.unsubscribe?.()
      data.modelAssetId = token.modelAssetId
      data.usingStl = false
      ensurePlaceholderChild(group, token)
      const assetId = token.modelAssetId
      data.unsubscribe = subscribeAssetUrl(doc, assetId, (url) => {
        if (data.modelAssetId !== assetId) return // superseded by a newer change
        const applyGeometry = (geometry: THREE.BufferGeometry) => {
          if (data.modelAssetId !== assetId) return
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
  } else if (data.modelAssetId !== null) {
    data.unsubscribe?.()
    data.unsubscribe = null
    data.modelAssetId = null
    data.usingStl = false
    ensurePlaceholderChild(group, token)
  } else {
    const mesh = group.children[0] as THREE.Mesh | undefined
    if (mesh) applyPlaceholderTransform(mesh, token)
  }
}

interface Scene3DProps {
  selectedTokenId?: string | null
  onSelectToken?: (tokenId: string) => void
}

/**
 * Personal, per-viewer 3D "flat plane" alternative to the 2D map
 * (canvas/MapCanvas.tsx) — the scene's map image becomes a literal tabletop
 * surface, and tokens with an uploaded STL (TokenRecord.modelAssetId) stand
 * on it as real 3D minis instead of flat sprites; tokens without one get a
 * plain placeholder cone (or a flat box for hazard/trap tokens).
 *
 * v1 scope, deliberately narrower than the 2D view:
 * - No fog-of-war/line-of-sight masking — every non-hidden token renders for
 *   everyone regardless of vision. Hidden tokens still only render for the
 *   DM, same as 2D.
 * - Dragging a token is DM-only, matching 2D's existing convention (token
 *   dragging in the 2D view has always been DM-only).
 * - A drag only writes the token's final position once released — no
 *   continuous position broadcast mid-drag like 2D's onDragMove throttling.
 * - No selection highlight ring yet (selection still works functionally —
 *   clicking a token calls onSelectToken, opening the same side-panel
 *   editors the 2D view uses — it just isn't visually marked in 3D).
 * - Walls/lights/annotations/measuring have no 3D equivalent; this view is
 *   map + tokens only.
 */
export function Scene3D({ selectedTokenId = null, onSelectToken }: Scene3DProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const { session } = useSession()
  const doc = session?.doc ?? null
  const isDm = session?.role === 'dm'
  const { activeScene } = useScenes(doc)
  const mapUrl = useAssetUrl(doc, activeScene?.mapAssetId ?? null)
  const { tokens, moveToken } = useTokens(doc, activeScene?.id ?? null)

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

    const applyTexture = (image: HTMLImageElement | null, dims: CellDims) => {
      const canvas = buildPlaneCanvas(image, dims, grid)
      const texture = new THREE.CanvasTexture(canvas)
      texture.colorSpace = THREE.SRGBColorSpace
      const previousMap = material.map
      material.map = texture
      material.color.set(0xffffff)
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
    // fields change, not on every unrelated scene-settings edit.
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
  ])

  // Diffs the token list against the live Group map — add/remove/update,
  // mirroring canvas/TokenLayer.ts's update() pattern for the 2D view.
  useEffect(() => {
    const scene = sceneRef.current
    if (!scene || !doc) return
    const groups = tokenGroupsRef.current
    const visibleTokens = isDm ? tokens : tokens.filter((t) => !t.hidden)
    const seen = new Set<string>()

    for (const token of visibleTokens) {
      seen.add(token.id)
      let group = groups.get(token.id)
      if (!group) {
        group = new THREE.Group()
        group.userData = { modelAssetId: null, unsubscribe: null, usingStl: false } satisfies TokenUserData
        scene.add(group)
        groups.set(token.id, group)
      }
      updateToken(doc, group, token)
    }

    for (const [id, group] of groups) {
      if (seen.has(id)) continue
      ;(group.userData as TokenUserData).unsubscribe?.()
      scene.remove(group)
      groups.delete(id)
    }
  }, [doc, tokens, isDm])

  void selectedTokenId // see doc comment: no visual highlight yet, kept for API parity with MapCanvas

  return <div ref={containerRef} className="map-canvas scene3d" data-ready="true" />
}
