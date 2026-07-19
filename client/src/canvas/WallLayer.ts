import { Container, Graphics, type FederatedPointerEvent } from 'pixi.js'
import { distanceToSegment } from '../map/visibility'
import type { WallRecord } from '../map/types'

/** Grid-cell-space hit tolerance for shift-click-to-delete. Not pegged to an
 * exact screen-pixel size (WallLayer doesn't track the world's zoom scale),
 * just a reasonable tap target at typical grid sizes. */
const DELETE_HIT_TOLERANCE_CELLS = 0.15

export interface WallLayerCallbacks {
  onCreateWall: (x1: number, y1: number, x2: number, y2: number) => void
  onDeleteWall: (wallId: string) => void
}

/**
 * DM-only: renders existing walls as lines, and — when active — supports
 * click-chain drawing. Click once to start a chain, click again to commit a
 * segment from the last point to the new one and continue the chain from
 * there, right-click to end the chain without starting a new segment.
 * Shift-click an existing wall to delete it.
 */
export class WallLayer {
  readonly container = new Container()
  private readonly wallsGraphics = new Graphics()
  private readonly previewGraphics = new Graphics()
  private readonly hitPlane = new Graphics()

  private active = false
  private gridSizePx = 1
  private walls: WallRecord[] = []
  private callbacks: WallLayerCallbacks | null = null
  private pendingStart: { x: number; y: number } | null = null

  constructor() {
    this.container.addChild(this.hitPlane, this.wallsGraphics, this.previewGraphics)
    this.hitPlane.eventMode = 'none'
    this.hitPlane.on('pointertap', this.handleTap)
    this.hitPlane.on('rightdown', this.handleRightDown)
    this.hitPlane.on('globalpointermove', this.handlePointerMove)
  }

  update(
    walls: WallRecord[],
    gridSizePx: number,
    mapSize: { width: number; height: number } | null,
    active: boolean,
    callbacks: WallLayerCallbacks,
  ): void {
    this.walls = walls
    this.gridSizePx = gridSizePx
    this.callbacks = callbacks

    if (this.active !== active) {
      this.pendingStart = null
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
    for (const wall of this.walls) {
      this.wallsGraphics.moveTo(wall.x1 * this.gridSizePx, wall.y1 * this.gridSizePx)
      this.wallsGraphics.lineTo(wall.x2 * this.gridSizePx, wall.y2 * this.gridSizePx)
    }
    if (this.walls.length > 0) {
      this.wallsGraphics.stroke({ width: 3, color: 0xff4444, alpha: 0.9 })
    }
    // Endpoint dots as a second pass so they sit on top of the lines.
    for (const wall of this.walls) {
      this.wallsGraphics.circle(wall.x1 * this.gridSizePx, wall.y1 * this.gridSizePx, 4).fill({ color: 0xff4444 })
      this.wallsGraphics.circle(wall.x2 * this.gridSizePx, wall.y2 * this.gridSizePx, 4).fill({ color: 0xff4444 })
    }
  }

  private toGridPoint(event: FederatedPointerEvent): { x: number; y: number } {
    const local = event.getLocalPosition(this.container)
    return { x: local.x / this.gridSizePx, y: local.y / this.gridSizePx }
  }

  private handleTap = (event: FederatedPointerEvent) => {
    if (!this.active || !this.callbacks) return
    const point = this.toGridPoint(event)

    if (event.shiftKey) {
      const hit = this.findWallNear(point)
      if (hit) {
        this.callbacks.onDeleteWall(hit.id)
        return
      }
    }

    if (this.pendingStart) {
      this.callbacks.onCreateWall(this.pendingStart.x, this.pendingStart.y, point.x, point.y)
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
    if (!this.active || !this.pendingStart) return
    const point = this.toGridPoint(event)
    this.previewGraphics.clear()
    this.previewGraphics
      .moveTo(this.pendingStart.x * this.gridSizePx, this.pendingStart.y * this.gridSizePx)
      .lineTo(point.x * this.gridSizePx, point.y * this.gridSizePx)
      .stroke({ width: 2, color: 0xffffff, alpha: 0.6 })
  }

  private findWallNear(point: { x: number; y: number }): WallRecord | null {
    let nearest: WallRecord | null = null
    let nearestDist = DELETE_HIT_TOLERANCE_CELLS
    for (const wall of this.walls) {
      const dist = distanceToSegment(point, wall)
      if (dist < nearestDist) {
        nearestDist = dist
        nearest = wall
      }
    }
    return nearest
  }

  destroy(): void {
    this.container.destroy({ children: true })
  }
}
