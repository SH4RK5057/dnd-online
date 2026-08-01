import type { WallRecord } from './types'

/** Wall segments that currently block line-of-sight, fog-of-war, and attack
 * targeting — every ordinary wall, plus doors while closed. An open door
 * blocks nothing, same as walking through a doorway; a closed one blocks
 * exactly like a solid wall. Every caller that feeds `WallRecord[]` into
 * map/visibility.ts's generic segment math (which deliberately knows
 * nothing about doors) should filter through this first. */
export function blockingWalls(walls: WallRecord[]): WallRecord[] {
  return walls.filter((w) => !(w.isDoor && w.open))
}
