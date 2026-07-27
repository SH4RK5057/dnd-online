import { describe, expect, it } from 'vitest'
import {
  applyRacialBonus,
  computeInitiativeBonus,
  computeMaxHp,
  computeModifier,
  computeProficiencyBonus,
  computeSaveBonus,
  computeSkillBonus,
  isValidPointBuy,
  isValidStandardArray,
  normalizeCharacterRecord,
  parseHitDiceCount,
  pointBuyCost,
  resolveTokenHp,
} from './rules'
import type { CharacterRecord } from './types'
import type { TokenRecord } from '../map/types'

describe('computeModifier', () => {
  it('handles even and odd scores', () => {
    expect(computeModifier(10)).toBe(0)
    expect(computeModifier(11)).toBe(0)
    expect(computeModifier(12)).toBe(1)
    expect(computeModifier(20)).toBe(5)
    expect(computeModifier(8)).toBe(-1)
    expect(computeModifier(1)).toBe(-5)
  })
})

describe('computeProficiencyBonus', () => {
  it('matches the standard 5e level breakpoints', () => {
    expect(computeProficiencyBonus(1)).toBe(2)
    expect(computeProficiencyBonus(4)).toBe(2)
    expect(computeProficiencyBonus(5)).toBe(3)
    expect(computeProficiencyBonus(8)).toBe(3)
    expect(computeProficiencyBonus(9)).toBe(4)
    expect(computeProficiencyBonus(12)).toBe(4)
    expect(computeProficiencyBonus(13)).toBe(5)
    expect(computeProficiencyBonus(16)).toBe(5)
    expect(computeProficiencyBonus(17)).toBe(6)
    expect(computeProficiencyBonus(20)).toBe(6)
  })

  it('clamps out-of-range levels', () => {
    expect(computeProficiencyBonus(0)).toBe(2)
    expect(computeProficiencyBonus(25)).toBe(6)
  })
})

function baseCharacter(): CharacterRecord {
  return {
    id: 'c1',
    ownerId: 'p1',
    campaignId: null,
    locked: false,
    name: 'Test',
    race: 'Human',
    className: 'Fighter',
    level: 5,
    background: '',
    alignment: '',
    abilities: { str: 16, dex: 14, con: 12, int: 10, wis: 8, cha: 13 },
    abilityMethod: 'manual',
    baseAbilities: { str: 16, dex: 14, con: 12, int: 10, wis: 8, cha: 13 },
    saveProficiencies: { str: true, dex: false, con: true, int: false, wis: false, cha: false },
    skillProficiencies: { athletics: 'proficient', perception: 'expertise' },
    ac: 16,
    initiativeBonus: 0,
    speed: 30,
    hp: { max: 44, current: 44, temp: 0 },
    hitDice: '5d10',
    inventory: [],
    hitDiceUsed: 0,
    spellSlotsByLevel: [],
    spellSlotsUsedByLevel: [],
    resources: [],
    spells: [],
    feats: [],
    createdAt: 0,
  }
}

describe('computeSaveBonus', () => {
  it('adds proficiency bonus only when proficient', () => {
    const c = baseCharacter()
    // Str 16 -> mod +3, proficient at level 5 (prof +3) => +6
    expect(computeSaveBonus(c, 'str')).toBe(6)
    // Dex 14 -> mod +2, not proficient => +2
    expect(computeSaveBonus(c, 'dex')).toBe(2)
  })
})

describe('computeSkillBonus', () => {
  it('applies no bonus, proficiency, or double proficiency (expertise)', () => {
    const c = baseCharacter()
    // Str 16 -> mod +3; athletics proficient, prof +3 => +6
    expect(computeSkillBonus(c, 'athletics')).toBe(6)
    // Wis 8 -> mod -1; perception expertise, prof +3*2 => -1 + 6 = 5
    expect(computeSkillBonus(c, 'perception')).toBe(5)
    // Int 10 -> mod 0; arcana untrained => 0
    expect(computeSkillBonus(c, 'arcana')).toBe(0)
  })
})

describe('computeInitiativeBonus', () => {
  it('combines Dex modifier and flat bonus', () => {
    const c = baseCharacter()
    expect(computeInitiativeBonus(c)).toBe(2)
    expect(computeInitiativeBonus({ ...c, initiativeBonus: 2 })).toBe(4)
  })
})

describe('resolveTokenHp', () => {
  const character = baseCharacter()
  const charactersById = new Map([[character.id, character]])

  it('reads from the linked character when characterId is set', () => {
    const token: TokenRecord = {
      id: 't1',
      sceneId: 's1',
      name: 'Hero',
      assetId: null,
      sizeCategory: 'medium',
      x: 0,
      y: 0,
      ownerId: 'p1',
      characterId: character.id,
      hp: null,
      conditions: [],
      initiative: null,
      monsterKey: null,
      ac: null,
      speed: null,
      description: '',
      hidden: false,
      z: 0,
      createdAt: 0,
    }
    expect(resolveTokenHp(token, charactersById)).toEqual({ max: 44, current: 44, temp: 0, fromCharacter: true })
  })

  it('reads from the token directly when unlinked', () => {
    const token: TokenRecord = {
      id: 't2',
      sceneId: 's1',
      name: 'Goblin',
      assetId: null,
      sizeCategory: 'small',
      x: 0,
      y: 0,
      ownerId: null,
      characterId: null,
      hp: { max: 7, current: 7, temp: 0 },
      conditions: [],
      initiative: null,
      monsterKey: null,
      ac: null,
      speed: null,
      description: '',
      hidden: false,
      z: 0,
      createdAt: 0,
    }
    expect(resolveTokenHp(token, charactersById)).toEqual({ max: 7, current: 7, temp: 0, fromCharacter: false })
  })

  it('returns null when neither a linked character nor token HP exists', () => {
    const token: TokenRecord = {
      id: 't3',
      sceneId: 's1',
      name: 'Prop',
      assetId: null,
      sizeCategory: 'medium',
      x: 0,
      y: 0,
      ownerId: null,
      characterId: null,
      hp: null,
      conditions: [],
      initiative: null,
      monsterKey: null,
      ac: null,
      speed: null,
      description: '',
      hidden: false,
      z: 0,
      createdAt: 0,
    }
    expect(resolveTokenHp(token, charactersById)).toBeNull()
  })
})

