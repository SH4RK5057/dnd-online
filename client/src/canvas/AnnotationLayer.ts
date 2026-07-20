import { Container, Graphics } from 'pixi.js'
import type { AnnotationRecord, Point } from '../map/annotationTypes'

/** Renders freehand map annotations (map/useAnnotations.ts) plus a live
 * preview of whatever stroke is currently being drawn. Pure renderer, no
 * interactivity of its own — the shift-drag gesture that drives it lives in
 * MapCanvas.tsx's existing app.stage-level pointer handlers (see that
 * file's doc comment for why: layering another hitPlane on top would steal
 * clicks meant for walls/lights/tokens/panning underneath it, since Pixi
 * hit-testing picks exactly one topmost target rather than falling through
 * to what's beneath when a handler declines to act). */
export class AnnotationLayer {
  readonly container = new Container()
  private readonly committedGraphics = new Graphics()
  private readonly previewGraphics = new Graphics()
  private gridSizePx = 1

  constructor() {
    this.container.addChild(this.committedGraphics, this.previewGraphics)
  }

  update(annotations: AnnotationRecord[], gridSizePx: number): void {
    this.gridSizePx = gridSizePx
    this.committedGraphics.clear()
    for (const annotation of annotations) {
      this.drawStroke(this.committedGraphics, annotation.points, annotation.color, 0.85)
    }
  }

  setPreview(points: Point[], color: number): void {
    this.previewGraphics.clear()
    this.drawStroke(this.previewGraphics, points, color, 0.55)
  }

  private drawStroke(graphics: Graphics, points: Point[], color: number, alpha: number): void {
    if (points.length < 2) return
    graphics.moveTo(points[0].x * this.gridSizePx, points[0].y * this.gridSizePx)
    for (const point of points.slice(1)) graphics.lineTo(point.x * this.gridSizePx, point.y * this.gridSizePx)
    graphics.stroke({ width: 3, color, alpha, cap: 'round', join: 'round' })
  }

  destroy(): void {
    this.container.destroy({ children: true })
  }
}
