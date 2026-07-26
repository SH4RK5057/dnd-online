/** Where a campaign's shared reference content should be fetched from —
 * this is the *location* only (a URL, or a GitHub owner/repo/branch/path),
 * synced via the campaign's Yjs doc so every player's client knows to fetch
 * the exact same dataset the DM configured, instead of each browser needing
 * its own separately-typed URL. Deliberately holds no access token — see
 * useContentSource.ts's doc comment for why. */
export type ContentSourceMode = 'none' | 'url' | 'github'

export interface ContentSourceRecord {
  mode: ContentSourceMode
  url: string
  owner: string
  repo: string
  branch: string
  path: string
  updatedAt: number
}

export function defaultContentSource(): ContentSourceRecord {
  return { mode: 'none', url: '', owner: '', repo: '', branch: '', path: '', updatedAt: 0 }
}

/** A stable string identifying "this exact configured source", so a client
 * can tell whether its locally cached mirror content already matches the
 * campaign's currently-configured source or needs re-fetching. */
export function sourceKeyFor(source: ContentSourceRecord | null | undefined): string {
  if (!source || source.mode === 'none') return ''
  if (source.mode === 'url') return `url:${source.url}`
  return `github:${source.owner}/${source.repo}@${source.branch}:${source.path}`
}

export function describeContentSource(source: ContentSourceRecord | null | undefined): string {
  if (!source || source.mode === 'none') return 'No shared content source configured for this campaign yet.'
  if (source.mode === 'url') return `Mirror URL: ${source.url}`
  return `GitHub: ${source.owner}/${source.repo}@${source.branch}${source.path ? `/${source.path}` : ''}`
}
