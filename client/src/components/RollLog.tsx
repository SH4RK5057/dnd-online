import { useState } from 'react'
import { useSession } from '../session/useSession'
import { getOrCreatePlayerId } from '../session/lastSession'
import { useRollLog } from '../dice/useRollLog'
import type { RollRecord, RollTerm } from '../dice/types'
import { useTokens, useAllTokens } from '../map/useTokens'
import { useCharacters } from '../character/useCharacters'
import { applyDamage, computeDamagePatch } from '../character/rules'
import { parseNotation, rollNotation } from '../dice/notation'

function fmtSigned(n: number): string {
  return n >= 0 ? `+${n}` : `${n}`
}

function termSummary(term: RollTerm): string {
  const sign = term.sign === -1 ? '-' : ''
  return `${sign}${term.count}d${term.sides}`
}

/** One roll's expandable math breakdown — natural die results (with which
 * ones were dropped under advantage/disadvantage) vs. the flat modifier. */
function RollBreakdown({ roll }: { roll: RollRecord }) {
  return (
    <div className="roll-log__breakdown">
      {roll.terms.map((term, i) => (
        <div key={i} className="roll-log__breakdown-term">
          <span>{termSummary(term)}:</span>
          {term.results.map((r, ri) => (
            <span key={ri} className={term.kept.includes(r) && term.results.indexOf(r) === ri ? '' : 'roll-log__die--dropped'}>
              {r}
            </span>
          ))}
        </div>
      ))}
      {roll.modifier !== 0 && (
        <div className="roll-log__breakdown-term">
          <span>Modifier: {fmtSigned(roll.modifier)}</span>
        </div>
      )}
      {roll.mode !== 'normal' && <div className="roll-log__breakdown-term">Mode: {roll.mode}</div>}
    </div>
  )
}

export function RollLog() {
  const { session } = useSession()
  const doc = session?.doc ?? null
  const isDm = session?.role === 'dm'
  const myPlayerId = getOrCreatePlayerId()
  const { rolls, pushRoll, updateRoll } = useRollLog(doc, isDm)
  const { setTokenHp } = useTokens(doc, null)
  const allTokens = useAllTokens(doc)
  const { characters, updateCharacter } = useCharacters(doc)
  const [expanded, setExpanded] = useState<Set<string>>(new Set())

  // Private rolls are still written to the same shared doc.getMap('rolls')
  // (this app has no server to filter writes at the source — see
  // dice/types.ts's RollRecord.private doc comment) — visibility is
  // enforced here instead: only the roller and the DM ever render the
  // entry, everyone else's client just skips it.
  const visibleRolls = rolls.filter((roll) => !roll.private || isDm || roll.playerId === myPlayerId)

  const toggle = (id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const charactersById = new Map(characters.map((c) => [c.id, c]))

  const handleMarkOutcome = (roll: RollRecord, outcome: 'hit' | 'miss') => {
    if (!roll.attackContext) return
    updateRoll(roll.id, { attackContext: { ...roll.attackContext, outcome } })
  }

  /** Rolls the attack's weapon damage (snapshotted onto attackContext at
   * attack-roll time, so this doesn't need to re-look-up the attacker's
   * character), logs it, and applies it to the target through the same
   * character/token HP split every other HP write in this app uses. */
  const handleRollDamage = (roll: RollRecord) => {
    const ctx = roll.attackContext
    if (!ctx) return
    const notation = `${ctx.damageDice}${ctx.damageBonus !== 0 ? (ctx.damageBonus >= 0 ? '+' : '') + ctx.damageBonus : ''}`
    let result
    try {
      result = rollNotation(parseNotation(notation), 'normal')
    } catch {
      return
    }
    pushRoll({
      playerId: roll.playerId,
      playerName: roll.playerName,
      label: `${ctx.weaponName} damage`,
      notation,
      mode: 'normal',
      terms: result.terms,
      modifier: result.modifier,
      total: result.total,
      requestedBy: null,
      private: false,
    })
    const targetToken = allTokens.find((t) => t.id === ctx.targetTokenId)
    if (targetToken) {
      if (targetToken.characterId) {
        const targetCharacter = charactersById.get(targetToken.characterId)
        if (targetCharacter) updateCharacter(targetCharacter.id, computeDamagePatch(targetCharacter, result.total))
      } else if (targetToken.hp) {
        setTokenHp(targetToken.id, applyDamage(targetToken.hp, result.total))
      }
    }
    updateRoll(roll.id, { attackContext: { ...ctx, damageApplied: true } })
  }

  if (!doc) return null

  const newestFirst = [...visibleRolls].reverse()

  return (
    <div className="roll-log">
      <h2>Roll log</h2>
      <ul className="roll-log__list">
        {newestFirst.map((roll) => (
          <li key={roll.id} className="roll-log__item">
            <button type="button" className="roll-log__summary" onClick={() => toggle(roll.id)}>
              <strong>{roll.playerName}</strong>
              {roll.label ? ` — ${roll.label}` : ''}: <strong>{roll.total}</strong>
              <span className="roll-log__notation">
                ({roll.notation}
                {roll.mode !== 'normal' ? `, ${roll.mode}` : ''})
              </span>
              {roll.private && <span className="roll-log__private">private</span>}
            </button>
            {roll.attackContext && (
              <div className="roll-log__attack">
                <span>
                  vs {roll.attackContext.targetName} (AC {roll.attackContext.targetAc ?? '?'})
                </span>
                <span className={`roll-log__outcome roll-log__outcome--${roll.attackContext.outcome}`}>
                  {roll.attackContext.outcome === 'pending' ? 'Pending' : roll.attackContext.outcome === 'hit' ? 'Hit' : 'Miss'}
                </span>
                {isDm && roll.attackContext.outcome === 'pending' && (
                  <>
                    <button type="button" onClick={() => handleMarkOutcome(roll, 'hit')}>
                      Mark Hit
                    </button>
                    <button type="button" onClick={() => handleMarkOutcome(roll, 'miss')}>
                      Mark Miss
                    </button>
                  </>
                )}
                {roll.attackContext.outcome === 'hit' &&
                  !roll.attackContext.damageApplied &&
                  (isDm || roll.playerId === myPlayerId) && (
                    <button type="button" onClick={() => handleRollDamage(roll)}>
                      Roll Damage
                    </button>
                  )}
                {roll.attackContext.damageApplied && <span>Damage applied</span>}
              </div>
            )}
            {expanded.has(roll.id) && <RollBreakdown roll={roll} />}
          </li>
        ))}
        {newestFirst.length === 0 && <li className="character-sheet__hint">No rolls yet.</li>}
      </ul>
    </div>
  )
}
