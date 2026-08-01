export type SizeCategory = 'tiny' | 'small' | 'medium' | 'large' | 'huge' | 'gargantuan'

export type AssetKind = 'map' | 'token' | 'handout' | 'audio' | 'model'

export type GridType = 'square' | 'hex'

/** What kind of space this scene represents, which drives which navigation
 * UI applies (canvas/../components/SceneNavigationPanel.tsx):
 * - 'dungeon': the original battle-map behavior — individual token
 *   movement, dynamic line-of-sight and fog of war. The default, so every
 *   scene created before this field existed keeps behaving exactly as it
 *   always did.
 * - 'town': the DM picks Group or Individual navigation (navigationMode)
 *   between Points of Interest (map/poiTypes.ts), with a transition overlay
 *   when a POI links to another scene.
 * - 'landscape': always Group navigation, driven by POIs, gated behind a
 *   party movement-consensus mechanic (consensusMode).
 */
export type SceneScale = 'dungeon' | 'town' | 'landscape'
export type NavigationMode = 'group' | 'individual'
export type ConsensusMode = 'vote' | 'leader'

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
  /** Read as `?? 'dungeon'` for scenes created before this field existed. */
  scale: SceneScale
  /** Only meaningful when scale is 'town'. Read as `?? 'group'`. */
  navigationMode: NavigationMode
  /** Only meaningful when scale is 'landscape'. Read as `?? 'vote'`. */
  consensusMode: ConsensusMode
  /** The player designated to move the party alone, when consensusMode is
   * 'leader'. Read as `?? null`. */
  partyLeaderId: string | null
  /** The POI (map/poiTypes.ts) the party is currently considered to be at,
   * for town/landscape scenes — null if they haven't moved yet, or this is
   * a dungeon scene where the concept doesn't apply. Read as `?? null`. */
  currentPoiId: string | null
  /** DM-set minimum working-area size (grid cells). `null` means "never
   * customized" — a genuine sentinel, not just a pre-field-existed absence
   * (see map/useScenes.ts's createScene, which sets both to null on every
   * new scene). While a scene has no map image, this null-or-not distinction
   * doesn't matter and the play area is just this value (falling back to
   * BLANK_SCENE_WIDTH_CELLS/HEIGHT_CELLS, map/constants.ts, when null). Once
   * a map image is uploaded, it matters a lot: leaving both null means the
   * play area exactly matches the image's own size (unchanged, historical
   * behavior); setting either one explicitly floors the play area at that
   * size, letting it extend past the image's edges without ever shrinking
   * below what the image itself needs (map/canvasSize.ts's
   * resolveCanvasSizeCells owns this logic; used by both the 2D and 3D
   * views). Old scenes predating this field read as `undefined` at runtime
   * despite the `number | null` type — treated the same as `null` wherever
   * this is read. */
  blankWidthCells: number | null
  blankHeightCells: number | null
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
  /** Active conditions with optional durations — see ActiveCondition. Always
   * meaningful regardless of characterId — combat-instance-scoped, not
   * duplicated onto the character. */
  conditions: ActiveCondition[]
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
  /** DC to passively notice this token while it's hidden — the DM's call
   * (this app doesn't model a Stealth roll for it), e.g. 10 + the hiding
   * creature's Dex/Stealth modifier, or a trap's discovery DC. Only
   * meaningful while `hidden` is true. Null = not set, so passive-
   * perception auto-reveal (see useCampaignSettings.ts
   * passivePerceptionEnabled) never triggers for this token even when the
   * campaign setting is on — the DM has to opt each hidden token in. */
  perceptionDc: number | null
  /** Altitude in grid cells above (positive) or below (negative) the map
   * plane, e.g. a flying creature or something in a pit. Not rendered as
   * actual 3D — token art still draws flat on the map — but visible on
   * inspection and usable for range/line-of-sight math (see
   * map/distance3D.ts). Defaults to 0 (same plane as everything else). */
  z: number
  /** Whether this combatant has an unused reaction right now — resets to
   * true whenever combat advances TO this token's turn (5e rule: you regain
   * your reaction at the start of your own turn), and whenever combat
   * starts. Consumed either by an opportunity-attack roll outside your own
   * turn (see components/AttackRollPanel.tsx) or manually via the
   * initiative tracker's "Use reaction" button for a non-attack reaction
   * (a readied spell, Shield, etc. — narrated outside the app). */
  reactionAvailable: boolean
  /** Custom rectangular footprint in grid cells, overriding sizeCategory's
   * fixed footprint — for DM-placed hazard/trap tokens sized to an actual
   * area rather than a creature size category. Null for every normal
   * token, which keeps using sizeCategory as before. */
  hazardSize: { widthCells: number; heightCells: number } | null
  /** An uploaded STL 3D model (AssetKind 'model') standing in for this
   * token in the 3D flat-plane view (canvas3d/Scene3D.tsx) — synced through
   * the same chunked asset pipeline as map/token images (map/assetSync.ts),
   * just an unprocessed binary blob instead of a compressed image. Null
   * falls back to a plain placeholder mini in 3D. Irrelevant to the normal
   * 2D map view, which keeps using `assetId` exactly as before. */
  modelAssetId: string | null
  /** Explicit standing height, in grid-cell world units, for this token's 3D
   * flat-plane mesh (STL or placeholder) — overrides the automatic
   * sizeCategory-derived height (see map/sizeCategory.ts resolveModelHeight).
   * Null means "automatic." Directly sets the mesh's world-space height
   * rather than a multiplier, so the DM can size an oddly-proportioned STL
   * (or just eyeball a look they like) without doing scale-factor math. */
  modelHeightCells: number | null
  createdAt: number
}

/** One active condition on a token, with an optional duration. */
export interface ActiveCondition {
  /** A dice/conditions.ts KNOWN_CONDITIONS name. */
  name: string
  /** Rounds remaining, decremented by 1 each time combat's round counter
   * advances (see combat/useCombat.ts advanceTurn's onRoundIncremented
   * callback, wired from components/InitiativeTracker.tsx) and removed once
   * it hits 0. Null = indefinite — the DM/owner clears it manually via the
   * same checkbox that applied it, matching the original behavior from
   * before durations existed. Set by whoever applies the condition
   * (components/TokenHpConditionEditor.tsx). */
  roundsRemaining: number | null
}

export interface WallRecord {
  id: string
  sceneId: string
  /** Grid-cell units, same convention as TokenRecord.x/y. */
  x1: number
  y1: number
  x2: number
  y2: number
  /** Render thickness in screen pixels (at 1x grid scale) — set once at
   * creation time from whatever the wall tool's thickness slider was at,
   * like a brush size. Read as `?? 4` for walls created before this field
   * existed. Purely cosmetic; doesn't affect line-of-sight math. */
  thickness: number
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
