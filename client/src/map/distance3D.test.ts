import { describe, expect, it } from 'vitest'
import { distance3D } from './distance3D'

describe('distance3D', () => {
  it('matches plain 2D distance when both points share the same altitude', () => {
    expect(distance3D({ x: 0, y: 0, z: 0 }, { x: 3, y: 4, z: 0 })).toBeCloseTo(5, 6)
  })

  it('accounts for altitude difference', () => {
    // 3-4-5 in x/z instead of x/y.
    expect(distance3D({ x: 0, y: 0, z: 0 }, { x: 3, y: 0, z: 4 })).toBeCloseTo(5, 6)
  })

  it('is zero for the same point', () => {
    expect(distance3D({ x: 5, y: 5, z: 2 }, { x: 5, y: 5, z: 2 })).toBe(0)
  })

  it('combines all three axes', () => {
    expect(distance3D({ x: 0, y: 0, z: 0 }, { x: 1, y: 2, z: 2 })).toBeCloseTo(3, 6)
  })
})
