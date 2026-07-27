import { describe, expect, it } from 'vitest'
import { groupFeaturesByKey, normalizeClass, normalizeRace, normalizeSubclass } from './mirrorNormalize'

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

  it('preserves each trait\'s name when entries are real 5etools-shaped {name, entries} objects', () => {
    const raw = {
      name: 'Dwarf',
      size: ['M'],
      speed: 25,
      ability: [{ con: 2 }],
      entries: [
        { name: 'Age', entries: ['Dwarves mature at the same rate as humans.'] },
        { name: 'Darkvision', entries: ['You can see in dim light within 60 feet as if it were bright light.'] },
        { name: 'Speed', type: 'entries', entries: ['Your speed is not reduced by wearing heavy armor.'] },
      ],
    }
    const race = normalizeRace(raw, 'mirror:dwarf')
    expect(race?.traits).toEqual([
      'Age: Dwarves mature at the same rate as humans.',
      'Darkvision: You can see in dim light within 60 feet as if it were bright light.',
      'Speed: Your speed is not reduced by wearing heavy armor.',
    ])
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
      asiLevels: [4, 8, 12, 16, 19],
      subclassLevel: 3,
      features: [],
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

  it('detects ASI levels and subclass level from feature names, sorted by level', () => {
    const raw = { name: 'Fighter', hd: { faces: 10 }, proficiency: ['str', 'con'] }
    const features = [
      { level: 6, name: 'Ability Score Improvement', entries: [] },
      { level: 1, name: 'Fighting Style', entries: [] },
      { level: 3, name: 'Martial Archetype', entries: [] },
      { level: 4, name: 'Ability Score Improvement', entries: [] },
    ]
    const cls = normalizeClass(raw, 'k', features)
    expect(cls?.asiLevels).toEqual([4, 6])
    expect(cls?.subclassLevel).toBe(3)
    expect(cls?.features.map((f) => f.level)).toEqual([1, 3, 4, 6])
  })

  it('falls back to standard ASI levels and subclassLevel 3 when nothing matches', () => {
    const raw = { name: 'Homebrew Class' }
    const cls = normalizeClass(raw, 'k', [{ level: 1, name: 'Something Else', entries: [] }])
    expect(cls?.asiLevels).toEqual([4, 8, 12, 16, 19])
    expect(cls?.subclassLevel).toBe(3)
  })
})

describe('groupFeaturesByKey', () => {
  it('groups feature entries by the given key field', () => {
    const raw = [
      { name: 'Fighting Style', level: 1, className: 'Fighter', entries: ['pick a style'] },
      { name: 'Action Surge', level: 2, className: 'Fighter', entries: [] },
      { name: 'Spellcasting', level: 1, className: 'Wizard', entries: [] },
    ]
    const groups = groupFeaturesByKey(raw, 'className')
    expect(groups.get('Fighter')?.map((f) => f.name)).toEqual(['Fighting Style', 'Action Surge'])
    expect(groups.get('Wizard')?.map((f) => f.name)).toEqual(['Spellcasting'])
    expect(groups.get('Sorcerer')).toBeUndefined()
  })

  it('returns an empty map for non-array input', () => {
    expect(groupFeaturesByKey(undefined, 'className').size).toBe(0)
    expect(groupFeaturesByKey(null, 'className').size).toBe(0)
  })
})

describe('normalizeSubclass', () => {
  it('extracts name, className, and sorted features', () => {
    const raw = { name: 'Champion', className: 'Fighter', shortName: 'Champion' }
    const features = [
      { level: 7, name: 'Remarkable Athlete', entries: [] },
      { level: 3, name: 'Improved Critical', entries: [] },
    ]
    const subclass = normalizeSubclass(raw, 'mirror:subclass-1', features)
    expect(subclass).toEqual({
      key: 'mirror:subclass-1',
      source: 'mirror',
      name: 'Champion',
      className: 'Fighter',
      features: [
        { level: 3, name: 'Improved Critical', entries: [] },
        { level: 7, name: 'Remarkable Athlete', entries: [] },
      ],
    })
  })

  it('returns null when name or className is missing', () => {
    expect(normalizeSubclass({ name: 'Champion' }, 'k')).toBeNull()
    expect(normalizeSubclass({ className: 'Fighter' }, 'k')).toBeNull()
    expect(normalizeSubclass(null, 'k')).toBeNull()
  })
})
