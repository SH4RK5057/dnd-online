import { SIZE_FOOTPRINT_CELLS, SIZE_RENDER_SCALE } from './constants'
import type { SizeCategory } from './types'

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
