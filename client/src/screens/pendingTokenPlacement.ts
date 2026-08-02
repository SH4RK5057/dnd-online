import type { SizeCategory } from '../map/types'

/** A token the DM has configured (name/size/art) but not yet placed —
 * staged from TokenUploadButton's form, resolved into an actual token once
 * the DM clicks the map in 'place-tokens' mode. Lives in SessionScreen so
 * both TokenUploadButton (producer) and MapCanvas (consumer, via the
 * click handler) can share it without either owning the other. */
export interface PendingTokenPlacement {
  name: string
  sizeCategory: SizeCategory
  file: File | null
  /** Optional STL 3D model for the 3D flat-plane view (canvas3d/Scene3D.tsx)
   * — see TokenRecord.modelAssetId. Independent of `file` (the 2D image);
   * a token can have either, both, or neither. */
  modelFile: File | null
  /** Set when this placement came from the compendium's "Add to scene"
   * button (encounter drag-and-drop) instead of TokenUploadButton — carries
   * the stat block fields to initialize on the token once it's placed. */
  monsterInit: { monsterKey: string; hp: { current: number; max: number; temp: number }; ac: number; speed: number } | null
  /** Set when this placement came from the character roster's "Place token"
   * button (components/CharacterTokenMenu.tsx) instead of TokenUploadButton
   * or the compendium — links the new token to the character sheet (HP then
   * lives there, see character/rules.ts resolveTokenHp) and assigns the
   * token's owner so a player-owned character's fog-of-war comes online
   * immediately without a separate Token Ownership step. */
  characterInit: { characterId: string; ownerId: string } | null
  /** Set when placing a DM-configured hazard/trap token (custom rectangular
   * size, starts hidden) instead of a normal creature token. */
  hazardSize: { widthCells: number; heightCells: number } | null
}
