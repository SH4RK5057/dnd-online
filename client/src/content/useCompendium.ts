import { useCallback, useEffect, useMemo, useState } from 'react'
import type * as Y from 'yjs'
import { SRD_ITEMS, SRD_MONSTERS, SRD_SPELLS } from './srdData'
import { useHomebrewContent } from './useHomebrewContent'
import {
  fetchMirrorFromUrl,
  getCachedMirrorContent,
  importMirrorFiles,
  type MirrorContent,
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
  importMirrorLocalFiles: (files: FileList | File[]) => Promise<void>
  /** `token` is optional — a bearer token (e.g. GitHub PAT) for a private
   * mirror repo. See mirrorStorage.ts's fetchMirrorFromUrl. */
  importMirrorUrl: (url: string, token?: string) => Promise<void>
  homebrew: ReturnType<typeof useHomebrewContent>
}

/** Merges the three compendium sources into one browsable set: the baked-in
 * SRD fallback (always present), an optional private-mirror import (loaded
 * from its IndexedDB cache on mount — see mirrorStorage.ts), and DM homebrew
 * content (live-synced via the campaign's Yjs doc). Mirror content is purely
 * local to this browser; homebrew is shared with every connected player. */
export function useCompendium(doc: Y.Doc | null): UseCompendiumResult {
  const homebrew = useHomebrewContent(doc)
  const [mirror, setMirror] = useState<MirrorContent | null>(null)
  const [mirrorErrors, setMirrorErrors] = useState<string[]>([])

  useEffect(() => {
    let cancelled = false
    void getCachedMirrorContent().then((cached) => {
      if (!cancelled) setMirror(cached)
    })
    return () => {
      cancelled = true
    }
  }, [])

  const importMirrorLocalFiles = useCallback(async (files: FileList | File[]) => {
    const { content, errors } = await importMirrorFiles(files)
    setMirror(content)
    setMirrorErrors(errors)
  }, [])

  const importMirrorUrl = useCallback(async (url: string, token = '') => {
    const { content, errors } = await fetchMirrorFromUrl(url, token)
    setMirror(content)
    setMirrorErrors(errors)
  }, [])

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

  return {
    spells,
    monsters,
    items,
    mirrorErrors,
    mirrorImportedAt: mirror?.importedAt ?? null,
    importMirrorLocalFiles,
    importMirrorUrl,
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
