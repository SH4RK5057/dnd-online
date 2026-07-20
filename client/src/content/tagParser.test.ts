import { describe, expect, it } from 'vitest'
import { parseTags, stripTags } from './tagParser'

describe('parseTags', () => {
  it('returns a single text segment when there is no markup', () => {
    expect(parseTags('A goblin attacks.')).toEqual([{ type: 'text', text: 'A goblin attacks.' }])
  })

  it('parses a dice tag surrounded by plain text', () => {
    const segments = parseTags('Deals {@damage 8d6} fire damage.')
    expect(segments).toEqual([
      { type: 'text', text: 'Deals ' },
      { type: 'dice', text: '8d6' },
      { type: 'text', text: ' fire damage.' },
    ])
  })

  it('parses a save tag and formats it as a readable phrase', () => {
    const segments = parseTags('Each creature must make a {@save dex} or take damage.')
    expect(segments).toContainEqual({ type: 'save', text: 'dex save' })
  })

  it('parses a dc tag', () => {
    expect(parseTags('{@dc 15} Dexterity saving throw')).toContainEqual({ type: 'dc', text: 'DC 15' })
  })

  it('parses a hit tag and normalizes the sign', () => {
    expect(parseTags('{@hit 5} to hit')).toContainEqual({ type: 'hit', text: '+5' })
    expect(parseTags('{@hit -1} to hit')).toContainEqual({ type: 'hit', text: '-1' })
  })

  it('parses condition/skill/spell/item/creature cross-reference tags using the pipe-first segment', () => {
    expect(parseTags('{@condition blinded|PHB|blinded condition}')).toContainEqual({
      type: 'condition',
      text: 'blinded',
    })
    expect(parseTags('{@skill Stealth}')).toContainEqual({ type: 'skill', text: 'Stealth' })
    expect(parseTags('{@spell fireball}')).toContainEqual({ type: 'spell', text: 'fireball' })
    expect(parseTags('{@item longsword|PHB}')).toContainEqual({ type: 'item', text: 'longsword' })
    expect(parseTags('{@creature goblin}')).toContainEqual({ type: 'creature', text: 'goblin' })
  })

  it('parses bold/italic tags', () => {
    expect(parseTags('{@b Special Trait.}')).toContainEqual({ type: 'bold', text: 'Special Trait.' })
    expect(parseTags('{@i flavor text}')).toContainEqual({ type: 'italic', text: 'flavor text' })
  })

  it('falls back to the pipe-first display text for an unrecognized tag', () => {
    expect(parseTags('{@filter spells|source=PHB}')).toContainEqual({ type: 'other', text: 'spells' })
  })

  it('handles multiple tags in one string, in order', () => {
    const segments = parseTags('{@b Fire Breath.} The dragon exhales fire in a {@dice 15d6} cone.')
    expect(segments.map((s) => s.type)).toEqual(['bold', 'text', 'dice', 'text'])
  })

  it('does not throw and returns the original text unchanged when there is no closing brace', () => {
    expect(() => parseTags('broken {@dice 1d6')).not.toThrow()
    expect(parseTags('broken {@dice 1d6')).toEqual([{ type: 'text', text: 'broken {@dice 1d6' }])
  })
})

describe('stripTags', () => {
  it('reduces tagged text to plain readable text', () => {
    expect(stripTags('Deals {@damage 8d6} fire damage to each creature ({@save dex}).')).toBe(
      'Deals 8d6 fire damage to each creature (dex save).',
    )
  })

  it('returns plain text unchanged', () => {
    expect(stripTags('No markup here.')).toBe('No markup here.')
  })
})
