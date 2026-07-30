import { useEffect, useRef } from 'react'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import type * as Y from 'yjs'
import { useSession } from '../session/useSession'
import { useScenes } from '../map/useScenes'
import { useTokens } from '../map/useTokens'
import { useAssetUrl, subscribeAssetUrl } from '../map/assetSync'
import { BLANK_SCENE_WIDTH_CELLS, BLANK_SCENE_HEIGHT_CELLS } from '../map/constants'
import { footprintCells, resolveModelHeight, snapToSlot } from '../map/sizeCategory'
import { getCachedModelGeometry, loadModelGeometry } from './modelCache'
import type { TokenRecord } from '../map/types'

const PLACEHOLDER_COLOR = 0x6b6375
const HAZARD_COLOR = 0xcc5522
const STL_COLOR = 0xcfc9bd
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
 * height with feet at y=0, so sizing it is just a uniform scale — unlike
 * the placeholder cone/box, which scale non-uniformly by footprint. */
function applyStlTransform(mesh: THREE.Mesh, token: TokenRecord): void {
  mesh.scale.setScalar(resolveModelHeight(token))
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

  // Re-centers the camera when the active scene changes (not on every token
  // move) — an approximate initial framing using blank-canvas dims; the map
  // texture effect below refines the plane's actual size once it loads, and
  // OrbitControls lets the viewer reframe manually regardless.
  useEffect(() => {
    const camera = cameraRef.current
    const controls = controlsRef.current
    if (!camera || !controls || !activeScene) return
    const w = activeScene.blankWidthCells ?? BLANK_SCENE_WIDTH_CELLS
    const h = activeScene.blankHeightCells ?? BLANK_SCENE_HEIGHT_CELLS
    const cx = w / 2
    const cz = h / 2
    const dist = Math.max(w, h)
    camera.position.set(cx, dist * 0.9, cz + dist * 0.9)
    controls.target.set(cx, 0, cz)
    controls.update()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeScene?.id])

  // Sizes and textures the plane from the scene's map image (falling back
  // to the blank-canvas dims + a plain color, mirroring MapCanvas.tsx's own
  // mapLayer.size-or-blank-dims fallback) whenever the map or grid size
  // changes.
  useEffect(() => {
    const plane = planeRef.current
    if (!plane || !activeScene) return
    let cancelled = false
    const gridSizePx = activeScene.gridSizePx
    const blankWidthCells = activeScene.blankWidthCells ?? BLANK_SCENE_WIDTH_CELLS
    const blankHeightCells = activeScene.blankHeightCells ?? BLANK_SCENE_HEIGHT_CELLS

    const applyDims = (widthCells: number, heightCells: number) => {
      plane.scale.set(widthCells, 1, heightCells)
      plane.position.set(widthCells / 2, 0, heightCells / 2)
    }
    applyDims(blankWidthCells, blankHeightCells)

    const material = plane.material as THREE.MeshStandardMaterial
    if (!mapUrl) {
      material.map = null
      material.color.set(0x3a3226)
      material.needsUpdate = true
      return
    }

    const loader = new THREE.TextureLoader()
    loader.load(mapUrl, (texture) => {
      if (cancelled) return
      texture.colorSpace = THREE.SRGBColorSpace
      material.map = texture
      material.color.set(0xffffff)
      material.needsUpdate = true
      applyDims(texture.image.width / gridSizePx, texture.image.height / gridSizePx)
    })

    return () => {
      cancelled = true
    }
    // Deliberately narrower than "activeScene" as a whole — this should
    // only re-run when the map image or these specific dimension fields
    // change, not on every unrelated scene-settings edit.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mapUrl, activeScene?.gridSizePx, activeScene?.blankWidthCells, activeScene?.blankHeightCells])

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
