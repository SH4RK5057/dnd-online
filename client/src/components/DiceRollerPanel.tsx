import { useState } from 'react'
import { useSession } from '../session/useSession'
import { useConnectionStatus } from '../session/useConnectionStatus'
import { getOrCreatePlayerId } from '../session/lastSession'
import { useScenes } from '../map/useScenes'
import { useTokens } from '../map/useTokens'
import { useCharacters } from '../character/useCharacters'
import { useRollLog } from '../dice/useRollLog'
import { useRollRequests } from '../dice/useRollRequests'
import { parseNotation, rollNotation } from '../dice/notation'
import { resolveEffectiveMode } from '../dice/conditions'
import type { RollMode } from '../dice/types'

/** Standalone freeform dice roller, usable by DM and players regardless of
 * character-sheet state — plus the DM's "request a roll" flow: "players
 * communicate intent via chat/voice, and the DM sends an official roll
 * prompt through the app UI" for non-battle checks and similar. */
export function DiceRollerPanel() {
  const { session } = useSession()
  const doc = session?.doc ?? null
  const isDm = session?.role === 'dm'
  const myPlayerId = getOrCreatePlayerId()
  const { peers } = useConnectionStatus(session)
  const { activeSceneId } = useScenes(doc)
  const { tokens } = useTokens(doc, activeSceneId)
  const { characters } = useCharacters(doc)
  const { pushRoll } = useRollLog(doc, isDm)
  const { requests, createRequest, clearRequest } = useRollRequests(doc)

  const [notation, setNotation] = useState('1d20')
  const [label, setLabel] = useState('')
  const [mode, setMode] = useState<RollMode>('normal')
  const [isPrivate, setIsPrivate] = useState(false)

  const [requestTarget, setRequestTarget] = useState('')
  const [requestLabel, setRequestLabel] = useState('')
  const [requestNotation, setRequestNotation] = useState('1d20')

  const players = peers.filter((p) => p.role === 'player')
  const myRequests = requests.filter((r) => r.targetPlayerId === myPlayerId)

  const myConditions = (() => {
    const myCharacter = characters.find((c) => c.ownerId === myPlayerId)
    const myToken = myCharacter ? tokens.find((t) => t.characterId === myCharacter.id) : undefined
    return myToken?.conditions ?? []
  })()

  const doRoll = (
    rollNotationStr: string,
    rollLabel: string,
    rollMode: RollMode,
    requestedBy: string | null,
    requestId?: string,
    rollPrivate = false,
  ) => {
    try {
      const effectiveMode = resolveEffectiveMode(rollMode, myConditions, 'abilityCheck')
      const parsed = parseNotation(rollNotationStr)
      const result = rollNotation(parsed, effectiveMode)
      pushRoll({
        playerId: myPlayerId,
        playerName: session?.displayName ?? 'Player',
        label: rollLabel,
        notation: rollNotationStr,
        mode: effectiveMode,
        terms: result.terms,
        modifier: result.modifier,
        total: result.total,
        requestedBy,
        private: rollPrivate,
      })
      if (requestId) clearRequest(requestId)
    } catch (err) {
      window.alert(err instanceof Error ? err.message : 'Could not parse that notation.')
    }
  }

  const handleFreeformRoll = () => doRoll(notation, label, mode, null, undefined, isPrivate)

  const handleCreateRequest = () => {
    if (!requestTarget) return
    createRequest(requestTarget, myPlayerId, requestLabel || 'Roll requested', requestNotation || null)
    setRequestLabel('')
  }

  if (!doc) return null

  return (
    <div className="dice-roller-panel">
      <h2>Dice roller</h2>

      {myRequests.length > 0 && (
        <ul className="dice-roller-panel__requests">
          {myRequests.map((req) => (
            <li key={req.id} className="dice-roller-panel__request">
              <span>
                DM requests: <strong>{req.label}</strong>
                {req.suggestedNotation ? ` (${req.suggestedNotation})` : ''}
              </span>
              <button
                type="button"
                onClick={() => doRoll(req.suggestedNotation ?? '1d20', req.label, 'normal', req.requestedBy, req.id)}
              >
                Roll
              </button>
              <button type="button" onClick={() => clearRequest(req.id)}>
                Dismiss
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="dice-roller-panel__row">
        <input placeholder="Label (optional)" value={label} onChange={(e) => setLabel(e.target.value)} />
        <input placeholder="Notation, e.g. 2d6+3" value={notation} onChange={(e) => setNotation(e.target.value)} />
        <select value={mode} onChange={(e) => setMode(e.target.value as RollMode)}>
          <option value="normal">Normal</option>
          <option value="advantage">Advantage</option>
          <option value="disadvantage">Disadvantage</option>
        </select>
        <label>
          <input type="checkbox" checked={isPrivate} onChange={(e) => setIsPrivate(e.target.checked)} />
          Private (you + DM only)
        </label>
        <button type="button" onClick={handleFreeformRoll}>
          Roll
        </button>
      </div>

      {isDm && (
        <div className="dice-roller-panel__request-form">
          <h3>Request a roll</h3>
          <div className="dice-roller-panel__row">
            <select value={requestTarget} onChange={(e) => setRequestTarget(e.target.value)}>
              <option value="">Choose a player…</option>
              {players.map((p) => (
                <option key={p.playerId} value={p.playerId}>
                  {p.name}
                </option>
              ))}
            </select>
            <input placeholder="e.g. Perception check" value={requestLabel} onChange={(e) => setRequestLabel(e.target.value)} />
            <input
              placeholder="Suggested notation, e.g. 1d20+3"
              value={requestNotation}
              onChange={(e) => setRequestNotation(e.target.value)}
            />
            <button type="button" onClick={handleCreateRequest} disabled={!requestTarget}>
              Send request
            </button>
          </div>
          {requests.length > 0 && (
            <ul className="dice-roller-panel__requests">
              {requests.map((req) => (
                <li key={req.id} className="dice-roller-panel__request">
                  <span>
                    {players.find((p) => p.playerId === req.targetPlayerId)?.name ?? 'Player'}: {req.label}
                  </span>
                  <button type="button" onClick={() => clearRequest(req.id)}>
                    Cancel
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  )
}
