import type { InventoryHistoryRecord } from '../character/inventoryHistory'

function describe(entry: InventoryHistoryRecord): string {
  const qty = entry.quantity > 1 ? `${entry.quantity}x ` : ''
  if (entry.action === 'add') return `${entry.characterName} added ${qty}${entry.itemName}`
  if (entry.action === 'remove') return `${entry.characterName} removed ${qty}${entry.itemName}`
  return `${entry.characterName} gave ${qty}${entry.itemName} to ${entry.toCharacterName}`
}

/** Party-wide inventory transaction log — newest first, shared by everyone
 * regardless of whose character sheet it's viewed from (character/
 * useInventoryActions.ts logs to one global doc.getMap, not per-character). */
export function InventoryHistoryList({ entries }: { entries: InventoryHistoryRecord[] }) {
  if (entries.length === 0) return <p className="character-sheet__hint">No inventory changes yet.</p>
  return (
    <ul className="character-sheet__row-list">
      {entries.map((entry) => (
        <li key={entry.id} className="character-sheet__row">
          <span>{describe(entry)}</span>
          <span className="character-sheet__hint">{new Date(entry.createdAt).toLocaleTimeString()}</span>
        </li>
      ))}
    </ul>
  )
}
