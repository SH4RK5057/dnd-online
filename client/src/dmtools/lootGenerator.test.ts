import { describe, expect, it } from 'vitest'
import { rollLoot } from './lootGenerator'
import type { ItemData } from '../content/types'

function item(name: string): ItemData {
  return { key: `test:${name}`, source: 'srd', name, type: '', rarity: 'none', weight: '', value: '', entries: [] }
}

describe('rollLoot', () => {
  it('rolls gold within the expected range for each tier', () => {
    const meager = rollLoot('meager', [], {}, () => 0)
    expect(meager.gold).toBe(1) // 1d6 at roll-floor => 1, no flat bonus

    const meagerMax = rollLoot('meager', [], {}, () => 0.999)
    expect(meagerMax.gold).toBe(6)

    const rich = rollLoot('rich', [], {}, () => 0)
    expect(rich.gold).toBe(25 + 3) // flat 25 + 3d20 at roll-floor => 1 each
  })

  it('includes a trinket by default', () => {
    const result = rollLoot('meager', [], {}, () => 0)
    expect(result.trinket).not.toBeNull()
  })

  it('omits the trinket when disabled', () => {
    const result = rollLoot('meager', [], { includeTrinket: false }, () => 0)
    expect(result.trinket).toBeNull()
  })

  it('picks items from the available pool without duplicates, up to the tier default count', () => {
    const pool = [item('Sword'), item('Shield'), item('Potion')]
    const result = rollLoot('rich', pool, {}, () => 0)
    expect(result.items).toHaveLength(2)
    expect(new Set(result.items.map((i) => i.name)).size).toBe(2)
  })

  it('never returns more items than are available', () => {
    const pool = [item('Sword')]
    const result = rollLoot('rich', pool, {}, () => 0)
    expect(result.items).toHaveLength(1)
  })

  it('respects an explicit itemCount override', () => {
    const pool = [item('Sword'), item('Shield'), item('Potion')]
    const result = rollLoot('meager', pool, { itemCount: 2 }, () => 0)
    expect(result.items).toHaveLength(2)
  })
})
