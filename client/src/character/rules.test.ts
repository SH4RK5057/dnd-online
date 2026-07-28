import { describe, expect, it } from 'vitest'
import {
  applyAbilityScoreImprovement,
  applyDamage,
  applyRacialBonus,
  casterTypeForClass,
  combineAbilityBonuses,
  computeChosenAbilityBonuses,
  computeClassResourceGrants,
  computeDamagePatch,
  computeInitiativeBonus,
  computeMaxHp,
  computeModifier,
  computePassiveSkill,
  computeProficiencyBonus,
  computeSaveBonus,
  computeSkillBonus,
  computeSpellSaveDc,
  computeSpellSlotsByLevel,
  deathSaveResetPatch,
  isValidAbilityScoreImprovement,
  isValidPointBuy,
  isValidStandardArray,
  mergeClassResourceGrants,
  normalizeCharacterRecord,
  parseHitDiceCount,
  pointBuyCost,
  resolveTokenAc,
  resolveTokenHp,
  spellcastingAbilityForClass,
  xpToLevel,
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
    subclassName: '',
    level: 5,
    xp: 0,
    resolvedAsiLevels: [],
    featureChoices: {},
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
    overrides: [],
    deathSaves: { successes: 0, failures: 0 },
    concentratingOn: '',
    pendingConcentrationCheckDc: null,
    weapons: [],
    currency: { pp: 0, gp: 0, ep: 0, sp: 0, cp: 0 },
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

describe('computePassiveSkill', () => {
  it('is 10 + the skill bonus, expertise included (baseCharacter has Perception expertise)', () => {
    // Wis 8 -> mod -1, expertise => -1 + 3*2 = +5; passive = 15
    const c = baseCharacter()
    expect(computePassiveSkill(c, 'perception')).toBe(15)
  })

  it('drops to plain proficiency or untrained correctly', () => {
    const c = baseCharacter()
    const proficient = { ...c, skillProficiencies: { ...c.skillProficiencies, perception: 'proficient' as const } }
    expect(computePassiveSkill(proficient, 'perception')).toBe(12) // -1 + 3 = +2 -> 12
    const untrained = { ...c, skillProficiencies: {} }
    expect(computePassiveSkill(untrained, 'perception')).toBe(9) // -1 -> 9
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
      perceptionDc: null,
      z: 0,
      reactionAvailable: true,
      hazardSize: null,
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
      perceptionDc: null,
      z: 0,
      reactionAvailable: true,
      hazardSize: null,
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
      perceptionDc: null,
      z: 0,
      reactionAvailable: true,
      hazardSize: null,
      createdAt: 0,
    }
    expect(resolveTokenHp(token, charactersById)).toBeNull()
  })
})

describe('resolveTokenAc', () => {
  const character = baseCharacter()
  const charactersById = new Map([[character.id, character]])
  const baseToken: TokenRecord = {
    id: 't1',
    sceneId: 's1',
    name: 'Hero',
    assetId: null,
    sizeCategory: 'medium',
    x: 0,
    y: 0,
    ownerId: 'p1',
    characterId: null,
    hp: null,
    conditions: [],
    initiative: null,
    monsterKey: null,
    ac: null,
    speed: null,
    description: '',
    hidden: false,
    perceptionDc: null,
    z: 0,
    reactionAvailable: true,
    hazardSize: null,
    createdAt: 0,
  }

  it('reads from the linked character when characterId is set', () => {
    expect(resolveTokenAc({ ...baseToken, characterId: character.id }, charactersById)).toBe(16)
  })

  it('reads from the token directly when unlinked', () => {
    expect(resolveTokenAc({ ...baseToken, ac: 13 }, charactersById)).toBe(13)
  })

  it('returns null when unlinked and no ac is set', () => {
    expect(resolveTokenAc(baseToken, charactersById)).toBeNull()
  })
})

describe('applyDamage', () => {
  it('drains temp HP before current HP', () => {
    expect(applyDamage({ current: 10, max: 10, temp: 5 }, 3)).toEqual({ current: 10, max: 10, temp: 2 })
    expect(applyDamage({ current: 10, max: 10, temp: 5 }, 8)).toEqual({ current: 7, max: 10, temp: 0 })
  })

  it('clamps current HP at 0, never negative', () => {
    expect(applyDamage({ current: 5, max: 10, temp: 0 }, 20)).toEqual({ current: 0, max: 10, temp: 0 })
  })

  it('is a no-op for zero or negative amounts', () => {
    const hp = { current: 5, max: 10, temp: 0 }
    expect(applyDamage(hp, 0)).toBe(hp)
    expect(applyDamage(hp, -3)).toBe(hp)
  })
})

