import type { CharacterRecord, FeatEntry, InventoryItem } from '../character/types'

/** Inventory + feats row-CRUD. Always editable regardless of `character.locked`
 * — gear and feats change during normal play, unlike the core blueprint. */
export function CharacterInventory({
  character,
  canEdit,
  onUpdate,
}: {
  character: CharacterRecord
  canEdit: boolean
  onUpdate: (patch: Partial<Pick<CharacterRecord, 'inventory' | 'feats'>>) => void
}) {
  const updateItem = (id: string, patch: Partial<InventoryItem>) => {
    onUpdate({ inventory: character.inventory.map((item) => (item.id === id ? { ...item, ...patch } : item)) })
  }
  const addItem = () => {
    const item: InventoryItem = { id: crypto.randomUUID(), name: '', quantity: 1, notes: '' }
    onUpdate({ inventory: [...character.inventory, item] })
  }
  const removeItem = (id: string) => onUpdate({ inventory: character.inventory.filter((i) => i.id !== id) })

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
              onChange={(e) => updateItem(item.id, { name: e.target.value })}
            />
            <input
              type="number"
              min={0}
              value={item.quantity}
              disabled={!canEdit}
              onChange={(e) => updateItem(item.id, { quantity: Number(e.target.value) })}
            />
            <input
              placeholder="Notes"
              value={item.notes}
              disabled={!canEdit}
              onChange={(e) => updateItem(item.id, { notes: e.target.value })}
            />
            {canEdit && (
              <button type="button" onClick={() => removeItem(item.id)}>
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
