export interface Point {
  x: number
  y: number
}

export interface Segment {
  x1: number
  y1: number
  x2: number
  y2: number
}

const EPSILON = 1e-4
const ANGLE_EPSILON = 1e-4
const NUDGE_DISTANCE = 1e-3
/** Baseline angular resolution for approximating the maxRadius boundary as a
 * circle in open areas where wall endpoints are sparse or absent. */
const BASELINE_RAY_COUNT = 64

/**
 * Computes the visibility polygon from `origin`, given `segments` as opaque
 * line-segment occluders, bounded by `maxRadius`.
 *
 * Radial-sweep technique: cast rays at every wall-endpoint angle (each as a
 * trio — angle-epsilon, angle, angle+epsilon — so corners are resolved
 * correctly on both sides), plus a baseline evenly-spaced spread so the
 * maxRadius boundary reads as a circle rather than a rough polygon in open
 * areas. Take the nearest occluder hit per ray (or maxRadius if none), sort
 * all hits by angle, and the sorted points are the polygon vertices.
 */
export function computeVisibilityPolygon(origin: Point, segments: Segment[], maxRadius: number): Point[] {
  const usableSegments = segments.filter((s) => segmentLength(s) > EPSILON)
  const safeOrigin = nudgeOffWalls(origin, usableSegments)

  const angles = new Set<number>()
  for (let i = 0; i < BASELINE_RAY_COUNT; i++) {
    angles.add((i / BASELINE_RAY_COUNT) * Math.PI * 2)
  }

  const cornerAngles = new Set<number>()
  for (const seg of usableSegments) {
    cornerAngles.add(Math.atan2(seg.y1 - safeOrigin.y, seg.x1 - safeOrigin.x))
    cornerAngles.add(Math.atan2(seg.y2 - safeOrigin.y, seg.x2 - safeOrigin.x))
  }

  const rayAngles: number[] = [...angles]
  for (const angle of cornerAngles) {
    rayAngles.push(angle - ANGLE_EPSILON, angle, angle + ANGLE_EPSILON)
  }

  const hits: { angle: number; point: Point; distance: number }[] = rayAngles.map((angle) => {
    const dir = { x: Math.cos(angle), y: Math.sin(angle) }
    const { point, distance } = castRay(safeOrigin, dir, usableSegments, maxRadius)
    return { angle, point, distance }
  })

  hits.sort((a, b) => a.angle - b.angle || a.distance - b.distance)

  return hits.map((h) => h.point)
}

function castRay(origin: Point, dir: Point, segments: Segment[], maxRadius: number): { point: Point; distance: number } {
  let nearestDistance = maxRadius
  for (const seg of segments) {
    const t = raySegmentIntersection(origin, dir, seg)
    if (t !== null && t < nearestDistance) {
      nearestDistance = t
    }
  }
  return {
    point: { x: origin.x + dir.x * nearestDistance, y: origin.y + dir.y * nearestDistance },
    distance: nearestDistance,
  }
}

/** Standard ray/segment intersection (ray: origin + dir*t1, t1>=0; segment:
 * p1 + (p2-p1)*t2, 0<=t2<=1). Returns the ray parameter (== distance, since
 * `dir` is always a unit vector in this module) or null if there's no valid
 * intersection, including the parallel case (near-zero denominator). */
function raySegmentIntersection(origin: Point, dir: Point, seg: Segment): number | null {
  const sdx = seg.x2 - seg.x1
  const sdy = seg.y2 - seg.y1

  const denom = sdx * dir.y - sdy * dir.x
  if (Math.abs(denom) < EPSILON) return null // parallel (or collinear)

  const t2 = (dir.x * (seg.y1 - origin.y) + dir.y * (origin.x - seg.x1)) / denom
  if (t2 < 0 || t2 > 1) return null

  // Whichever axis dir has more magnitude in avoids dividing by a near-zero component.
  const t1 = Math.abs(dir.x) > Math.abs(dir.y) ? (seg.x1 + sdx * t2 - origin.x) / dir.x : (seg.y1 + sdy * t2 - origin.y) / dir.y

  if (t1 < 0) return null
  return t1
}

function distanceToSegment(p: Point, seg: Segment): number {
  const dx = seg.x2 - seg.x1
  const dy = seg.y2 - seg.y1
  const lenSq = dx * dx + dy * dy
  if (lenSq < EPSILON) return Math.hypot(p.x - seg.x1, p.y - seg.y1)

  const t = Math.max(0, Math.min(1, ((p.x - seg.x1) * dx + (p.y - seg.y1) * dy) / lenSq))
  return Math.hypot(p.x - (seg.x1 + t * dx), p.y - (seg.y1 + t * dy))
}

function segmentLength(seg: Segment): number {
  return Math.hypot(seg.x2 - seg.x1, seg.y2 - seg.y1)
}

/** Pushes the origin a tiny distance off any wall it's touching (a token
 * standing in a doorway, or exactly on a wall's endpoint) so the sweep never
 * has to reason about a zero-distance ray. */
function nudgeOffWalls(origin: Point, segments: Segment[]): Point {
  let nudged = origin
  for (const seg of segments) {
    if (distanceToSegment(nudged, seg) >= EPSILON) continue
    const dx = seg.x2 - seg.x1
    const dy = seg.y2 - seg.y1
    const len = Math.hypot(dx, dy)
    if (len < EPSILON) continue
    // Perpendicular unit vector to the wall's line.
    const nx = -dy / len
    const ny = dx / len
    nudged = { x: nudged.x + nx * NUDGE_DISTANCE, y: nudged.y + ny * NUDGE_DISTANCE }
  }
  return nudged
}
