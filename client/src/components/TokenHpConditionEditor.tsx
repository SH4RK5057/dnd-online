import { useSession } from '../session/useSession'
import { getOrCreatePlayerId } from '../session/lastSession'
import { useTokens } from '../map/useTokens'
import { useCharacters } from '../character/useCharacters'
import { resolveTokenHp } from '../character/rules'
import { KNOWN_CONDITIONS } from '../dice/conditions'

/** Inline panel shown when a token is selected on the map — HP, conditions,
 * and initiative, gated to `isDm || isOwner` per the app's DM-authoritative
 * convention. HP edits go to the linked character's record when the token
 * has one (see character/rules.ts resolveTokenHp for why), or the token
 * itself otherwise. */
export function TokenHpConditionEditor({
  sceneId,
  selectedTokenId,
  onClose,
}: {
  sceneId: string
  selectedTokenId: string | null
  onClose: () => void
}) {
  const { session } = useSession()
  const doc = session?.doc ?? null
  const isDm = session?.role === 'dm'
  const myPlayerId = getOrCreatePlayerId()

  const { tokens, setTokenHp, setTokenConditions, setTokenInitiative, linkCharacter, setTokenHidden, setTokenZ } =
    useTokens(doc, sceneId)
  const { characters, updateCharacter, createNpcCharacter } = useCharacters(doc)

  const token = tokens.find((t) => t.id === selectedTokenId)
  if (!doc || !token) return null

  const canEdit = isDm || token.ownerId === myPlayerId
  if (!canEdit) return null

  const charactersById = new Map(characters.map((c) => [c.id, c]))
  const resolvedHp = resolveTokenHp(token, charactersById)
  const linkedCharacter = token.characterId ? charactersById.get(token.characterId) : null

  const setHpField = (field: 'current' | 'max' | 'temp', value: number) => {
    if (linkedCharacter) {
      updateCharacter(linkedCharacter.id, { hp: { ...linkedCharacter.hp, [field]: value } })
    } else {
      const current = token.hp ?? { current: 0, max: 0, temp: 0 }
      setTokenHp(token.id, { ...current, [field]: value })
    }
  }

  const toggleCondition = (condition: string, active: boolean) => {
    const next = active ? [...token.conditions, condition] : token.conditions.filter((c) => c !== condition)
    setTokenConditions(token.id, next)
  }

  return (
    <div className="token-hp-condition-editor">
      <div className="token-hp-condition-editor__header">
        <h2>{token.name}</h2>
        <button type="button" onClick={onClose}>
          Close
        </button>
      </div>

      {isDm && (
        <label className="token-hp-condition-editor__link">
          Linked character
          <select value={token.characterId ?? ''} onChange={(e) => linkCharacter(token.id, e.target.value || null)}>
            <option value="">None (track HP on token)</option>
            {characters.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
      )}

      {isDm && !token.characterId && session && (
        <button
          type="button"
          onClick={() => {
            const id = createNpcCharacter(token.name, session.roomName)
            linkCharacter(token.id, id)
          }}
        >
          + Create NPC character sheet
        </button>
      )}

      {isDm && (
        <div className="token-hp-condition-editor__advanced">
          <label>
            <input type="checkbox" checked={token.hidden} onChange={(e) => setTokenHidden(token.id, e.target.checked)} />
            Hidden from players (independent of fog)
          </label>
          <label>
            Altitude (cells)
            <input type="number" value={token.z} onChange={(e) => setTokenZ(token.id, Number(e.target.value))} />
          </label>
        </div>
      )}

      <h3>Hit points</h3>
      {resolvedHp ? (
        <div className="character-sheet__hp">
          <label>
            Current
            <input type="number" value={resolvedHp.current} onChange={(e) => setHpField('current', Number(e.target.value))} />
          </label>
          <label>
            Max
            <input type="number" value={resolvedHp.max} onChange={(e) => setHpField('max', Number(e.target.value))} />
          </label>
          <label>
            Temp
            <input type="number" value={resolvedHp.temp} onChange={(e) => setHpField('temp', Number(e.target.value))} />
          </label>
        </div>
      ) : (
        <button type="button" onClick={() => setTokenHp(token.id, { current: 10, max: 10, temp: 0 })}>
          Start tracking HP for this token
        </button>
      )}

      <h3>Conditions</h3>
      <div className="token-hp-condition-editor__conditions">
        {KNOWN_CONDITIONS.map((condition) => (
          <label key={condition}>
            <input
              type="checkbox"
              checked={token.conditions.includes(condition)}
              onChange={(e) => toggleCondition(condition, e.target.checked)}
            />
            {condition}
          </label>
        ))}
      </div>

      <h3>Initiative</h3>
      <input
        type="number"
        value={token.initiative ?? ''}
        placeholder="Not rolled"
        onChange={(e) => setTokenInitiative(token.id, e.target.value === '' ? null : Number(e.target.value))}
      />
    </div>
  )
}
