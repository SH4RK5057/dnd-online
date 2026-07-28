import type { AbilityKey, AbilityScores, CharacterRecord, ResourceEntry, SkillId } from './types'
import type { TokenRecord } from '../map/types'
import type { RaceData } from '../content/types'

const ABILITY_KEYS_SET = new Set<string>(['str', 'dex', 'con', 'int', 'wis', 'cha'])

/** Fills in fields for a CharacterRecord persisted (localStorage or an
 * existing campaign Yjs doc) before those fields existed — `abilities` is
 * treated as if it were already the base (no racial bonus known), which is
 * the only reasonable assumption without re-deriving history; `xp`/
 * `subclassName`/`resolvedAsiLevels`/`featureChoices`/`overrides` default to
 * "hasn't leveled up / made any choices under this system yet." Every
 * character read path should go through this. */
export function normalizeCharacterRecord(character: CharacterRecord): CharacterRecord {
  if (
    character.abilityMethod &&
    character.baseAbilities &&
    character.resolvedAsiLevels &&
    character.subclassName !== undefined &&
    character.xp !== undefined &&
    character.featureChoices &&
    character.overrides
  ) {
    return character
  }
  return {
    ...character,
    abilityMethod: character.abilityMethod ?? 'manual',
    baseAbilities: character.baseAbilities ?? character.abilities,
    subclassName: character.subclassName ?? '',
    xp: character.xp ?? 0,
    resolvedAsiLevels: character.resolvedAsiLevels ?? [],
    featureChoices: character.featureChoices ?? {},
    overrides: character.overrides ?? [],
  }
}

/** Standard 5e ability-score-to-modifier table: floor((score - 10) / 2). */
export function computeModifier(score: number): number {
  return Math.floor((score - 10) / 2)
}

/** Standard 5e proficiency-bonus-by-level table. */
export function computeProficiencyBonus(level: number): number {
  const clamped = Math.min(20, Math.max(1, level))
  return 2 + Math.floor((clamped - 1) / 4)
}

export const SKILL_ABILITY_MAP: Record<SkillId, AbilityKey> = {
  athletics: 'str',
  acrobatics: 'dex',
  sleightOfHand: 'dex',
  stealth: 'dex',
  arcana: 'int',
  history: 'int',
  investigation: 'int',
  nature: 'int',
  religion: 'int',
  animalHandling: 'wis',
  insight: 'wis',
  medicine: 'wis',
  perception: 'wis',
  survival: 'wis',
  deception: 'cha',
  intimidation: 'cha',
  performance: 'cha',
  persuasion: 'cha',
}

export function computeSaveBonus(character: Pick<CharacterRecord, 'abilities' | 'level' | 'saveProficiencies'>, ability: AbilityKey): number {
  const mod = computeModifier(character.abilities[ability])
  const proficient = character.saveProficiencies[ability]
  return proficient ? mod + computeProficiencyBonus(character.level) : mod
}

export function computeSkillBonus(character: Pick<CharacterRecord, 'abilities' | 'level' | 'skillProficiencies'>, skill: SkillId): number {
  const ability = SKILL_ABILITY_MAP[skill]
  const mod = computeModifier(character.abilities[ability])
  const proficiency = character.skillProficiencies[skill]
  const profBonus = computeProficiencyBonus(character.level)
  if (proficiency === 'expertise') return mod + profBonus * 2
  if (proficiency === 'proficient') return mod + profBonus
  return mod
}

export function computeInitiativeBonus(character: Pick<CharacterRecord, 'abilities' | 'initiativeBonus'>): number {
  return computeModifier(character.abilities.dex) + character.initiativeBonus
}

export interface ResolvedHp {
  current: number
  max: number
  temp: number
  /** True when HP is authoritative on the character (linked token); false
   * when it's authoritative directly on the token (unlinked NPC/monster). */
  fromCharacter: boolean
}

