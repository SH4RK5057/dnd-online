import { describe, expect, it } from 'vitest'
import { snapToHexGrid } from './hexGrid'

const RADIUS = 0.5
const HEX_WIDTH = Math.sqrt(3) * RADIUS
const VERT_SPACING = RADIUS * 1.5

function vertex(row: number, col: number, i: number): { x: number; y: number } {
  const rowOffsetX = row % 2 !== 0 ? HEX_WIDTH / 2 : 0
  const center = { x: col * HEX_WIDTH + rowOffsetX, y: row * VERT_SPACING }
  const angle = (Math.PI / 180) * (60 * i - 90)
  return { x: center.x + RADIUS * Math.cos(angle), y: center.y + RADIUS * Math.sin(angle) }
}

describe('snapToHexGrid', () => {
  it('snaps a point exactly on a vertex back to itself', () => {
    const v = vertex(0, 0, 0)
    const snapped = snapToHexGrid(v)
    expect(snapped.x).toBeCloseTo(v.x, 9)
    expect(snapped.y).toBeCloseTo(v.y, 9)
  })

  it('snaps a nearby offset point to the correct vertex, not the hex center', () => {
    const v = vertex(0, 0, 2)
    const offset = { x: v.x + 0.05, y: v.y - 0.03 }
    const snapped = snapToHexGrid(offset)
    expect(snapped.x).toBeCloseTo(v.x, 6)
    expect(snapped.y).toBeCloseTo(v.y, 6)
    // Sanity: the snapped point must not be the hex center itself.
    expect(Math.hypot(snapped.x - 0, snapped.y - 0)).toBeGreaterThan(0.01)
  })

  it('snaps consistently for two adjacent hexes sharing a vertex — both land on the identical point', () => {
    // Hex (row 0, col 0) and hex (row 1, col 0) share a vertex (pointy-top,
    // odd-row offset) — approach it from a point biased toward each hex and
    // confirm both resolve to the exact same coordinate (critical for walls
    // tracing along shared hex edges to stay bit-for-bit coincident).
    const shared = vertex(0, 0, 4)
    const fromAbove = { x: shared.x + 0.02, y: shared.y - 0.04 }
    const fromBelow = { x: shared.x - 0.03, y: shared.y + 0.02 }
    const a = snapToHexGrid(fromAbove)
    const b = snapToHexGrid(fromBelow)
    expect(a.x).toBeCloseTo(b.x, 9)
    expect(a.y).toBeCloseTo(b.y, 9)
  })

  it('does not produce NaN for an arbitrary point', () => {
    const snapped = snapToHexGrid({ x: 123.456, y: -78.9 })
    expect(Number.isFinite(snapped.x)).toBe(true)
    expect(Number.isFinite(snapped.y)).toBe(true)
  })
})
