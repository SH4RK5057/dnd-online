import type * as Y from 'yjs'
import { useCharacters } from '../character/useCharacters'

/** DM-only banner surfacing every campaign-bound character with at least
 * one 'pending' CharacterOverrideRecord — this is how "the DM is asked to
 * approve" a player's custom override, whether it was proposed before
 * joining (travels in via bindCharacter cloning the standalone record) or
 * added later during play. Persistent rather than a one-shot toast: it
 * just reflects current doc state, so it naturally disappears once every
 * pending override has been resolved, with no separate
 * "already notified" tracking needed. */
export function PendingOverridesBanner({ doc }: { doc: Y.Doc | null }) {
  const { characters, updateCharacter } = useCharacters(doc)
  const pending = characters.flatMap((c) => c.overrides.filter((o) => o.status === 'pending').map((o) => ({ character: c, override: o })))

  if (pending.length === 0) return null

  const setStatus = (characterId: string, overrideId: string, status: 'approved' | 'rejected') => {
    const character = characters.find((c) => c.id === characterId)
    if (!character) return
    updateCharacter(characterId, {
      overrides: character.overrides.map((o) => (o.id === overrideId ? { ...o, status } : o)),
    })
  }

  return (
    <div className="pending-overrides-banner">
      <strong>Custom overrides awaiting your approval:</strong>
      <ul>
        {pending.map(({ character, override }) => (
          <li key={override.id}>
            <span>
              <strong>{character.name}</strong>: {override.label} = {override.value}
            </span>
            <button type="button" onClick={() => setStatus(character.id, override.id, 'approved')}>
              Approve
            </button>
            <button type="button" onClick={() => setStatus(character.id, override.id, 'rejected')}>
              Reject
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
}