/**
 * HP splits by lifetime, not by "which entity owns the field": a wound
 * shouldn't heal because the DM switched maps, so a character-linked
 * token's HP always lives on `CharacterRecord.hp` — `TokenRecord.hp` is
 * only read for tokens with `characterId === null` (loose monster/NPC
 * tokens with no sheet). Every HP read/write site should go through this
 * resolver instead of re-deriving the `characterId` branch itself.
 */
export function resolveTokenHp(token: TokenRecord, charactersById: Map<string, CharacterRecord>): ResolvedHp | null {
  if (token.characterId) {
    const character = charactersById.get(token.characterId)
    if (!character) return null
    return { ...character.hp, fromCharacter: true }
  }
  if (token.hp) return { ...token.hp, fromCharacter: false }
  return null
}

export function emptyAbilityScores(): AbilityScores {
  return { str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 10 }
}

/** Extracts the die COUNT from a free-text hit-dice string like "3d8" (the
 * die size after the "d" is cosmetic display only, not used for tracking
 * how many are available to spend). Returns 0 for anything unparseable. */
export function parseHitDiceCount(hitDice: string): number {
  const match = /^(\d+)d\d+/i.exec(hitDice.trim())
  return match ? Number(match[1]) : 0
}

/** Standard 5e max-HP formula: max die value at level 1, then average
 * (rounded up) per level thereafter — hitDie/2 + 1 is the standard
 * "average roll" shortcut (e.g. a d8 averages 5). */
export function computeMaxHp(hitDie: number, level: number, conModifier: number): number {
  const perLevelAfterFirst = Math.floor(hitDie / 2) + 1 + conModifier
  return hitDie + conModifier + (level - 1) * perLevelAfterFirst
}

/** Adds a race's flat ability bonuses onto pre-racial base scores to produce
 * the final derived `abilities` — every other consumer of `abilities` keeps
 * reading the same shape, unaware of the base/bonus split. */
export function applyRacialBonus(base: AbilityScores, bonuses: Partial<Record<AbilityKey, number>>): AbilityScores {
  return {
    str: base.str + (bonuses.str ?? 0),
    dex: base.dex + (bonuses.dex ?? 0),
    con: base.con + (bonuses.con ?? 0),
    int: base.int + (bonuses.int ?? 0),
    wis: base.wis + (bonuses.wis ?? 0),
    cha: base.cha + (bonuses.cha ?? 0),
  }
}

/** Sums two partial ability-bonus maps together (rather than one
 * overwriting the other) — used to combine a race's flat `abilityBonuses`
 * with any additional bonuses granted by a resolved FeatureChoice (see
 * computeChosenAbilityBonuses). */
export function combineAbilityBonuses(
  a: Partial<Record<AbilityKey, number>>,
  b: Partial<Record<AbilityKey, number>>,
): Partial<Record<AbilityKey, number>> {
  const out: Partial<Record<AbilityKey, number>> = { ...a }
  for (const [key, value] of Object.entries(b)) {
    if (typeof value !== 'number') continue
    const k = key as AbilityKey
    out[k] = (out[k] ?? 0) + value
  }
  return out
}

/** Derives extra ability bonuses from a race's resolved FeatureChoices whose
 * options ARE ability keys (e.g. Half-Elf's "choose two abilities for +1
 * each") — `grantsAbilityBonus` marks which of a race's choices this
 * applies to; a choice without it (Dragonborn's Draconic Ancestry) is
 * skipped since its options aren't ability keys. Unresolved choices (not
 * yet in `featureChoices`) simply contribute nothing yet. */
export function computeChosenAbilityBonuses(
  race: Pick<RaceData, 'choices'>,
  featureChoices: Record<string, string[]>,
): Partial<Record<AbilityKey, number>> {
  let bonuses: Partial<Record<AbilityKey, number>> = {}
  for (const choice of race.choices) {
    if (!choice.grantsAbilityBonus) continue
    const selected = featureChoices[choice.id] ?? []
    for (const optionKey of selected) {
      if (!ABILITY_KEYS_SET.has(optionKey)) continue
      bonuses = combineAbilityBonuses(bonuses, { [optionKey]: choice.grantsAbilityBonus })
    }
  }
  return bonuses
}

