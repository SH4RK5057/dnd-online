import { useEffect, useRef, useState } from 'react'
import type { TokenRecord } from '../map/types'

/** DM-only pre-combat setup, shown by InitiativeTracker in place of a plain
 * "Start combat" button whenever combat isn't active. Every scene token is
 * selected by default (so starting with everyone is still one click), but
 * unchecking any of them is the whole mechanism for split-party/selective
 * encounters — the DM just leaves whichever players (or monsters) aren't
 * part of this fight unchecked. Spawning new monsters onto the scene first
 * is the compendium drawer's "Add to scene" button (Phase 5) — this panel
 * only handles picking which of the tokens already on the map take part. */
export function EncounterBuilder({
  tokens,
  onStart,
}: {
  tokens: TokenRecord[]
  onStart: (selectedTokens: TokenRecord[]) => void
}) {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set(tokens.map((t) => t.id)))
  // Tracks every token id this panel has ever seen, so a brand-new token
  // (e.g. just dropped in from the compendium) can default to selected
  // without re-selecting one the DM deliberately unchecked earlier — `tokens`
  // gets a new array reference on every unrelated token edit too (HP change,
  // move, etc.), so "not in selectedIds" alone can't tell those apart.
  const seenIdsRef = useRef<Set<string>>(new Set(tokens.map((t) => t.id)))

  useEffect(() => {
    const newIds = tokens.filter((t) => !seenIdsRef.current.has(t.id)).map((t) => t.id)
    for (const token of tokens) seenIdsRef.current.add(token.id)
    if (newIds.length === 0) return
    setSelectedIds((prev) => new Set([...prev, ...newIds]))
  }, [tokens])

  const toggle = (tokenId: string, checked: boolean) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (checked) next.add(tokenId)
      else next.delete(tokenId)
      return next
    })
  }

  const selectedTokens = tokens.filter((t) => selectedIds.has(t.id))

  return (
    <div className="encounter-builder">
      <p className="character-sheet__hint">
        Choose who's in this fight — leave anyone not involved unchecked (split party, bystanders, etc).
      </p>
      <ul className="encounter-builder__list">
        {tokens.map((token) => (
          <li key={token.id}>
            <label>
              <input type="checkbox" checked={selectedIds.has(token.id)} onChange={(e) => toggle(token.id, e.target.checked)} />
              {token.name}
              {token.ownerId && <span className="compendium-drawer__source">player</span>}
            </label>
          </li>
        ))}
        {tokens.length === 0 && <li className="character-sheet__hint">No tokens on this scene yet.</li>}
      </ul>
      <button type="button" onClick={() => onStart(selectedTokens)} disabled={selectedTokens.length === 0}>
        Start encounter{selectedTokens.length > 0 ? ` (${selectedTokens.length})` : ''}
      </button>
    </div>
  )
}