describe('deathSaveResetPatch', () => {
  it('resets death saves once current HP moves back above 0', () => {
    const c = { deathSaves: { successes: 1, failures: 2 } }
    expect(deathSaveResetPatch(c, 5)).toEqual({ deathSaves: { successes: 0, failures: 0 } })
  })

  it('is a no-op when still at 0 HP or nothing to reset', () => {
    expect(deathSaveResetPatch({ deathSaves: { successes: 1, failures: 0 } }, 0)).toEqual({})
    expect(deathSaveResetPatch({ deathSaves: { successes: 0, failures: 0 } }, 5)).toEqual({})
  })
})

describe('computeDamagePatch', () => {
  it('applies damage to HP', () => {
    const c = { ...baseCharacter(), hp: { current: 10, max: 44, temp: 0 } }
    expect(computeDamagePatch(c, 4).hp).toEqual({ current: 6, max: 44, temp: 0 })
  })

  it('flags a pending concentration check at max(10, floor(damage/2)) when concentrating', () => {
    const c = { ...baseCharacter(), concentratingOn: 'Fireball' }
    expect(computeDamagePatch(c, 30).pendingConcentrationCheckDc).toBe(15)
    expect(computeDamagePatch(c, 4).pendingConcentrationCheckDc).toBe(10)
  })

  it('does not flag a concentration check when not concentrating', () => {
    const c = baseCharacter()
    expect(computeDamagePatch(c, 10).pendingConcentrationCheckDc).toBeUndefined()
  })
})

describe('spellcastingAbilityForClass / computeSpellSaveDc', () => {
  it('maps each caster class to its standard spellcasting ability', () => {
    expect(spellcastingAbilityForClass('Wizard')).toBe('int')
    expect(spellcastingAbilityForClass('Cleric')).toBe('wis')
    expect(spellcastingAbilityForClass('Sorcerer')).toBe('cha')
  })

  it('returns null for a class with no recognized spellcasting ability', () => {
    expect(spellcastingAbilityForClass('Fighter')).toBeNull()
  })

  it('computes DC as 8 + proficiency + ability modifier', () => {
    // Wizard, level 5 (prof +3), Int 16 (+3) => 8 + 3 + 3 = 14
    const c = { ...baseCharacter(), className: 'Wizard', level: 5, abilities: { ...baseCharacter().abilities, int: 16 } }
    expect(computeSpellSaveDc(c)).toBe(14)
  })

  it('returns null for a non-caster class', () => {
    expect(computeSpellSaveDc({ ...baseCharacter(), className: 'Fighter' })).toBeNull()
  })
})

