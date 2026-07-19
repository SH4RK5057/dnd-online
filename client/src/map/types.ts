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
