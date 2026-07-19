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
