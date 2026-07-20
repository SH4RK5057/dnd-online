import type { ItemData, MonsterData, SpellData } from './types'

function matchesQuery(name: string, query: string): boolean {
  return query.trim() === '' || name.toLowerCase().includes(query.trim().toLowerCase())
}

export function filterSpells(spells: SpellData[], query: string, level: number | 'all', school: string | 'all'): SpellData[] {
  return spells.filter(
    (s) => matchesQuery(s.name, query) && (level === 'all' || s.level === level) && (school === 'all' || s.school === school),
  )
}

export function filterMonsters(monsters: MonsterData[], query: string, cr: string | 'all', type: string | 'all'): MonsterData[] {
  return monsters.filter(
    (m) =>
      matchesQuery(m.name, query) &&
      (cr === 'all' || m.cr === cr) &&
      (type === 'all' || m.type.toLowerCase().includes(type.toLowerCase())),
  )
}

export function filterItems(items: ItemData[], query: string, type: string | 'all'): ItemData[] {
  return items.filter((i) => matchesQuery(i.name, query) && (type === 'all' || i.type === type))
}