/** The 5e Standard Array — each value must be assigned to exactly one
 * ability, no repeats/substitutions. */
export const STANDARD_ARRAY = [15, 14, 13, 12, 10, 8]

/** True when `scores` is some permutation of STANDARD_ARRAY exactly. */
export function isValidStandardArray(scores: AbilityScores): boolean {
  const values = Object.values(scores).sort((a, b) => a - b)
  const expected = [...STANDARD_ARRAY].sort((a, b) => a - b)
  return values.length === expected.length && values.every((v, i) => v === expected[i])
}

/** Standard 5e point-buy cost table, scores 8-15 only (pre-racial). */
export const POINT_BUY_COSTS: Record<number, number> = {
  8: 0,
  9: 1,
  10: 2,
  11: 3,
  12: 4,
  13: 5,
  14: 7,
  15: 9,
}

export const POINT_BUY_BUDGET = 27

/** Total point-buy cost of a set of base scores — Infinity if any score
 * falls outside the buyable 8-15 range, so it always fails a budget check
 * rather than silently underselling an out-of-range score. */
export function pointBuyCost(scores: AbilityScores): number {
  return Object.values(scores).reduce((sum, score) => {
    const cost = POINT_BUY_COSTS[score]
    return sum + (cost === undefined ? Infinity : cost)
  }, 0)
}

export function isValidPointBuy(scores: AbilityScores, budget = POINT_BUY_BUDGET): boolean {
  return pointBuyCost(scores) <= budget
}

/** Standard 5e XP-to-level thresholds — index 0 is level 1's threshold (0
 * XP), index 19 is level 20's. */
export const XP_THRESHOLDS = [
  0, 300, 900, 2700, 6500, 14000, 23000, 34000, 48000, 64000,
  85000, 100000, 120000, 140000, 165000, 195000, 225000, 265000, 305000, 355000,
]

/** The highest level whose XP threshold `xp` meets or exceeds — leveling up
 * is still a deliberate action (see CharacterRecord.xp's doc comment), this
 * just tells the UI when that action becomes available. */
export function xpToLevel(xp: number): number {
  let level = 1
  for (let i = 0; i < XP_THRESHOLDS.length; i++) {
    if (xp >= XP_THRESHOLDS[i]) level = i + 1
  }
  return level
}

/** A 5e Ability Score Improvement is either +2 to one ability or +1 to two
 * different abilities — never +2 to two abilities, or split any other way. */
export function isValidAbilityScoreImprovement(changes: Partial<Record<AbilityKey, number>>): boolean {
  const values = Object.values(changes).filter((v): v is number => typeof v === 'number' && v !== 0)
  if (values.length === 0) return false
  const total = values.reduce((sum, v) => sum + v, 0)
  if (total !== 2 || values.some((v) => v <= 0 || v > 2)) return false
  if (values.length === 1) return values[0] === 2
  return values.length === 2 && values.every((v) => v === 1)
}

export function applyAbilityScoreImprovement(base: AbilityScores, changes: Partial<Record<AbilityKey, number>>): AbilityScores {
  const next = { ...base }
  for (const [k, v] of Object.entries(changes)) {
    if (typeof v === 'number') next[k as AbilityKey] += v
  }
  return next
}

export interface ClassResourceGrant {
  name: string
  max: number
}

/** Best-effort mechanical modeling of the well-known SRD class resource
 * pools (Rage, Ki, Sorcery Points, etc.) that this app's generic
 * `ResourceEntry` shape can represent as a simple current/max counter —
 * returns what a character of this class/level/abilities SHOULD have,
 * for the level-up flow to merge in via mergeClassResourceGrants.
 * Deliberately NOT exhaustive: features like Sneak Attack (a damage-die
 * scale, not a "use" pool), Pact Magic (its own unusual short-rest-recovery
 * slot rules), and Arcane Recovery (keyed off spent spell slots, not level)
 * don't fit this current/max shape and aren't modeled here — see the
 * class's `features` reference text instead. Returns [] for any
 * class/level this doesn't recognize, so mirror-imported/homebrew classes
 * degrade safely rather than getting invented resources. */
