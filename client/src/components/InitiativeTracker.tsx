import { useSession } from '../session/useSession'
import { getOrCreatePlayerId } from '../session/lastSession'
import { useScenes } from '../map/useScenes'
import { useTokens } from '../map/useTokens'
import { useCharacters } from '../character/useCharacters'
import { useCombat } from '../combat/useCombat'
import { computeInitiativeOrder } from '../combat/rules'
import { computeInitiativeBonus } from '../character/rules'
import { useSessionEvents } from '../sessionLog/useSessionEvents'
import { EncounterBuilder } from './EncounterBuilder'
import type { MonsterInitiativeMode } from '../combat/types'
import type { TokenRecord } from '../map/types'

/** Initiative order + round/turn state are visible to everyone (players
 * want to see the queue and whose turn it is); starting/ending combat,
 * choosing Individual vs. Group Monster Initiative, and advancing the turn
 * are DM-only, same tier as scene/wall/light editing already is. */
export function InitiativeTracker() {
  const { session } = useSession()
  const doc = session?.doc ?? null
  const isDm = session?.role === 'dm'
  const myPlayerId = getOrCreatePlayerId()
  const { activeSceneId, activeScene } = useScenes(doc)
  const { tokens, setTokenInitiative, setTokenReactionAvailable } = useTokens(doc, activeSceneId)
  const { characters } = useCharacters(doc)
  const { combat, startCombat, endCombat, advanceTurn, setMonsterInitiativeMode } = useCombat(doc, activeSceneId)
  const { logEvent } = useSessionEvents(doc, isDm)

  if (!doc || !activeSceneId) return null

  const charactersById = new Map(characters.map((c) => [c.id, c]))
  const rollBonusForToken = (token: (typeof tokens)[number]) => {
    const character = token.characterId ? charactersById.get(token.characterId) : null
    return character ? computeInitiativeBonus(character) : 0
  }

  const order = computeInitiativeOrder(tokens)

  const handleModeChange = (mode: MonsterInitiativeMode) => setMonsterInitiativeMode(mode)
  const handleStart = (selectedTokens: TokenRecord[]) => {
    startCombat(selectedTokens, rollBonusForToken, setTokenInitiative, setTokenReactionAvailable)
    logEvent(`Combat started in ${activeScene?.name ?? 'a scene'}`)
  }
  const handleEnd = () => {
    endCombat(tokens, setTokenInitiative)
    logEvent(`Combat ended in ${activeScene?.name ?? 'a scene'}`)
  }
  const handleAdvance = () => advanceTurn(tokens, setTokenReactionAvailable)

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
          {combat.active && (
            <>
              <button type="button" onClick={handleAdvance}>
                Next turn
              </button>
              <button type="button" onClick={handleEnd}>
                End combat
              </button>
            </>
          )}
        </div>
      )}

      {isDm && !combat.active && <EncounterBuilder tokens={tokens} onStart={handleStart} />}

      {combat.active && <p className="character-sheet__hint">Round {combat.round}</p>}

      <ol className="initiative-tracker__order">
        {order.map((token) => {
          const canManage = isDm || token.ownerId === myPlayerId
          return (
            <li key={token.id} className={token.id === combat.currentTokenId ? 'initiative-tracker__current' : ''}>
              {token.name} — {token.initiative}
              {token.id === combat.currentTokenId && ' (current turn)'}
              {combat.active && (
                <span className={`initiative-tracker__reaction${token.reactionAvailable ? '' : ' initiative-tracker__reaction--used'}`}>
                  {token.reactionAvailable ? '⚡ Reaction available' : 'Reaction used'}
                </span>
              )}
              {combat.active && canManage && token.reactionAvailable && (
                <button
                  type="button"
                  title="Mark this reaction used for a non-attack reaction (a readied spell, Shield, etc.) — an opportunity attack rolled from the character sheet consumes it automatically."
                  onClick={() => setTokenReactionAvailable(token.id, false)}
                >
                  Use reaction
                </button>
              )}
            </li>
          )
        })}
        {order.length === 0 && <li className="character-sheet__hint">No initiative rolled yet.</li>}
      </ol>
    </div>
  )
}
