import { Container, Graphics, Text } from 'pixi.js'

export type MeasureShape = 'line' | 'circle' | 'cone'

/** Feet per grid square — the standard 5e convention, same one implied
 * everywhere else distance already matters in this app (light/vision radii
 * are in grid cells, not feet, but this is the first place an actual feet
 * readout is shown to the user). */
const FEET_PER_CELL = 5

/**
 * Renders a live measuring preview — a ruler line, or a circle/cone AoE
 * template — from an origin point to wherever the pointer currently is.
 * Pure renderer, no interactivity of its own: the gesture that drives it
 * (Ctrl-drag for a line, Ctrl+Shift-drag for a circle, Ctrl+Alt-drag for a
 * cone) lives in MapCanvas.tsx's existing app.stage-level pointer handlers,
 * same reasoning as AnnotationLayer's shift-drag — it's not hit-tested
 * against anything, just "wherever the cursor is," and works identically
 * for the DM and players since it isn't gated by the DM-only `toolMode`
 * system at all. Deliberately not persisted to the Yjs doc — this is a
 * personal, ephemeral aid each viewer sees only on their own screen, not a
 * shared drawing like annotations.
 */
export class MeasureLayer {
  readonly container = new Container()
  private readonly graphics = new Graphics()
  private readonly label = new Text({ text: '', style: { fontSize: 14, fill: 0xffffff, fontFamily: 'sans-serif' } })
  private gridSizePx = 1

  constructor() {
    this.container.addChild(this.graphics, this.label)
    this.label.visible = false
  }

  setGridSizePx(gridSizePx: number): void {
    this.gridSizePx = gridSizePx > 0 ? gridSizePx : 1
  }

  /** `origin`/`current` are in grid-cell units. Pass null to clear. */
  setPreview(shape: MeasureShape, origin: { x: number; y: number } | null, current: { x: number; y: number } | null): void {
    this.graphics.clear()
    if (!origin || !current) {
      this.label.visible = false
      return
    }

    const ox = origin.x * this.gridSizePx
    const oy = origin.y * this.gridSizePx
    const cx = current.x * this.gridSizePx
    const cy = current.y * this.gridSizePx
    const distanceCells = Math.hypot(current.x - origin.x, current.y - origin.y)
    const feet = Math.round(distanceCells * FEET_PER_CELL)

    if (shape === 'line') {
      this.graphics.moveTo(ox, oy).lineTo(cx, cy).stroke({ width: 3, color: 0xffee66, alpha: 0.85, cap: 'round' })
      this.graphics.circle(ox, oy, 4).fill({ color: 0xffee66 })
      this.label.text = `${feet} ft`
    } else if (shape === 'circle') {
      const radiusPx = Math.hypot(cx - ox, cy - oy)
      this.graphics.circle(ox, oy, radiusPx).fill({ color: 0xffee66, alpha: 0.2 }).stroke({ width: 2, color: 0xffee66, alpha: 0.85 })
      this.label.text = `${feet} ft radius`
    } else {
      // 5e cone: a 90-degree wedge from origin, pointing toward `current`,
      // with length = the drag distance.
      const lengthPx = Math.hypot(cx - ox, cy - oy)
      if (lengthPx > 0) {
        const angle = Math.atan2(cy - oy, cx - ox)
        const spread = Math.PI / 4 // ±45° = 90° total
        const p1 = { x: ox + lengthPx * Math.cos(angle - spread), y: oy + lengthPx * Math.sin(angle - spread) }
        const p2 = { x: ox + lengthPx * Math.cos(angle + spread), y: oy + lengthPx * Math.sin(angle + spread) }
        this.graphics
          .moveTo(ox, oy)
          .lineTo(p1.x, p1.y)
          .lineTo(p2.x, p2.y)
          .closePath()
          .fill({ color: 0xffee66, alpha: 0.2 })
          .stroke({ width: 2, color: 0xffee66, alpha: 0.85 })
      }
      this.label.text = `${feet} ft`
    }

    this.label.position.set(cx + 10, cy + 10)
    this.label.visible = true
  }

  destroy(): void {
    this.container.destroy({ children: true })
  }
}
