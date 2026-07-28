import { useCallback, useEffect, useState } from 'react'
import * as Y from 'yjs'
import type { Currency, LootItemRecord } from './types'
import type { CharacterRecord } from '../character/types'

const CURRENCY_KEY = 'currency'

function lootMap(doc: Y.Doc) {
  return doc.getMap<LootItemRecord>('partyLoot')
}
function currencyMap(doc: Y.Doc) {
  return doc.getMap<Currency>('partyCurrency')
}
function charactersMap(doc: Y.Doc) {
  return doc.getMap<CharacterRecord>('characters')
}

function defaultCurrency(): Currency {
  return { pp: 0, gp: 0, ep: 0, sp: 0, cp: 0 }
}

export interface UsePartyLootResult {
  /** Unclaimed loot, oldest first. */
  items: LootItemRecord[]
  currency: Currency
  addItem: (name: string, quantity: number, notes: string) => void
  removeItem: (itemId: string) => void
  /** Moves an item out of the shared pool into a specific character's own
   * inventory in one step. */
  claimItem: (itemId: string, characterId: string) => void
  adjustCurrency: (patch: Partial<Currency>) => void
  /** Divides each denomination evenly (floor) across `characterIds`,
   * crediting each character's own `currency` — any remainder stays in the
   * shared pool rather than being lost, so re-splitting later still adds up. */
  splitCurrency: (characterIds: string[]) => void
}

/** Shared party treasure — a pool of unclaimed loot items plus a pooled
 * coin purse, visible to the DM and every player alike (same
 * party-wide-transparency reasoning as inventory history). Claiming an item
 * or splitting currency writes directly into the relevant character's own
 * record, mirroring the pattern useInventoryActions already uses for
 * cross-character inventory moves. */
export function usePartyLoot(doc: Y.Doc | null): UsePartyLootResult {
  const [items, setItems] = useState<LootItemRecord[]>([])
  const [currency, setCurrencyState] = useState<Currency>(defaultCurrency())

  useEffect(() => {
    if (!doc) {
      setItems([])
      return
    }
    const lootM = lootMap(doc)
    const sync = () => setItems(Array.from(lootM.values()).sort((a, b) => a.createdAt - b.createdAt))
    sync()
    lootM.observe(sync)
    return () => lootM.unobserve(sync)
  }, [doc])

  useEffect(() => {
    if (!doc) {
      setCurrencyState(defaultCurrency())
      return
    }
    const m = currencyMap(doc)
    const sync = () => setCurrencyState({ ...defaultCurrency(), ...m.get(CURRENCY_KEY) })
    sync()
    m.observe(sync)
    return () => m.unobserve(sync)
  }, [doc])

  const addItem = useCallback(
    (name: string, quantity: number, notes: string) => {
      if (!doc) return
      const id = crypto.randomUUID()
      lootMap(doc).set(id, { id, name, quantity: Math.max(1, quantity), notes, createdAt: Date.now() })
    },
    [doc],
  )

  const removeItem = useCallback(
    (itemId: string) => {
      if (!doc) return
      lootMap(doc).delete(itemId)
    },
    [doc],
  )

  const claimItem = useCallback(
    (itemId: string, characterId: string) => {
      if (!doc) return
      const lootM = lootMap(doc)
      const item = lootM.get(itemId)
      if (!item) return
      const charactersM = charactersMap(doc)
      const character = charactersM.get(characterId)
      if (!character) return
      doc.transact(() => {
        charactersM.set(characterId, {
          ...character,
          inventory: [...character.inventory, { id: crypto.randomUUID(), name: item.name, quantity: item.quantity, notes: item.notes }],
        })
        lootM.delete(itemId)
      })
    },
    [doc],
  )

  const adjustCurrency = useCallback(
    (patch: Partial<Currency>) => {
      if (!doc) return
      const m = currencyMap(doc)
      const current = { ...defaultCurrency(), ...m.get(CURRENCY_KEY) }
      const next: Currency = {
        pp: Math.max(0, current.pp + (patch.pp ?? 0)),
        gp: Math.max(0, current.gp + (patch.gp ?? 0)),
        ep: Math.max(0, current.ep + (patch.ep ?? 0)),
        sp: Math.max(0, current.sp + (patch.sp ?? 0)),
        cp: Math.max(0, current.cp + (patch.cp ?? 0)),
      }
      m.set(CURRENCY_KEY, next)
    },
    [doc],
  )

  const splitCurrency = useCallback(
    (characterIds: string[]) => {
      if (!doc || characterIds.length === 0) return
      const m = currencyMap(doc)
      const current = { ...defaultCurrency(), ...m.get(CURRENCY_KEY) }
      const shares: Currency = defaultCurrency()
      const remainder: Currency = defaultCurrency()
      for (const denom of ['pp', 'gp', 'ep', 'sp', 'cp'] as const) {
        shares[denom] = Math.floor(current[denom] / characterIds.length)
        remainder[denom] = current[denom] - shares[denom] * characterIds.length
      }
      const charactersM = charactersMap(doc)
      doc.transact(() => {
        for (const characterId of characterIds) {
          const character = charactersM.get(characterId)
          if (!character) continue
          charactersM.set(characterId, {
            ...character,
            currency: {
              pp: character.currency.pp + shares.pp,
              gp: character.currency.gp + shares.gp,
              ep: character.currency.ep + shares.ep,
              sp: character.currency.sp + shares.sp,
              cp: character.currency.cp + shares.cp,
            },
          })
        }
        m.set(CURRENCY_KEY, remainder)
      })
    },
    [doc],
  )

  return { items, currency, addItem, removeItem, claimItem, adjustCurrency, splitCurrency }
}
