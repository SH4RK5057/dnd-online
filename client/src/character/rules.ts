import type { AbilityKey, AbilityScores, CharacterRecord, SkillId } from './types'
import type { TokenRecord } from '../map/types'

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
