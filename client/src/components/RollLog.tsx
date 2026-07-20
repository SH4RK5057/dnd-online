import { useState } from 'react'
import { useSession } from '../session/useSession'
import { getOrCreatePlayerId } from '../session/lastSession'
import { useRollLog } from '../dice/useRollLog'
import type { RollRecord, RollTerm } from '../dice/types'

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
  const { rolls } = useRollLog(doc, isDm)
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
            {expanded.has(roll.id) && <RollBreakdown roll={roll} />}
          </li>
        ))}
        {newestFirst.length === 0 && <li className="character-sheet__hint">No rolls yet.</li>}
      </ul>
    </div>
  )
}
