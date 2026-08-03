import { describe, expect, it, vi } from 'vitest'
import { resolveAreaEffect, type AreaEffect } from './areaEffects'
import type { CharacterRecord } from '../character/types'

/** Deterministic random source: returns a fixed sequence of [0,1) values,
 * repeating the last one once exhausted — same helper as dice/notation.test.ts. */
function sequence(...faces: { face: number; sides: number }[]): () => number {
  const values = faces.map(({ face, sides }) => (face - 1) / sides + 0.0001)
  let i = 0
  return () => values[Math.min(i++, values.length - 1)]
}

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

function makeCtx() {
  return {
    pushRoll: vi.fn(),
    updateCharacter: vi.fn(),
    setTokenHp: vi.fn(),
    sourceName: 'Spike trap',
  }
}

const negatesEffect: AreaEffect = { damageDice: '2d6', savingThrow: 'dex', saveDc: 15, savingThrowEffect: 'negates' }
const halfEffect: AreaEffect = { damageDice: '2d6', savingThrow: 'dex', saveDc: 15, savingThrowEffect: 'half' }

describe('resolveAreaEffect', () => {
  it('applies full damage to an unlinked token when its save fails', () => {
    const target = { id: 't1', name: 'Goblin', characterId: null, hp: { current: 10, max: 10, temp: 0 } }
    const ctx = makeCtx()
    // 2d6 damage: faces 4,3 -> 7. Save: 1d20 (no character, bonus +0) face 5 -> 5, fails DC 15.
    const rng = sequence({ face: 4, sides: 6 }, { face: 3, sides: 6 }, { face: 5, sides: 20 })
    resolveAreaEffect(halfEffect, [target], new Map(), ctx, rng)

    expect(ctx.setTokenHp).toHaveBeenCalledWith('t1', expect.objectContaining({ current: 3, max: 10, temp: 0 }))
    expect(ctx.pushRoll).toHaveBeenCalledTimes(2)
    expect(ctx.pushRoll).toHaveBeenNthCalledWith(1, expect.objectContaining({ label: 'Spike trap damage', total: 7 }))
    expect(ctx.pushRoll).toHaveBeenNthCalledWith(2, expect.objectContaining({ label: 'Spike trap save (Dexterity)', total: 5 }))
  })

  it('halves damage on a successful save when savingThrowEffect is half', () => {
    const target = { id: 't1', name: 'Goblin', characterId: null, hp: { current: 10, max: 10, temp: 0 } }
    const ctx = makeCtx()
    // 2d6: faces 4,3 -> 7. Save: face 18 -> 18, succeeds DC 15. Half of 7 = 3 (floor).
    const rng = sequence({ face: 4, sides: 6 }, { face: 3, sides: 6 }, { face: 18, sides: 20 })
    resolveAreaEffect(halfEffect, [target], new Map(), ctx, rng)

    expect(ctx.setTokenHp).toHaveBeenCalledWith('t1', expect.objectContaining({ current: 7, max: 10, temp: 0 }))
  })

  it('applies zero damage on a successful save when savingThrowEffect is negates', () => {
    const target = { id: 't1', name: 'Goblin', characterId: null, hp: { current: 10, max: 10, temp: 0 } }
    const ctx = makeCtx()
    const rng = sequence({ face: 4, sides: 6 }, { face: 3, sides: 6 }, { face: 18, sides: 20 })
    resolveAreaEffect(negatesEffect, [target], new Map(), ctx, rng)

    expect(ctx.setTokenHp).not.toHaveBeenCalled()
  })

  it('rolls the character-linked save bonus and patches the character on damage', () => {
    const character = baseCharacter()
    const charactersById = new Map([[character.id, character]])
    const target = { id: 't1', name: character.name, characterId: character.id, hp: null }
    const ctx = makeCtx()
    // Dex 14 -> mod +2, not proficient in dex saves -> bonus +2.
    // Damage: faces 6,6 -> 12. Save d20 face 5 -> 5+2=7, fails DC 15.
    const rng = sequence({ face: 6, sides: 6 }, { face: 6, sides: 6 }, { face: 5, sides: 20 })
    resolveAreaEffect(halfEffect, [target], charactersById, ctx, rng)

    expect(ctx.updateCharacter).toHaveBeenCalledWith(character.id, expect.objectContaining({ hp: { max: 44, current: 32, temp: 0 } }))
    expect(ctx.setTokenHp).not.toHaveBeenCalled()
  })

  it('skips applying damage to a target with no resolvable HP but still rolls and logs', () => {
    const target = { id: 't1', name: 'Prop', characterId: null, hp: null }
    const ctx = makeCtx()
    const rng = sequence({ face: 4, sides: 6 }, { face: 3, sides: 6 }, { face: 5, sides: 20 })
    resolveAreaEffect(halfEffect, [target], new Map(), ctx, rng)

    expect(ctx.pushRoll).toHaveBeenCalledTimes(2)
    expect(ctx.setTokenHp).not.toHaveBeenCalled()
    expect(ctx.updateCharacter).not.toHaveBeenCalled()
  })

  it('resolves every target independently against one shared damage roll', () => {
    const targetA = { id: 'a', name: 'A', characterId: null, hp: { current: 10, max: 10, temp: 0 } }
    const targetB = { id: 'b', name: 'B', characterId: null, hp: { current: 10, max: 10, temp: 0 } }
    const ctx = makeCtx()
    // Damage: faces 4,3 -> 7. A's save face 5 -> 5 (fails, full 7). B's save face 18 -> 18 (succeeds, half 3).
    const rng = sequence({ face: 4, sides: 6 }, { face: 3, sides: 6 }, { face: 5, sides: 20 }, { face: 18, sides: 20 })
    resolveAreaEffect(halfEffect, [targetA, targetB], new Map(), ctx, rng)

    expect(ctx.setTokenHp).toHaveBeenCalledWith('a', expect.objectContaining({ current: 3, max: 10, temp: 0 }))
    expect(ctx.setTokenHp).toHaveBeenCalledWith('b', expect.objectContaining({ current: 7, max: 10, temp: 0 }))
    expect(ctx.pushRoll).toHaveBeenCalledTimes(3)
  })

  it('is a no-op with invalid damage dice notation', () => {
    const target = { id: 't1', name: 'Goblin', characterId: null, hp: { current: 10, max: 10, temp: 0 } }
    const ctx = makeCtx()
    resolveAreaEffect({ ...halfEffect, damageDice: 'not dice' }, [target], new Map(), ctx)

    expect(ctx.pushRoll).not.toHaveBeenCalled()
    expect(ctx.setTokenHp).not.toHaveBeenCalled()
  })
})
