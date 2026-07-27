import { useState } from 'react'
import type { CharacterRecord, FeatEntry, InventoryItem } from '../character/types'
import type { UseInventoryActionsResult } from '../character/useInventoryActions'

/** Inventory + feats row-CRUD. Always editable regardless of `character.locked`
 * — gear and feats change during normal play, unlike the core blueprint.
 * Inventory add/remove/transfer go through inventoryActions so every change
 * is logged (character/inventoryHistory.ts) — feats don't need that, so
 * they stay on the plain onUpdate patch pattern. */
export function CharacterInventory({
  character,
  canEdit,
  onUpdate,
  inventoryActions,
  otherCharacters = [],
}: {
  character: CharacterRecord
  canEdit: boolean
  onUpdate: (patch: Partial<Pick<CharacterRecord, 'inventory' | 'feats'>>) => void
  /** Omitted in the standalone (pre-campaign) character editor — falls back
   * to plain onUpdate-based add/remove with no history logging there. */
  inventoryActions?: UseInventoryActionsResult
  /** Everyone else's character, for the transfer-to dropdown. Empty (no
   * transfer UI) when omitted or there's no one else to give items to. */
  otherCharacters?: { id: string; name: string }[]
}) {
  const [transferTargetByItemId, setTransferTargetByItemId] = useState<Record<string, string>>({})

  const updateItemFields = (id: string, patch: Partial<Pick<InventoryItem, 'name' | 'notes'>>) => {
    onUpdate({ inventory: character.inventory.map((item) => (item.id === id ? { ...item, ...patch } : item)) })
  }
  const updateItemQuantity = (item: InventoryItem, quantity: number) => {
    // Quantity edits aren't logged as add/remove — only whole-row
    // add/remove/transfer are, to keep the history log meaningful rather
    // than noisy with every +/-1 tweak.
    const clamped = Math.max(0, quantity)
    onUpdate({ inventory: character.inventory.map((i) => (i.id === item.id ? { ...i, quantity: clamped } : i)) })
  }
  const addItem = () => {
    if (inventoryActions) {
      inventoryActions.addItem(character.id, character.name, { name: '', quantity: 1, notes: '' })
    } else {
      onUpdate({ inventory: [...character.inventory, { id: crypto.randomUUID(), name: '', quantity: 1, notes: '' }] })
    }
  }
  const removeItem = (item: InventoryItem) => {
    if (inventoryActions) inventoryActions.removeItem(character.id, character.name, item)
    else onUpdate({ inventory: character.inventory.filter((i) => i.id !== item.id) })
  }
  const handleTransfer = (item: InventoryItem) => {
    if (!inventoryActions) return
    const targetId = transferTargetByItemId[item.id]
    const target = otherCharacters.find((c) => c.id === targetId)
    if (!target) return
    inventoryActions.transferItem({ characterId: character.id, characterName: character.name }, { characterId: target.id, characterName: target.name }, item)
    setTransferTargetByItemId((prev) => ({ ...prev, [item.id]: '' }))
  }

  const updateFeat = (id: string, patch: Partial<FeatEntry>) => {
    onUpdate({ feats: character.feats.map((f) => (f.id === id ? { ...f, ...patch } : f)) })
  }
  const addFeat = () => {
    const feat: FeatEntry = { id: crypto.randomUUID(), name: '', notes: '' }
    onUpdate({ feats: [...character.feats, feat] })
  }
  const removeFeat = (id: string) => onUpdate({ feats: character.feats.filter((f) => f.id !== id) })

  return (
    <div className="character-sheet__section">
      <h3>Inventory</h3>
      <ul className="character-sheet__row-list">
        {character.inventory.map((item) => (
          <li key={item.id} className="character-sheet__row">
            <input
              placeholder="Item name"
              value={item.name}
              disabled={!canEdit}
              onChange={(e) => updateItemFields(item.id, { name: e.target.value })}
            />
            <input
              type="number"
              min={0}
              value={item.quantity}
              disabled={!canEdit}
              onChange={(e) => updateItemQuantity(item, Number(e.target.value))}
            />
            <input
              placeholder="Notes"
              value={item.notes}
              disabled={!canEdit}
              onChange={(e) => updateItemFields(item.id, { notes: e.target.value })}
            />
            {canEdit && otherCharacters.length > 0 && (
              <>
                <select
                  value={transferTargetByItemId[item.id] ?? ''}
                  onChange={(e) => setTransferTargetByItemId((prev) => ({ ...prev, [item.id]: e.target.value }))}
                >
                  <option value="">Give to…</option>
                  {otherCharacters.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
                <button type="button" onClick={() => handleTransfer(item)} disabled={!transferTargetByItemId[item.id]}>
                  Give
                </button>
              </>
            )}
            {canEdit && (
              <button type="button" onClick={() => removeItem(item)}>
                Remove
              </button>
            )}
          </li>
        ))}
      </ul>
      {canEdit && (
        <button type="button" onClick={addItem}>
          Add item
        </button>
      )}

      <h3>Feats</h3>
      <ul className="character-sheet__row-list">
        {character.feats.map((feat) => (
          <li key={feat.id} className="character-sheet__row">
            <input
              placeholder="Feat name"
              value={feat.name}
              disabled={!canEdit}
              onChange={(e) => updateFeat(feat.id, { name: e.target.value })}
            />
            <input
              placeholder="Notes"
              value={feat.notes}
              disabled={!canEdit}
              onChange={(e) => updateFeat(feat.id, { notes: e.target.value })}
            />
            {canEdit && (
              <button type="button" onClick={() => removeFeat(feat.id)}>
                Remove
              </button>
            )}
          </li>
        ))}
      </ul>
      {canEdit && (
        <button type="button" onClick={addFeat}>
          Add feat
        </button>
      )}
    </div>
  )
}
