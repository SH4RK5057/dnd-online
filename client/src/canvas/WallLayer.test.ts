import { describe, expect, it, vi } from 'vitest'
import { WallLayer, type WallLayerCallbacks } from './WallLayer'
import type { WallRecord } from '../map/types'

const GRID_SIZE = 50

/** Minimal stand-in for a Pixi FederatedPointerEvent — WallLayer's handlers
 * only ever read `button`, `shiftKey`, and call `getLocalPosition()`. */
function fakeEvent(localX: number, localY: number, opts: { button?: number; shiftKey?: boolean } = {}) {
  return {
    button: opts.button ?? 0,
    shiftKey: opts.shiftKey ?? false,
    getLocalPosition: () => ({ x: localX, y: localY }),
  }
}

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

function makeCallbacks() {
  const onCreateWall = vi.fn<WallLayerCallbacks['onCreateWall']>()
  const onUpdateWallEndpoint = vi.fn<WallLayerCallbacks['onUpdateWallEndpoint']>()
  const onDeleteWall = vi.fn<WallLayerCallbacks['onDeleteWall']>()
  return { onCreateWall, onUpdateWallEndpoint, onDeleteWall }
}

describe('WallLayer endpoint vs new-chain ambiguity', () => {
  it('a stationary click at an existing wall endpoint starts a new chain instead of silently no-op dragging it', () => {
    const layer = new WallLayer()
    const wall = makeWall()
    const callbacks = makeCallbacks()
    layer.update([wall], GRID_SIZE, { width: 2000, height: 2000 }, true, false, 'square', 4, callbacks)
    layer.setViewScale(1)

    const endpointLocalX = wall.x2 * GRID_SIZE
    const endpointLocalY = wall.y2 * GRID_SIZE

    // Stationary press-and-release exactly on the existing endpoint.
    ;(layer as any).handlePointerDown(fakeEvent(endpointLocalX, endpointLocalY))
    ;(layer as any).handlePointerUp(fakeEvent(endpointLocalX, endpointLocalY))

    // Must NOT have been treated as a no-op drag of the existing endpoint.
    expect(callbacks.onUpdateWallEndpoint).not.toHaveBeenCalled()
    // Nothing commits yet — this click only opens a new chain.
    expect(callbacks.onCreateWall).not.toHaveBeenCalled()
    expect((layer as any).pendingStart).toEqual({ x: wall.x2, y: wall.y2 })

    // A second click elsewhere commits the new, connected wall segment.
    const secondLocalX = 20 * GRID_SIZE
    const secondLocalY = 5 * GRID_SIZE
    ;(layer as any).handlePointerDown(fakeEvent(secondLocalX, secondLocalY))
    ;(layer as any).handlePointerUp(fakeEvent(secondLocalX, secondLocalY))

    expect(callbacks.onCreateWall).toHaveBeenCalledTimes(1)
    expect(callbacks.onCreateWall).toHaveBeenCalledWith(wall.x2, wall.y2, 20, 5, 4)
  })

  it('an actual drag starting near an existing endpoint still moves it, not a chain', () => {
    const layer = new WallLayer()
    const wall = makeWall()
    const callbacks = makeCallbacks()
    layer.update([wall], GRID_SIZE, { width: 2000, height: 2000 }, true, false, 'square', 4, callbacks)
    layer.setViewScale(1)

    const startLocalX = wall.x2 * GRID_SIZE
    const startLocalY = wall.y2 * GRID_SIZE
    const movedLocalX = (wall.x2 + 1) * GRID_SIZE
    const movedLocalY = (wall.y2 + 1) * GRID_SIZE

    ;(layer as any).handlePointerDown(fakeEvent(startLocalX, startLocalY))
    ;(layer as any).handlePointerMove(fakeEvent(movedLocalX, movedLocalY))
    ;(layer as any).handlePointerUp(fakeEvent(movedLocalX, movedLocalY))

    expect(callbacks.onCreateWall).not.toHaveBeenCalled()
    expect(callbacks.onUpdateWallEndpoint).toHaveBeenCalledWith(wall.id, 'end', wall.x2 + 1, wall.y2 + 1)
    expect((layer as any).pendingStart).toBeNull()
  })

  it('a normal click-chain with no endpoints nearby is unaffected', () => {
    const layer = new WallLayer()
    const callbacks = makeCallbacks()
    layer.update([], GRID_SIZE, { width: 2000, height: 2000 }, true, false, 'square', 4, callbacks)
    layer.setViewScale(1)

    const p1x = 2 * GRID_SIZE
    const p1y = 2 * GRID_SIZE
    const p2x = 8 * GRID_SIZE
    const p2y = 6 * GRID_SIZE

    ;(layer as any).handlePointerDown(fakeEvent(p1x, p1y))
    ;(layer as any).handlePointerUp(fakeEvent(p1x, p1y))
    expect(callbacks.onCreateWall).not.toHaveBeenCalled()

    ;(layer as any).handlePointerDown(fakeEvent(p2x, p2y))
    ;(layer as any).handlePointerUp(fakeEvent(p2x, p2y))
    expect(callbacks.onCreateWall).toHaveBeenCalledTimes(1)
    expect(callbacks.onCreateWall).toHaveBeenCalledWith(2, 2, 8, 6, 4)
  })
})
