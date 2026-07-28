import { useCallback, useEffect, useState } from 'react'
import * as Y from 'yjs'
import type { RollRecord } from './types'
import { triggerDiceAnimation } from './diceAnimationBus'

const MAX_ROLL_LOG_ENTRIES = 200

function rollsMap(doc: Y.Doc) {
  return doc.getMap<RollRecord>('rolls')
}

export interface UseRollLogResult {
  /** Chronological, oldest first — same client-side createdAt-sort
   * convention as scenes/other lists in this app, not a Y.Array. */
  rolls: RollRecord[]
  pushRoll: (roll: Omit<RollRecord, 'id' | 'createdAt'>) => void
  /** Patches an existing roll — used for attack-resolution follow-ups (DM
   * marking hit/miss, flagging damage applied) rather than creating a new
   * roll each time. */
  updateRoll: (id: string, patch: Partial<Omit<RollRecord, 'id'>>) => void
}

/**
 * `isDm` gates trimming, not adding — everyone can push a roll (rolling
 * isn't a privileged action), but only the DM's own client ever deletes old
 * entries once the log exceeds MAX_ROLL_LOG_ENTRIES. If every peer trimmed
 * independently, two clients racing to delete the same aging entries at
 * once is harmless under Yjs's CRDT semantics (deleting an already-deleted
 * key is a no-op) but is still unnecessary duplicate work across every
 * connected player; keeping it DM-only avoids that entirely.
 */
export function useRollLog(doc: Y.Doc | null, isDm: boolean): UseRollLogResult {
  const [rolls, setRolls] = useState<RollRecord[]>([])

  useEffect(() => {
    if (!doc) {
      setRolls([])
      return
    }
    const rollsM = rollsMap(doc)
    const sync = () => setRolls(Array.from(rollsM.values()).sort((a, b) => a.createdAt - b.createdAt))
    sync()
    rollsM.observe(sync)
    return () => rollsM.unobserve(sync)
  }, [doc])

  useEffect(() => {
    if (!doc || !isDm) return
    const excess = rolls.length - MAX_ROLL_LOG_ENTRIES
    if (excess <= 0) return
    const rollsM = rollsMap(doc)
    const oldestFirst = [...rolls].sort((a, b) => a.createdAt - b.createdAt)
    doc.transact(() => {
      for (let i = 0; i < excess; i++) rollsM.delete(oldestFirst[i].id)
    })
  }, [doc, isDm, rolls])

  const pushRoll = useCallback(
    (roll: Omit<RollRecord, 'id' | 'createdAt'>) => {
      if (!doc) return
      const id = crypto.randomUUID()
      rollsMap(doc).set(id, { ...roll, id, createdAt: Date.now() })
      // Every roll funnels through here regardless of caller (freeform,
      // quick-roll, attack, spell, rest healing, etc.) — a single choke
      // point to trigger the dice animation from, rather than wiring it
      // into every call site individually. Uses the first die term (the
      // d20 for most checks/attacks/saves) and its real kept value.
      const firstTerm = roll.terms[0]
      if (firstTerm) {
        triggerDiceAnimation({ sides: firstTerm.sides, value: firstTerm.kept.reduce((a, b) => a + b, 0) })
      }
    },
    [doc],
  )

  const updateRoll = useCallback(
    (id: string, patch: Partial<Omit<RollRecord, 'id'>>) => {
      if (!doc) return
      const rollsM = rollsMap(doc)
      const roll = rollsM.get(id)
      if (!roll) return
      rollsM.set(id, { ...roll, ...patch })
    },
    [doc],
  )

  return { rolls, pushRoll, updateRoll }
}
