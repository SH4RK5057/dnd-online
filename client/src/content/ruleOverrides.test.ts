import { describe, expect, it } from 'vitest'
import { resolveCharacterStatOverride, resolveGlobalRule, type RuleOverrideRecord } from './ruleOverrides'

function makeOverride(patch: Partial<RuleOverrideRecord>): RuleOverrideRecord {
  return {
    id: crypto.randomUUID(),
    scope: 'campaign',
    sceneId: null,
    targetType: 'globalRule',
    targetKey: 'critRange',
    statPath: null,
    label: '',
    value: '',
    createdAt: 0,
    ...patch,
  }
}

describe('resolveGlobalRule', () => {
  it('returns null when there is no matching override', () => {
    expect(resolveGlobalRule([], 'critRange', { sceneId: null })).toBeNull()
  })

  it('returns a campaign-wide override', () => {
    const overrides = [makeOverride({ targetKey: 'critRange', value: '19-20' })]
    expect(resolveGlobalRule(overrides, 'critRange', { sceneId: 'scene-1' })).toBe('19-20')
  })

  it('prefers a scene-scoped override over a campaign-wide one for the same key', () => {
    const overrides = [
      makeOverride({ targetKey: 'critRange', value: '19-20' }),
      makeOverride({ targetKey: 'critRange', scope: 'scene', sceneId: 'scene-1', value: '18-20' }),
    ]
    expect(resolveGlobalRule(overrides, 'critRange', { sceneId: 'scene-1' })).toBe('18-20')
    // A different scene still falls back to the campaign-wide value.
    expect(resolveGlobalRule(overrides, 'critRange', { sceneId: 'scene-2' })).toBe('19-20')
  })

  it('ignores overrides for a different key', () => {
    const overrides = [makeOverride({ targetKey: 'shortRestMinutes', value: '480' })]
    expect(resolveGlobalRule(overrides, 'critRange', { sceneId: null })).toBeNull()
  })
})

describe('resolveCharacterStatOverride', () => {
  it('returns null when there is no matching override', () => {
    expect(resolveCharacterStatOverride([], 'char-1', 'ac', { sceneId: null })).toBeNull()
  })

  it('returns a campaign-wide character stat override', () => {
    const overrides = [
      makeOverride({ targetType: 'characterStat', targetKey: 'char-1', statPath: 'ac', value: '18' }),
    ]
    expect(resolveCharacterStatOverride(overrides, 'char-1', 'ac', { sceneId: 'scene-1' })).toBe('18')
  })

  it('prefers a scene-scoped character stat override', () => {
    const overrides = [
      makeOverride({ targetType: 'characterStat', targetKey: 'char-1', statPath: 'ac', value: '18' }),
      makeOverride({
        targetType: 'characterStat',
        targetKey: 'char-1',
        statPath: 'ac',
        scope: 'scene',
        sceneId: 'scene-1',
        value: '22',
      }),
    ]
    expect(resolveCharacterStatOverride(overrides, 'char-1', 'ac', { sceneId: 'scene-1' })).toBe('22')
  })

  it('does not confuse two different characters or stat paths', () => {
    const overrides = [
      makeOverride({ targetType: 'characterStat', targetKey: 'char-1', statPath: 'ac', value: '18' }),
    ]
    expect(resolveCharacterStatOverride(overrides, 'char-2', 'ac', { sceneId: null })).toBeNull()
    expect(resolveCharacterStatOverride(overrides, 'char-1', 'speed', { sceneId: null })).toBeNull()
  })
})
