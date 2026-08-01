import { useState } from 'react'
import { useSession } from '../session/useSession'
import { getOrCreatePlayerId } from '../session/lastSession'
import { useScenes } from '../map/useScenes'
import { useTokens } from '../map/useTokens'
import { useCharacters } from '../character/useCharacters'
import { useCombat } from '../combat/useCombat'
import { computeInitiativeOrder } from '../combat/rules'
import { computeInitiativeBonus } from '../character/rules'
import { useSessionEvents } from '../sessionLog/useSessionEvents'
import { useCompendium, findByKey } from '../content/useCompendium'
import { EncounterBuilder } from './EncounterBuilder'
import { StatBlockCard } from './StatBlockCard'
import type { MonsterInitiativeMode } from '../combat/types'
import type { TokenRecord } from '../map/types'

/** Initiative order + round/turn state are visible to everyone (players
 * want to see the queue and whose turn it is); starting/ending combat,
 * choosing Individual vs. Group Monster Initiative, advancing the turn, and
 * expanding a monster-linked combatant's full stat block (an "Info" toggle,
 * reusing the same StatBlockCard the compendium drawer/token inspector
 * show) are DM-only, same tier as scene/wall/light editing already is —
 * lets the DM check a monster's rules without leaving the initiative list
 * to click its token individually. */
export function InitiativeTracker() {
  const { session } = useSession()
  const doc = session?.doc ?? null
  const isDm = session?.role === 'dm'
  const myPlayerId = getOrCreatePlayerId()
  const { activeSceneId, activeScene } = useScenes(doc)
  const { tokens, setTokenInitiative, setTokenReactionAvailable, setTokenConditions } = useTokens(doc, activeSceneId)
  const { characters } = useCharacters(doc)
  const { combat, startCombat, endCombat, advanceTurn, setMonsterInitiativeMode } = useCombat(doc, activeSceneId)
  const { logEvent } = useSessionEvents(doc, isDm)
  const compendium = useCompendium(doc)
  const [infoOpenTokenId, setInfoOpenTokenId] = useState<string | null>(null)

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
  const handleAdvance = () =>
    advanceTurn(tokens, setTokenReactionAvailable, () => {
      // Once-per-round condition tick-down (see ActiveCondition's doc
      // comment in map/types.ts) — a simplification of 5e's actual
      // per-creature "until the start of your next turn" wording, but close
      // enough for a smoothness feature and much simpler to reason about.
      for (const token of tokens) {
        if (token.conditions.length === 0) continue
        const next = token.conditions
          .map((c) => (c.roundsRemaining !== null ? { ...c, roundsRemaining: c.roundsRemaining - 1 } : c))
          .filter((c) => c.roundsRemaining === null || c.roundsRemaining > 0)
        if (next.length !== token.conditions.length || next.some((c, i) => c.roundsRemaining !== token.conditions[i]?.roundsRemaining)) {
          setTokenConditions(token.id, next)
        }
      }
    })

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
        {order.map((token, i) => {
          const canManage = isDm || token.ownerId === myPlayerId
          const isCurrent = token.id === combat.currentTokenId
          const currentIndex = order.findIndex((t) => t.id === combat.currentTokenId)
          const isOnDeck = combat.active && currentIndex !== -1 && i === (currentIndex + 1) % order.length && order.length > 1
          return (
            <li key={token.id} className={isCurrent ? 'initiative-tracker__current' : ''}>
              {token.name} — {token.initiative}
              {isCurrent && ' (current turn)'}
              {isOnDeck && <span className="initiative-tracker__on-deck"> (on deck)</span>}
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
              {isDm && token.monsterKey && (
                <button type="button" onClick={() => setInfoOpenTokenId((prev) => (prev === token.id ? null : token.id))}>
                  {infoOpenTokenId === token.id ? 'Hide info' : 'Info'}
                </button>
              )}
              {isDm && infoOpenTokenId === token.id && token.monsterKey && (
                <div className="initiative-tracker__info">
                  {(() => {
                    const entry = findByKey(compendium, token.monsterKey)
                    return entry ? <StatBlockCard entry={entry} /> : <p className="character-sheet__hint">Compendium entry not found.</p>
                  })()}
                </div>
              )}
            </li>
          )
        })}
        {order.length === 0 && <li className="character-sheet__hint">No initiative rolled yet.</li>}
      </ol>
    </div>
  )
}
