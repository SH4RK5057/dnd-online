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
}
