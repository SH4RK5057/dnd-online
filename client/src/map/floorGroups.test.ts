import { describe, expect, it } from 'vitest'
import { floorSiblings } from './floorGroups'
import type { SceneRecord } from './types'

function scene(overrides: Partial<SceneRecord> & Pick<SceneRecord, 'id'>): SceneRecord {
  return {
    name: overrides.id,
    mapAssetId: null,
    gridSizePx: 50,
    gridOffsetX: 0,
    gridOffsetY: 0,
    gridVisible: true,
    gridType: 'square',
    fogEnabled: false,
    ambientBrightness: 1,
    persistentFogEnabled: true,
    sharedVisionEnabled: false,
    published: false,
    scale: 'dungeon',
    navigationMode: 'group',
    consensusMode: 'vote',
    partyLeaderId: null,
    currentPoiId: null,
    blankWidthCells: null,
    blankHeightCells: null,
    floorGroup: '',
    floorOrder: 0,
    createdAt: 0,
    ...overrides,
  }
}

describe('floorSiblings', () => {
  it('returns an empty array when the scene has no floor group', () => {
    const scenes = [scene({ id: 'a' }), scene({ id: 'b', floorGroup: 'Tower' })]
    expect(floorSiblings(scenes, scenes[0])).toEqual([])
  })

  it('returns every scene sharing the same floor group, including itself', () => {
    const scenes = [
      scene({ id: 'a', floorGroup: 'Tower', floorOrder: 1 }),
      scene({ id: 'b', floorGroup: 'Tower', floorOrder: 0 }),
      scene({ id: 'c', floorGroup: 'Other' }),
    ]
    const result = floorSiblings(scenes, scenes[0])
    expect(result.map((s) => s.id)).toEqual(['b', 'a'])
  })

  it('sorts by floorOrder, breaking ties by createdAt', () => {
    const scenes = [
      scene({ id: 'top', floorGroup: 'Tower', floorOrder: 2 }),
      scene({ id: 'later', floorGroup: 'Tower', floorOrder: 0, createdAt: 200 }),
      scene({ id: 'earlier', floorGroup: 'Tower', floorOrder: 0, createdAt: 100 }),
    ]
    const result = floorSiblings(scenes, scenes[0])
    expect(result.map((s) => s.id)).toEqual(['earlier', 'later', 'top'])
  })

  it('excludes scenes in a different floor group', () => {
    const scenes = [scene({ id: 'a', floorGroup: 'Tower' }), scene({ id: 'b', floorGroup: 'Dungeon' })]
    expect(floorSiblings(scenes, scenes[0]).map((s) => s.id)).toEqual(['a'])
  })
})
