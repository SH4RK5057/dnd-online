import type { TerrainType } from '../map/types'
import type { AreaEffect } from '../map/areaEffects'

/** A terrain patch the DM has configured (type/size) but not yet placed —
 * same staged-then-click-to-place pattern as pendingTokenPlacement.ts,
 * resolved once the DM clicks the map in 'place-terrain' mode. The click
 * point becomes the patch's top-left anchor (no snap-to-slot centering
 * like tokens get — terrain is a freeform rectangle, not a creature
 * footprint). */
export interface PendingTerrainPlacement {
  terrainType: TerrainType
  widthCells: number
  heightCells: number
  /** See TerrainRecord.effect. */
  effect: AreaEffect | null
}
