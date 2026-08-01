import type { GridType } from '../map/types'

/** Grid-line drawing for the 3D flat-plane view's baked-in plane texture —
 * Three.js has no live vector-graphics layer to draw into the scene the way
 * Pixi's GridLayer does, so this renders the same lines onto a 2D canvas
 * instead, in grid-cell-unit space (mirrors canvas/hexGrid.ts's convention:
 * `pxPerCell` is this texture's own internal resolution, chosen independent
 * of the scene's real `gridSizePx`, which can be arbitrarily small or huge). */
export interface GridLinesConfig {
  widthCells: number
  heightCells: number
  /** Internal texture resolution, in canvas px per grid cell. */
  pxPerCell: number
  /** Grid offset, in grid cells (already divided by the scene's gridSizePx —
   * see canvas/GridLayer.ts, whose pixel-space offset this must match). */
  offsetXCells: number
  offsetYCells: number
  gridType: GridType
}

/** Mirrors GridLayer.drawSquareGrid, in cell-unit space instead of pixels. */
function drawSquareGrid(ctx: CanvasRenderingContext2D, config: GridLinesConfig): void {
  const { widthCells, heightCells, pxPerCell, offsetXCells, offsetYCells } = config
  const width = widthCells * pxPerCell
  const height = heightCells * pxPerCell
  const startXCells = ((offsetXCells % 1) + 1) % 1
  const startYCells = ((offsetYCells % 1) + 1) % 1

  ctx.beginPath()
  for (let xCells = startXCells; xCells <= widthCells; xCells += 1) {
    const x = xCells * pxPerCell
    ctx.moveTo(x, 0)
    ctx.lineTo(x, height)
  }
  for (let yCells = startYCells; yCells <= heightCells; yCells += 1) {
    const y = yCells * pxPerCell
    ctx.moveTo(0, y)
    ctx.lineTo(width, y)
  }
  ctx.stroke()
}

/** Ratios mirror GridLayer.drawHexGrid's pixel-space constants exactly (see
 * canvas/hexGrid.ts's identical reasoning) so the 3D grid lines up with the
 * 2D one. Pointy-top hex tiling. */
function drawHexGrid(ctx: CanvasRenderingContext2D, config: GridLinesConfig): void {
  const { widthCells, heightCells, pxPerCell, offsetXCells, offsetYCells } = config
  const radiusCells = 0.5
  const hexWidthCells = Math.sqrt(3) * radiusCells
  const vertSpacingCells = radiusCells * 1.5

  const offX = ((offsetXCells % hexWidthCells) + hexWidthCells) % hexWidthCells
  const offY = ((offsetYCells % vertSpacingCells) + vertSpacingCells) % vertSpacingCells

  const firstRow = Math.floor(-offY / vertSpacingCells) - 1
  const lastRow = Math.ceil((heightCells - offY) / vertSpacingCells) + 1

  ctx.beginPath()
  for (let row = firstRow; row <= lastRow; row++) {
    const cyCells = row * vertSpacingCells + offY
    const rowOffsetXCells = row % 2 !== 0 ? hexWidthCells / 2 : 0
    const firstCol = Math.floor((-offX - rowOffsetXCells) / hexWidthCells) - 1
    const lastCol = Math.ceil((widthCells - offX - rowOffsetXCells) / hexWidthCells) + 1
    for (let col = firstCol; col <= lastCol; col++) {
      const cxCells = col * hexWidthCells + rowOffsetXCells + offX
      drawHexAt(ctx, cxCells * pxPerCell, cyCells * pxPerCell, radiusCells * pxPerCell)
    }
  }
  ctx.stroke()
}

function drawHexAt(ctx: CanvasRenderingContext2D, cx: number, cy: number, radius: number): void {
  for (let i = 0; i < 6; i++) {
    const angle = (Math.PI / 180) * (60 * i - 90)
    const px = cx + radius * Math.cos(angle)
    const py = cy + radius * Math.sin(angle)
    if (i === 0) ctx.moveTo(px, py)
    else ctx.lineTo(px, py)
  }
  ctx.closePath()
}

/** Draws grid lines directly onto an existing canvas context — the caller
 * (canvas3d/Scene3D.tsx) owns the canvas itself so it can layer this on top
 * of a map image (or a bare background fill) before uploading the result as
 * a single texture. No-ops if the grid is hidden or degenerate. */
export function drawGridLines(ctx: CanvasRenderingContext2D, config: GridLinesConfig): void {
  if (config.pxPerCell <= 0 || config.widthCells <= 0 || config.heightCells <= 0) return
  ctx.save()
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.35)'
  ctx.lineWidth = 1
  if (config.gridType === 'hex') drawHexGrid(ctx, config)
  else drawSquareGrid(ctx, config)
  ctx.restore()
}