describe('parseHitDiceCount', () => {
  it('extracts the die count from a standard hit-dice string', () => {
    expect(parseHitDiceCount('3d8')).toBe(3)
    expect(parseHitDiceCount('1d6')).toBe(1)
    expect(parseHitDiceCount('12d10')).toBe(12)
  })

  it('tolerates surrounding whitespace and case', () => {
    expect(parseHitDiceCount(' 5D8 ')).toBe(5)
  })

  it('returns 0 for unparseable text', () => {
    expect(parseHitDiceCount('')).toBe(0)
    expect(parseHitDiceCount('lots')).toBe(0)
  })
})

describe('computeMaxHp', () => {
  it('uses the full die at level 1, then average-rounded-up per level after', () => {
    // d8, level 1, +2 con => 8 + 2 = 10
    expect(computeMaxHp(8, 1, 2)).toBe(10)
    // d8, level 3, +2 con => 10 + 2*(4+1+2) = 10 + 14 = 24
    expect(computeMaxHp(8, 3, 2)).toBe(24)
    // d6, level 1, -1 con => 6 - 1 = 5
    expect(computeMaxHp(6, 1, -1)).toBe(5)
    // d12, level 5, +3 con => 12+3 + 4*(6+1+3) = 15 + 40 = 55
    expect(computeMaxHp(12, 5, 3)).toBe(55)
  })
})

describe('applyRacialBonus', () => {
  it('adds each specified bonus and leaves unmentioned abilities unchanged', () => {
    const base = { str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 10 }
    expect(applyRacialBonus(base, { dex: 2, int: 1 })).toEqual({
      str: 10,
      dex: 12,
      con: 10,
      int: 11,
      wis: 10,
      cha: 10,
    })
  })

  it('is a no-op with an empty bonus set', () => {
    const base = { str: 8, dex: 9, con: 10, int: 11, wis: 12, cha: 13 }
    expect(applyRacialBonus(base, {})).toEqual(base)
  })
})

describe('isValidStandardArray', () => {
  it('accepts any permutation of the standard array', () => {
    expect(isValidStandardArray({ str: 15, dex: 14, con: 13, int: 12, wis: 10, cha: 8 })).toBe(true)
    expect(isValidStandardArray({ str: 8, dex: 10, con: 12, int: 13, wis: 14, cha: 15 })).toBe(true)
  })

  it('rejects a set with a repeated or out-of-set value', () => {
    expect(isValidStandardArray({ str: 15, dex: 15, con: 13, int: 12, wis: 10, cha: 8 })).toBe(false)
    expect(isValidStandardArray({ str: 16, dex: 14, con: 13, int: 12, wis: 10, cha: 8 })).toBe(false)
  })
})

describe('pointBuyCost / isValidPointBuy', () => {
  it('computes cost from the standard table and validates against the 27-point budget', () => {
    const allEights = { str: 8, dex: 8, con: 8, int: 8, wis: 8, cha: 8 }
    expect(pointBuyCost(allEights)).toBe(0)
    expect(isValidPointBuy(allEights)).toBe(true)

    // 15,15,15,8,8,8 => 9+9+9+0+0+0 = 27, exactly at budget
    const maxSpend = { str: 15, dex: 15, con: 15, int: 8, wis: 8, cha: 8 }
    expect(pointBuyCost(maxSpend)).toBe(27)
    expect(isValidPointBuy(maxSpend)).toBe(true)

    // One over budget
    const overBudget = { str: 15, dex: 15, con: 15, int: 9, wis: 8, cha: 8 }
    expect(pointBuyCost(overBudget)).toBe(28)
    expect(isValidPointBuy(overBudget)).toBe(false)
  })

  it('treats an out-of-range score as infinitely expensive', () => {
    const outOfRange = { str: 16, dex: 8, con: 8, int: 8, wis: 8, cha: 8 }
    expect(pointBuyCost(outOfRange)).toBe(Infinity)
    expect(isValidPointBuy(outOfRange)).toBe(false)
  })
})

describe('normalizeCharacterRecord', () => {
  it('backfills abilityMethod/baseAbilities for a record persisted before those fields existed', () => {
    const legacy = baseCharacter()
    // @ts-expect-error -- simulating a pre-migration record read from storage
    delete legacy.abilityMethod
    // @ts-expect-error -- simulating a pre-migration record read from storage
    delete legacy.baseAbilities
    const normalized = normalizeCharacterRecord(legacy)
    expect(normalized.abilityMethod).toBe('manual')
    expect(normalized.baseAbilities).toEqual(legacy.abilities)
  })

  it('leaves an already-current record untouched', () => {
    const current = { ...baseCharacter(), abilityMethod: 'pointBuy' as const, baseAbilities: { str: 8, dex: 8, con: 8, int: 8, wis: 8, cha: 8 } }
    expect(normalizeCharacterRecord(current)).toBe(current)
  })
})
