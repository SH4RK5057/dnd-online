import { useSession } from '../session/useSession'
import { useScenes } from '../map/useScenes'
import { useTokens } from '../map/useTokens'
import { useCharacters } from '../character/useCharacters'
import { useCombat } from '../combat/useCombat'
import { computeInitiativeOrder } from '../combat/rules'
import { computeInitiativeBonus } from '../character/rules'
import type { MonsterInitiativeMode } from '../combat/types'

/** Initiative order + round/turn state are visible to everyone (players
 * want to see the queue and whose turn it is); starting/ending combat,
 * choosing Individual vs. Group Monster Initiative, and advancing the turn
 * are DM-only, same tier as scene/wall/light editing already is. */
export function InitiativeTracker() {
  const { session } = useSession()
  const doc = session?.doc ?? null
  const isDm = session?.role === 'dm'
  const { activeSceneId } = useScenes(doc)
  const { tokens, setTokenInitiative } = useTokens(doc, activeSceneId)
  const { characters } = useCharacters(doc)
  const { combat, startCombat, endCombat, advanceTurn, setMonsterInitiativeMode } = useCombat(doc, activeSceneId)

  if (!doc || !activeSceneId) return null

  const charactersById = new Map(characters.map((c) => [c.id, c]))
  const rollBonusForToken = (token: (typeof tokens)[number]) => {
    const character = token.characterId ? charactersById.get(token.characterId) : null
    return character ? computeInitiativeBonus(character) : 0
  }

  const order = computeInitiativeOrder(tokens)

  const handleModeChange = (mode: MonsterInitiativeMode) => setMonsterInitiativeMode(mode)
  const handleStart = () => startCombat(tokens, rollBonusForToken, setTokenInitiative)
  const handleEnd = () => endCombat(tokens, setTokenInitiative)
  const handleAdvance = () => advanceTurn(tokens)

  return (
    <div className="initiative-tracker">
      <h2>Initiative</h2>

      {isDm && (
        <div className="initiative-tracker__controls">
          <label>
            Monster initiative
            <select value={combat.monsterInitiativeMode} onChange={(e) => handleModeChange(e.target.value as MonsterInitiativeMode)}>
              <option value="group">Group (by enemy type)</option>
              <option value="individual">Individual</option>
            </select>
          </label>
          {combat.active ? (
            <>
              <button type="button" onClick={handleAdvance}>
                Next turn
              </button>
              <button type="button" onClick={handleEnd}>
                End combat
              </button>
            </>
          ) : (
            <button type="button" onClick={handleStart} disabled={tokens.length === 0}>
              Start combat
            </button>
          )}
        </div>
      )}

      {combat.active && <p className="character-sheet__hint">Round {combat.round}</p>}

      <ol className="initiative-tracker__order">
        {order.map((token) => (
          <li key={token.id} className={token.id === combat.currentTokenId ? 'initiative-tracker__current' : ''}>
            {token.name} — {token.initiative}
            {token.id === combat.currentTokenId && ' (current turn)'}
          </li>
        ))}
        {order.length === 0 && <li className="character-sheet__hint">No initiative rolled yet.</li>}
      </ol>
    </div>
  )
}
