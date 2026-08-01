import { Container, Graphics, type FederatedPointerEvent } from 'pixi.js'
import { distanceToSegment } from '../map/visibility'
import { snapToHexGrid } from './hexGrid'
import type { GridType, WallRecord } from '../map/types'

/** Hit-test tolerances are expressed as target screen-pixel radii, not fixed
 * grid-cell amounts — grid-cell-space tolerances stay a constant WORLD size
 * regardless of camera zoom, so at typical "zoomed out to see the whole
 * dungeon" scales they shrink to a couple of screen pixels and become
 * essentially unhittable with a real mouse. `setViewScale` keeps the current
 * camera zoom so these can be converted to cell-space fresh on every check. */
const DELETE_HIT_RADIUS_PX = 10
/** Larger than the delete tolerance — endpoints are small dots, worth a more
 * generous grab target since missing one falls through to "start a new wall". */
const ENDPOINT_HIT_RADIUS_PX = 16
/** Slightly more generous than the grab tolerance — this is "snap to connect
 * exactly," not "grab to drag," so it's worth erring toward connecting two
 * walls that were clearly meant to meet rather than leaving a hairline gap
 * a ray can leak through. Takes priority over grid-snap. */
const ENDPOINT_MAGNET_RADIUS_PX = 22
/** Below this on-screen movement between a chain segment's down and up, a
 * gesture counts as a stationary click (leaves the chain open for another
 * click) rather than a click-and-drag (commits the segment immediately and
 * ends the chain) — see handlePointerUp. This was originally 6px, which
 * turned out to be far tighter than real mouse clicks actually are: ordinary
 * hand tremor between mousedown and mouseup routinely exceeds 6px, which
 * silently misread an intended "start a chain" click as a click-and-drag —
 * committing a tiny, barely-visible micro-wall AND leaving no chain open, so
 * the click that should have connected to it did nothing at all. 20px
 * comfortably absorbs normal click jitter while still being much smaller
 * than any deliberate drag-across-the-map gesture. */
const DRAG_COMMIT_THRESHOLD_PX = 20
const DRAG_WRITE_INTERVAL_MS = 75
export const DEFAULT_WALL_THICKNESS_PX = 4

export interface WallLayerCallbacks {
  onCreateWall: (x1: number, y1: number, x2: number, y2: number, thickness: number, isDoor: boolean) => void
  onUpdateWallEndpoint: (wallId: string, which: 'start' | 'end', x: number, y: number) => void
  onToggleDoor: (wallId: string, open: boolean) => void
  onDeleteWall: (wallId: string) => void
}

interface EndpointHit {
  wall: WallRecord
  which: 'start' | 'end'
}

/**
 * DM-only: renders existing walls as lines, and — when active — supports
 * click-chain drawing. Click once to start a chain, click again to commit a
 * segment from the last point to the new one and continue the chain from
 * there, right-click to end the chain without starting a new segment.
 * Shift-click an existing wall to delete it. A press near an existing
 * endpoint is ambiguous until release, same as the first point of a new
 * chain: an actual drag moves that point, but a stationary click there
 * starts a new chain from it instead (magnet-snapped exactly onto it) —
 * connecting a new wall to an existing corner is normal DM behavior and
 * must not be swallowed as a no-op "drag" that silently does nothing.
 *
 * Doors: `setDoorMode` toggles whether newly-drawn walls are created as
 * doors (see WallRecord.isDoor) — a brush setting, same spirit as
 * thickness/snapToGrid, applying to whatever gets drawn next rather than
 * needing its own separate tool. A stationary (non-drag) click directly on
 * an *existing* door instead toggles it open/closed — doors are common
 * enough to interact with that this takes priority over that click's usual
 * "start a new chain here" meaning.
 */
export class WallLayer {
  readonly container = new Container()
  private readonly wallsGraphics = new Graphics()
  private readonly previewGraphics = new Graphics()
  private readonly hitPlane = new Graphics()

  private active = false
  private hitPlaneActive = false
  private hitPlaneWidth = -1
  private hitPlaneHeight = -1
  private gridSizePx = 1
  private snapToGrid = false
  private gridType: GridType = 'square'
  private viewScale = 1
  private thickness = DEFAULT_WALL_THICKNESS_PX
  private doorMode = false
  private walls: WallRecord[] = []
  private callbacks: WallLayerCallbacks | null = null
  private pendingStart: { x: number; y: number } | null = null
  /** Where the currently in-progress press started, if any — distinct from
   * pendingStart (the last *committed* chain point): a click's own down/up
   * pair is tracked here until pointerUp resolves what it means. See
   * handlePointerUp's doc comment. */
  private downPoint: { x: number; y: number } | null = null
  private draggingEndpoint: EndpointHit | null = null
  /** True once a press near an endpoint has actually moved past the drag
   * threshold — see handlePointerMove/handlePointerUp. While false,
   * `draggingEndpoint` is only a candidate: the gesture might still resolve
   * as "start a new chain here" instead of "drag this point." */
  private endpointDragConfirmed = false
  private lastWriteAt = 0

