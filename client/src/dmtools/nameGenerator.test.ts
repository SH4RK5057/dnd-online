import { describe, expect, it } from 'vitest'
import { generateName, NAME_STYLES } from './nameGenerator'

describe('generateName', () => {
  it('produces a non-empty name for every style', () => {
    for (const style of NAME_STYLES) {
      const name = generateName(style, () => 0)
      expect(name.length).toBeGreaterThan(0)
    }
  })

  it('is deterministic given a fixed random source', () => {
    const a = generateName('common', () => 0.3)
    const b = generateName('common', () => 0.3)
    expect(a).toBe(b)
  })

  it('omits the middle fragment when the random source rolls high', () => {
    // randomSource() < 0.5 gates the middle fragment — a constant 0.9 always
    // fails that check, so the result is just a start + end fragment
    // (common.starts[9] = 'Cor', common.ends[7] = 'in').
    const name = generateName('common', () => 0.9)
    expect(name).toBe('Corin')
  })

  it('varies output across different random sources', () => {
    const names = new Set(Array.from({ length: 20 }, (_, i) => generateName('flowing', () => (i % 10) / 10)))
    expect(names.size).toBeGreaterThan(1)
  })
})
