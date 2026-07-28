import { describe, expect, it } from 'vitest'
import { rectanglesOverlap, snapToSlot, tokenFootprintRect } from './sizeCategory'

describe('snapToSlot', () => {
  it('for a 1-cell token, anchors to whichever cell the point falls within (not the nearest grid line)', () => {
    // A click just past the start of cell 0 should stay in cell 0, not get
    // rounded up into cell 1 the way Math.round(0.5) would.
    expect(snapToSlot(0.01, 1)).toBe(0)
    expect(snapToSlot(0.49, 1)).toBe(0)
    expect(snapToSlot(0.5, 1)).toBe(0)
    expect(snapToSlot(0.99, 1)).toBe(0)
    expect(snapToSlot(1.0, 1)).toBe(1)
    expect(snapToSlot(1.5, 1)).toBe(1)
  })

  it('handles negative coordinates the same way', () => {
    expect(snapToSlot(-0.5, 1)).toBe(-1)
    expect(snapToSlot(-0.01, 1)).toBe(-1)
    expect(snapToSlot(0, 1)).toBe(0)
  })

  it('for a 2-cell (large) token, centers the clicked point within the 2x2 block', () => {
    // Anchor (top-left) should be one cell back from wherever's closest to center.
    expect(snapToSlot(1.5, 2)).toBe(1)
    expect(snapToSlot(2.0, 2)).toBe(1)
    expect(snapToSlot(2.5, 2)).toBe(2)
  })

  it('for a 3-cell (huge) token, centers similarly', () => {
    expect(snapToSlot(3.0, 3)).toBe(2)
    expect(snapToSlot(4.0, 3)).toBe(3)
  })
})

describe('rectanglesOverlap', () => {
  it('is true for overlapping rectangles', () => {
    const a = tokenFootprintRect(0, 0, 2, 2)
    const b = tokenFootprintRect(1, 1, 2, 2)
    expect(rectanglesOverlap(a, b)).toBe(true)
  })

  it('is false for rectangles that only touch edges', () => {
    const a = tokenFootprintRect(0, 0, 2, 2)
    const b = tokenFootprintRect(2, 0, 2, 2)
    expect(rectanglesOverlap(a, b)).toBe(false)
  })

  it('is false for separated rectangles', () => {
    const a = tokenFootprintRect(0, 0, 1, 1)
    const b = tokenFootprintRect(5, 5, 1, 1)
    expect(rectanglesOverlap(a, b)).toBe(false)
  })

  it('is true when one rectangle fully contains the other', () => {
    const a = tokenFootprintRect(0, 0, 5, 5)
    const b = tokenFootprintRect(2, 2, 1, 1)
    expect(rectanglesOverlap(a, b)).toBe(true)
  })
})
