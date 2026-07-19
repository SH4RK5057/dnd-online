import { describe, expect, it } from 'vitest'
import { computeVisibilityPolygon, type Point, type Segment } from './visibility'

function distance(a: Point, b: Point): number {
  return Math.hypot(a.x - b.x, a.y - b.y)
}

function normalize(v: Point): Point {
  const len = Math.hypot(v.x, v.y)
  return { x: v.x / len, y: v.y / len }
}

/** Standard even-odd ray-casting point-in-polygon test. */
function pointInPolygon(point: Point, polygon: Point[]): boolean {
  let inside = false
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i].x
    const yi = polygon[i].y
    const xj = polygon[j].x
    const yj = polygon[j].y
    const intersect = yi > point.y !== yj > point.y && point.x < ((xj - xi) * (point.y - yi)) / (yj - yi) + xi
    if (intersect) inside = !inside
  }
  return inside
}

describe('computeVisibilityPolygon', () => {
  it('produces a full circle of the given radius when there are no walls', () => {
    const origin = { x: 0, y: 0 }
    const radius = 10
    const polygon = computeVisibilityPolygon(origin, [], radius)

    expect(polygon.length).toBeGreaterThan(0)
    for (const point of polygon) {
      expect(distance(origin, point)).toBeCloseTo(radius, 6)
    }

    // Sample a handful of directions explicitly to confirm full coverage, not just "some points".
    for (const angle of [0, Math.PI / 2, Math.PI, (3 * Math.PI) / 2, 2.4, 5.1]) {
      const expected = { x: Math.cos(angle) * radius, y: Math.sin(angle) * radius }
      const nearest = polygon.reduce((best, p) => (distance(p, expected) < distance(best, expected) ? p : best))
      expect(distance(nearest, expected)).toBeLessThan(0.6) // within one baseline-ray angular step
    }
  })

  it('occludes the point directly behind a perpendicular wall, but not a point beside it', () => {
    const origin = { x: 0, y: 0 }
    const wall: Segment = { x1: -1, y1: 5, x2: 1, y2: 5 }
    const polygon = computeVisibilityPolygon(origin, [wall], 10)

    const behindWall = { x: 0, y: 8 } // straight up, past the wall at y=5
    const besideWall = { x: 5, y: 5 } // well outside the wall's x-span

    expect(pointInPolygon(behindWall, polygon)).toBe(false)
    expect(pointInPolygon(besideWall, polygon)).toBe(true)
  })

  it('lets visibility through a gap between two colinear wall segments, but not through either segment', () => {
    const origin = { x: 0, y: 0 }
    const wallLeft: Segment = { x1: -5, y1: 5, x2: -1, y2: 5 }
    const wallRight: Segment = { x1: 1, y1: 5, x2: 5, y2: 5 }
    const polygon = computeVisibilityPolygon(origin, [wallLeft, wallRight], 15)

    const throughGap = { x: 0, y: 9 } // straight up, through the doorway between the two walls
    expect(pointInPolygon(throughGap, polygon)).toBe(true)

    // A point at the same angle as a point on wallLeft, but farther out, should be occluded.
    const onWallLeft = { x: -3, y: 5 }
    const dirLeft = normalize(onWallLeft)
    const behindWallLeft = { x: dirLeft.x * 11, y: dirLeft.y * 11 }
    expect(pointInPolygon(behindWallLeft, polygon)).toBe(false)

    // Same check on the right segment.
    const onWallRight = { x: 3, y: 5 }
    const dirRight = normalize(onWallRight)
    const behindWallRight = { x: dirRight.x * 11, y: dirRight.y * 11 }
    expect(pointInPolygon(behindWallRight, polygon)).toBe(false)
  })

  it('does not produce NaN or a degenerate polygon when the origin touches a wall endpoint', () => {
    const origin = { x: 0, y: 0 }
    const wall: Segment = { x1: 0, y1: 0, x2: 5, y2: 0 }
    const polygon = computeVisibilityPolygon(origin, [wall], 10)

    expect(polygon.length).toBeGreaterThan(0)
    for (const point of polygon) {
      expect(Number.isFinite(point.x)).toBe(true)
      expect(Number.isFinite(point.y)).toBe(true)
    }
  })

  it('does not crash on duplicate or zero-length segments', () => {
    const origin = { x: 0, y: 0 }
    const wall: Segment = { x1: -1, y1: 5, x2: 1, y2: 5 }
    const zeroLength: Segment = { x1: 2, y1: 2, x2: 2, y2: 2 }

    expect(() => {
      const polygon = computeVisibilityPolygon(origin, [wall, wall, zeroLength], 10)
      expect(polygon.length).toBeGreaterThan(0)
      for (const point of polygon) {
        expect(Number.isFinite(point.x)).toBe(true)
        expect(Number.isFinite(point.y)).toBe(true)
      }
    }).not.toThrow()
  })

  it('clips correctly at maxRadius: a far wall is ignored, a near wall still occludes', () => {
    const origin = { x: 0, y: 0 }
    const radius = 5
    const farWall: Segment = { x1: 10, y1: -1, x2: 10, y2: 1 } // well beyond the radius
    const nearWall: Segment = { x1: -1, y1: 3, x2: 1, y2: 3 } // inside the radius

    const polygonFarOnly = computeVisibilityPolygon(origin, [farWall], radius)
    // The far wall is well beyond maxRadius, so every vertex should still sit on the radius circle.
    for (const point of polygonFarOnly) {
      expect(distance(origin, point)).toBeCloseTo(radius, 6)
    }

    const polygonWithNear = computeVisibilityPolygon(origin, [nearWall], radius)
    const behindNearWall = { x: 0, y: 4.5 } // past the near wall, still inside maxRadius
    expect(pointInPolygon(behindNearWall, polygonWithNear)).toBe(false)
  })

  it('fully contains an origin inside a closed room with no leaks at any of its four corners', () => {
    // A closed 10x10 room, walls meeting at exactly-coincident corners —
    // this is the scenario WallLayer's endpoint magnetism exists to
    // guarantee in the UI; here we confirm the underlying algorithm itself
    // has no corner-leak bug when segments really do share an endpoint.
    const room: Segment[] = [
      { x1: -5, y1: -5, x2: 5, y2: -5 }, // top
      { x1: 5, y1: -5, x2: 5, y2: 5 }, // right
      { x1: 5, y1: 5, x2: -5, y2: 5 }, // bottom
      { x1: -5, y1: 5, x2: -5, y2: -5 }, // left
    ]
    const origin = { x: 0, y: 0 }
    const maxRadius = 50 // far larger than the room — any leak would reach well past it
    const polygon = computeVisibilityPolygon(origin, room, maxRadius)

    // A sealed room's visibility polygon should never extend past its walls.
    for (const point of polygon) {
      expect(Math.abs(point.x)).toBeLessThanOrEqual(5 + 1e-6)
      expect(Math.abs(point.y)).toBeLessThanOrEqual(5 + 1e-6)
    }

    // Points well outside the room, including straight through each corner,
    // must all be occluded — this is exactly where a coincident-endpoint
    // leak would show up if the ray-triplet handling were wrong.
    const outsidePoints = [
      { x: 20, y: 0 },
      { x: -20, y: 0 },
      { x: 0, y: 20 },
      { x: 0, y: -20 },
      { x: 20, y: 20 }, // through the bottom-right corner
      { x: -20, y: -20 }, // through the top-left corner
      { x: 20, y: -20 }, // through the top-right corner
      { x: -20, y: 20 }, // through the bottom-left corner
    ]
    for (const point of outsidePoints) {
      expect(pointInPolygon(point, polygon)).toBe(false)
    }
  })

  it('lets visibility through a doorway gap in an otherwise-closed room, occluded everywhere else', () => {
    // Same room as above, but the bottom wall has a doorway gap in the middle.
    const room: Segment[] = [
      { x1: -5, y1: -5, x2: 5, y2: -5 }, // top
      { x1: 5, y1: -5, x2: 5, y2: 5 }, // right
      { x1: 5, y1: 5, x2: 1, y2: 5 }, // bottom-right half
      { x1: -1, y1: 5, x2: -5, y2: 5 }, // bottom-left half (gap from x=-1 to x=1)
      { x1: -5, y1: 5, x2: -5, y2: -5 }, // left
    ]
    const origin = { x: 0, y: 0 }
    const polygon = computeVisibilityPolygon(origin, room, 50)

    const throughDoorway = { x: 0, y: 20 } // straight down through the gap
    expect(pointInPolygon(throughDoorway, polygon)).toBe(true)

    const throughRightCorner = { x: 20, y: 20 }
    const throughLeftCorner = { x: -20, y: 20 }
    expect(pointInPolygon(throughRightCorner, polygon)).toBe(false)
    expect(pointInPolygon(throughLeftCorner, polygon)).toBe(false)
  })
})
