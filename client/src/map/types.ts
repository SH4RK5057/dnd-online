export type SizeCategory = 'tiny' | 'small' | 'medium' | 'large' | 'huge' | 'gargantuan'

export type AssetKind = 'map' | 'token' | 'handout' | 'audio'

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
  /** Links this token to a CharacterRecord (character/types.ts). When set,
   * `hp` below is not authoritative — see character/rules.ts resolveTokenHp
   * for why HP lives on the character instead once linked. */
  characterId: string | null
  /** Only meaningful (read or written) when characterId is null — a loose
   * monster/NPC token with no character sheet behind it. */
  hp: { current: number; max: number; temp: number } | null
  /** Condition names (see dice/conditions.ts KNOWN_CONDITIONS). Always
   * meaningful regardless of characterId — combat-instance-scoped, not
   * duplicated onto the character. */
  conditions: string[]
  /** This token's rolled initiative for the current encounter, or null
   * outside combat / before it's rolled. Turn order is always derived fresh
   * from this field (see combat/rules.ts computeInitiativeOrder) — never
   * stored as a separate ordered list. */
  initiative: number | null
  /** content/types.ts ContentKey (e.g. "srd:goblin", "mirror:...",
   * "homebrew:<id>") this token was created from via encounter drag-and-drop,
   * or null. A one-time initialization source, not a live link — editing the
   * compendium entry afterward doesn't retroactively change existing tokens.
   * Used by the DM's token inspector to show the full stat block/rules for
   * this token (content/useCompendium.ts findByKey). */
  monsterKey: string | null
  /** Only meaningful (read or written) when characterId is null — mirrors
   * `hp`'s split: a linked character's AC lives on the CharacterRecord
   * instead. Initialized from monsterKey's stat block on drop, editable after. */
  ac: number | null
  /** Same split as `ac` above. */
  speed: number | null
  /** Freeform DM-entered text shown to players when they click this token —
   * distinct from the rules/stat-block lookup (which is DM-only, pulled from
   * monsterKey or characterId instead of stored here). Empty string = DM
   * hasn't written one; players see nothing in that case, not a placeholder. */
  description: string
  /** DM-only visibility — a token the DM has placed (a trap, mimic, or
   * stealthy enemy) but not yet revealed. Independent of fog-of-war: even a
   * player who can otherwise see this exact spot won't see a hidden token
   * there. Never affects the DM's own view, or a DM's normal (non-preview)
   * editing — see canvas/MapCanvas.tsx's token effect for where this is
   * actually filtered out of what gets rendered. */
  hidden: boolean
  /** Altitude in grid cells above (positive) or below (negative) the map
   * plane, e.g. a flying creature or something in a pit. Not rendered as
   * actual 3D — token art still draws flat on the map — but visible on
   * inspection and usable for range/line-of-sight math (see
   * map/distance3D.ts). Defaults to 0 (same plane as everything else). */
  z: number
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
