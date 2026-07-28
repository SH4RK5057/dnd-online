import type { CharacterRecord } from './types'
import { computeModifier, deathSaveResetPatch, parseHitDiceCount } from './rules'

/** Extracts the die SIZE from a hit-dice string like "3d8" (8). Used
 * alongside parseHitDiceCount's die COUNT to build a short-rest healing
 * roll's notation. Returns 6 (a reasonable fallback) if unparseable. */
export function parseHitDieSize(hitDice: string): number {
  const match = /^\d+d(\d+)/i.exec(hitDice.trim())
  return match ? Number(match[1]) : 6
}

/** How many hit dice a character has left to spend on a short rest. */
export function hitDiceAvailable(character: Pick<CharacterRecord, 'hitDice' | 'hitDiceUsed'>): number {
  return Math.max(0, parseHitDiceCount(character.hitDice) - character.hitDiceUsed)
}

/** Dice notation for spending `count` hit dice on a short rest — each die
 * plus the character's Constitution modifier, e.g. spending 2 hit dice on a
 * "4d8" character with +2 Con gives "2d8+2+2" (one +CON per die spent, the
 * standard 5e short-rest healing formula). Roll this through the existing
 * dice engine (dice/notation.ts) and pass the result into applyShortRest. */
export function shortRestHealingNotation(character: Pick<CharacterRecord, 'hitDice' | 'abilities'>, count: number): string {
  const size = parseHitDieSize(character.hitDice)
  const conMod = computeModifier(character.abilities.con)
  const conTerm = conMod !== 0 ? `${conMod >= 0 ? '+' : ''}${conMod}`.repeat(count) : ''
  return `${count}d${size}${conTerm}`
}

/** Applies a short rest: marks `hitDiceSpent` hit dice as used and heals by
 * `healingRolled` (the already-rolled total from shortRestHealingNotation),
 * capped at max HP. Everything else (spell slots, other resources) is
 * untouched — only a long rest recovers those. */
export function applyShortRest(
  character: Pick<CharacterRecord, 'hp' | 'hitDiceUsed' | 'deathSaves'>,
  hitDiceSpent: number,
  healingRolled: number,
): Partial<CharacterRecord> {
  const nextCurrent = Math.min(character.hp.max, character.hp.current + healingRolled)
  return {
    hitDiceUsed: character.hitDiceUsed + hitDiceSpent,
    hp: { ...character.hp, current: nextCurrent },
    ...deathSaveResetPatch(character, nextCurrent),
  }
}

/**
 * Applies a long rest: full HP, every spell slot and resource back to max,
 * and half the character's total hit dice (rounded down, minimum 1 if any
 * were spent) recovered — the standard 5e long-rest recovery rules. Temp HP
 * is left untouched (a long rest doesn't remove it, it just isn't restored
 * by one either).
 */
export function applyLongRest(character: CharacterRecord): Partial<CharacterRecord> {
  const totalHitDice = parseHitDiceCount(character.hitDice)
  const recovered = character.hitDiceUsed > 0 ? Math.max(1, Math.floor(totalHitDice / 2)) : 0
  return {
    hp: { ...character.hp, current: character.hp.max },
    hitDiceUsed: Math.max(0, character.hitDiceUsed - recovered),
    spellSlotsUsedByLevel: character.spellSlotsUsedByLevel.map(() => 0),
    resources: character.resources.map((r) => ({ ...r, current: r.max })),
    ...deathSaveResetPatch(character, character.hp.max),
  }
}