  constructor() {
    this.container.addChild(this.hitPlane, this.wallsGraphics, this.previewGraphics)
    this.hitPlane.eventMode = 'none'
    this.hitPlane.on('pointerdown', this.handlePointerDown)
    this.hitPlane.on('rightdown', this.handleRightDown)
    this.hitPlane.on('globalpointermove', this.handlePointerMove)
    this.hitPlane.on('pointerup', this.handlePointerUp)
    this.hitPlane.on('pointerupoutside', this.handlePointerUp)
  }

  /** Called by MapCanvas whenever the camera's zoom changes, so hit-test
   * tolerances (defined as screen-pixel radii) can be converted to the
   * correct grid-cell-space distance for the current zoom level. */
  setViewScale(scale: number): void {
    this.viewScale = scale > 0 ? scale : 1
  }

  private toleranceCells(radiusPx: number): number {
    return radiusPx / (this.gridSizePx * this.viewScale)
  }

  update(
    walls: WallRecord[],
    gridSizePx: number,
    mapSize: { width: number; height: number } | null,
    active: boolean,
    snapToGrid: boolean,
    gridType: GridType,
    thickness: number,
    doorMode: boolean,
    callbacks: WallLayerCallbacks,
  ): void {
    this.walls = walls
    this.gridSizePx = gridSizePx
    this.snapToGrid = snapToGrid
    this.gridType = gridType
    this.thickness = thickness
    this.doorMode = doorMode
    this.callbacks = callbacks

    if (this.active !== active) {
      this.pendingStart = null
      this.downPoint = null
      this.draggingEndpoint = null
      this.endpointDragConfirmed = false
      this.previewGraphics.clear()
    }
    this.active = active

    // Only touch the hitPlane's geometry when its inputs actually changed —
    // rebuilding it on every update() (which fires on every wall-list change,
    // i.e. after every commit) needlessly churns the hit-test target while a
    // click-chain gesture may still be in flight.
    const mapWidth = mapSize?.width ?? 0
    const mapHeight = mapSize?.height ?? 0
    if (this.hitPlaneActive !== active || this.hitPlaneWidth !== mapWidth || this.hitPlaneHeight !== mapHeight) {
      this.hitPlaneActive = active
      this.hitPlaneWidth = mapWidth
      this.hitPlaneHeight = mapHeight
      this.hitPlane.clear()
      this.hitPlane.eventMode = active && mapSize ? 'static' : 'none'
      if (active && mapSize) {
        this.hitPlane.rect(0, 0, mapSize.width, mapSize.height).fill({ color: 0x000000, alpha: 0.001 })
      }
    }

    this.redrawWalls()
  }

  private redrawWalls(): void {
    this.wallsGraphics.clear()
    // Each wall gets its own moveTo/lineTo/stroke() so its own thickness
    // applies — Graphics.stroke() styles whatever path has been built up
    // since the last stroke/clear, so a single shared call (as before
    // per-wall thickness existed) would force one width for every segment.
    for (const wall of this.walls) {
      const isOpenDoor = !!wall.isDoor && !!wall.open
      // Doors get a distinct brown (vs. plain walls' red) so they read as
      // a different kind of thing at a glance; an open one is drawn at
      // reduced alpha as a visual cue that it isn't currently blocking
      // anything, even though — unlike a plain wall — it's still drawn at
      // all times so its location stays visible either way.
      const color = wall.isDoor ? 0x8a5a2b : 0xff4444
      const alpha = isOpenDoor ? 0.35 : 0.9
      this.wallsGraphics
        .moveTo(wall.x1 * this.gridSizePx, wall.y1 * this.gridSizePx)
        .lineTo(wall.x2 * this.gridSizePx, wall.y2 * this.gridSizePx)
        .stroke({ width: wall.thickness ?? DEFAULT_WALL_THICKNESS_PX, color, alpha })
    }
    // Endpoint dots as a second pass so they sit on top of the lines.
    for (const wall of this.walls) {
      const color = wall.isDoor ? 0x8a5a2b : 0xff4444
      this.wallsGraphics.circle(wall.x1 * this.gridSizePx, wall.y1 * this.gridSizePx, 4).fill({ color })
      this.wallsGraphics.circle(wall.x2 * this.gridSizePx, wall.y2 * this.gridSizePx, 4).fill({ color })
    }
  }

