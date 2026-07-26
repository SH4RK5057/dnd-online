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
    expect(key).toBe('url:https://example.com/data')
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
    expect(key).toBe('github:me/my-data@main:data')
  })

  it('produces different keys when any github field changes', () => {
    const base = { ...defaultContentSource(), mode: 'github' as const, owner: 'me', repo: 'r', branch: 'main', path: '' }
    const key = sourceKeyFor(base)
    expect(sourceKeyFor({ ...base, branch: 'dev' })).not.toBe(key)
    expect(sourceKeyFor({ ...base, path: 'data' })).not.toBe(key)
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
})
