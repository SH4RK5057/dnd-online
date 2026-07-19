import { Container, Graphics, type FederatedPointerEvent } from 'pixi.js'
import type { LightRecord, TokenRecord } from '../map/types'

/** Grid-cell-space hit tolerance for grabbing/deleting an existing light. */
const HIT_TOLERANCE_CELLS = 0.4
const DRAG_WRITE_INTERVAL_MS = 75

export interface LightLayerCallbacks {
  onCreateLight: (x: number, y: number) => void
  onMoveLight: (lightId: string, x: number, y: number) => void
  onDetachLight: (lightId: string) => void
  onDeleteLight: (lightId: string) => void
}

/**
 * DM-only: renders lights as a small dot plus a translucent ring showing
 * their radius. When active, click empty space to place a new light,
 * drag an existing one to move it (dragging an attached light detaches it
 * first, since its position would otherwise keep following the token and
 * ignore the drag), shift-click to delete.
 */
export class LightLayer {
  readonly container = new Container()
  private readonly lightsGraphics = new Graphics()
  private readonly hitPlane = new Graphics()

  private active = false
  private gridSizePx = 1
  private lights: LightRecord[] = []
  private tokensById = new Map<string, TokenRecord>()
  private callbacks: LightLayerCallbacks | null = null
  private draggingLightId: string | null = null
  private dragOffset = { x: 0, y: 0 }
  private lastWriteAt = 0

  constructor() {
    this.container.addChild(this.hitPlane, this.lightsGraphics)
    this.hitPlane.eventMode = 'none'
    this.hitPlane.on('pointerdown', this.handlePointerDown)
    this.hitPlane.on('globalpointermove', this.handlePointerMove)
    this.hitPlane.on('pointerup', this.handlePointerUp)
    this.hitPlane.on('pointerupoutside', this.handlePointerUp)
  }

  update(
    lights: LightRecord[],
    tokens: TokenRecord[],
    gridSizePx: number,
    mapSize: { width: number; height: number } | null,
    active: boolean,
    callbacks: LightLayerCallbacks,
  ): void {
    this.lights = lights
    this.tokensById = new Map(tokens.map((t) => [t.id, t]))
    this.gridSizePx = gridSizePx
    this.callbacks = callbacks
    this.active = active

    this.hitPlane.clear()
    this.hitPlane.eventMode = active && mapSize ? 'static' : 'none'
    if (active && mapSize) {
      this.hitPlane.rect(0, 0, mapSize.width, mapSize.height).fill({ color: 0x000000, alpha: 0.001 })
    }

    this.redraw()
  }

  private resolvePosition(light: LightRecord): { x: number; y: number } {
    if (light.attachedTokenId) {
      const token = this.tokensById.get(light.attachedTokenId)
      if (token) return { x: token.x, y: token.y }
    }
    return { x: light.x, y: light.y }
  }

  private redraw(): void {
    this.lightsGraphics.clear()
    for (const light of this.lights) {
      const pos = this.resolvePosition(light)
      const px = pos.x * this.gridSizePx
      const py = pos.y * this.gridSizePx
      const radiusPx = light.radius * this.gridSizePx
      this.lightsGraphics
        .circle(px, py, radiusPx)
        .fill({ color: light.color, alpha: 0.1 })
        .stroke({ width: 1, color: light.color, alpha: 0.5 })
      this.lightsGraphics.circle(px, py, 5).fill({ color: light.color, alpha: light.enabled ? 1 : 0.3 })
    }
  }

  private toGridPoint(event: FederatedPointerEvent): { x: number; y: number } {
    const local = event.getLocalPosition(this.container)
    return { x: local.x / this.gridSizePx, y: local.y / this.gridSizePx }
  }

  private findLightNear(point: { x: number; y: number }): LightRecord | null {
    let nearest: LightRecord | null = null
    let nearestDist = HIT_TOLERANCE_CELLS
    for (const light of this.lights) {
      const pos = this.resolvePosition(light)
      const dist = Math.hypot(point.x - pos.x, point.y - pos.y)
      if (dist < nearestDist) {
        nearestDist = dist
        nearest = light
      }
    }
    return nearest
  }

  private handlePointerDown = (event: FederatedPointerEvent) => {
    if (!this.active || !this.callbacks) return
    const point = this.toGridPoint(event)
    const hit = this.findLightNear(point)

    if (event.shiftKey) {
      if (hit) this.callbacks.onDeleteLight(hit.id)
      return
    }

    if (hit) {
      if (hit.attachedTokenId) this.callbacks.onDetachLight(hit.id)
      const pos = this.resolvePosition(hit)
      this.draggingLightId = hit.id
      this.dragOffset = { x: point.x - pos.x, y: point.y - pos.y }
      this.lastWriteAt = 0
    } else {
      this.callbacks.onCreateLight(point.x, point.y)
    }
  }

  private handlePointerMove = (event: FederatedPointerEvent) => {
    if (!this.active || !this.draggingLightId || !this.callbacks) return
    const now = performance.now()
    if (now - this.lastWriteAt < DRAG_WRITE_INTERVAL_MS) return
    this.lastWriteAt = now
    const point = this.toGridPoint(event)
    this.callbacks.onMoveLight(this.draggingLightId, point.x - this.dragOffset.x, point.y - this.dragOffset.y)
  }

  private handlePointerUp = (event: FederatedPointerEvent) => {
    if (!this.draggingLightId || !this.callbacks) {
      this.draggingLightId = null
      return
    }
    // Always land on the exact release position, even if the last move tick was throttled away.
    const point = this.toGridPoint(event)
    this.callbacks.onMoveLight(this.draggingLightId, point.x - this.dragOffset.x, point.y - this.dragOffset.y)
    this.draggingLightId = null
  }

  destroy(): void {
    this.container.destroy({ children: true })
  }
}
