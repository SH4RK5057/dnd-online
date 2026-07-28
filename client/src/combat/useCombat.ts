import { useCallback, useEffect, useState } from 'react'
import * as Y from 'yjs'
import type { CombatStateRecord, MonsterInitiativeMode } from './types'
import { computeInitiativeOrder, groupMonsterTokensByName, nextTurn } from './rules'
import type { TokenRecord } from '../map/types'

function combatMap(doc: Y.Doc) {
  return doc.getMap<CombatStateRecord>('combat')
}

function defaultCombat(sceneId: string): CombatStateRecord {
  return { sceneId, active: false, round: 0, currentTokenId: null, monsterInitiativeMode: 'group', startedAt: null }
}

export interface UseCombatResult {
  combat: CombatStateRecord
  /** Rolls initiative for every token on the scene (players always
   * individually; monsters per `combat.monsterInitiativeMode`) and starts
   * combat at round 1. `rollBonusForToken` supplies the +modifier for a
   * given token (Dex mod + initiative bonus for a character-linked token,
   * 0 for a bare monster token) — kept as a caller-supplied function so this
   * hook doesn't need to know about characters at all. */
  startCombat: (
    tokens: TokenRecord[],
    rollBonusForToken: (token: TokenRecord) => number,
    setTokenInitiative: (tokenId: string, value: number | null) => void,
    setTokenReactionAvailable: (tokenId: string, available: boolean) => void,
    randomSource?: () => number,
  ) => void
  endCombat: (tokens: TokenRecord[], setTokenInitiative: (tokenId: string, value: number | null) => void) => void
  /** `setTokenReactionAvailable` is optional so existing callers that don't
   * care about reactions (tests, anywhere reactions aren't surfaced) don't
   * need to thread it through — the new turn's token just keeps whatever
   * reaction state it already had if omitted. */
  advanceTurn: (tokens: TokenRecord[], setTokenReactionAvailable?: (tokenId: string, available: boolean) => void) => void
  setMonsterInitiativeMode: (mode: MonsterInitiativeMode) => void
}

export function useCombat(doc: Y.Doc | null, sceneId: string | null): UseCombatResult {
  const [combatBySceneId, setCombatBySceneId] = useState<Map<string, CombatStateRecord>>(new Map())

  useEffect(() => {
    if (!doc) {
      setCombatBySceneId(new Map())
      return
    }
    const combatM = combatMap(doc)
    const sync = () => setCombatBySceneId(new Map(combatM.entries()))
    sync()
    combatM.observe(sync)
    return () => combatM.unobserve(sync)
  }, [doc])

  const combat = (sceneId ? combatBySceneId.get(sceneId) : undefined) ?? defaultCombat(sceneId ?? '')

  const patchCombat = useCallback(
    (patch: Partial<CombatStateRecord>) => {
      if (!doc || !sceneId) return
      const combatM = combatMap(doc)
      const current = combatM.get(sceneId) ?? defaultCombat(sceneId)
      combatM.set(sceneId, { ...current, ...patch })
    },
    [doc, sceneId],
  )

  const startCombat = useCallback(
    (
      tokens: TokenRecord[],
      rollBonusForToken: (token: TokenRecord) => number,
      setTokenInitiative: (tokenId: string, value: number | null) => void,
      setTokenReactionAvailable: (tokenId: string, available: boolean) => void,
      randomSource: () => number = Math.random,
    ) => {
      if (!sceneId) return
      // Everyone starts a fresh encounter with their reaction available,
      // regardless of what a previous fight left it at.
      for (const token of tokens) setTokenReactionAvailable(token.id, true)
      const rollD20 = () => Math.floor(randomSource() * 20) + 1
      const assigned = new Map<string, number>()
      const assign = (token: TokenRecord, value: number) => {
        assigned.set(token.id, value)
        setTokenInitiative(token.id, value)
      }

      // Player-owned tokens always roll individually.
      for (const token of tokens.filter((t) => t.ownerId !== null)) {
        assign(token, rollD20() + rollBonusForToken(token))
      }

      const monsterTokens = tokens.filter((t) => t.ownerId === null)
      if (combat.monsterInitiativeMode === 'individual') {
        for (const token of monsterTokens) assign(token, rollD20() + rollBonusForToken(token))
      } else {
        for (const group of groupMonsterTokensByName(monsterTokens).values()) {
          const value = rollD20() + rollBonusForToken(group[0])
          for (const token of group) assign(token, value)
        }
      }

      // The `tokens` passed in don't reflect the writes above yet (those go
      // through the caller's own token hook, async relative to this
      // function) — patch a local copy so the very first turn is computed
      // from the initiative values just rolled, not stale ones.
      const patchedTokens = tokens.map((t) => (assigned.has(t.id) ? { ...t, initiative: assigned.get(t.id)! } : t))
      const order = computeInitiativeOrder(patchedTokens)
      patchCombat({ active: true, round: 1, currentTokenId: order[0]?.id ?? null, startedAt: Date.now() })
    },
    [sceneId, combat.monsterInitiativeMode, patchCombat],
  )

  const endCombat = useCallback(
    (tokens: TokenRecord[], setTokenInitiative: (tokenId: string, value: number | null) => void) => {
      for (const token of tokens) {
        if (token.initiative !== null) setTokenInitiative(token.id, null)
      }
      patchCombat({ active: false, round: 0, currentTokenId: null })
    },
    [patchCombat],
  )

  const advanceTurn = useCallback(
    (tokens: TokenRecord[], setTokenReactionAvailable?: (tokenId: string, available: boolean) => void) => {
      const { nextTokenId, roundIncremented } = nextTurn(tokens, combat.currentTokenId)
      if (nextTokenId) setTokenReactionAvailable?.(nextTokenId, true)
      patchCombat({ currentTokenId: nextTokenId, round: roundIncremented ? combat.round + 1 : combat.round })
    },
    [combat.currentTokenId, combat.round, patchCombat],
  )

  const setMonsterInitiativeMode = useCallback(
    (mode: MonsterInitiativeMode) => patchCombat({ monsterInitiativeMode: mode }),
    [patchCombat],
  )

  return { combat, startCombat, endCombat, advanceTurn, setMonsterInitiativeMode }
}
