import { describe, expect, it } from 'vitest'
import { parseNotation, rollNotation } from './notation'

/** Deterministic random source: returns a fixed sequence of [0,1) values,
 * repeating the last one once exhausted. rollDie does floor(x*sides)+1, so
 * to get an exact die face `f` out of `sides`, pass x = (f-1)/sides (using
 * the low end of that face's bucket, safely away from the rounding edge). */
function sequence(...faces: { face: number; sides: number }[]): () => number {
  const values = faces.map(({ face, sides }) => (face - 1) / sides + 0.0001)
  let i = 0
  return () => values[Math.min(i++, values.length - 1)]
}

describe('parseNotation', () => {
  it('parses a single die term', () => {
    expect(parseNotation('1d20')).toEqual({ diceTerms: [{ sign: 1, count: 1, sides: 20 }], modifier: 0 })
  })

  it('parses multiple dice terms and a flat modifier', () => {
    expect(parseNotation('2d6+1d4+3')).toEqual({
      diceTerms: [
        { sign: 1, count: 2, sides: 6 },
        { sign: 1, count: 1, sides: 4 },
      ],
      modifier: 3,
    })
  })

  it('parses negative terms', () => {
    expect(parseNotation('1d20-1d4-2')).toEqual({
      diceTerms: [
        { sign: 1, count: 1, sides: 20 },
        { sign: -1, count: 1, sides: 4 },
      ],
      modifier: -2,
    })
  })

  it('defaults an implicit die count of 1', () => {
    expect(parseNotation('d20')).toEqual({ diceTerms: [{ sign: 1, count: 1, sides: 20 }], modifier: 0 })
  })

  it('throws on empty input', () => {
    expect(() => parseNotation('')).toThrow()
    expect(() => parseNotation('   ')).toThrow()
  })

  it('throws on malformed input', () => {
    expect(() => parseNotation('2d6 + banana')).toThrow()
    expect(() => parseNotation('hello')).toThrow()
  })
})

describe('rollNotation', () => {
  it('rolls a flat modifier-only expression', () => {
    const result = rollNotation(parseNotation('5'), 'normal')
    expect(result.total).toBe(5)
    expect(result.terms).toEqual([])
  })

  it('rolls a simple d20+modifier at normal mode', () => {
    const rng = sequence({ face: 14, sides: 20 })
    const result = rollNotation(parseNotation('1d20+5'), 'normal', rng)
    expect(result.terms).toEqual([{ sign: 1, sides: 20, count: 1, results: [14], kept: [14] }])
    expect(result.total).toBe(19)
  })

  it('keeps the higher roll under advantage', () => {
    const rng = sequence({ face: 6, sides: 20 }, { face: 17, sides: 20 })
    const result = rollNotation(parseNotation('1d20+2'), 'advantage', rng)
    expect(result.terms[0].results).toEqual([6, 17])
    expect(result.terms[0].kept).toEqual([17])
    expect(result.total).toBe(19)
  })

  it('keeps the lower roll under disadvantage', () => {
    const rng = sequence({ face: 6, sides: 20 }, { face: 17, sides: 20 })
    const result = rollNotation(parseNotation('1d20+2'), 'disadvantage', rng)
    expect(result.terms[0].kept).toEqual([6])
    expect(result.total).toBe(8)
  })

  it('does not apply advantage/disadvantage to non-d20 or multi-die terms', () => {
    const rng = sequence({ face: 3, sides: 6 }, { face: 5, sides: 6 })
    const result = rollNotation(parseNotation('2d6'), 'advantage', rng)
    expect(result.terms[0].results).toEqual([3, 5])
    expect(result.terms[0].kept).toEqual([3, 5])
    expect(result.total).toBe(8)
  })

  it('only applies advantage/disadvantage to a LONE d20 term, leaving other terms in a multi-term roll untouched', () => {
    // 5e rule: advantage/disadvantage affects only the single d20 of the
    // check/attack itself, not every die in a compound expression.
    const rng = sequence({ face: 4, sides: 20 }, { face: 19, sides: 20 }, { face: 3, sides: 6 })
    const result = rollNotation(parseNotation('1d20+1d6'), 'advantage', rng)
    expect(result.terms[0].kept).toEqual([19])
    expect(result.terms[1].results).toEqual([3])
    expect(result.total).toBe(19 + 3)
  })

  it('sums negative terms correctly', () => {
    const rng = sequence({ face: 4, sides: 4 })
    const result = rollNotation(parseNotation('10-1d4'), 'normal', rng)
    expect(result.terms[0].kept).toEqual([4])
    expect(result.total).toBe(6)
  })
})
