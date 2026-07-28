import { useState } from 'react'
import { useSession } from '../session/useSession'
import { getOrCreatePlayerId } from '../session/lastSession'
import { useCharacters } from '../character/useCharacters'
import { usePartyLoot } from '../loot/usePartyLoot'
import type { Currency } from '../loot/types'

const DENOMINATIONS: (keyof Currency)[] = ['pp', 'gp', 'ep', 'sp', 'cp']
const DENOMINATION_LABELS: Record<keyof Currency, string> = { pp: 'PP', gp: 'GP', ep: 'EP', sp: 'SP', cp: 'CP' }

/** Shared treasure pool — unclaimed loot items anyone can add or claim, plus
 * a pooled coin purse the DM can adjust and split evenly among the party.
 * Visible to the DM and every player, same party-wide-transparency
 * reasoning as the inventory history log. */
export function PartyLootPanel() {
  const { session } = useSession()
  const doc = session?.doc ?? null
  const isDm = session?.role === 'dm'
  const myPlayerId = getOrCreatePlayerId()
  const { characters, myCharacter } = useCharacters(doc)
  const { items, currency, addItem, removeItem, claimItem, adjustCurrency, splitCurrency } = usePartyLoot(doc)

  const [name, setName] = useState('')
  const [quantity, setQuantity] = useState(1)
  const [notes, setNotes] = useState('')
  const [claimTargets, setClaimTargets] = useState<Record<string, string>>({})

  if (!doc) return null

  const myCharacterRecord = myCharacter(myPlayerId)

  const handleAdd = () => {
    if (!name.trim()) return
    addItem(name.trim(), quantity, notes.trim())
    setName('')
    setQuantity(1)
    setNotes('')
  }

  return (
    <section className="scene-toolbar__section">
      <h3 className="scene-toolbar__heading">Party loot</h3>

      <h4>Unclaimed items</h4>
      {items.length > 0 ? (
        <ul className="character-sheet__row-list">
          {items.map((item) => {
            const targetId = claimTargets[item.id] ?? myCharacterRecord?.id ?? ''
            return (
              <li key={item.id} className="character-sheet__row">
                <span>
                  <strong>{item.name}</strong> ×{item.quantity}
                  {item.notes ? ` — ${item.notes}` : ''}
                </span>
                {isDm ? (
                  <select value={targetId} onChange={(e) => setClaimTargets((prev) => ({ ...prev, [item.id]: e.target.value }))}>
                    <option value="">Assign to…</option>
                    {characters.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                ) : null}
                <button
                  type="button"
                  disabled={!targetId}
                  onClick={() => targetId && claimItem(item.id, targetId)}
                >
                  {isDm ? 'Assign' : 'Claim for me'}
                </button>
                {isDm && (
                  <button type="button" onClick={() => removeItem(item.id)}>
                    Remove
                  </button>
                )}
              </li>
            )
          })}
        </ul>
      ) : (
        <p className="character-sheet__hint">No unclaimed loot right now.</p>
      )}

      <div className="character-sheet__row">
        <input placeholder="Item name" value={name} onChange={(e) => setName(e.target.value)} />
        <input type="number" min={1} value={quantity} onChange={(e) => setQuantity(Math.max(1, Number(e.target.value)))} />
        <input placeholder="Notes" value={notes} onChange={(e) => setNotes(e.target.value)} />
        <button type="button" onClick={handleAdd} disabled={!name.trim()}>
          Add to pool
        </button>
      </div>

      <h4>Coin purse</h4>
      <div className="party-loot__currency">
        {DENOMINATIONS.map((denom) => (
          <span key={denom} className="party-loot__denomination">
            <strong>{currency[denom]}</strong> {DENOMINATION_LABELS[denom]}
            {isDm && (
              <span className="character-sheet__slot-used">
                <button type="button" onClick={() => adjustCurrency({ [denom]: -1 })} disabled={currency[denom] <= 0}>
                  −
                </button>
                <button type="button" onClick={() => adjustCurrency({ [denom]: 1 })}>
                  +
                </button>
              </span>
            )}
          </span>
        ))}
      </div>
      {isDm && (
        <button
          type="button"
          onClick={() => splitCurrency(characters.filter((c) => c.ownerId !== 'npc').map((c) => c.id))}
          disabled={characters.length === 0 || DENOMINATIONS.every((d) => currency[d] === 0)}
        >
          Split evenly among party
        </button>
      )}
    </section>
  )
}
