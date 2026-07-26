/** Where a campaign's shared reference content should be fetched from —
 * this is the *location* only (a URL, or a GitHub owner/repo/branch/path),
 * synced via the campaign's Yjs doc so every player's client knows to fetch
 * the exact same dataset the DM configured, instead of each browser needing
 * its own separately-typed URL. Deliberately holds no access token — see
 * useContentSource.ts's doc comment for why. */
export type ContentSourceMode = 'none' | 'url' | 'github'

/** Which content categories to pull in — flat booleans (not a nested
 * array/object) per this app's CRDT-flatness convention. Lets a DM import
 * just monsters, just items, or any combination, rather than always
 * ingesting spells+monsters+items together. */
export interface ContentCategories {
  includeSpells: boolean
  includeMonsters: boolean
  includeItems: boolean
}

export interface ContentSourceRecord extends ContentCategories {
  mode: ContentSourceMode
  url: string
  owner: string
  repo: string
  branch: string
  path: string
  updatedAt: number
}

export function defaultContentCategories(): ContentCategories {
  return { includeSpells: true, includeMonsters: true, includeItems: true }
}

export function defaultContentSource(): ContentSourceRecord {
  return { mode: 'none', url: '', owner: '', repo: '', branch: '', path: '', updatedAt: 0, ...defaultContentCategories() }
}

/** A stable string identifying "this exact configured source" — location
 * plus which categories are included — so a client can tell whether its
 * locally cached mirror content already matches the campaign's
 * currently-configured source or needs re-fetching. */
export function sourceKeyFor(source: ContentSourceRecord | null | undefined): string {
  if (!source || source.mode === 'none') return ''
  const categoryFlags = `${source.includeSpells ? 's' : ''}${source.includeMonsters ? 'm' : ''}${source.includeItems ? 'i' : ''}`
  const location =
    source.mode === 'url' ? `url:${source.url}` : `github:${source.owner}/${source.repo}@${source.branch}:${source.path}`
  return `${location}|${categoryFlags}`
}

export function describeContentSource(source: ContentSourceRecord | null | undefined): string {
  if (!source || source.mode === 'none') return 'No shared content source configured for this campaign yet.'
  const location =
    source.mode === 'url'
      ? `Mirror URL: ${source.url}`
      : `GitHub: ${source.owner}/${source.repo}@${source.branch}${source.path ? `/${source.path}` : ''}`
  const categories = [
    source.includeSpells && 'spells',
    source.includeMonsters && 'monsters',
    source.includeItems && 'items',
  ].filter(Boolean)
  return `${location} (${categories.length > 0 ? categories.join(', ') : 'nothing selected'})`
}
