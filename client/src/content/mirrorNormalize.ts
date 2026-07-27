/** Best-effort normalizers from raw 5etools-2014-src JSON shapes into this
 * app's SpellData/MonsterData/ItemData. Real 5etools JSON has many
 * version-to-version quirks — these are defensive (missing/oddly-shaped
 * fields degrade to empty strings/defaults rather than throwing) rather than
 * a full-fidelity reimplementation of 5etools' own parser. */
import type { AbilityKey, SkillId } from '../character/types'
import type { ClassData, ClassFeatureData, ItemData, MonsterAction, MonsterData, RaceData, SpellData, SubclassData } from './types'

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

const VALID_ABILITY_KEYS = new Set<string>(['str', 'dex', 'con', 'int', 'wis', 'cha'])

function normalizeAbilityBonuses(ability: unknown): Partial<Record<AbilityKey, number>> {
  // 5etools' `ability` field is an array (usually length 1) of objects
  // mapping ability -> bonus, e.g. [{dex: 2}] — a `choose` variant (pick N
  // abilities for +1 each) exists too but isn't modeled here; that entry's
  // numeric keys are simply skipped, degrading to "no bonus from that
  // clause" rather than throwing.
  const out: Partial<Record<AbilityKey, number>> = {}
  const first = Array.isArray(ability) ? ability[0] : ability
  if (!first || typeof first !== 'object') return out
  for (const [k, v] of Object.entries(first as Record<string, unknown>)) {
    if (VALID_ABILITY_KEYS.has(k) && typeof v === 'number') out[k as AbilityKey] = v
  }
  return out
}

function normalizeRaceSpeed(speed: unknown): number {
  if (typeof speed === 'number') return speed
  if (speed && typeof speed === 'object') {
    const walk = (speed as Record<string, unknown>).walk
    if (typeof walk === 'number') return walk
  }
  return 30
}

export function normalizeRace(raw: unknown, key: string): RaceData | null {
  if (!raw || typeof raw !== 'object') return null
  const r = raw as Record<string, unknown>
  if (typeof r.name !== 'string') return null
  const sizeRaw = Array.isArray(r.size) ? asString(r.size[0]) : asString(r.size)
  return {
    key,
    source: 'mirror',
    name: r.name,
    size: SIZE_CODES[sizeRaw] ?? sizeRaw ?? 'Medium',
    speed: normalizeRaceSpeed(r.speed),
    abilityBonuses: normalizeAbilityBonuses(r.ability),
    traits: flattenEntries(r.entries).slice(0, 5),
  }
}

function normalizeSavingThrows(proficiency: unknown): AbilityKey[] {
  if (!Array.isArray(proficiency)) return []
  return proficiency.filter((p): p is AbilityKey => typeof p === 'string' && VALID_ABILITY_KEYS.has(p))
}

/** Maps a 5etools skill display name ("Sleight of Hand") to this app's
 * camelCase SkillId ("sleightOfHand") — the startingProficiencies.skills
 * choice list is written as display names, not ids. */
const SKILL_NAME_TO_ID: Record<string, SkillId> = {
  acrobatics: 'acrobatics',
  'animal handling': 'animalHandling',
  arcana: 'arcana',
  athletics: 'athletics',
  deception: 'deception',
  history: 'history',
  insight: 'insight',
  intimidation: 'intimidation',
  investigation: 'investigation',
  medicine: 'medicine',
  nature: 'nature',
  perception: 'perception',
  performance: 'performance',
  persuasion: 'persuasion',
  religion: 'religion',
  'sleight of hand': 'sleightOfHand',
  stealth: 'stealth',
  survival: 'survival',
}
const ALL_SKILL_IDS = Object.values(SKILL_NAME_TO_ID)

function normalizeSkillChoices(startingProficiencies: unknown): { choices: SkillId[]; count: number } {
  const sp = startingProficiencies as { skills?: unknown } | undefined
  const skillsField = sp?.skills
  const chooseEntry = Array.isArray(skillsField)
    ? (skillsField.find((e) => e && typeof e === 'object' && 'choose' in (e as object)) as
        | { choose?: { from?: unknown[]; count?: number } }
        | undefined)
    : undefined
  const from = chooseEntry?.choose?.from
  const count = typeof chooseEntry?.choose?.count === 'number' ? chooseEntry.choose.count : 2
  if (!Array.isArray(from) || from.length === 0) return { choices: ALL_SKILL_IDS, count }
  const choices: SkillId[] = []
  for (const entry of from) {
    const name = asString(entry).toLowerCase()
    const id = SKILL_NAME_TO_ID[name]
    if (id) choices.push(id)
  }
  return { choices: choices.length > 0 ? choices : ALL_SKILL_IDS, count }
}