export function computeClassResourceGrants(className: string, level: number, abilities: AbilityScores): ClassResourceGrant[] {
  const name = className.trim().toLowerCase()
  if (name === 'barbarian' && level >= 1) {
    const uses = level >= 20 ? 999 : level >= 17 ? 6 : level >= 12 ? 5 : level >= 6 ? 4 : level >= 3 ? 3 : 2
    return [{ name: 'Rage', max: uses }]
  }
  if (name === 'fighter') {
    const grants: ClassResourceGrant[] = []
    if (level >= 1) grants.push({ name: 'Second Wind', max: 1 })
    if (level >= 2) grants.push({ name: 'Action Surge', max: level >= 17 ? 2 : 1 })
    return grants
  }
  if (name === 'monk' && level >= 2) return [{ name: 'Ki Points', max: level }]
  if (name === 'sorcerer' && level >= 2) return [{ name: 'Sorcery Points', max: level }]
  if (name === 'bard' && level >= 1) return [{ name: 'Bardic Inspiration', max: Math.max(1, computeModifier(abilities.cha)) }]
  if (name === 'cleric' && level >= 2) {
    const uses = level >= 18 ? 3 : level >= 6 ? 2 : 1
    return [{ name: 'Channel Divinity', max: uses }]
  }
  if (name === 'paladin' && level >= 1) return [{ name: 'Lay on Hands Pool', max: level * 5 }]
  if (name === 'druid' && level >= 2) return [{ name: 'Wild Shape', max: 2 }]
  return []
}

/** Merges class resource grants into an existing resource list — an
 * existing resource (matched by name) has its `max` updated and `current`
 * clamped down if needed (preserving how much is already spent); a new one
 * starts full. Resources not granted by the class (DM/player-added
 * homebrew ones) are left untouched. */
export function mergeClassResourceGrants(existing: ResourceEntry[], grants: ClassResourceGrant[]): ResourceEntry[] {
  const result = existing.map((r) => ({ ...r }))
  for (const grant of grants) {
    const found = result.find((r) => r.name === grant.name)
    if (found) {
      found.max = grant.max
      found.current = Math.min(found.current, grant.max)
    } else {
      result.push({ id: crypto.randomUUID(), name: grant.name, current: grant.max, max: grant.max })
    }
  }
  return result
}

/** Which standard 5e spell slot progression a class uses — 'full' (Bard,
 * Cleric, Druid, Sorcerer, Wizard), 'half' (Paladin, Ranger, starting at
 * level 2, capped at 5th-level spells), 'pact' (Warlock's unusual Pact
 * Magic: a small number of same-level slots that all upgrade together),
 * or 'none' for anything else (including mirror-imported/homebrew classes
 * this app doesn't recognize — those keep manually-editable slots rather
 * than being silently zeroed out). */
export type CasterType = 'full' | 'half' | 'pact' | 'none'

const FULL_CASTER_CLASSES = new Set(['bard', 'cleric', 'druid', 'sorcerer', 'wizard'])
const HALF_CASTER_CLASSES = new Set(['paladin', 'ranger'])

export function casterTypeForClass(className: string): CasterType {
  const name = className.trim().toLowerCase()
  if (FULL_CASTER_CLASSES.has(name)) return 'full'
  if (HALF_CASTER_CLASSES.has(name)) return 'half'
  if (name === 'warlock') return 'pact'
  return 'none'
}

/** Standard 5e full-caster slot table — index 0 = level 1, each row is
 * slots for spell levels 1-9. */
