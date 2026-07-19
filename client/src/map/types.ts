export type SizeCategory = 'tiny' | 'small' | 'medium' | 'large' | 'huge' | 'gargantuan'

export type AssetKind = 'map' | 'token'

export interface SceneRecord {
  id: string
  name: string
  mapAssetId: string | null
  gridSizePx: number
  gridOffsetX: number
  gridOffsetY: number
  gridVisible: boolean
  /** Fog of war on/off for this scene. Off = full visibility for everyone. */
  fogEnabled: boolean
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
