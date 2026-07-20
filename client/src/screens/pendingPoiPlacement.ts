/** A Point of Interest the DM has named but not yet placed — same staged-
 * then-click-to-place pattern as pendingTokenPlacement.ts, resolved once
 * the DM clicks the map in 'place-pois' mode. */
export interface PendingPoiPlacement {
  name: string
}
