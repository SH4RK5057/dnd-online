import { BLANK_SCENE_HEIGHT_CELLS, BLANK_SCENE_WIDTH_CELLS } from './constants'
import type { SceneRecord } from './types'

export interface CellDims {
  widthCells: number
  heightCells: number
}

/**
 * Resolves a scene's effective play-area size, in grid cells — shared by
 * the 2D (canvas/MapCanvas.tsx) and 3D (canvas3d/Scene3D.tsx) views so both
 * always agree on how big the board is.
 *
 * - No map image (`imageSizeCells` is null): the DM's blank-canvas dims
 *   (`SceneRecord.blankWidthCells`/`blankHeightCells`), or the app default
 *   when never customized (`null` — see those fields' doc comment).
 * - Map image present, DM has never customized blank dims (both still
 *   `null`): exactly the image's own cell size, unchanged — nothing grows
 *   unexpectedly for a scene the DM hasn't touched this control on.
 * - Map image present AND the DM has explicitly set blank dims: the larger
 *   of the two per axis, so the play area can extend past the map image's
 *   edges (e.g. a fight spilling off a drawn map) without ever shrinking
 *   below what the image itself needs.
 */
export function resolveCanvasSizeCells(
  scene: Pick<SceneRecord, 'blankWidthCells' | 'blankHeightCells'> | null,
  imageSizeCells: CellDims | null,
): CellDims | null {
  const explicitWidth = scene?.blankWidthCells ?? null
  const explicitHeight = scene?.blankHeightCells ?? null

  if (imageSizeCells) {
    if (explicitWidth === null && explicitHeight === null) return imageSizeCells
    return {
      widthCells: Math.max(imageSizeCells.widthCells, explicitWidth ?? 0),
      heightCells: Math.max(imageSizeCells.heightCells, explicitHeight ?? 0),
    }
  }
  if (!scene) return null
  return {
    widthCells: explicitWidth ?? BLANK_SCENE_WIDTH_CELLS,
    heightCells: explicitHeight ?? BLANK_SCENE_HEIGHT_CELLS,
  }
}