describe('normalizeCharacterRecord', () => {
  it('backfills death saves, concentration, and weapons on an older record', () => {
    const legacy = baseCharacter() as unknown as Record<string, unknown>
    delete legacy.deathSaves
    delete legacy.concentratingOn
    delete legacy.pendingConcentrationCheckDc
    delete legacy.weapons
    const normalized = normalizeCharacterRecord(legacy as unknown as CharacterRecord)
    expect(normalized.deathSaves).toEqual({ successes: 0, failures: 0 })
    expect(normalized.concentratingOn).toBe('')
    expect(normalized.pendingConcentrationCheckDc).toBeNull()
    expect(normalized.weapons).toEqual([])
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

  it('backfills subclassName/xp/resolvedAsiLevels for a record persisted before those fields existed', () => {
    const legacy = baseCharacter()
    // @ts-expect-error -- simulating a pre-migration record read from storage
    delete legacy.subclassName
    // @ts-expect-error -- simulating a pre-migration record read from storage
    delete legacy.xp
    // @ts-expect-error -- simulating a pre-migration record read from storage
    delete legacy.resolvedAsiLevels
    const normalized = normalizeCharacterRecord(legacy)
    expect(normalized.subclassName).toBe('')
    expect(normalized.xp).toBe(0)
    expect(normalized.resolvedAsiLevels).toEqual([])
  })

  it('backfills overrides for a record persisted before that field existed', () => {
    const legacy = baseCharacter()
    // @ts-expect-error -- simulating a pre-migration record read from storage
    delete legacy.overrides
    expect(normalizeCharacterRecord(legacy).overrides).toEqual([])
  })
})

describe('xpToLevel', () => {
  it('matches the standard 5e XP table breakpoints', () => {
    expect(xpToLevel(0)).toBe(1)
    expect(xpToLevel(299)).toBe(1)
    expect(xpToLevel(300)).toBe(2)
    expect(xpToLevel(899)).toBe(2)
    expect(xpToLevel(2699)).toBe(3)
    expect(xpToLevel(2700)).toBe(4)
    expect(xpToLevel(355000)).toBe(20)
    expect(xpToLevel(999999)).toBe(20)
  })
})

describe('isValidAbilityScoreImprovement / applyAbilityScoreImprovement', () => {
  it('accepts +2 to one ability', () => {
    expect(isValidAbilityScoreImprovement({ str: 2 })).toBe(true)
  })

  it('accepts +1 to two different abilities', () => {
    expect(isValidAbilityScoreImprovement({ str: 1, dex: 1 })).toBe(true)
  })

  it('rejects +2 to two abilities, an uneven split, or no change', () => {
    expect(isValidAbilityScoreImprovement({ str: 2, dex: 2 })).toBe(false)
    expect(isValidAbilityScoreImprovement({ str: 1, dex: 2 })).toBe(false)
    expect(isValidAbilityScoreImprovement({})).toBe(false)
    expect(isValidAbilityScoreImprovement({ str: 3 })).toBe(false)
  })

  it('applies the changes onto base scores', () => {
    const base = { str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 10 }
    expect(applyAbilityScoreImprovement(base, { str: 1, dex: 1 })).toEqual({
      str: 11, dex: 11, con: 10, int: 10, wis: 10, cha: 10,
    })
  })
})

describe('computeClassResourceGrants / mergeClassResourceGrants', () => {
  const abilities = { str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 16 }

  it('grants Barbarian Rage uses scaling with level', () => {
    expect(computeClassResourceGrants('Barbarian', 1, abilities)).toEqual([{ name: 'Rage', max: 2 }])
    expect(computeClassResourceGrants('Barbarian', 6, abilities)).toEqual([{ name: 'Rage', max: 4 }])
    expect(computeClassResourceGrants('Barbarian', 20, abilities)).toEqual([{ name: 'Rage', max: 999 }])
  })

  it('grants Fighter Second Wind at 1 and Action Surge at 2, improving at 17', () => {
    expect(computeClassResourceGrants('Fighter', 1, abilities)).toEqual([{ name: 'Second Wind', max: 1 }])
    expect(computeClassResourceGrants('Fighter', 2, abilities)).toEqual([
      { name: 'Second Wind', max: 1 },
      { name: 'Action Surge', max: 1 },
    ])
    expect(computeClassResourceGrants('Fighter', 17, abilities)).toEqual([
      { name: 'Second Wind', max: 1 },
      { name: 'Action Surge', max: 2 },
    ])
  })

  it('grants Bardic Inspiration equal to Cha modifier (min 1)', () => {
    expect(computeClassResourceGrants('Bard', 1, abilities)).toEqual([{ name: 'Bardic Inspiration', max: 3 }])
    expect(computeClassResourceGrants('Bard', 1, { ...abilities, cha: 8 })).toEqual([{ name: 'Bardic Inspiration', max: 1 }])
  })

  it('returns nothing for a class/level with no modeled resource', () => {
    expect(computeClassResourceGrants('Rogue', 5, abilities)).toEqual([])
    expect(computeClassResourceGrants('Monk', 1, abilities)).toEqual([])
    expect(computeClassResourceGrants('UnknownHomebrewClass', 5, abilities)).toEqual([])
  })

  it('merges grants into an existing resource list, preserving current usage and clamping it to a lower max', () => {
    const existing = [{ id: 'r1', name: 'Rage', current: 1, max: 2 }, { id: 'r2', name: 'Custom Homebrew', current: 3, max: 5 }]
    const merged = mergeClassResourceGrants(existing, [{ name: 'Rage', max: 3 }])
    expect(merged.find((r) => r.name === 'Rage')).toEqual({ id: 'r1', name: 'Rage', current: 1, max: 3 })
    expect(merged.find((r) => r.name === 'Custom Homebrew')).toEqual({ id: 'r2', name: 'Custom Homebrew', current: 3, max: 5 })
  })

  it('adds a new full resource when none existed yet', () => {
    const merged = mergeClassResourceGrants([], [{ name: 'Ki Points', max: 2 }])
    expect(merged).toHaveLength(1)
    expect(merged[0]).toMatchObject({ name: 'Ki Points', current: 2, max: 2 })
    expect(typeof merged[0].id).toBe('string')
  })

  it('clamps current usage down when max shrinks below it', () => {
    const existing = [{ id: 'r1', name: 'Ki Points', current: 5, max: 5 }]
    const merged = mergeClassResourceGrants(existing, [{ name: 'Ki Points', max: 3 }])
    expect(merged[0].current).toBe(3)
  })
})

describe('combineAbilityBonuses', () => {
  it('sums overlapping keys instead of overwriting', () => {
    expect(combineAbilityBonuses({ str: 1, con: 2 }, { str: 1, dex: 1 })).toEqual({ str: 2, con: 2, dex: 1 })
  })

  it('handles empty inputs', () => {
    expect(combineAbilityBonuses({}, {})).toEqual({})
    expect(combineAbilityBonuses({ cha: 2 }, {})).toEqual({ cha: 2 })
  })
})

describe('computeChosenAbilityBonuses', () => {
  it('grants a bonus for each selected option on a grantsAbilityBonus choice', () => {
    const race = {
      choices: [
        { id: 'half-elf-ability-choice', label: 'Choose two', count: 2, grantsAbilityBonus: 1, options: [] },
      ],
    }
    expect(computeChosenAbilityBonuses(race, { 'half-elf-ability-choice': ['dex', 'wis'] })).toEqual({ dex: 1, wis: 1 })
  })

  it('ignores choices without grantsAbilityBonus (e.g. Draconic Ancestry)', () => {
    const race = {
      choices: [{ id: 'draconic-ancestry', label: 'Draconic Ancestry', count: 1, options: [] }],
    }
    expect(computeChosenAbilityBonuses(race, { 'draconic-ancestry': ['red'] })).toEqual({})
  })

  it('contributes nothing for an unresolved choice', () => {
    const race = {
      choices: [{ id: 'half-elf-ability-choice', label: 'Choose two', count: 2, grantsAbilityBonus: 1, options: [] }],
    }
    expect(computeChosenAbilityBonuses(race, {})).toEqual({})
  })
})

describe('casterTypeForClass', () => {
  it('classifies full casters, half casters, Warlock, and everything else', () => {
    expect(casterTypeForClass('Wizard')).toBe('full')
    expect(casterTypeForClass('bard')).toBe('full')
    expect(casterTypeForClass('Cleric')).toBe('full')
    expect(casterTypeForClass('Druid')).toBe('full')
    expect(casterTypeForClass('Sorcerer')).toBe('full')
    expect(casterTypeForClass('Paladin')).toBe('half')
    expect(casterTypeForClass('Ranger')).toBe('half')
    expect(casterTypeForClass('Warlock')).toBe('pact')
    expect(casterTypeForClass('Fighter')).toBe('none')
    expect(casterTypeForClass('Rogue')).toBe('none')
    expect(casterTypeForClass('SomeHomebrewClass')).toBe('none')
  })
})

describe('computeSpellSlotsByLevel', () => {
  it('matches the standard full-caster progression at key levels', () => {
    expect(computeSpellSlotsByLevel('Wizard', 1)).toEqual([2, 0, 0, 0, 0, 0, 0, 0, 0])
    expect(computeSpellSlotsByLevel('Wizard', 3)).toEqual([4, 2, 0, 0, 0, 0, 0, 0, 0])
    expect(computeSpellSlotsByLevel('Wizard', 5)).toEqual([4, 3, 2, 0, 0, 0, 0, 0, 0])
    expect(computeSpellSlotsByLevel('Wizard', 20)).toEqual([4, 3, 3, 3, 3, 2, 2, 1, 1])
  })

  it('matches the standard half-caster progression, capped at 5th-level spells', () => {
    expect(computeSpellSlotsByLevel('Paladin', 1)).toEqual([0, 0, 0, 0, 0, 0, 0, 0, 0])
    expect(computeSpellSlotsByLevel('Paladin', 2)).toEqual([2, 0, 0, 0, 0, 0, 0, 0, 0])
    expect(computeSpellSlotsByLevel('Ranger', 5)).toEqual([4, 2, 0, 0, 0, 0, 0, 0, 0])
    expect(computeSpellSlotsByLevel('Ranger', 20)).toEqual([4, 3, 3, 3, 2, 0, 0, 0, 0])
  })

  it('matches Warlock Pact Magic (same-level slots, not spread across levels)', () => {
    expect(computeSpellSlotsByLevel('Warlock', 1)).toEqual([1, 0, 0, 0, 0, 0, 0, 0, 0])
    expect(computeSpellSlotsByLevel('Warlock', 5)).toEqual([0, 0, 2, 0, 0, 0, 0, 0, 0])
    expect(computeSpellSlotsByLevel('Warlock', 11)).toEqual([0, 0, 0, 0, 3, 0, 0, 0, 0])
    expect(computeSpellSlotsByLevel('Warlock', 20)).toEqual([0, 0, 0, 0, 4, 0, 0, 0, 0])
  })

  it('returns all zeros for a non-caster or unrecognized class', () => {
    expect(computeSpellSlotsByLevel('Fighter', 20)).toEqual(new Array(9).fill(0))
    expect(computeSpellSlotsByLevel('HomebrewMartialClass', 10)).toEqual(new Array(9).fill(0))
  })

  it('clamps out-of-range levels', () => {
    expect(computeSpellSlotsByLevel('Wizard', 0)).toEqual(computeSpellSlotsByLevel('Wizard', 1))
    expect(computeSpellSlotsByLevel('Wizard', 99)).toEqual(computeSpellSlotsByLevel('Wizard', 20))
  })
})
