import { useCallback, useEffect, useState } from 'react'
import * as Y from 'yjs'
import { defaultContentSource, type ContentCategories, type ContentSourceRecord } from './contentSourceTypes'

const SOURCE_KEY = 'source'

function sourceMap(doc: Y.Doc) {
  return doc.getMap<ContentSourceRecord>('contentSource')
}

export interface UseContentSourceResult {
  record: ContentSourceRecord
  setUrlSource: (url: string, categories: ContentCategories) => void
  setGithubSource: (owner: string, repo: string, branch: string, path: string, categories: ContentCategories) => void
  clearSource: () => void
}

/** The campaign's shared "where to fetch reference content from" pointer —
 * a singleton record synced via Yjs (same pattern as
 * character/useCampaignSettings.ts) so every connected player's browser
 * knows to fetch the same dataset the DM configured, instead of everyone
 * separately typing in the same URL. Deliberately stores only the
 * *location* — never an access token, since anything written here is
 * replicated to every peer over WebRTC. A private-repo token stays local to
 * each browser (content/constants.ts's loadSavedMirrorToken), so every
 * viewer — DM included — supplies their own. */
export function useContentSource(doc: Y.Doc | null): UseContentSourceResult {
  const [record, setRecord] = useState<ContentSourceRecord>(defaultContentSource())

  useEffect(() => {
    if (!doc) {
      setRecord(defaultContentSource())
      return
    }
    const m = sourceMap(doc)
    const sync = () => setRecord({ ...defaultContentSource(), ...m.get(SOURCE_KEY) })
    sync()
    m.observe(sync)
    return () => m.unobserve(sync)
  }, [doc])

  const setUrlSource = useCallback(
    (url: string, categories: ContentCategories) => {
      if (!doc) return
      sourceMap(doc).set(SOURCE_KEY, { ...defaultContentSource(), ...categories, mode: 'url', url, updatedAt: Date.now() })
    },
    [doc],
  )

  const setGithubSource = useCallback(
    (owner: string, repo: string, branch: string, path: string, categories: ContentCategories) => {
      if (!doc) return
      sourceMap(doc).set(SOURCE_KEY, {
        ...defaultContentSource(),
        ...categories,
        mode: 'github',
        owner,
        repo,
        branch,
        path,
        updatedAt: Date.now(),
      })
    },
    [doc],
  )

  const clearSource = useCallback(() => {
    if (!doc) return
    sourceMap(doc).set(SOURCE_KEY, defaultContentSource())
  }, [doc])

  return { record, setUrlSource, setGithubSource, clearSource }
}
