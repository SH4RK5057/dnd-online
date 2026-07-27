import { describe, expect, it } from 'vitest'
import { defaultContentSource, describeContentSource, sourceKeyFor } from './contentSourceTypes'

describe('sourceKeyFor', () => {
  it('returns empty string for no source or mode "none"', () => {
    expect(sourceKeyFor(null)).toBe('')
    expect(sourceKeyFor(undefined)).toBe('')
    expect(sourceKeyFor(defaultContentSource())).toBe('')
  })

  it('keys a url source by its url', () => {
    const key = sourceKeyFor({ ...defaultContentSource(), mode: 'url', url: 'https://example.com/data' })
    expect(key).toBe('url:https://example.com/data|smirc')
  })

  it('keys a github source by owner/repo/branch/path', () => {
    const key = sourceKeyFor({
      ...defaultContentSource(),
      mode: 'github',
      owner: 'me',
      repo: 'my-data',
      branch: 'main',
      path: 'data',
    })
    expect(key).toBe('github:me/my-data@main:data|smirc')
  })

  it('produces different keys when any github field changes', () => {
    const base = { ...defaultContentSource(), mode: 'github' as const, owner: 'me', repo: 'r', branch: 'main', path: '' }
    const key = sourceKeyFor(base)
    expect(sourceKeyFor({ ...base, branch: 'dev' })).not.toBe(key)
    expect(sourceKeyFor({ ...base, path: 'data' })).not.toBe(key)
  })

  it('produces different keys when the selected categories change', () => {
    const base = { ...defaultContentSource(), mode: 'url' as const, url: 'https://x.test' }
    const key = sourceKeyFor(base)
    expect(sourceKeyFor({ ...base, includeSpells: false })).not.toBe(key)
    expect(sourceKeyFor({ ...base, includeMonsters: false })).not.toBe(key)
    expect(sourceKeyFor({ ...base, includeItems: false })).not.toBe(key)
    expect(sourceKeyFor({ ...base, includeMonsters: false })).toBe('url:https://x.test|sirc')
  })
})

describe('describeContentSource', () => {
  it('describes an unconfigured source', () => {
    expect(describeContentSource(null)).toMatch(/no shared content source/i)
    expect(describeContentSource(defaultContentSource())).toMatch(/no shared content source/i)
  })

  it('describes a url source', () => {
    expect(describeContentSource({ ...defaultContentSource(), mode: 'url', url: 'https://x.test' })).toContain('https://x.test')
  })

  it('describes a github source, including path when set', () => {
    const withPath = describeContentSource({
      ...defaultContentSource(),
      mode: 'github',
      owner: 'me',
      repo: 'r',
      branch: 'main',
      path: 'data',
    })
    expect(withPath).toContain('me/r@main/data')

    const withoutPath = describeContentSource({
      ...defaultContentSource(),
      mode: 'github',
      owner: 'me',
      repo: 'r',
      branch: 'main',
      path: '',
    })
    expect(withoutPath).toContain('me/r@main')
    expect(withoutPath).not.toContain('/data')
  })

  it('lists which categories are included, or says so when none are', () => {
    const allThree = describeContentSource({ ...defaultContentSource(), mode: 'url', url: 'https://x.test' })
    expect(allThree).toContain('spells, monsters, items, races, classes')

    const onlyMonsters = describeContentSource({
      ...defaultContentSource(),
      mode: 'url',
      url: 'https://x.test',
      includeSpells: false,
      includeItems: false,
      includeRaces: false,
      includeClasses: false,
    })
    expect(onlyMonsters).toContain('(monsters)')

    const none = describeContentSource({
      ...defaultContentSource(),
      mode: 'url',
      url: 'https://x.test',
      includeSpells: false,
      includeMonsters: false,
      includeItems: false,
      includeRaces: false,
      includeClasses: false,
    })
    expect(none).toContain('nothing selected')
  })
})
