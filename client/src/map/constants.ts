import type { SizeCategory } from './types'

export const DEFAULT_GRID_SIZE_PX = 70

/** Used as the canvas/grid/wall/light working area when a scene has no map
 * image yet, so the DM can lay out walls, lights, and tokens before
 * uploading art. Scaled by the scene's actual grid size at use. */
export const BLANK_SCENE_WIDTH_CELLS = 30
export const BLANK_SCENE_HEIGHT_CELLS = 20

/** Bytes per Yjs chunk write. Kept well under WebRTC data channels' practical
 * per-message safety margin (~256KB) so each chunk is its own small,
 * separately-broadcast update. */
export const ASSET_CHUNK_SIZE = 16 * 1024
/** Spacing between chunk writes so a tight synchronous send loop doesn't
 * flood the data channel. */
export const ASSET_CHUNK_WRITE_DELAY_MS = 25

export const MAX_UPLOAD_BYTES = 20 * 1024 * 1024

export const MAP_IMAGE_MAX_DIMENSION = 2400
export const MAP_IMAGE_QUALITY = 0.85
export const TOKEN_IMAGE_MAX_DIMENSION = 256
export const TOKEN_IMAGE_QUALITY = 0.8
export const HANDOUT_IMAGE_MAX_DIMENSION = 1600
export const HANDOUT_IMAGE_QUALITY = 0.85

export const SIZE_FOOTPRINT_CELLS: Record<SizeCategory, number> = {
  tiny: 1,
  small: 1,
  medium: 1,
  large: 2,
  huge: 3,
  gargantuan: 4,
}

export const SIZE_RENDER_SCALE: Record<SizeCategory, number> = {
  tiny: 0.5,
  small: 1,
  medium: 1,
  large: 1,
  huge: 1,
  gargantuan: 1,
}

export const SIZE_LABELS: Record<SizeCategory, string> = {
  tiny: 'Tiny',
  small: 'Small',
  medium: 'Medium',
  large: 'Large',
  huge: 'Huge',
  gargantuan: 'Gargantuan',
}

/** Grid cells, matching TokenRecord/WallRecord/LightRecord's coordinate convention. */
export const DEFAULT_LIGHT_RADIUS_CELLS = 8
/** Baseline sight even in total darkness/unlit areas — not a game-rules
 * darkvision feature, just enough that a token isn't blind at its own feet. */
export const PERSONAL_VISION_RADIUS_CELLS = 1
/** Hard cap on how far a token's own line of sight reaches, even in full light. */
export const MAX_VISION_RADIUS_CELLS = 30
export const DEFAULT_LIGHT_COLOR = 0xffaa55
