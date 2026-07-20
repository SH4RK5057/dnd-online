import type { TokenRecord } from '../map/types'

/** Turn order, computed fresh every time from live token data — never
 * persisted as an array (see CombatStateRecord's doc comment for why).
 * Descending by initiative; ties broken by token id for a stable order. */
export function computeInitiativeOrder(tokens: TokenRecord[]): TokenRecord[] {
  return tokens
    .filter((t): t is TokenRecord & { initiative: number } => t.initiative !== null)
    .sort((a, b) => b.initiative - a.initiative || a.id.localeCompare(b.id))
}

export interface NextTurnResult {
  nextTokenId: string | null
  roundIncremented: boolean
}

/** Finds whoever goes after `currentTokenId` in the live order. If the
 * current token is gone (removed/left the scene mid-combat), resumes at the
 * top of the remaining order without incrementing the round — a defensive
 * fallback, not the normal path. */
export function nextTurn(tokens: TokenRecord[], currentTokenId: string | null): NextTurnResult {
  const order = computeInitiativeOrder(tokens)
  if (order.length === 0) return { nextTokenId: null, roundIncremented: false }

  const currentIndex = order.findIndex((t) => t.id === currentTokenId)
  if (currentIndex === -1) return { nextTokenId: order[0].id, roundIncremented: false }

  const nextIndex = (currentIndex + 1) % order.length
  return { nextTokenId: order[nextIndex].id, roundIncremented: nextIndex === 0 }
}

/** Groups monster (unowned) tokens by name for Group Monster Initiative —
 * every token sharing a name rolls once, together. Player-owned tokens are
 * always excluded here; they always roll individually (see useCombat). */
export function groupMonsterTokensByName(tokens: TokenRecord[]): Map<string, TokenRecord[]> {
  const groups = new Map<string, TokenRecord[]>()
  for (const token of tokens) {
    if (token.ownerId !== null) continue
    const group = groups.get(token.name)
    if (group) group.push(token)
    else groups.set(token.name, [token])
  }
  return groups
}
