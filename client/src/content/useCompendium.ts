import { useCallback, useEffect, useMemo, useState } from 'react'
import type * as Y from 'yjs'
import { loadSavedMirrorToken } from './constants'
import { defaultContentCategories, sourceKeyFor, type ContentCategories, type ContentSourceRecord } from './contentSourceTypes'
import { useContentSource, type UseContentSourceResult } from './useContentSource'
import { SRD_ITEMS, SRD_MONSTERS, SRD_SPELLS } from './srdData'
import { useHomebrewContent } from './useHomebrewContent'
import {
  fetchGithubRepo,
  fetchMirrorFromUrl,
  getCachedMirrorContent,
  importMirrorFiles,
  type MirrorContent,
  type MirrorImportResult,
} from './mirrorStorage'
import type {
  CompendiumEntry,
  HomebrewItemRecord,
  HomebrewMonsterRecord,
  HomebrewSpellRecord,
  ItemData,
  MonsterData,
  SpellData,
} from './types'

/** Fetches whatever the campaign's shared content source currently points
 * to, using this browser's own saved token (never one synced via Yjs — see
 * useContentSource.ts). Returns null for mode 'none' (nothing configured). */
async function fetchForSource(source: ContentSourceRecord, sourceKey: string): Promise<MirrorImportResult | null> {
  const token = loadSavedMirrorToken()
  if (source.mode === 'url') return fetchMirrorFromUrl(source.url, token, sourceKey, source)
  if (source.mode === 'github') return fetchGithubRepo(source.owner, source.repo, source.branch, source.path, token, sourceKey, source)
  return null
}

function homebrewSpellToData(r: HomebrewSpellRecord): SpellData {
  return { ...r, key: `homebrew:${r.id}`, source: 'homebrew' }
}
function homebrewMonsterToData(r: HomebrewMonsterRecord): MonsterData {
  return { ...r, key: `homebrew:${r.id}`, source: 'homebrew' }
}
function homebrewItemToData(r: HomebrewItemRecord): ItemData {
  return { ...r, key: `homebrew:${r.id}`, source: 'homebrew' }
}

export interface UseCompendiumResult {
  spells: SpellData[]
  monsters: MonsterData[]
  items: ItemData[]
  mirrorErrors: string[]
  mirrorImportedAt: number | null
  /** `categories` (default: all) limits which of spells/monsters/items get
   * ingested — pass e.g. `{includeSpells: false, includeMonsters: true,
   * includeItems: false}` to bring in just monsters. */
  importMirrorLocalFiles: (files: FileList | File[], categories?: ContentCategories) => Promise<void>
  /** `token` is optional — a bearer token (e.g. GitHub PAT) for a private
   * mirror repo. See mirrorStorage.ts's fetchMirrorFromUrl. Also persists
   * this (including `categories`) as the campaign's shared content source
   * (contentSource.record), so every other connected client fetches the
   * same dataset. */
  importMirrorUrl: (url: string, token?: string, categories?: ContentCategories) => Promise<void>
  /** Imports from any GitHub repo/folder regardless of layout — see
   * mirrorStorage.ts's fetchGithubRepo. `path` restricts to a subfolder;
   * pass '' for the whole repo. Also persists this (including `categories`)
   * as the campaign's shared content source. */
  importGithubRepo: (
    owner: string,
    repo: string,
    branch: string,
    path: string,
    token?: string,
    categories?: ContentCategories,
  ) => Promise<void>
  /** The campaign's shared content source pointer (Yjs-synced) — what every
   * client tries to auto-fetch, and what setting a new mirror URL/GitHub
   * repo above writes to. */
  contentSource: UseContentSourceResult
  /** True once this browser has tried (and possibly failed) to fetch the
   * campaign's currently-configured source this session — lets the UI show
   * "couldn't load, maybe you need a token" instead of just silently idle. */
  contentSourceSynced: boolean
  /** Re-attempts fetching the campaign's shared content source using
   * whatever token is currently saved in this browser — for a player (or
   * DM) retrying after entering one, without changing the shared source. */
  retrySync: () => void
  homebrew: ReturnType<typeof useHomebrewContent>
}

/** Merges the three compendium sources into one browsable set: the baked-in
 * SRD fallback (always present), an optional private-mirror import (loaded
 * from its IndexedDB cache on mount — see mirrorStorage.ts), and DM homebrew
 * content (live-synced via the campaign's Yjs doc). Mirror content itself is
 * cached per-browser (IndexedDB), but *which* mirror to fetch is now a
 * shared campaign setting (contentSourceTypes.ts) — every client
 * auto-fetches the same configured source using its own locally-saved
 * token, so all players end up with the same spell/monster/item data
 * without each of them re-entering the DM's URL by hand. */
