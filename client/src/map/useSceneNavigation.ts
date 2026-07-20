import { useEffect } from 'react'
import * as Y from 'yjs'
import { usePois } from './usePois'
import { useMovementProposal } from './useMovementProposal'
import type { SceneRecord } from './types'
import type { TokenRecord } from './types'

export interface UseSceneNavigationResult {
  pois: ReturnType<typeof usePois>['pois']
  createPoi: ReturnType<typeof usePois>['createPoi']
  deletePoi: ReturnType<typeof usePois>['deletePoi']
  movePoi: ReturnType<typeof usePois>['movePoi']
  renamePoi: ReturnType<typeof usePois>['renamePoi']
  setLinkedScene: ReturnType<typeof usePois>['setLinkedScene']
  connectPois: ReturnType<typeof usePois>['connectPois']
  disconnectPois: ReturnType<typeof usePois>['disconnectPois']
  proposal: ReturnType<typeof useMovementProposal>['proposal']
  /** Individual-mode town travel: moves just this one player's own
   * token(s), no consensus, no shared currentPoiId change. */
  travelIndividually: (myTokenIds: string[], targetPoiId: string) => void
  /** Group travel — Town/Group executes immediately; Landscape defers to
   * consensusMode (an immediate move for 'leader', a new/updated proposal
   * for 'vote' — see the DM-only auto-execute effect below for how a vote
   * actually resolves). */
  requestGroupTravel: (playerId: string, targetPoiId: string) => void
  voteOnProposal: (playerId: string, yes: boolean) => void
  cancelProposal: () => void
}

/** Orchestrates map/types.ts's SceneScale navigation modes on top of
 * usePois.ts (the location graph) and useMovementProposal.ts (Landscape's
 * vote consensus) — the actual "move the party" mechanics, shared by
 * whichever UI drives them (components/SceneNavigationPanel.tsx). */
export function useSceneNavigation(
  doc: Y.Doc | null,
  scene: SceneRecord | null,
  isDm: boolean,
  connectedPlayerIds: string[],
  allTokens: TokenRecord[],
  moveToken: (tokenId: string, x: number, y: number) => void,
  setCurrentPoi: (sceneId: string, poiId: string | null) => void,
  switchToScene: (sceneId: string) => Promise<void>,
  onSceneTransition: (linkedSceneName: string) => void,
): UseSceneNavigationResult {
  const sceneId = scene?.id ?? null
  const { pois, createPoi, deletePoi, movePoi, renamePoi, setLinkedScene, connectPois, disconnectPois } = usePois(doc, sceneId)
  const { proposal, propose, vote, cancel } = useMovementProposal(doc, sceneId)

  const executeGroupMove = (targetPoiId: string) => {
    if (!doc || !scene) return
    const target = pois.find((p) => p.id === targetPoiId)
    if (!target) return
    setCurrentPoi(scene.id, targetPoiId)
    for (const token of allTokens) {
      if (token.ownerId !== null) moveToken(token.id, target.x, target.y)
    }
    if (target.linkedSceneId) {
      void switchToScene(target.linkedSceneId)
      onSceneTransition(target.name)
    }
  }

  // DM-only auto-resolution of a 'vote' proposal once a majority of
  // currently-connected players have voted yes — same DM-only-does-the-
  // cleanup convention as every other timed/consensus sweep in this app
  // (map/usePings.ts, map/useAnnotations.ts), here avoiding two clients
  // racing to execute the same move twice.
  useEffect(() => {
    if (!isDm || !proposal || scene?.consensusMode !== 'vote') return
    const yesVotes = connectedPlayerIds.filter((id) => proposal.votes[id]).length
    if (connectedPlayerIds.length > 0 && yesVotes > connectedPlayerIds.length / 2) {
      executeGroupMove(proposal.targetPoiId)
      cancel()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isDm, proposal, scene?.consensusMode, connectedPlayerIds])

  const travelIndividually = (myTokenIds: string[], targetPoiId: string) => {
    const target = pois.find((p) => p.id === targetPoiId)
    if (!target) return
    for (const tokenId of myTokenIds) moveToken(tokenId, target.x, target.y)
  }

  const requestGroupTravel = (playerId: string, targetPoiId: string) => {
    if (!scene) return
    if (scene.scale === 'town') {
      executeGroupMove(targetPoiId)
      return
    }
    // Landscape: leader mode executes immediately for the leader only
    // (their own UI is the only one that calls this in leader mode — see
    // SceneNavigationPanel.tsx); vote mode always creates/updates a
    // proposal instead, resolved by the effect above.
    if (scene.consensusMode === 'leader') {
      executeGroupMove(targetPoiId)
    } else {
      propose(playerId, targetPoiId)
    }
  }

  return {
    pois,
    createPoi,
    deletePoi,
    movePoi,
    renamePoi,
    setLinkedScene,
    connectPois,
    disconnectPois,
    proposal,
    travelIndividually,
    requestGroupTravel,
    voteOnProposal: vote,
    cancelProposal: cancel,
  }
}