const FULL_CASTER_SLOTS: number[][] = [
  [2, 0, 0, 0, 0, 0, 0, 0, 0],
  [3, 0, 0, 0, 0, 0, 0, 0, 0],
  [4, 2, 0, 0, 0, 0, 0, 0, 0],
  [4, 3, 0, 0, 0, 0, 0, 0, 0],
  [4, 3, 2, 0, 0, 0, 0, 0, 0],
  [4, 3, 3, 0, 0, 0, 0, 0, 0],
  [4, 3, 3, 1, 0, 0, 0, 0, 0],
  [4, 3, 3, 2, 0, 0, 0, 0, 0],
  [4, 3, 3, 3, 1, 0, 0, 0, 0],
  [4, 3, 3, 3, 2, 0, 0, 0, 0],
  [4, 3, 3, 3, 2, 1, 0, 0, 0],
  [4, 3, 3, 3, 2, 1, 0, 0, 0],
  [4, 3, 3, 3, 2, 1, 1, 0, 0],
  [4, 3, 3, 3, 2, 1, 1, 0, 0],
  [4, 3, 3, 3, 2, 1, 1, 1, 0],
  [4, 3, 3, 3, 2, 1, 1, 1, 0],
  [4, 3, 3, 3, 2, 1, 1, 1, 1],
  [4, 3, 3, 3, 3, 1, 1, 1, 1],
  [4, 3, 3, 3, 3, 2, 1, 1, 1],
  [4, 3, 3, 3, 3, 2, 2, 1, 1],
]

/** Standard 5e half-caster slot table (Paladin/Ranger) — only reaches
 * 5th-level spells, so only 5 columns are ever nonzero. */
const HALF_CASTER_SLOTS: number[][] = [
  [0, 0, 0, 0, 0],
  [2, 0, 0, 0, 0],
  [3, 0, 0, 0, 0],
  [3, 0, 0, 0, 0],
  [4, 2, 0, 0, 0],
  [4, 2, 0, 0, 0],
  [4, 3, 0, 0, 0],
  [4, 3, 0, 0, 0],
  [4, 3, 2, 0, 0],
  [4, 3, 2, 0, 0],
  [4, 3, 3, 0, 0],
  [4, 3, 3, 0, 0],
  [4, 3, 3, 1, 0],
  [4, 3, 3, 1, 0],
  [4, 3, 3, 2, 0],
  [4, 3, 3, 2, 0],
  [4, 3, 3, 3, 1],
  [4, 3, 3, 3, 1],
  [4, 3, 3, 3, 2],
  [4, 3, 3, 3, 2],
]

/** Warlock's Pact Magic — {count, level} of identical slots, all at the
 * same spell level (unlike every other caster's spread-across-levels
 * table). Recharges on a short rest elsewhere in this app's rest system,
 * unlike normal slots — this table only covers how many/what level. */
const WARLOCK_PACT_SLOTS: { count: number; level: number }[] = [
  { count: 1, level: 1 },
  { count: 2, level: 1 },
  { count: 2, level: 2 },
  { count: 2, level: 2 },
  { count: 2, level: 3 },
  { count: 2, level: 3 },
  { count: 2, level: 4 },
  { count: 2, level: 4 },
  { count: 2, level: 5 },
  { count: 2, level: 5 },
  { count: 3, level: 5 },
  { count: 3, level: 5 },
  { count: 3, level: 5 },
  { count: 3, level: 5 },
  { count: 3, level: 5 },
  { count: 3, level: 5 },
  { count: 4, level: 5 },
  { count: 4, level: 5 },
  { count: 4, level: 5 },
  { count: 4, level: 5 },
]

/** The standard 5e spell-slot-by-level array (index 0 = level-1 slots ...
 * index 8 = level-9 slots) for a single-class character of this class and
 * level — [0,0,...] for a class this app doesn't recognize as a caster, so
 * mirror-imported/homebrew classes keep whatever's already there instead of
 * being silently zeroed. */
export function computeSpellSlotsByLevel(className: string, level: number): number[] {
  const type = casterTypeForClass(className)
  const clamped = Math.min(20, Math.max(1, level))
  if (type === 'full') return [...FULL_CASTER_SLOTS[clamped - 1]]
  if (type === 'half') return [...HALF_CASTER_SLOTS[clamped - 1], 0, 0, 0, 0]
  if (type === 'pact') {
    const { count, level: slotLevel } = WARLOCK_PACT_SLOTS[clamped - 1]
    const arr = new Array(9).fill(0)
    arr[slotLevel - 1] = count
    return arr
  }
  return new Array(9).fill(0)
}
