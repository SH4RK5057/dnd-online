import { useCallback, useEffect, useState } from 'react'
import * as Y from 'yjs'
import type { HomebrewItemRecord, HomebrewMonsterRecord, HomebrewSpellRecord } from './types'

function spellsMap(doc: Y.Doc) {
  return doc.getMap<HomebrewSpellRecord>('homebrewSpells')
}
function monstersMap(doc: Y.Doc) {
  return doc.getMap<HomebrewMonsterRecord>('homebrewMonsters')
}
function itemsMap(doc: Y.Doc) {
  return doc.getMap<HomebrewItemRecord>('homebrewItems')
}

export interface UseHomebrewContentResult {
  homebrewSpells: HomebrewSpellRecord[]
  homebrewMonsters: HomebrewMonsterRecord[]
  homebrewItems: HomebrewItemRecord[]
  createHomebrewSpell: (fields: Omit<HomebrewSpellRecord, 'id' | 'createdAt'>) => string
  updateHomebrewSpell: (id: string, patch: Partial<Omit<HomebrewSpellRecord, 'id' | 'createdAt'>>) => void
  deleteHomebrewSpell: (id: string) => void
  createHomebrewMonster: (fields: Omit<HomebrewMonsterRecord, 'id' | 'createdAt'>) => string
  updateHomebrewMonster: (id: string, patch: Partial<Omit<HomebrewMonsterRecord, 'id' | 'createdAt'>>) => void
  deleteHomebrewMonster: (id: string) => void
  createHomebrewItem: (fields: Omit<HomebrewItemRecord, 'id' | 'createdAt'>) => string
  updateHomebrewItem: (id: string, patch: Partial<Omit<HomebrewItemRecord, 'id' | 'createdAt'>>) => void
  deleteHomebrewItem: (id: string) => void
}

/** DM-authored custom spells/monsters/items, stored flat in the campaign's
 * Yjs doc (same `doc.getMap<Record>('name')`, `{id, ...fields, createdAt}`
 * convention as every other entity in this app) so they sync to players and
 * survive reconnects, unlike the SRD/mirror content which is purely local. */
export function useHomebrewContent(doc: Y.Doc | null): UseHomebrewContentResult {
  const [homebrewSpells, setHomebrewSpells] = useState<HomebrewSpellRecord[]>([])
  const [homebrewMonsters, setHomebrewMonsters] = useState<HomebrewMonsterRecord[]>([])
  const [homebrewItems, setHomebrewItems] = useState<HomebrewItemRecord[]>([])

  useEffect(() => {
    if (!doc) {
      setHomebrewSpells([])
      setHomebrewMonsters([])
      setHomebrewItems([])
      return
    }
    const spellsM = spellsMap(doc)
    const monstersM = monstersMap(doc)
    const itemsM = itemsMap(doc)

    const syncSpells = () => setHomebrewSpells(Array.from(spellsM.values()))
    const syncMonsters = () => setHomebrewMonsters(Array.from(monstersM.values()))
    const syncItems = () => setHomebrewItems(Array.from(itemsM.values()))

    syncSpells()
    syncMonsters()
    syncItems()
    spellsM.observe(syncSpells)
    monstersM.observe(syncMonsters)
    itemsM.observe(syncItems)
    return () => {
      spellsM.unobserve(syncSpells)
      monstersM.unobserve(syncMonsters)
      itemsM.unobserve(syncItems)
    }
  }, [doc])

  const createHomebrewSpell = useCallback(
    (fields: Omit<HomebrewSpellRecord, 'id' | 'createdAt'>): string => {
      if (!doc) throw new Error('No active session.')
      const id = crypto.randomUUID()
      spellsMap(doc).set(id, { ...fields, id, createdAt: Date.now() })
      return id
    },
    [doc],
  )
  const updateHomebrewSpell = useCallback(
    (id: string, patch: Partial<Omit<HomebrewSpellRecord, 'id' | 'createdAt'>>) => {
      if (!doc) return
      const m = spellsMap(doc)
      const record = m.get(id)
      if (!record) return
      m.set(id, { ...record, ...patch })
    },
    [doc],
  )
  const deleteHomebrewSpell = useCallback((id: string) => doc && spellsMap(doc).delete(id), [doc])

  const createHomebrewMonster = useCallback(
    (fields: Omit<HomebrewMonsterRecord, 'id' | 'createdAt'>): string => {
      if (!doc) throw new Error('No active session.')
      const id = crypto.randomUUID()
      monstersMap(doc).set(id, { ...fields, id, createdAt: Date.now() })
      return id
    },
    [doc],
  )
  const updateHomebrewMonster = useCallback(
    (id: string, patch: Partial<Omit<HomebrewMonsterRecord, 'id' | 'createdAt'>>) => {
      if (!doc) return
      const m = monstersMap(doc)
      const record = m.get(id)
      if (!record) return
      m.set(id, { ...record, ...patch })
    },
    [doc],
  )
  const deleteHomebrewMonster = useCallback((id: string) => doc && monstersMap(doc).delete(id), [doc])

  const createHomebrewItem = useCallback(
    (fields: Omit<HomebrewItemRecord, 'id' | 'createdAt'>): string => {
      if (!doc) throw new Error('No active session.')
      const id = crypto.randomUUID()
      itemsMap(doc).set(id, { ...fields, id, createdAt: Date.now() })
      return id
    },
    [doc],
  )
  const updateHomebrewItem = useCallback(
    (id: string, patch: Partial<Omit<HomebrewItemRecord, 'id' | 'createdAt'>>) => {
      if (!doc) return
      const m = itemsMap(doc)
      const record = m.get(id)
      if (!record) return
      m.set(id, { ...record, ...patch })
    },
    [doc],
  )
  const deleteHomebrewItem = useCallback((id: string) => doc && itemsMap(doc).delete(id), [doc])

  return {
    homebrewSpells,
    homebrewMonsters,
    homebrewItems,
    createHomebrewSpell,
    updateHomebrewSpell,
    deleteHomebrewSpell,
    createHomebrewMonster,
    updateHomebrewMonster,
    deleteHomebrewMonster,
    createHomebrewItem,
    updateHomebrewItem,
    deleteHomebrewItem,
  }
}
