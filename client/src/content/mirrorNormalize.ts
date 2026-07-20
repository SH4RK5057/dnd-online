/** Best-effort normalizers from raw 5etools-2014-src JSON shapes into this
 * app's SpellData/MonsterData/ItemData. Real 5etools JSON has many
 * version-to-version quirks — these are defensive (missing/oddly-shaped
 * fields degrade to empty strings/defaults rather than throwing) rather than
 * a full-fidelity reimplementation of 5etools' own parser. */
import type { ItemData, MonsterAction, MonsterData, SpellData } from './types'

const SCHOOL_CODES: Record<string, string> = {
  A: 'Abjuration',
  C: 'Conjuration',
  D: 'Divination',
  E: 'Enchantment',
  V: 'Evocation',
  I: 'Illusion',
  N: 'Necromancy',
  T: 'Transmutation',
}

const SIZE_CODES: Record<string, string> = {
  T: 'Tiny',
  S: 'Small',
  M: 'Medium',
  L: 'Large',
  H: 'Huge',
  G: 'Gargantuan',
}

function asString(value: unknown): string {
  if (typeof value === 'string') return value
  if (typeof value === 'number') return String(value)
  return ''
}

/** 5etools "entries" arrays mix plain strings with nested objects (lists,
 * tables, sub-entries) — this flattens to a plain string array, rendering
 * any object entry's own `entries`/`items` recursively and dropping ones
 * with no textual content rather than crashing on an unfamiliar shape. */
function flattenEntries(entries: unknown): string[] {
  if (!Array.isArray(entries)) return []
  const out: string[] = []
  for (const entry of entries) {
    if (typeof entry === 'string') {
      out.push(entry)
    } else if (entry && typeof entry === 'object') {
      const obj = entry as Record<string, unknown>
      if (Array.isArray(obj.entries)) out.push(...flattenEntries(obj.entries))
      else if (Array.isArray(obj.items)) out.push(...flattenEntries(obj.items))
      else if (typeof obj.name === 'string') out.push(obj.name)
    }
  }
  return out
}

function normalizeRange(range: unknown): string {
  if (typeof range === 'string') return range
  if (range && typeof range === 'object') {
    const r = range as { type?: string; distance?: { type?: string; amount?: number } }
    if (r.type === 'point' && r.distance) {
      return r.distance.type === 'feet' ? `${r.distance.amount ?? '?'} feet` : String(r.distance.type ?? 'point')
    }
    if (r.type) return r.type
  }
  return ''
}

function normalizeComponents(components: unknown): string {
  if (typeof components === 'string') return components
  if (components && typeof components === 'object') {
    const c = components as { v?: boolean; s?: boolean; m?: boolean | string }
    const parts: string[] = []
    if (c.v) parts.push('V')
    if (c.s) parts.push('S')
    if (c.m) parts.push(typeof c.m === 'string' ? `M (${c.m})` : 'M')
    return parts.join(', ')
  }
  return ''
}

function normalizeTime(time: unknown): string {
  if (typeof time === 'string') return time
  if (Array.isArray(time) && time[0] && typeof time[0] === 'object') {
    const t = time[0] as { number?: number; unit?: string }
    return `${t.number ?? 1} ${t.unit ?? 'action'}`
  }
  return ''
}

function normalizeDuration(duration: unknown): string {
  if (typeof duration === 'string') return duration
  if (Array.isArray(duration) && duration[0] && typeof duration[0] === 'object') {
    const d = duration[0] as { type?: string; duration?: { amount?: number; type?: string } }
    if (d.type === 'timed' && d.duration) return `${d.duration.amount ?? '?'} ${d.duration.type ?? ''}`.trim()
    return d.type ?? ''
  }
  return ''
}

export function normalizeSpell(raw: unknown, key: string): SpellData | null {
  if (!raw || typeof raw !== 'object') return null
  const r = raw as Record<string, unknown>
  if (typeof r.name !== 'string') return null
  const classes: string[] = []
  const fromClassList = (r.classes as { fromClassList?: { name?: string }[] } | undefined)?.fromClassList
  if (Array.isArray(fromClassList)) {
    for (const c of fromClassList) if (typeof c.name === 'string') classes.push(c.name)
  }
  return {
    key,
    source: 'mirror',
    name: r.name,
    level: typeof r.level === 'number' ? r.level : 0,
    school: SCHOOL_CODES[asString(r.school)] ?? asString(r.school),
    castingTime: normalizeTime(r.time),
    range: normalizeRange(r.range),
    components: normalizeComponents(r.components),
    duration: normalizeDuration(r.duration),
    classes,
    entries: flattenEntries(r.entries),
  }
}

