import type { SceneRecord } from './types'

/** Every scene sharing `scene`'s floor group (including `scene` itself),
 * sorted by `floorOrder` then `createdAt` for ties — the order
 * FloorSwitcher.tsx renders its tabs in. Returns an empty array when the
 * scene isn't part of a group (`floorGroup` empty, the default), so callers
 * can use `.length > 1` to decide whether a tab strip is even worth
 * showing (a lone scene "grouped" with itself isn't a switcher). */
export function floorSiblings(scenes: SceneRecord[], scene: Pick<SceneRecord, 'floorGroup'>): SceneRecord[] {
  const floorGroup = scene.floorGroup ?? ''
  if (!floorGroup) return []
  return [...scenes]
    .filter((s) => (s.floorGroup ?? '') === floorGroup)
    .sort((a, b) => (a.floorOrder ?? 0) - (b.floorOrder ?? 0) || a.createdAt - b.createdAt)
}
