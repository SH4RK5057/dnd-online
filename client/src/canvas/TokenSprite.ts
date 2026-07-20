import { Container, Graphics, Sprite, Text, type FederatedPointerEvent, type Texture } from 'pixi.js'
import { footprintCells, renderScale } from '../map/sizeCategory'
import type { SizeCategory } from '../map/types'

export interface TokenSpriteCallbacks {
  /** Called at most every DRAG_WRITE_INTERVAL_MS while dragging, grid-cell coords. */
  onDragMove: (gridX: number, gridY: number) => void
  /** Always called once, unthrottled, when the drag ends — guarantees the doc
   * converges to the true final position even if the last throttled tick was skipped. */
  onDragEnd: (gridX: number, gridY: number) => void
  /** A plain click (pointer barely moved between down and up) — separate
   * from drag so clicking a non-draggable token (someone else's, or while
   * not in Move mode) still lets any viewer select it to inspect HP/conditions. */
  onSelect: () => void
}

export interface TokenInteractionFlags {
  draggable: boolean
  /** Whether a plain click fires onSelect at all — true whenever the token
   * layer is mounted, effectively "can this viewer click any token." */
  selectable: boolean
}

/** Below this local (pre-camera-zoom) pixel movement between pointerdown and
 * pointerup, a gesture counts as a click, not a drag — tokens are a much
 * larger, more forgiving target than e.g. a wall endpoint, so a simple
 * fixed threshold (not zoom-scaled) is good enough here. */
const CLICK_MOVE_THRESHOLD_PX = 8
const DRAG_WRITE_INTERVAL_MS = 75
const HP_BAR_HEIGHT_PX = 5
const HP_BAR_GAP_PX = 3

/** Renders one token: art or a placeholder square, an HP bar (if HP data is
 * known), condition dots, a selection outline, and a name label. Drag is
 * fully local/visual (smooth at any frame rate); position writes back to the
 * shared doc go through the throttled/final callbacks above. */
export class TokenSprite {
  readonly container = new Container()
  private readonly art = new Sprite()
  private readonly placeholder = new Graphics()
  private readonly selectionRing = new Graphics()
  private readonly hpBar = new Graphics()
  private readonly conditionDots = new Graphics()
  private readonly label = new Text({ text: '', style: { fontSize: 12, fill: 0xffffff, fontFamily: 'sans-serif' } })

  private readonly callbacks: TokenSpriteCallbacks
  private readonly draggable: boolean
  private gridSizePx = 1
  private dragging = false
  private dragPointerOffset = { x: 0, y: 0 }
  private pointerDownLocal: { x: number; y: number } | null = null
  private lastWriteAt = 0

  constructor(interactive: TokenInteractionFlags, callbacks: TokenSpriteCallbacks) {
    this.callbacks = callbacks
    this.draggable = interactive.draggable
    this.art.visible = false
    this.label.anchor.set(0.5, 0)
    this.container.addChild(this.selectionRing, this.placeholder, this.art, this.hpBar, this.conditionDots, this.label)

    if (interactive.draggable || interactive.selectable) {
      this.container.eventMode = 'static'
      this.container.cursor = interactive.draggable ? 'grab' : 'pointer'
      this.container.on('pointerdown', this.handlePointerDown)
      this.container.on('globalpointermove', this.handlePointerMove)
      this.container.on('pointerup', this.handlePointerUp)
      this.container.on('pointerupoutside', this.handlePointerUp)
    }
  }

  update(options: {
    name: string
    sizeCategory: SizeCategory
    gridX: number
    gridY: number
    gridSizePx: number
    texture: Texture | null
    hp: { current: number; max: number; temp: number } | null
    conditions: string[]
    selected: boolean
  }): void {
    const { name, sizeCategory, gridX, gridY, gridSizePx, texture, hp, conditions, selected } = options
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

    this.selectionRing.clear()
    if (selected) {
      this.selectionRing.rect(inset - 3, inset - 3, side + 6, side + 6).stroke({ width: 3, color: 0xffd54a, alpha: 0.95 })
    }

    this.hpBar.clear()
    if (hp) {
      const barY = inset - HP_BAR_GAP_PX - HP_BAR_HEIGHT_PX
      const ratio = hp.max > 0 ? Math.max(0, Math.min(1, hp.current / hp.max)) : 0
      const fillColor = ratio > 0.5 ? 0x3fbf5f : ratio > 0.25 ? 0xe0a72e : 0xd1273d
      this.hpBar.rect(inset, barY, side, HP_BAR_HEIGHT_PX).fill({ color: 0x1a1a1a, alpha: 0.8 })
      if (ratio > 0) this.hpBar.rect(inset, barY, side * ratio, HP_BAR_HEIGHT_PX).fill({ color: fillColor, alpha: 0.95 })
      if (hp.temp > 0) {
        const tempRatio = Math.min(1, hp.temp / Math.max(hp.max, 1))
        this.hpBar.rect(inset, barY, side * tempRatio, HP_BAR_HEIGHT_PX).stroke({ width: 1, color: 0x7ec8ff, alpha: 0.9 })
      }
    }

    this.conditionDots.clear()
    const dotRadius = 3
    const maxDots = 6
    const shown = conditions.slice(0, maxDots)
    shown.forEach((_condition, i) => {
      const cx = inset + dotRadius + i * (dotRadius * 2 + 2)
      const cy = footprint + HP_BAR_GAP_PX + dotRadius
      this.conditionDots.circle(cx, cy, dotRadius).fill({ color: 0xd1273d, alpha: 0.9 }).stroke({ width: 1, color: 0xffffff, alpha: 0.8 })
    })

    this.label.text = name
    this.label.position.set(footprint / 2, footprint + (conditions.length > 0 ? HP_BAR_GAP_PX * 2 + dotRadius * 2 : 2))

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
    const local = this.getLocalPointer(event)
    this.pointerDownLocal = local
    if (this.draggable) {
      this.dragging = true
      this.container.cursor = 'grabbing'
      this.dragPointerOffset = {
        x: local.x - this.container.position.x,
        y: local.y - this.container.position.y,
      }
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
    const local = this.getLocalPointer(event)
    const downLocal = this.pointerDownLocal
    this.pointerDownLocal = null
    const movedFar = downLocal ? Math.hypot(local.x - downLocal.x, local.y - downLocal.y) > CLICK_MOVE_THRESHOLD_PX : true

    if (this.dragging) {
      this.dragging = false
      this.container.cursor = 'grab'
      const x = local.x - this.dragPointerOffset.x
      const y = local.y - this.dragPointerOffset.y
      // Snap to the nearest whole grid cell on release — intermediate throttled
      // writes during the drag stay fractional for smooth remote-viewer motion.
      const gridX = Math.round(x / this.gridSizePx)
      const gridY = Math.round(y / this.gridSizePx)
      this.container.position.set(gridX * this.gridSizePx, gridY * this.gridSizePx)
      this.callbacks.onDragEnd(gridX, gridY)
    }

    if (!movedFar) this.callbacks.onSelect()
  }

  destroy(): void {
    this.container.destroy({ children: true })
  }
}
