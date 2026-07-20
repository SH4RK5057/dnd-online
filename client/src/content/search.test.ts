import { describe, expect, it } from 'vitest'
import { filterItems, filterMonsters, filterSpells } from './search'
import { SRD_ITEMS, SRD_MONSTERS, SRD_SPELLS } from './srdData'

describe('filterSpells', () => {
  it('matches by case-insensitive substring of name', () => {
    const results = filterSpells(SRD_SPELLS, 'fire', 'all', 'all')
    expect(results.map((s) => s.name)).toEqual(expect.arrayContaining(['Fire Bolt', 'Fireball']))
  })

  it('filters by level', () => {
    const results = filterSpells(SRD_SPELLS, '', 3, 'all')
    expect(results).toHaveLength(1)
    expect(results[0].name).toBe('Fireball')
  })

  it('filters by school', () => {
    const results = filterSpells(SRD_SPELLS, '', 'all', 'Abjuration')
    expect(results.map((s) => s.name)).toEqual(['Shield'])
  })

  it('returns everything when filters are all "all" and query is empty', () => {
    expect(filterSpells(SRD_SPELLS, '', 'all', 'all')).toHaveLength(SRD_SPELLS.length)
  })
})

describe('filterMonsters', () => {
  it('matches by name substring', () => {
    expect(filterMonsters(SRD_MONSTERS, 'gob', 'all', 'all').map((m) => m.name)).toEqual(['Goblin'])
  })

  it('filters by challenge rating', () => {
    expect(filterMonsters(SRD_MONSTERS, '', '1/4', 'all').map((m) => m.name).sort()).toEqual(['Goblin', 'Skeleton', 'Wolf'].sort())
  })

  it('filters by type substring', () => {
    expect(filterMonsters(SRD_MONSTERS, '', 'all', 'humanoid').map((m) => m.name).sort()).toEqual(['Goblin', 'Orc'].sort())
  })
})

describe('filterItems', () => {
  it('matches by name substring', () => {
    expect(filterItems(SRD_ITEMS, 'potion', 'all').map((i) => i.name)).toEqual(['Potion of Healing'])
  })

  it('filters by type', () => {
    expect(filterItems(SRD_ITEMS, '', 'Potion').map((i) => i.name)).toEqual(['Potion of Healing'])
  })
})
