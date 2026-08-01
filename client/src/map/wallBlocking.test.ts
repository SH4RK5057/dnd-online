import { describe, expect, it } from 'vitest'
import { blockingWalls } from './wallBlocking'
import type { WallRecord } from './types'

function makeWall(overrides: Partial<WallRecord> = {}): WallRecord {
  return {
    id: 'wall-1',
    sceneId: 'scene-1',
    x1: 0,
    y1: 0,
    x2: 10,
    y2: 10,
    thickness: 4,
    createdAt: 0,
    ...overrides,
  }
}

describe('blockingWalls', () => {
  it('keeps an ordinary (non-door) wall', () => {
    const wall = makeWall()
    expect(blockingWalls([wall])).toEqual([wall])
  })

  it('keeps a closed door', () => {
    const wall = makeWall({ isDoor: true, open: false })
    expect(blockingWalls([wall])).toEqual([wall])
  })

  it('drops an open door', () => {
    const wall = makeWall({ isDoor: true, open: true })
    expect(blockingWalls([wall])).toEqual([])
  })

  it('keeps a door with isDoor true but open left undefined (defaults closed)', () => {
    const wall = makeWall({ isDoor: true })
    expect(blockingWalls([wall])).toEqual([wall])
  })
})
