import { describe, expect, it } from 'vitest'
import { resolveAttackMode, resolveEffectiveMode } from './conditions'

describe('resolveEffectiveMode', () => {
  it('leaves the mode untouched when no relevant condition is active', () => {
    expect(resolveEffectiveMode('normal', [], 'attack')).toBe('normal')
    expect(resolveEffectiveMode('advantage', ['Deafened'], 'attack')).toBe('advantage')
  })

  it('forces disadvantage when a matching condition is active', () => {
    expect(resolveEffectiveMode('normal', ['Poisoned'], 'attack')).toBe('disadvantage')
    expect(resolveEffectiveMode('normal', ['Poisoned'], 'abilityCheck')).toBe('disadvantage')
  })

  it('does not apply a condition to an unrelated roll category', () => {
    // Blinded only affects attacks, not ability checks or saves.
    expect(resolveEffectiveMode('normal', ['Blinded'], 'abilityCheck')).toBe('normal')
    expect(resolveEffectiveMode('normal', ['Blinded'], 'save')).toBe('normal')
  })

  it('cancels an explicit advantage pick to normal rather than stacking', () => {
    expect(resolveEffectiveMode('advantage', ['Poisoned'], 'attack')).toBe('normal')
  })

  it('leaves an explicit disadvantage pick as disadvantage', () => {
    expect(resolveEffectiveMode('disadvantage', ['Poisoned'], 'attack')).toBe('disadvantage')
  })

  it('checks multiple active conditions', () => {
    expect(resolveEffectiveMode('normal', ['Deafened', 'Prone'], 'attack')).toBe('disadvantage')
  })
})

describe('resolveAttackMode', () => {
  it('leaves the mode untouched with no conditions on either side', () => {
    expect(resolveAttackMode('normal', [], [], 'melee')).toBe('normal')
  })

  it('grants melee advantage but ranged disadvantage against a Prone target', () => {
    expect(resolveAttackMode('normal', [], ['Prone'], 'melee')).toBe('advantage')
    expect(resolveAttackMode('normal', [], ['Prone'], 'ranged')).toBe('disadvantage')
  })

  it('grants advantage regardless of attack type against a Blinded target', () => {
    expect(resolveAttackMode('normal', [], ['Blinded'], 'melee')).toBe('advantage')
    expect(resolveAttackMode('normal', [], ['Blinded'], 'ranged')).toBe('advantage')
  })

  it('grants disadvantage regardless of attack type against an Invisible target', () => {
    expect(resolveAttackMode('normal', [], ['Invisible'], 'melee')).toBe('disadvantage')
    expect(resolveAttackMode('normal', [], ['Invisible'], 'ranged')).toBe('disadvantage')
  })

  it('cancels attacker disadvantage against target advantage back to normal', () => {
    // Blinded attacker (self disadvantage) vs a Prone target in melee (target advantage) cancel out.
    expect(resolveAttackMode('normal', ['Blinded'], ['Prone'], 'melee')).toBe('normal')
  })

  it('combines attacker self-disadvantage with target-side disadvantage without canceling', () => {
    // Blinded attacker (self disadvantage) firing ranged at a Prone target (also disadvantage) stays disadvantage.
    expect(resolveAttackMode('normal', ['Blinded'], ['Prone'], 'ranged')).toBe('disadvantage')
  })

  it('cancels an explicit advantage pick against a target that also imposes disadvantage', () => {
    expect(resolveAttackMode('advantage', [], ['Invisible'], 'melee')).toBe('normal')
  })

  it('ignores unknown or irrelevant target conditions', () => {
    expect(resolveAttackMode('normal', [], ['Deafened'], 'melee')).toBe('normal')
  })
})
