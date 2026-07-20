/** Straight-line distance between two points that each have a grid-cell x/y
 * plus an altitude (`z`, also in grid-cell units — see TokenRecord.z). Pure
 * math, no rendering: the map stays visually flat (per ROADMAP.md, altitude
 * is "not actively rendered in 3D"), this is just what a DM's range/LOS
 * ruling can call when a token is above or below the map plane. */
export function distance3D(a: { x: number; y: number; z: number }, b: { x: number; y: number; z: number }): number {
  return Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z)
}