  /** `exclude` is the endpoint currently being dragged (if any) — it's
   * excluded from magnet candidates so a point doesn't uselessly "snap to
   * itself" at its own not-yet-updated position. */
  private toGridPoint(event: FederatedPointerEvent, exclude?: EndpointHit): { x: number; y: number } {
    const local = event.getLocalPosition(this.container)
    const raw = { x: local.x / this.gridSizePx, y: local.y / this.gridSizePx }
    const magnet = this.findMagnetPoint(raw, exclude)
    if (magnet) return magnet
    if (this.snapToGrid) {
      return this.gridType === 'hex' ? snapToHexGrid(raw) : { x: Math.round(raw.x), y: Math.round(raw.y) }
    }
    return raw
  }

  /** Finds an existing wall endpoint (any wall, either end) within magnet
   * range of `point`, so newly-placed or dragged points connect exactly
   * rather than leaving a gap the visibility algorithm can leak light
   * through — walls are independent line segments to that algorithm, so
   * "meant to touch" only actually helps if they're bit-for-bit coincident. */
  private findMagnetPoint(point: { x: number; y: number }, exclude?: EndpointHit): { x: number; y: number } | null {
    let nearest: { x: number; y: number } | null = null
    let nearestDist = this.toleranceCells(ENDPOINT_MAGNET_RADIUS_PX)
    for (const wall of this.walls) {
      if (!(exclude && exclude.wall.id === wall.id && exclude.which === 'start')) {
        const d = Math.hypot(point.x - wall.x1, point.y - wall.y1)
        if (d < nearestDist) {
          nearestDist = d
          nearest = { x: wall.x1, y: wall.y1 }
        }
      }
      if (!(exclude && exclude.wall.id === wall.id && exclude.which === 'end')) {
        const d = Math.hypot(point.x - wall.x2, point.y - wall.y2)
        if (d < nearestDist) {
          nearestDist = d
          nearest = { x: wall.x2, y: wall.y2 }
        }
      }
    }
    return nearest
  }

  private findWallNear(point: { x: number; y: number }): WallRecord | null {
    let nearest: WallRecord | null = null
    let nearestDist = this.toleranceCells(DELETE_HIT_RADIUS_PX)
    for (const wall of this.walls) {
      const dist = distanceToSegment(point, wall)
      if (dist < nearestDist) {
        nearestDist = dist
        nearest = wall
      }
    }
    return nearest
  }

  private findEndpointNear(point: { x: number; y: number }): EndpointHit | null {
    let nearest: EndpointHit | null = null
    let nearestDist = this.toleranceCells(ENDPOINT_HIT_RADIUS_PX)
    for (const wall of this.walls) {
      const dStart = Math.hypot(point.x - wall.x1, point.y - wall.y1)
      if (dStart < nearestDist) {
        nearestDist = dStart
        nearest = { wall, which: 'start' }
      }
      const dEnd = Math.hypot(point.x - wall.x2, point.y - wall.y2)
      if (dEnd < nearestDist) {
        nearestDist = dEnd
        nearest = { wall, which: 'end' }
      }
    }
    return nearest
  }

  private handlePointerDown = (event: FederatedPointerEvent) => {
    if (!this.active || !this.callbacks || event.button !== 0) return
    const point = this.toGridPoint(event)

    if (event.shiftKey) {
      const hit = this.findWallNear(point)
      if (hit) this.callbacks.onDeleteWall(hit.id)
      return
    }

    // Every commit decision (including "was this a click or a drag") is
    // made in handlePointerUp/handlePointerMove instead of here — this just
    // remembers where the current press started, and — if it landed near an
    // existing endpoint — which one, in case the gesture turns into a drag.
    this.downPoint = point
    if (!this.pendingStart) {
      this.draggingEndpoint = this.findEndpointNear(point)
      this.endpointDragConfirmed = false
      this.lastWriteAt = 0
    }
  }

  private handleRightDown = (event: FederatedPointerEvent) => {
    event.preventDefault()
    this.pendingStart = null
    this.downPoint = null
    this.previewGraphics.clear()
  }