export function useCompendium(doc: Y.Doc | null): UseCompendiumResult {
  const homebrew = useHomebrewContent(doc)
  const contentSource = useContentSource(doc)
  const [mirror, setMirror] = useState<MirrorContent | null>(null)
  const [mirrorErrors, setMirrorErrors] = useState<string[]>([])
  const [attemptedSourceKey, setAttemptedSourceKey] = useState<string>('')

  useEffect(() => {
    let cancelled = false
    void getCachedMirrorContent().then((cached) => {
      if (!cancelled) setMirror(cached)
    })
    return () => {
      cancelled = true
    }
  }, [])

  // Auto-sync: whenever the campaign's shared source changes (or on first
  // load) and our local cache doesn't already match it, fetch it. Only
  // fetched once per source-key per session (attemptedSourceKey) even on
  // failure, so a missing token doesn't cause a retry loop — retrySync()
  // below is the explicit "try again" escape hatch for that case.
  useEffect(() => {
    const source = contentSource.record
    const key = sourceKeyFor(source)
    if (!key || mirror?.sourceKey === key || attemptedSourceKey === key) return
    let cancelled = false
    setAttemptedSourceKey(key)
    void fetchForSource(source, key).then((result) => {
      if (cancelled || !result) return
      const hasContent = result.content.spells.length + result.content.monsters.length + result.content.items.length > 0
      // Only replace the cache on an actual haul — a transient failure
      // (network blip, missing token) shouldn't wipe out previously-good
      // cached content for an older source-key.
      if (hasContent) setMirror(result.content)
      setMirrorErrors(result.errors)
    })
    return () => {
      cancelled = true
    }
  }, [contentSource.record, mirror?.sourceKey, attemptedSourceKey])

  const retrySync = useCallback(() => {
    setAttemptedSourceKey('')
  }, [])

  const importMirrorLocalFiles = useCallback(async (files: FileList | File[], categories = defaultContentCategories()) => {
    const { content, errors } = await importMirrorFiles(files, categories)
    setMirror(content)
    setMirrorErrors(errors)
  }, [])

  const importMirrorUrl = useCallback(
    async (url: string, token = '', categories = defaultContentCategories()) => {
      const key = sourceKeyFor({ mode: 'url', url, owner: '', repo: '', branch: '', path: '', updatedAt: 0, ...categories })
      const { content, errors } = await fetchMirrorFromUrl(url, token, key, categories)
      setMirror(content)
      setMirrorErrors(errors)
      setAttemptedSourceKey(key)
      contentSource.setUrlSource(url, categories)
    },
    [contentSource],
  )

  const importGithubRepo = useCallback(
    async (owner: string, repo: string, branch: string, path: string, token = '', categories = defaultContentCategories()) => {
      const key = sourceKeyFor({ mode: 'github', owner, repo, branch, path, url: '', updatedAt: 0, ...categories })
      const { content, errors } = await fetchGithubRepo(owner, repo, branch, path, token, key, categories)
      setMirror(content)
      setMirrorErrors(errors)
      setAttemptedSourceKey(key)
      contentSource.setGithubSource(owner, repo, branch, path, categories)
    },
    [contentSource],
  )

  const spells = useMemo(
    () => [...SRD_SPELLS, ...(mirror?.spells ?? []), ...homebrew.homebrewSpells.map(homebrewSpellToData)],
    [mirror, homebrew.homebrewSpells],
  )
  const monsters = useMemo(
    () => [...SRD_MONSTERS, ...(mirror?.monsters ?? []), ...homebrew.homebrewMonsters.map(homebrewMonsterToData)],
    [mirror, homebrew.homebrewMonsters],
  )
  const items = useMemo(
    () => [...SRD_ITEMS, ...(mirror?.items ?? []), ...homebrew.homebrewItems.map(homebrewItemToData)],
    [mirror, homebrew.homebrewItems],
  )

  const configuredKey = sourceKeyFor(contentSource.record)

  return {
    spells,
    monsters,
    items,
    mirrorErrors,
    mirrorImportedAt: mirror?.importedAt ?? null,
    importMirrorLocalFiles,
    importMirrorUrl,
    importGithubRepo,
    contentSource,
    contentSourceSynced: configuredKey !== '' && attemptedSourceKey === configuredKey,
    retrySync,
    homebrew,
  }
}

/** Looks up any compendium entry (any source) by its `key`, wrapped with its
 * kind discriminant — for the token inspector's "rules lookup" and for
 * encounter drag-and-drop initialization. */
export function findByKey(
  result: Pick<UseCompendiumResult, 'spells' | 'monsters' | 'items'>,
  key: string,
): CompendiumEntry | null {
  const spell = result.spells.find((s) => s.key === key)
  if (spell) return { kind: 'spell', data: spell }
  const monster = result.monsters.find((m) => m.key === key)
  if (monster) return { kind: 'monster', data: monster }
  const item = result.items.find((i) => i.key === key)
  if (item) return { kind: 'item', data: item }
  return null
}
