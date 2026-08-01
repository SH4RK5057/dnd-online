import { SIZE_FOOTPRINT_CELLS, SIZE_RENDER_SCALE } from './constants'
import type { SizeCategory, TokenRecord } from './types'

/** World units per footprint-cell of standing-mini height in the 3D
 * flat-plane view (canvas3d/Scene3D.tsx) — tuned so a medium creature reads
 * as a believable tabletop mini relative to a 1-cell plane square, not so
 * tall it looks like a tower. Only used when a token has no explicit
 * modelHeightCells override (see resolveModelHeight). */
const AUTO_MODEL_HEIGHT_PER_FOOTPRINT_CELL = 0.85

/** Token's on-screen footprint in grid cells (width == height, tokens are square). */
export function footprintCells(size: SizeCategory): number {
  return SIZE_FOOTPRINT_CELLS[size]
}

/** Multiplier applied within the footprint box — e.g. tiny renders smaller, centered in 1 cell. */
export function renderScale(size: SizeCategory): number {
  return SIZE_RENDER_SCALE[size]
}

/** A token's full on-screen side length in pixels, given the scene's grid size. */
export function tokenSidePx(size: SizeCategory, gridSizePx: number): number {
  return footprintCells(size) * gridSizePx * renderScale(size)
}

/** Center point of a token's footprint, in grid-cell units — `x`/`y` are the
 * footprint's top-left anchor (TokenRecord's convention). Used wherever a
 * single representative point stands in for a token's position (line-of-
 * sight checks, hazard-overlap detection), rather than its top-left corner. */
export function tokenFootprintCenter(x: number, y: number, size: SizeCategory): { x: number; y: number } {
  const cells = footprintCells(size)
  return { x: x + cells / 2, y: y + cells / 2 }
}

export interface CellRect {
  x1: number
  y1: number
  x2: number
  y2: number
}

/** A token's footprint as a rectangle in grid-cell units — `x`/`y` are the
 * top-left anchor. Used for hazard-overlap detection (see
 * canvas/MapCanvas.tsx's onMoveEnd handler). */
export function tokenFootprintRect(x: number, y: number, widthCells: number, heightCells: number): CellRect {
  return { x1: x, y1: y, x2: x + widthCells, y2: y + heightCells }
}

/** Axis-aligned rectangle overlap — touching edges don't count (a token
 * standing exactly adjacent to a hazard hasn't stepped into it). */
export function rectanglesOverlap(a: CellRect, b: CellRect): boolean {
  return a.x1 < b.x2 && a.x2 > b.x1 && a.y1 < b.y2 && a.y2 > b.y1
}

/** Snaps a raw grid-cell coordinate (the token's top-left anchor, same
 * convention as TokenRecord.x/y) so the token lands filling whichever slot
 * the point falls within, rather than snapping to the nearest grid
 * intersection like a wall would — walls snap to corners because they run
 * along grid lines, but a token snapping to a corner can end up straddling
 * the boundary and appear pushed into the wrong (adjacent) cell depending on
 * which side of a cell's midpoint you clicked. Using the cell index that
 * contains `raw` (rather than rounding to the nearest line) keeps the token
 * anchored to — and thus visually centered in/filling — the slot you
 * actually pointed at. For a multi-cell footprint (large/huge/gargantuan),
 * this centers the point within the NxN block instead of just one cell. */
export function snapToSlot(raw: number, footprintInCells: number): number {
  return Math.floor(raw - (footprintInCells - 1) / 2)
}

/** A token's standing height in the 3D flat-plane view (canvas3d/Scene3D.tsx),
 * in grid-cell world units. `modelHeightCells` (DM-set, see TokenRecord's
 * doc comment) always wins when set — a direct size override, not a
 * multiplier, so the DM doesn't have to do scale-factor math for an
 * oddly-proportioned STL. Otherwise falls back to an automatic size derived
 * from sizeCategory (or a flat, low height for hazard/trap tokens, which
 * read as ground markers rather than standing minis). */
export function resolveModelHeight(token: Pick<TokenRecord, 'sizeCategory' | 'hazardSize' | 'modelHeightCells'>): number {
  if (token.modelHeightCells !== null) return token.modelHeightCells
  if (token.hazardSize) return 0.12
  return footprintCells(token.sizeCategory) * renderScale(token.sizeCategory) * AUTO_MODEL_HEIGHT_PER_FOOTPRINT_CELL
}

/**
 * The uniform scale factor to apply to a normalized (height-1, XZ-centered
 * — see canvas3d/modelCache.ts) STL mesh so it stands at the right height
 * *and* never spills outside the token's own grid footprint into
 * neighboring cells. `localWidth`/`localDepth` are the model's natural X/Z
 * extents at that normalized height-1 scale (read straight off the loaded
 * geometry's `boundingBox`).
 *
 * Automatic case (no explicit modelHeightCells override): takes the
 * smallest of three ratios — the height target, and the scale that would
 * exactly fit the model's width/depth within the footprint — so whichever
 * dimension is most constraining wins. A slender humanoid is unaffected
 * (height wins); a squat, wide creature gets scaled down a bit shorter
 * than its "ideal" height rather than poking into the next cell over.
 *
 * Explicit override case: returned as-is, unclamped — an override is a
 * deliberate "make it exactly this size" choice (see resolveModelHeight's
 * doc comment), including intentionally larger than its own footprint.
 */
export function resolveStlScale(
  token: Pick<TokenRecord, 'sizeCategory' | 'hazardSize' | 'modelHeightCells'>,
  localWidth: number,
  localDepth: number,
): number {
  const targetHeight = resolveModelHeight(token)
  if (token.modelHeightCells !== null) return targetHeight
  const footprintWidth = token.hazardSize ? token.hazardSize.widthCells : footprintCells(token.sizeCategory)
  const footprintDepth = token.hazardSize ? token.hazardSize.heightCells : footprintCells(token.sizeCategory)
  const scaleForWidth = footprintWidth / Math.max(localWidth, 1e-6)
  const scaleForDepth = footprintDepth / Math.max(localDepth, 1e-6)
  return Math.min(targetHeight, scaleForWidth, scaleForDepth)
}
