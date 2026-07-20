import { useCallback, useEffect, useState } from 'react'
import * as Y from 'yjs'
import type { MovementProposalRecord } from './movementProposalTypes'

function proposalsMap(doc: Y.Doc) {
  return doc.getMap<MovementProposalRecord>('movementProposals')
}

export interface UseMovementProposalResult {
  proposal: MovementProposalRecord | null
  propose: (playerId: string, targetPoiId: string) => void
  vote: (playerId: string, yes: boolean) => void
  cancel: () => void
}

/** Landscape scenes' "Democratic Voting" consensus mode — see
 * map/useSceneNavigation.ts for where a proposal actually gets executed
 * once enough votes are in (or immediately, in 'leader' mode, which never
 * creates a lingering proposal at all). */
export function useMovementProposal(doc: Y.Doc | null, sceneId: string | null): UseMovementProposalResult {
  const [proposal, setProposal] = useState<MovementProposalRecord | null>(null)

  useEffect(() => {
    if (!doc || !sceneId) {
      setProposal(null)
      return
    }
    const m = proposalsMap(doc)
    const sync = () => setProposal(m.get(sceneId) ?? null)
    sync()
    m.observe(sync)
    return () => m.unobserve(sync)
  }, [doc, sceneId])

  const propose = useCallback(
    (playerId: string, targetPoiId: string) => {
      if (!doc || !sceneId) return
      proposalsMap(doc).set(sceneId, { sceneId, targetPoiId, proposedBy: playerId, votes: { [playerId]: true }, createdAt: Date.now() })
    },
    [doc, sceneId],
  )

  const vote = useCallback(
    (playerId: string, yes: boolean) => {
      if (!doc || !sceneId) return
      const m = proposalsMap(doc)
      const current = m.get(sceneId)
      if (!current) return
      m.set(sceneId, { ...current, votes: { ...current.votes, [playerId]: yes } })
    },
    [doc, sceneId],
  )

  const cancel = useCallback(() => {
    if (!doc || !sceneId) return
    proposalsMap(doc).delete(sceneId)
  }, [doc, sceneId])

  return { proposal, propose, vote, cancel }
}
