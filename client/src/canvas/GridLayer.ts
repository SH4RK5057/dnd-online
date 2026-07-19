import { Container, Graphics } from 'pixi.js'

export interface GridConfig {
  gridSizePx: number
  gridOffsetX: number
  gridOffsetY: number
  gridVisible: boolean
  width: number
  height: number
}

export class GridLayer {
  readonly container = new Container()
  private readonly graphics = new Graphics()

  constructor() {
    this.container.addChild(this.graphics)
  }

  update(config: GridConfig): void {
    this.graphics.clear()
    if (!config.gridVisible || config.gridSizePx <= 0 || config.width <= 0 || config.height <= 0) return

    const { gridSizePx, gridOffsetX, gridOffsetY, width, height } = config
    const startX = ((gridOffsetX % gridSizePx) + gridSizePx) % gridSizePx
    const startY = ((gridOffsetY % gridSizePx) + gridSizePx) % gridSizePx

    for (let x = startX; x <= width; x += gridSizePx) {
      this.graphics.moveTo(x, 0).lineTo(x, height)
    }
    for (let y = startY; y <= height; y += gridSizePx) {
      this.graphics.moveTo(0, y).lineTo(width, y)
    }
    this.graphics.stroke({ width: 1, color: 0xffffff, alpha: 0.35 })
  }

  destroy(): void {
    this.container.destroy({ children: true })
  }
}
