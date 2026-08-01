import { describe, expect, it } from 'vitest'
import { rectanglesOverlap, resolveModelHeight, resolveStlScale, snapToSlot, tokenFootprintRect } from './sizeCategory'
import type { TokenRecord } from './types'

function baseToken(overrides: Partial<Pick<TokenRecord, 'sizeCategory' | 'hazardSize' | 'modelHeightCells'>> = {}) {
  return {
    sizeCategory: 'medium' as const,
    hazardSize: null,
    modelHeightCells: null,
    ...overrides,
  }
}

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

describe('resolveModelHeight', () => {
  it('uses an explicit modelHeightCells override over everything else', () => {
    expect(resolveModelHeight(baseToken({ modelHeightCells: 3.5 }))).toBe(3.5)
    expect(resolveModelHeight(baseToken({ sizeCategory: 'huge', modelHeightCells: 0.5 }))).toBe(0.5)
    expect(resolveModelHeight(baseToken({ hazardSize: { widthCells: 2, heightCells: 2 }, modelHeightCells: 2 }))).toBe(2)
  })

  it('gives hazard/trap tokens a flat, low automatic height', () => {
    expect(resolveModelHeight(baseToken({ hazardSize: { widthCells: 2, heightCells: 3 } }))).toBe(0.12)
  })

  it('computes an automatic height from sizeCategory when no override is set', () => {
    // medium: footprint 1 * renderScale 1 * 0.85 = 0.85
    expect(resolveModelHeight(baseToken({ sizeCategory: 'medium' }))).toBeCloseTo(0.85)
    // tiny: footprint 1 * renderScale 0.5 * 0.85 = 0.425
    expect(resolveModelHeight(baseToken({ sizeCategory: 'tiny' }))).toBeCloseTo(0.425)
    // huge: footprint 3 * renderScale 1 * 0.85 = 2.55
    expect(resolveModelHeight(baseToken({ sizeCategory: 'huge' }))).toBeCloseTo(2.55)
  })
})

describe('resolveStlScale', () => {
  it('returns the override height unclamped, ignoring the model natural proportions', () => {
    // Footprint is 1 cell wide, but the model is 3 units wide at height 1 —
    // an explicit override still wins, even though it would overflow.
    expect(resolveStlScale(baseToken({ modelHeightCells: 2 }), 3, 3)).toBe(2)
  })

  it('uses the height target when the model is slender enough to fit', () => {
    // medium footprint 1x1, target height 0.85; a slender model (0.3 wide/deep
    // at height 1) needs scale 1/0.3≈3.33 to overflow — height wins.
    expect(resolveStlScale(baseToken({ sizeCategory: 'medium' }), 0.3, 0.3)).toBeCloseTo(0.85)
  })

  it('clamps to the footprint-fit scale when the model is wider than its footprint allows', () => {
    // medium footprint 1x1, target height 0.85; a wide model (1.5 wide at
    // height 1) would need scale 1/1.5≈0.667 to fit — narrower than the
    // height target, so width wins.
    expect(resolveStlScale(baseToken({ sizeCategory: 'medium' }), 1.5, 0.3)).toBeCloseTo(1 / 1.5)
  })

  it('uses the more constraining of width vs depth', () => {
    expect(resolveStlScale(baseToken({ sizeCategory: 'medium' }), 1.5, 2)).toBeCloseTo(1 / 2)
  })

  it('uses the hazard footprint dimensions (not sizeCategory) for hazard tokens', () => {
    // hazard 4x2 cells, wide model (3 units wide, 1 deep at height 1):
    // scaleForWidth = 4/3, scaleForDepth = 2/1 = 2, target height (hazard) = 0.12 — height wins regardless.
    expect(resolveStlScale(baseToken({ hazardSize: { widthCells: 4, heightCells: 2 } }), 3, 1)).toBeCloseTo(0.12)
  })
})
