import { describe, expect, it } from 'vitest'
import { normalizeClass, normalizeRace } from './mirrorNormalize'

describe('normalizeRace', () => {
  it('extracts size, speed, ability bonuses, and traits from a 5etools-shaped race', () => {
    const raw = {
      name: 'Half-Orc',
      size: ['M'],
      speed: 30,
      ability: [{ str: 2, con: 1 }],
      entries: ['Darkvision', 'Relentless Endurance', 'Savage Attacks'],
    }
    const race = normalizeRace(raw, 'mirror:race-1')
    expect(race).toEqual({
      key: 'mirror:race-1',
      source: 'mirror',
      name: 'Half-Orc',
      size: 'Medium',
      speed: 30,
      abilityBonuses: { str: 2, con: 1 },
      traits: ['Darkvision', 'Relentless Endurance', 'Savage Attacks'],
    })
  })

  it('degrades gracefully for a choose-N-abilities variant and object speed', () => {
    const raw = {
      name: 'Custom Lineage',
      size: 'M',
      speed: { walk: 30, fly: 0 },
      ability: [{ choose: { weighted: { from: ['str', 'dex'], weights: [1] } } }],
      entries: [],
    }
    const race = normalizeRace(raw, 'k')
    expect(race?.abilityBonuses).toEqual({})
    expect(race?.speed).toBe(30)
  })

  it('returns null for a raw value with no name', () => {
    expect(normalizeRace({ size: 'M' }, 'k')).toBeNull()
    expect(normalizeRace(null, 'k')).toBeNull()
  })
})

describe('normalizeClass', () => {
  it('extracts hit die, saving throws, and a fixed skill choice list', () => {
    const raw = {
      name: 'Fighter',
      hd: { number: 1, faces: 10 },
      proficiency: ['str', 'con'],
      startingProficiencies: {
        skills: [{ choose: { from: ['Acrobatics', 'Athletics', 'History', 'Insight'], count: 2 } }],
      },
    }
    const cls = normalizeClass(raw, 'mirror:class-1')
    expect(cls).toEqual({
      key: 'mirror:class-1',
      source: 'mirror',
      name: 'Fighter',
      hitDie: 10,
      savingThrows: ['str', 'con'],
      skillChoices: ['acrobatics', 'athletics', 'history', 'insight'],
      skillChoiceCount: 2,
    })
  })

  it('defaults hitDie to 8 and skillChoiceCount to 2, and falls back to all skills when the choose list is missing', () => {
    const raw = { name: 'Homebrew Class', proficiency: ['wis', 'cha'] }
    const cls = normalizeClass(raw, 'k')
    expect(cls?.hitDie).toBe(8)
    expect(cls?.skillChoiceCount).toBe(2)
    expect(cls?.skillChoices.length).toBeGreaterThan(15)
  })

  it('returns null for a raw value with no name', () => {
    expect(normalizeClass({ hd: { faces: 8 } }, 'k')).toBeNull()
    expect(normalizeClass(undefined, 'k')).toBeNull()
  })
})
