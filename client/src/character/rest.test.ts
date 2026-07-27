import { describe, expect, it } from 'vitest'
import { applyLongRest, applyShortRest, hitDiceAvailable, parseHitDieSize, shortRestHealingNotation } from './rest'
import { emptyAbilityScores } from './rules'
import type { CharacterRecord } from './types'

function baseCharacter(overrides: Partial<CharacterRecord> = {}): CharacterRecord {
  return {
    id: 'c1',
    ownerId: 'p1',
    campaignId: 'camp1',
    locked: false,
    name: 'Test',
    race: 'Human',
    className: 'Fighter',
    level: 5,
    background: '',
    alignment: '',
    abilities: emptyAbilityScores(),
    abilityMethod: 'manual',
    baseAbilities: emptyAbilityScores(),
    saveProficiencies: { str: false, dex: false, con: false, int: false, wis: false, cha: false },
    skillProficiencies: {},
    ac: 10,
    initiativeBonus: 0,
    speed: 30,
    hp: { max: 40, current: 10, temp: 0 },
    hitDice: '5d10',
    hitDiceUsed: 3,
    inventory: [],
    spellSlotsByLevel: [4, 3, 0, 0, 0, 0, 0, 0, 0],
    spellSlotsUsedByLevel: [4, 2, 0, 0, 0, 0, 0, 0, 0],
    resources: [{ id: 'r1', name: 'Ki', current: 1, max: 5 }],
    spells: [],
    feats: [],
    createdAt: 0,
    ...overrides,
  }
}

describe('parseHitDieSize', () => {
  it('extracts the die size', () => {
    expect(parseHitDieSize('5d10')).toBe(10)
    expect(parseHitDieSize('1d6')).toBe(6)
  })
  it('falls back to 6 for unparseable text', () => {
    expect(parseHitDieSize('')).toBe(6)
  })
})

describe('hitDiceAvailable', () => {
  it('is total minus used', () => {
    expect(hitDiceAvailable({ hitDice: '5d10', hitDiceUsed: 3 })).toBe(2)
  })
  it('never goes negative', () => {
    expect(hitDiceAvailable({ hitDice: '2d8', hitDiceUsed: 5 })).toBe(0)
  })
})

describe('shortRestHealingNotation', () => {
  it('builds one die-plus-CON-mod term per die spent', () => {
    const character = { hitDice: '5d10', abilities: { ...emptyAbilityScores(), con: 14 } } // +2 mod
    expect(shortRestHealingNotation(character, 2)).toBe('2d10+2+2')
  })
  it('omits the modifier entirely when CON mod is 0', () => {
    const character = { hitDice: '5d10', abilities: emptyAbilityScores() } // 10 con = +0 mod
    expect(shortRestHealingNotation(character, 3)).toBe('3d10')
  })
})

describe('applyShortRest', () => {
  it('marks hit dice spent and heals, capped at max HP', () => {
    const character = baseCharacter({ hp: { max: 40, current: 10, temp: 0 }, hitDiceUsed: 1 })
    const patch = applyShortRest(character, 2, 15)
    expect(patch.hitDiceUsed).toBe(3)
    expect(patch.hp).toEqual({ max: 40, current: 25, temp: 0 })
  })

  it('caps healing at max HP', () => {
    const character = baseCharacter({ hp: { max: 40, current: 35, temp: 0 } })
    const patch = applyShortRest(character, 1, 20)
    expect(patch.hp?.current).toBe(40)
  })
})

describe('applyLongRest', () => {
  it('fully heals, resets slots and resources, and recovers half hit dice', () => {
    const character = baseCharacter()
    const patch = applyLongRest(character)
    expect(patch.hp).toEqual({ max: 40, current: 40, temp: 0 })
    expect(patch.spellSlotsUsedByLevel).toEqual([0, 0, 0, 0, 0, 0, 0, 0, 0])
    expect(patch.resources).toEqual([{ id: 'r1', name: 'Ki', current: 5, max: 5 }])
    // 5 total hit dice, half rounded down = 2 recovered, 3 used - 2 = 1 remaining used
    expect(patch.hitDiceUsed).toBe(1)
  })

  it('recovers at least 1 hit die if any were spent, even at low totals', () => {
    const character = baseCharacter({ hitDice: '1d8', hitDiceUsed: 1 })
    const patch = applyLongRest(character)
    expect(patch.hitDiceUsed).toBe(0)
  })

  it('does not go negative or recover hit dice that were never spent', () => {
    const character = baseCharacter({ hitDiceUsed: 0 })
    const patch = applyLongRest(character)
    expect(patch.hitDiceUsed).toBe(0)
  })
})
