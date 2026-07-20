/** Hex-grid snap math for wall drawing, in grid-cell-unit space (same space
 * as WallLayer's `raw` point — local pixels already divided by gridSizePx).
 * Ratios must mirror GridLayer.drawHexGrid's pixel-space constants exactly
 * (radius = gridSizePx/2, hexWidth = sqrt(3)*radius, vertSpacing = radius*1.5)
 * so snapped points land exactly on the rendered hex grid's corners —
 * gridSizePx cancels out entirely once working in cell-unit space, so these
 * are unitless ratios, not pixel values. Grid offset (gridOffsetX/Y) is
 * intentionally ignored, consistent with how square-grid snap already
 * ignores it. */
const HEX_RADIUS_CU = 0.5
const HEX_WIDTH_CU = Math.sqrt(3) * HEX_RADIUS_CU
const HEX_VERT_SPACING_CU = HEX_RADIUS_CU * 1.5

export interface Point {
  x: number
  y: number
}

function hexCenter(row: number, col: number): Point {
  const rowOffsetX = row % 2 !== 0 ? HEX_WIDTH_CU / 2 : 0
  return { x: col * HEX_WIDTH_CU + rowOffsetX, y: row * HEX_VERT_SPACING_CU }
}

/** Mirrors GridLayer.drawHexAt's angle formula exactly. */
function hexVertices(center: Point): Point[] {
  const vertices: Point[] = []
  for (let i = 0; i < 6; i++) {
    const angle = (Math.PI / 180) * (60 * i - 90)
    vertices.push({ x: center.x + HEX_RADIUS_CU * Math.cos(angle), y: center.y + HEX_RADIUS_CU * Math.sin(angle) })
  }
  return vertices
}

/** Square-grid snap targets corners/line-intersections (Math.round), which
 * is what makes wall-tracing follow the drawn grid lines — this is the hex
 * analogue: snaps to the nearest hex VERTEX, not the nearest hex center
 * (center-snapping would draw walls straight through hex interiors, not
 * along their visible edges). Checks a 3x3 neighborhood of candidate hex
 * centers (9 hexes, 54 vertices) around the approximate nearest one — a
 * search radius several times larger than any real snap distance can be,
 * given a hex's circumradius is 0.5 cell units and row spacing is 0.75. */
export function snapToHexGrid(point: Point): Point {
  const approxRow = Math.round(point.y / HEX_VERT_SPACING_CU)
  const approxCol = Math.round(point.x / HEX_WIDTH_CU)

  let nearest: Point = point
  let nearestDist = Infinity
  for (let row = approxRow - 1; row <= approxRow + 1; row++) {
    for (let col = approxCol - 1; col <= approxCol + 1; col++) {
      const center = hexCenter(row, col)
      for (const vertex of hexVertices(center)) {
        const d = Math.hypot(point.x - vertex.x, point.y - vertex.y)
        if (d < nearestDist) {
          nearestDist = d
          nearest = vertex
        }
      }
    }
  }
  return nearest
}
