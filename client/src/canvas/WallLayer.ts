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
 * ends the chain) — see handlePointerUp. */
const DRAG_COMMIT_THRESHOLD_PX = 6
const DRAG_WRITE_INTERVAL_MS = 75
export const DEFAULT_WALL_THICKNESS_PX = 4

export interface WallLayerCallbacks {
  onCreateWall: (x1: number, y1: number, x2: number, y2: number, thickness: number) => void
  onUpdateWallEndpoint: (wallId: string, which: 'start' | 'end', x: number, y: number) => void
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
 * Shift-click an existing wall to delete it. Dragging an existing endpoint
 * (rather than empty space) moves that point instead of starting a chain.
 */
export class WallLayer {
  readonly container = new Container()
  private readonly wallsGraphics = new Graphics()
  private readonly previewGraphics = new Graphics()
  private readonly hitPlane = new Graphics()

  private active = false
  private gridSizePx = 1
  private snapToGrid = false
  private gridType: GridType = 'square'
  private viewScale = 1
  private thickness = DEFAULT_WALL_THICKNESS_PX
  private walls: WallRecord[] = []
  private callbacks: WallLayerCallbacks | null = null
  private pendingStart: { x: number; y: number } | null = null
  private draggingEndpoint: EndpointHit | null = null
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
    callbacks: WallLayerCallbacks,
  ): void {
    this.walls = walls
    this.gridSizePx = gridSizePx
    this.snapToGrid = snapToGrid
    this.gridType = gridType
    this.thickness = thickness
    this.callbacks = callbacks

    if (this.active !== active) {
      this.pendingStart = null
      this.draggingEndpoint = null
      this.previewGraphics.clear()
    }
    this.active = active

    this.hitPlane.clear()
    this.hitPlane.eventMode = active && mapSize ? 'static' : 'none'
    if (active && mapSize) {
      this.hitPlane.rect(0, 0, mapSize.width, mapSize.height).fill({ color: 0x000000, alpha: 0.001 })
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
      this.wallsGraphics
        .moveTo(wall.x1 * this.gridSizePx, wall.y1 * this.gridSizePx)
        .lineTo(wall.x2 * this.gridSizePx, wall.y2 * this.gridSizePx)
        .stroke({ width: wall.thickness ?? DEFAULT_WALL_THICKNESS_PX, color: 0xff4444, alpha: 0.9 })
    }
    // Endpoint dots as a second pass so they sit on top of the lines.
    for (const wall of this.walls) {
      this.wallsGraphics.circle(wall.x1 * this.gridSizePx, wall.y1 * this.gridSizePx, 4).fill({ color: 0xff4444 })
      this.wallsGraphics.circle(wall.x2 * this.gridSizePx, wall.y2 * this.gridSizePx, 4).fill({ color: 0xff4444 })
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

    if (!this.pendingStart) {
      const endpointHit = this.findEndpointNear(point)
      if (endpointHit) {
        this.draggingEndpoint = endpointHit
        this.lastWriteAt = 0
        return
      }
    }

    if (this.pendingStart) {
      this.callbacks.onCreateWall(this.pendingStart.x, this.pendingStart.y, point.x, point.y, this.thickness)
      this.pendingStart = point
    } else {
      this.pendingStart = point
    }
  }

  private handleRightDown = (event: FederatedPointerEvent) => {
    event.preventDefault()
    this.pendingStart = null
    this.previewGraphics.clear()
  }

  private handlePointerMove = (event: FederatedPointerEvent) => {
    if (!this.active) return

    if (this.draggingEndpoint && this.callbacks) {
      const now = performance.now()
      if (now - this.lastWriteAt < DRAG_WRITE_INTERVAL_MS) return
      this.lastWriteAt = now
      const point = this.toGridPoint(event, this.draggingEndpoint)
      this.callbacks.onUpdateWallEndpoint(this.draggingEndpoint.wall.id, this.draggingEndpoint.which, point.x, point.y)
      return
    }

    if (!this.pendingStart) return
    const point = this.toGridPoint(event)
    this.previewGraphics.clear()
    this.previewGraphics
      .moveTo(this.pendingStart.x * this.gridSizePx, this.pendingStart.y * this.gridSizePx)
      .lineTo(point.x * this.gridSizePx, point.y * this.gridSizePx)
      .stroke({ width: this.thickness, color: 0xffffff, alpha: 0.6 })
  }

  private handlePointerUp = (event: FederatedPointerEvent) => {
    if (this.draggingEndpoint && this.callbacks) {
      // Always land on the exact release position, even if the last move tick was throttled away.
      const point = this.toGridPoint(event, this.draggingEndpoint)
      this.callbacks.onUpdateWallEndpoint(this.draggingEndpoint.wall.id, this.draggingEndpoint.which, point.x, point.y)
      this.draggingEndpoint = null
      return
    }
    this.draggingEndpoint = null

    // Click-and-drag support: a chain segment's down click sets pendingStart
    // (see handlePointerDown) without creating anything yet, on the
    // assumption the user might be starting a multi-click chain. If instead
    // they drag a meaningful distance before releasing, that's a "draw one
    // wall" gesture — commit it here and end the chain. A release with
    // little/no movement is a stationary click, which leaves pendingStart
    // open so the next click can continue the chain, same as before.
    if (!this.active || !this.callbacks || !this.pendingStart) return
    const point = this.toGridPoint(event)
    const dragDistancePx = Math.hypot(point.x - this.pendingStart.x, point.y - this.pendingStart.y) * this.gridSizePx * this.viewScale
    if (dragDistancePx < DRAG_COMMIT_THRESHOLD_PX) return
    this.callbacks.onCreateWall(this.pendingStart.x, this.pendingStart.y, point.x, point.y, this.thickness)
    this.pendingStart = null
    this.previewGraphics.clear()
  }

  destroy(): void {
    this.container.destroy({ children: true })
  }
}