function normalizeAc(ac: unknown): { value: number; note: string } {
  if (typeof ac === 'number') return { value: ac, note: '' }
  if (Array.isArray(ac) && ac[0] !== undefined) {
    const first = ac[0]
    if (typeof first === 'number') return { value: first, note: '' }
    if (first && typeof first === 'object') {
      const f = first as { ac?: number; from?: string[] }
      return { value: f.ac ?? 10, note: Array.isArray(f.from) ? f.from.join(', ') : '' }
    }
  }
  return { value: 10, note: '' }
}

function normalizeHp(hp: unknown): { value: number; formula: string } {
  if (typeof hp === 'number') return { value: hp, formula: '' }
  if (hp && typeof hp === 'object') {
    const h = hp as { average?: number; formula?: string }
    return { value: h.average ?? 0, formula: h.formula ?? '' }
  }
  return { value: 0, formula: '' }
}

function normalizeSpeed(speed: unknown): string {
  if (typeof speed === 'string') return speed
  if (speed && typeof speed === 'object') {
    const parts: string[] = []
    for (const [mode, value] of Object.entries(speed as Record<string, unknown>)) {
      if (typeof value === 'number') parts.push(mode === 'walk' ? `${value} ft.` : `${mode} ${value} ft.`)
    }
    return parts.join(', ')
  }
  return ''
}

function normalizeActionList(list: unknown): MonsterAction[] {
  if (!Array.isArray(list)) return []
  const out: MonsterAction[] = []
  for (const entry of list) {
    if (entry && typeof entry === 'object') {
      const e = entry as { name?: string; entries?: unknown }
      out.push({ name: e.name ?? '', entries: flattenEntries(e.entries) })
    }
  }
  return out
}

export function normalizeMonster(raw: unknown, key: string): MonsterData | null {
  if (!raw || typeof raw !== 'object') return null
  const r = raw as Record<string, unknown>
  if (typeof r.name !== 'string') return null
  const ac = normalizeAc(r.ac)
  const hp = normalizeHp(r.hp)
  const sizeRaw = Array.isArray(r.size) ? asString(r.size[0]) : asString(r.size)
  return {
    key,
    source: 'mirror',
    name: r.name,
    size: SIZE_CODES[sizeRaw] ?? sizeRaw,
    type: typeof r.type === 'string' ? r.type : asString((r.type as { type?: string } | undefined)?.type),
    alignment: Array.isArray(r.alignment) ? r.alignment.join(' ') : asString(r.alignment),
    ac: ac.value,
    acNote: ac.note,
    hp: hp.value,
    hitDice: hp.formula,
    speed: normalizeSpeed(r.speed),
    abilities: {
      str: typeof r.str === 'number' ? r.str : 10,
      dex: typeof r.dex === 'number' ? r.dex : 10,
      con: typeof r.con === 'number' ? r.con : 10,
      int: typeof r.int === 'number' ? r.int : 10,
      wis: typeof r.wis === 'number' ? r.wis : 10,
      cha: typeof r.cha === 'number' ? r.cha : 10,
    },
    savingThrows: r.save && typeof r.save === 'object' ? Object.entries(r.save as Record<string, string>).map(([k, v]) => `${k} ${v}`).join(', ') : '',
    skills: r.skill && typeof r.skill === 'object' ? Object.entries(r.skill as Record<string, string>).map(([k, v]) => `${k} ${v}`).join(', ') : '',
    damageResistances: Array.isArray(r.resist) ? r.resist.join(', ') : asString(r.resist),
    damageImmunities: Array.isArray(r.immune) ? r.immune.join(', ') : asString(r.immune),
    conditionImmunities: Array.isArray(r.conditionImmune) ? r.conditionImmune.join(', ') : asString(r.conditionImmune),
    senses: Array.isArray(r.senses) ? r.senses.join(', ') : asString(r.senses),
    languages: Array.isArray(r.languages) ? r.languages.join(', ') : asString(r.languages),
    cr: asString(r.cr),
    traits: normalizeActionList(r.trait),
    actions: normalizeActionList(r.action),
    legendaryActions: normalizeActionList(r.legendary),
  }
}

export function normalizeItem(raw: unknown, key: string): ItemData | null {
  if (!raw || typeof raw !== 'object') return null
  const r = raw as Record<string, unknown>
  if (typeof r.name !== 'string') return null
  return {
    key,
    source: 'mirror',
    name: r.name,
    type: asString(r.type),
    rarity: asString(r.rarity) || 'none',
    weight: typeof r.weight === 'number' ? `${r.weight} lb.` : asString(r.weight),
    value: typeof r.value === 'number' ? `${r.value / 100} gp` : asString(r.value),
    entries: flattenEntries(r.entries),
  }
}
