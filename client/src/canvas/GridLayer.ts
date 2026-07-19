import { Container, Graphics } from 'pixi.js'
import type { GridType } from '../map/types'

export interface GridConfig {
  gridSizePx: number
  gridOffsetX: number
  gridOffsetY: number
  gridVisible: boolean
  gridType: GridType
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

    if (config.gridType === 'hex') {
      this.drawHexGrid(config)
    } else {
      this.drawSquareGrid(config)
    }
    this.graphics.stroke({ width: 1, color: 0xffffff, alpha: 0.35 })
  }

  private drawSquareGrid(config: GridConfig): void {
    const { gridSizePx, gridOffsetX, gridOffsetY, width, height } = config
    const startX = ((gridOffsetX % gridSizePx) + gridSizePx) % gridSizePx
    const startY = ((gridOffsetY % gridSizePx) + gridSizePx) % gridSizePx

    for (let x = startX; x <= width; x += gridSizePx) {
      this.graphics.moveTo(x, 0).lineTo(x, height)
    }
    for (let y = startY; y <= height; y += gridSizePx) {
      this.graphics.moveTo(0, y).lineTo(width, y)
    }
  }

  /** Pointy-top hex tiling. `gridSizePx` is treated as the hex's point-to-point
   * (vertical) diameter — a purely visual grid style; token/wall/light
   * coordinates stay in the same continuous grid-cell unit space either way. */
  private drawHexGrid(config: GridConfig): void {
    const { gridSizePx, gridOffsetX, gridOffsetY, width, height } = config
    const radius = gridSizePx / 2
    const hexWidth = Math.sqrt(3) * radius
    const vertSpacing = radius * 1.5

    const offsetX = ((gridOffsetX % hexWidth) + hexWidth) % hexWidth
    const offsetY = ((gridOffsetY % vertSpacing) + vertSpacing) % vertSpacing

    const firstRow = Math.floor(-offsetY / vertSpacing) - 1
    const lastRow = Math.ceil((height - offsetY) / vertSpacing) + 1

    for (let row = firstRow; row <= lastRow; row++) {
      const cy = row * vertSpacing + offsetY
      const rowOffsetX = row % 2 !== 0 ? hexWidth / 2 : 0
      const firstCol = Math.floor((-offsetX - rowOffsetX) / hexWidth) - 1
      const lastCol = Math.ceil((width - offsetX - rowOffsetX) / hexWidth) + 1
      for (let col = firstCol; col <= lastCol; col++) {
        const cx = col * hexWidth + rowOffsetX + offsetX
        this.drawHexAt(cx, cy, radius)
      }
    }
  }

  private drawHexAt(cx: number, cy: number, radius: number): void {
    for (let i = 0; i < 6; i++) {
      const angle = (Math.PI / 180) * (60 * i - 90)
      const px = cx + radius * Math.cos(angle)
      const py = cy + radius * Math.sin(angle)
      if (i === 0) this.graphics.moveTo(px, py)
      else this.graphics.lineTo(px, py)
    }
    this.graphics.closePath()
  }

  destroy(): void {
    this.container.destroy({ children: true })
  }
}
