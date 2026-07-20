export type SizeCategory = 'tiny' | 'small' | 'medium' | 'large' | 'huge' | 'gargantuan'

export type AssetKind = 'map' | 'token'

export type GridType = 'square' | 'hex'

export interface SceneRecord {
  id: string
  name: string
  mapAssetId: string | null
  gridSizePx: number
  gridOffsetX: number
  gridOffsetY: number
  gridVisible: boolean
  /** Visual grid style only — token/wall/light coordinates stay in the same
   * continuous grid-cell unit space regardless. Read as `?? 'square'` for
   * scenes created before this field existed. */
  gridType: GridType
  /** Fog of war on/off for this scene. Off = full visibility for everyone. */
  fogEnabled: boolean
  /** Baseline light level before any light sources or a token's own vision
   * aura are added in: 0.0 = pitch black (nothing visible without a light
   * source nearby), 1.0 = fully lit (daylight — the old always-on behavior).
   * Only has a visible effect while fogEnabled is true. Read as `?? 1.0` for
   * scenes created before this field existed. */
  ambientBrightness: number
  /** Whether explored-but-not-currently-visible cells stay revealed instead
   * of re-fogging once a player looks away — "persistent fog of
   * exploration." Only meaningful while fogEnabled is true. Read as `?? true`
   * for scenes created before this field existed (matches the always-on
   * behavior it had before this toggle existed). Turning it off doesn't
   * delete already-recorded exploration data, only stops applying it. */
  persistentFogEnabled: boolean
  /** Whether every player's live line-of-sight is computed from the union
   * of all player-owned tokens on the scene, instead of just their own —
   * lets a party spread across a room see everything any of them can see.
   * Only affects LIVE sight; each player's own persistent exploration
   * memory (see persistentFogEnabled) stays independent and is never
   * merged. Only meaningful while fogEnabled is true. Read as `?? false`
   * for scenes created before this field existed (matches the old
   * every-player-sees-only-their-own-tokens behavior). */
  sharedVisionEnabled: boolean
  /** Whether players can see this scene at all — lets the DM prep a map
   * (upload art, place walls/lights/tokens) before revealing it. Read as
   * `!== false` everywhere (not `=== true`) so scenes created before this
   * field existed, which have it `undefined`, stay visible. */
  published: boolean
  createdAt: number
}

export interface TokenRecord {
  id: string
  sceneId: string
  name: string
  assetId: string | null
  sizeCategory: SizeCategory
  /** Grid-cell units (not pixels), top-left of the token's footprint. */
  x: number
  y: number
  /** Stable playerId (session/lastSession.ts) of the connected player who
   * controls this token, or null if unassigned. Determines whose vision a
   * player's fog-of-war is computed from — a UI convention like the rest of
   * this app's DM-authoritative model, not an enforced permission. */
  ownerId: string | null
  createdAt: number
}

export interface WallRecord {
  id: string
  sceneId: string
  /** Grid-cell units, same convention as TokenRecord.x/y. */
  x1: number
  y1: number
  x2: number
  y2: number
  createdAt: number
}

export interface LightRecord {
  id: string
  sceneId: string
  /** Grid-cell units. Authoritative only when attachedTokenId is null —
   * otherwise the live position is read from the attached token instead. */
  x: number
  y: number
  /** Full-brightness falloff radius, grid cells. */
  radius: number
  /** Cosmetic tint only (0xRRGGBB) — doesn't affect the visibility math. */
  color: number
  attachedTokenId: string | null
  enabled: boolean
  createdAt: number
}

export interface AssetMeta {
  id: string
  kind: AssetKind
  mimeType: string
  width: number
  height: number
  totalChunks: number
  chunkSize: number
  byteLength: number
  hash: string
}
