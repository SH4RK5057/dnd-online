import type { AbilityKey, AbilityScores, CharacterRecord, SkillId } from './types'
import type { TokenRecord } from '../map/types'

/** Fills in `abilityMethod`/`baseAbilities` for a CharacterRecord persisted
 * (localStorage or an existing campaign Yjs doc) before those fields
 * existed — treats the old `abilities` as if it were already the base (no
 * racial bonus known), which is the only reasonable assumption without
 * re-deriving history. Every character read path should go through this. */
export function normalizeCharacterRecord(character: CharacterRecord): CharacterRecord {
  if (character.abilityMethod && character.baseAbilities) return character
  return {
    ...character,
    abilityMethod: character.abilityMethod ?? 'manual',
    baseAbilities: character.baseAbilities ?? character.abilities,
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