  private handlePointerMove = (event: FederatedPointerEvent) => {
    if (!this.active) return

    if (this.draggingEndpoint) {
      if (!this.endpointDragConfirmed) {
        if (!this.downPoint) return
        const probe = this.toGridPoint(event, this.draggingEndpoint)
        const dragDistancePx = Math.hypot(probe.x - this.downPoint.x, probe.y - this.downPoint.y) * this.gridSizePx * this.viewScale
        if (dragDistancePx < DRAG_COMMIT_THRESHOLD_PX) return
        this.endpointDragConfirmed = true
        this.lastWriteAt = 0
      }
      if (!this.callbacks) return
      const now = performance.now()
      if (now - this.lastWriteAt < DRAG_WRITE_INTERVAL_MS) return
      this.lastWriteAt = now
      const point = this.toGridPoint(event, this.draggingEndpoint)
      this.callbacks.onUpdateWallEndpoint(this.draggingEndpoint.wall.id, this.draggingEndpoint.which, point.x, point.y)
      return
    }

    // Preview from the last committed chain point while just hovering
    // (pendingStart), or from wherever the current press started if one's
    // in progress and hasn't resolved into a commit yet (downPoint).
    const anchor = this.pendingStart ?? this.downPoint
    if (!anchor) return
    const point = this.toGridPoint(event)
    this.previewGraphics.clear()
    this.previewGraphics
      .moveTo(anchor.x * this.gridSizePx, anchor.y * this.gridSizePx)
      .lineTo(point.x * this.gridSizePx, point.y * this.gridSizePx)
      .stroke({ width: this.thickness, color: 0xffffff, alpha: 0.6 })
  }

  private handlePointerUp = (event: FederatedPointerEvent) => {
    if (this.draggingEndpoint) {
      const endpointHit = this.draggingEndpoint
      const wasConfirmedDrag = this.endpointDragConfirmed
      this.draggingEndpoint = null
      this.endpointDragConfirmed = false
      this.downPoint = null
      if (!this.callbacks) return
      if (wasConfirmedDrag) {
        // Always land on the exact release position, even if the last move tick was throttled away.
        const point = this.toGridPoint(event, endpointHit)
        this.callbacks.onUpdateWallEndpoint(endpointHit.wall.id, endpointHit.which, point.x, point.y)
        return
      }
      // The press landed near this endpoint but never actually dragged it —
      // a stationary click here almost always means "start a new wall from
      // this corner," not "re-write this endpoint to virtually the same
      // spot and do nothing." Start a fresh chain from it instead; magnet-
      // snap (built into toGridPoint) lands pendingStart exactly on it so
      // the new wall connects with no gap.
      if (!this.active) return
      this.pendingStart = this.toGridPoint(event)
      return
    }

    if (!this.active || !this.callbacks || !this.downPoint) return
    const point = this.toGridPoint(event)
    const downPoint = this.downPoint
    this.downPoint = null

    if (this.pendingStart) {
      // Continuing an existing chain: committing (and where the previous
      // handlePointerDown-based version fired the commit) used to happen on
      // *this same click's* pointerdown, which could kick off a React
      // re-render (new wall -> Yjs observer -> setState) whose effects
      // rebuild this layer's hitPlane geometry while the click's own button
      // was still physically down — an unreliable position for a hit-test
      // target to change under. Committing here instead means the whole
      // down-then-up gesture has already finished by the time anything
      // downstream can react to it. Every chain-continuation click commits
      // unconditionally, regardless of how far the pointer drifted between
      // its own down and up — unlike the chain's first point (below),
      // there's no "was this a click or a drag" ambiguity once a chain is
      // already open.
      this.callbacks.onCreateWall(this.pendingStart.x, this.pendingStart.y, point.x, point.y, this.thickness, this.doorMode)
      this.pendingStart = point
      this.previewGraphics.clear()
      return
    }

    // No chain yet. A stationary click just starts one (leaves pendingStart
    // open for the next click) — unless it landed on an existing door, in
    // which case it toggles that door open/closed instead; a click-and-drag
    // draws one wall immediately and ends there, since real mouse use
    // rarely lands perfectly still.
    const dragDistancePx = Math.hypot(point.x - downPoint.x, point.y - downPoint.y) * this.gridSizePx * this.viewScale
    if (dragDistancePx < DRAG_COMMIT_THRESHOLD_PX) {
      const doorHit = this.findWallNear(downPoint)
      if (doorHit?.isDoor) {
        this.callbacks.onToggleDoor(doorHit.id, !doorHit.open)
        return
      }
      this.pendingStart = downPoint
      return
    }
    this.callbacks.onCreateWall(downPoint.x, downPoint.y, point.x, point.y, this.thickness, this.doorMode)
    this.previewGraphics.clear()
  }

  destroy(): void {
    this.container.destroy({ children: true })
  }
}