const STANDARD_ASI_LEVELS = [4, 8, 12, 16, 19]
const SUBCLASS_CHOICE_NAME_PATTERN = /domain|archetype|circle|tradition|origin|patron|oath|path|college|conclave|bloodline/i

/** Best-effort detection of which levels grant an Ability Score Improvement
 * — scans feature names for "Ability Score Improvement" rather than relying
 * on any fixed schema field, since 5etools' `classFeatures` reference-string
 * array format varies and isn't worth parsing exactly. Falls back to the
 * standard 5e levels when nothing is found (e.g. a thin/partial mirror). */
function detectAsiLevels(features: ClassFeatureData[]): number[] {
  const levels = features.filter((f) => /ability score improvement/i.test(f.name)).map((f) => f.level)
  return levels.length > 0 ? levels : STANDARD_ASI_LEVELS
}

/** Best-effort detection of the level a subclass must be chosen at — scans
 * feature names for common subclass-choice naming patterns (every core 5e
 * class's subclass-choice feature is named things like "Divine Domain",
 * "Martial Archetype", "Primal Path", etc.). Falls back to 3, the most
 * common value, when nothing matches. */
function detectSubclassLevel(features: ClassFeatureData[]): number {
  const match = features.find((f) => SUBCLASS_CHOICE_NAME_PATTERN.test(f.name))
  return match ? match.level : 3
}

function normalizeClassFeatureEntry(raw: unknown): ClassFeatureData | null {
  if (!raw || typeof raw !== 'object') return null
  const r = raw as Record<string, unknown>
  if (typeof r.name !== 'string') return null
  return { level: typeof r.level === 'number' ? r.level : 1, name: r.name, entries: flattenEntries(r.entries) }
}

/** Parses a file's whole `classFeature` (or `subclassFeature`) array into
 * per-class (or per-subclass) buckets, keyed by the raw `className` (or
 * `subclassShortName`) field — callers look up the bucket matching the
 * class/subclass they're currently normalizing. */
export function groupFeaturesByKey(rawList: unknown, keyField: string): Map<string, ClassFeatureData[]> {
  const groups = new Map<string, ClassFeatureData[]>()
  if (!Array.isArray(rawList)) return groups
  for (const raw of rawList) {
    if (!raw || typeof raw !== 'object') continue
    const r = raw as Record<string, unknown>
    const groupKey = typeof r[keyField] === 'string' ? (r[keyField] as string) : null
    if (!groupKey) continue
    const feature = normalizeClassFeatureEntry(raw)
    if (!feature) continue
    const bucket = groups.get(groupKey) ?? []
    bucket.push(feature)
    groups.set(groupKey, bucket)
  }
  return groups
}

export function normalizeClass(raw: unknown, key: string, features: ClassFeatureData[] = []): ClassData | null {
  if (!raw || typeof raw !== 'object') return null
  const r = raw as Record<string, unknown>
  if (typeof r.name !== 'string') return null
  const hd = r.hd as { faces?: number } | undefined
  const { choices, count } = normalizeSkillChoices(r.startingProficiencies)
  const sortedFeatures = [...features].sort((a, b) => a.level - b.level)
  return {
    key,
    source: 'mirror',
    name: r.name,
    hitDie: typeof hd?.faces === 'number' ? hd.faces : 8,
    savingThrows: normalizeSavingThrows(r.proficiency),
    skillChoices: choices,
    skillChoiceCount: count,
    asiLevels: detectAsiLevels(sortedFeatures),
    subclassLevel: detectSubclassLevel(sortedFeatures),
    features: sortedFeatures,
  }
}

export function normalizeSubclass(raw: unknown, key: string, features: ClassFeatureData[] = []): SubclassData | null {
  if (!raw || typeof raw !== 'object') return null
  const r = raw as Record<string, unknown>
  if (typeof r.name !== 'string' || typeof r.className !== 'string') return null
  return {
    key,
    source: 'mirror',
    name: r.name,
    className: r.className,
    features: [...features].sort((a, b) => a.level - b.level),
  }
}
