import { describe, expect, it } from 'vitest'
import { resolveEffectiveMode } from './conditions'

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
