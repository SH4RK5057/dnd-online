import { useState } from 'react'
import { useSession } from '../session/useSession'
import { useCompendium } from '../content/useCompendium'
import { filterItems } from '../content/search'
import type { PendingTokenPlacement } from '../screens/pendingTokenPlacement'

const MAX_SEARCH_RESULTS = 8

/** DM-only: builds a chest/container token pre-loaded with items, then arms
 * the shared token-placement flow (same click-to-place banner as
 * TokenUploadButton, which lives in the same Token Placement section) —
 * renders nothing of its own while a placement is pending, same convention
 * as CharacterTokenMenu. Items search the compendium (same picker pattern
 * as CharacterInventory's search-to-add) or can be typed freeform. */
export function ChestPlacementPanel({
  pendingPlacement,
  onRequestPlacement,
}: {
  pendingPlacement: PendingTokenPlacement | null
  onRequestPlacement: (placement: PendingTokenPlacement) => void
}) {
  const { session } = useSession()
  const doc = session?.doc ?? null
  const compendium = useCompendium(doc)

  const [name, setName] = useState('Chest')
  const [items, setItems] = useState<{ name: string; quantity: number; notes: string }[]>([])
  const [itemQuery, setItemQuery] = useState('')
  const itemMatches = itemQuery.trim() ? filterItems(compendium.items, itemQuery, 'all').slice(0, MAX_SEARCH_RESULTS) : []

  if (pendingPlacement) return null

  const addItem = (itemName: string, notes: string) => {
    setItems((prev) => [...prev, { name: itemName, quantity: 1, notes }])
    setItemQuery('')
  }
  const updateItemQuantity = (index: number, quantity: number) => {
    setItems((prev) => prev.map((item, i) => (i === index ? { ...item, quantity: Math.max(1, quantity) } : item)))
  }
  const removeItem = (index: number) => {
    setItems((prev) => prev.filter((_, i) => i !== index))
  }

  const handlePlaceChest = () => {
    const trimmed = name.trim()
    if (!trimmed) return
    onRequestPlacement({
      name: trimmed,
      sizeCategory: 'small',
      file: null,
      modelFile: null,
      monsterInit: null,
      characterInit: null,
      hazardSize: null,
      trapEffect: null,
      containerInit: { items },
    })
    setName('Chest')
    setItems([])
  }

  return (
    <div className="chest-placement-panel">
      <h4>Chest</h4>
      <input value={name} onChange={(event) => setName(event.target.value)} placeholder="Chest name" />
      {items.length > 0 && (
        <ul className="character-sheet__row-list">
          {items.map((item, index) => (
            <li key={index} className="character-sheet__row">
              <span>{item.name}</span>
              <input
                type="number"
                min={1}
                value={item.quantity}
                onChange={(event) => updateItemQuantity(index, Number(event.target.value))}
              />
              <button type="button" onClick={() => removeItem(index)}>
                Remove
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className="character-sheet__compendium-search">
        <input placeholder="Search compendium items to add…" value={itemQuery} onChange={(event) => setItemQuery(event.target.value)} />
        {itemMatches.length > 0 && (
          <ul className="character-sheet__search-results">
            {itemMatches.map((data) => (
              <li key={data.key}>
                <button type="button" onClick={() => addItem(data.name, [data.type, data.rarity].filter(Boolean).join(', '))}>
                  {data.name}
                  <span className="compendium-drawer__source">{data.type}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
        {itemQuery.trim() && (
          <button type="button" onClick={() => addItem(itemQuery.trim(), '')}>
            Add "{itemQuery.trim()}" as custom item
          </button>
        )}
      </div>
      <button type="button" onClick={handlePlaceChest} disabled={!name.trim()}>
        Place chest
      </button>
    </div>
  )
}
