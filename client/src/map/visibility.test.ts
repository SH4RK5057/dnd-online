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
})
