import { Container, Graphics, Sprite, Text, type FederatedPointerEvent, type Texture } from 'pixi.js'
import { footprintCells, renderScale } from '../map/sizeCategory'
import type { SizeCategory } from '../map/types'

export interface TokenSpriteCallbacks {
  /** Called at most every DRAG_WRITE_INTERVAL_MS while dragging, grid-cell coords. */
  onDragMove: (gridX: number, gridY: number) => void
  /** Always called once, unthrottled, when the drag ends — guarantees the doc
   * converges to the true final position even if the last throttled tick was skipped. */
  onDragEnd: (gridX: number, gridY: number) => void
}

const DRAG_WRITE_INTERVAL_MS = 75

/** Renders one token: art or a placeholder square, plus a name label. Drag is
 * fully local/visual (smooth at any frame rate); position writes back to the
 * shared doc go through the throttled/final callbacks above. */
export class TokenSprite {
  readonly container = new Container()
  private readonly art = new Sprite()
  private readonly placeholder = new Graphics()
  private readonly label = new Text({ text: '', style: { fontSize: 12, fill: 0xffffff, fontFamily: 'sans-serif' } })

  private readonly callbacks: TokenSpriteCallbacks
  private gridSizePx = 1
  private dragging = false
  private dragPointerOffset = { x: 0, y: 0 }
  private lastWriteAt = 0

  constructor(draggable: boolean, callbacks: TokenSpriteCallbacks) {
    this.callbacks = callbacks
    this.art.visible = false
    this.label.anchor.set(0.5, 0)
    this.container.addChild(this.placeholder, this.art, this.label)

    if (draggable) {
      this.container.eventMode = 'static'
      this.container.cursor = 'grab'
      this.container.on('pointerdown', this.handlePointerDown)
      this.container.on('globalpointermove', this.handlePointerMove)
      this.container.on('pointerup', this.handlePointerUp)
      this.container.on('pointerupoutside', this.handlePointerUp)
    }
  }

  update(
    name: string,
    sizeCategory: SizeCategory,
    gridX: number,
    gridY: number,
    gridSizePx: number,
    texture: Texture | null,
  ): void {
    this.gridSizePx = gridSizePx
    const footprint = footprintCells(sizeCategory) * gridSizePx
    const side = footprint * renderScale(sizeCategory)
    const inset = (footprint - side) / 2

    this.placeholder.clear()
    if (texture) {
      this.art.texture = texture
      this.art.visible = true
      this.art.width = side
      this.art.height = side
      this.art.position.set(inset, inset)
    } else {
      this.art.visible = false
      this.placeholder
        .rect(inset, inset, side, side)
        .fill({ color: 0x6b6375, alpha: 0.7 })
        .stroke({ width: 2, color: 0xffffff, alpha: 0.85 })
    }

    this.label.text = name
    this.label.position.set(footprint / 2, footprint + 2)

    if (!this.dragging) {
      this.container.position.set(gridX * gridSizePx, gridY * gridSizePx)
    }
  }

  /** The sprite is always parented immediately after construction (TokenLayer
   * adds it to its container right away) and only receives pointer events
   * while mounted, so `parent` is guaranteed non-null here. */
  private getLocalPointer(event: FederatedPointerEvent): { x: number; y: number } {
    const parent = this.container.parent
    if (!parent) return { x: 0, y: 0 }
    return event.getLocalPosition(parent)
  }

  private handlePointerDown = (event: FederatedPointerEvent) => {
    this.dragging = true
    this.container.cursor = 'grabbing'
    const local = this.getLocalPointer(event)
    this.dragPointerOffset = {
      x: local.x - this.container.position.x,
      y: local.y - this.container.position.y,
    }
  }

  private handlePointerMove = (event: FederatedPointerEvent) => {
    if (!this.dragging) return
    const local = this.getLocalPointer(event)
    const x = local.x - this.dragPointerOffset.x
    const y = local.y - this.dragPointerOffset.y
    this.container.position.set(x, y)

    const now = performance.now()
    if (now - this.lastWriteAt >= DRAG_WRITE_INTERVAL_MS) {
      this.lastWriteAt = now
      this.callbacks.onDragMove(x / this.gridSizePx, y / this.gridSizePx)
    }
  }

  private handlePointerUp = (event: FederatedPointerEvent) => {
    if (!this.dragging) return
    this.dragging = false
    this.container.cursor = 'grab'
    const local = this.getLocalPointer(event)
    const x = local.x - this.dragPointerOffset.x
    const y = local.y - this.dragPointerOffset.y
    // Snap to the nearest whole grid cell on release — intermediate throttled
    // writes during the drag stay fractional for smooth remote-viewer motion.
    const gridX = Math.round(x / this.gridSizePx)
    const gridY = Math.round(y / this.gridSizePx)
    this.container.position.set(gridX * this.gridSizePx, gridY * this.gridSizePx)
    this.callbacks.onDragEnd(gridX, gridY)
  }

  destroy(): void {
    this.container.destroy({ children: true })
  }
}
