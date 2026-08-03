import type { TriggerAction } from '../map/types'

/** A trigger the DM has configured (name/size/hidden/oneShot/actions) but
 * not yet placed — same staged-then-click-to-place pattern as
 * pendingTerrainPlacement.ts. The click point becomes the zone's top-left
 * anchor. */
export interface PendingTriggerPlacement {
  name: string
  widthCells: number
  heightCells: number
  hidden: boolean
  perceptionDc: number | null
  oneShot: boolean
  actions: TriggerAction[]
}
