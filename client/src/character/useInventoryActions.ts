import { useCallback, useEffect, useState } from 'react'
import * as Y from 'yjs'
import type { CharacterRecord, InventoryItem } from './types'
import type { InventoryHistoryRecord } from './inventoryHistory'

const MAX_HISTORY_ENTRIES = 300

function charactersMap(doc: Y.Doc) {
  return doc.getMap<CharacterRecord>('characters')
}
function historyMap(doc: Y.Doc) {
  return doc.getMap<InventoryHistoryRecord>('inventoryHistory')
}

function logEntry(doc: Y.Doc, entry: Omit<InventoryHistoryRecord, 'id' | 'createdAt'>): void {
  const id = crypto.randomUUID()
  historyMap(doc).set(id, { ...entry, id, createdAt: Date.now() })
}

export interface UseInventoryActionsResult {
  history: InventoryHistoryRecord[]
  addItem: (characterId: string, characterName: string, item: Omit<InventoryItem, 'id'>) => void
  removeItem: (characterId: string, characterName: string, item: InventoryItem) => void
  /** Moves one inventory row from one character to another in a single
   * transaction (removes it from the source, adds it to the target) and
   * logs one `transfer` history entry rather than a separate add + remove. */
  transferItem: (
    from: { characterId: string; characterName: string },
    to: { characterId: string; characterName: string },
    item: InventoryItem,
  ) => void
}

/** Logged inventory changes — "a log of every item transfer, addition, and
 * deletion between players and the DM." Shared/visible to everyone (the
 * whole point is party-wide transparency of who has what), same
 * DM-only-trims convention as dice/useRollLog.ts. */
export function useInventoryActions(doc: Y.Doc | null, isDm: boolean): UseInventoryActionsResult {
  const [history, setHistory] = useState<InventoryHistoryRecord[]>([])

  useEffect(() => {
    if (!doc) {
      setHistory([])
      return
    }
    const historyM = historyMap(doc)
    const sync = () => setHistory(Array.from(historyM.values()).sort((a, b) => b.createdAt - a.createdAt))
    sync()
    historyM.observe(sync)
    return () => historyM.unobserve(sync)
  }, [doc])

  useEffect(() => {
    if (!doc || !isDm) return
    const excess = history.length - MAX_HISTORY_ENTRIES
    if (excess <= 0) return
    const historyM = historyMap(doc)
    const oldestFirst = [...history].sort((a, b) => a.createdAt - b.createdAt)
    doc.transact(() => {
      for (let i = 0; i < excess; i++) historyM.delete(oldestFirst[i].id)
    })
  }, [doc, isDm, history])

  const addItem = useCallback(
    (characterId: string, characterName: string, item: Omit<InventoryItem, 'id'>) => {
      if (!doc) return
      const charactersM = charactersMap(doc)
      const character = charactersM.get(characterId)
      if (!character) return
      const newItem: InventoryItem = { ...item, id: crypto.randomUUID() }
      doc.transact(() => {
        charactersM.set(characterId, { ...character, inventory: [...character.inventory, newItem] })
        logEntry(doc, {
          action: 'add',
          itemName: newItem.name,
          quantity: newItem.quantity,
          characterName,
          toCharacterName: null,
        })
      })
    },
    [doc],
  )

  const removeItem = useCallback(
    (characterId: string, characterName: string, item: InventoryItem) => {
      if (!doc) return
      const charactersM = charactersMap(doc)
      const character = charactersM.get(characterId)
      if (!character) return
      doc.transact(() => {
        charactersM.set(characterId, { ...character, inventory: character.inventory.filter((i) => i.id !== item.id) })
        logEntry(doc, {
          action: 'remove',
          itemName: item.name,
          quantity: item.quantity,
          characterName,
          toCharacterName: null,
        })
      })
    },
    [doc],
  )

  const transferItem = useCallback(
    (
      from: { characterId: string; characterName: string },
      to: { characterId: string; characterName: string },
      item: InventoryItem,
    ) => {
      if (!doc) return
      const charactersM = charactersMap(doc)
      const fromCharacter = charactersM.get(from.characterId)
      const toCharacter = charactersM.get(to.characterId)
      if (!fromCharacter || !toCharacter) return
      const newItem: InventoryItem = { ...item, id: crypto.randomUUID() }
      doc.transact(() => {
        charactersM.set(from.characterId, {
          ...fromCharacter,
          inventory: fromCharacter.inventory.filter((i) => i.id !== item.id),
        })
        charactersM.set(to.characterId, { ...toCharacter, inventory: [...toCharacter.inventory, newItem] })
        logEntry(doc, {
          action: 'transfer',
          itemName: item.name,
          quantity: item.quantity,
          characterName: from.characterName,
          toCharacterName: to.characterName,
        })
      })
    },
    [doc],
  )

  return { history, addItem, removeItem, transferItem }
}
