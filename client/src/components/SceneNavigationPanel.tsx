import { useState } from 'react'
import { useSession } from '../session/useSession'
import { useConnectionStatus } from '../session/useConnectionStatus'
import { getOrCreatePlayerId } from '../session/lastSession'
import { useScenes } from '../map/useScenes'
import { useTokens } from '../map/useTokens'
import { useSceneNavigation } from '../map/useSceneNavigation'
import type { ConsensusMode, NavigationMode, SceneScale } from '../map/types'
import type { PendingPoiPlacement } from '../screens/pendingPoiPlacement'

/** Both the DM's POI editor and the player-facing "where do we go" UI live
 * here, gated internally by role — same single-component-both-audiences
 * pattern as components/InitiativeTracker.tsx. Only renders anything once
 * the active scene's scale is 'town' or 'landscape' (map/types.ts) —
 * 'dungeon' scenes keep the original Phase 2/3 free token movement with no
 * navigation UI at all. */
export function SceneNavigationPanel({
  pendingPoiPlacement,
  onRequestPoiPlacement,
  onCancelPoiPlacement,
}: {
  pendingPoiPlacement: PendingPoiPlacement | null
  onRequestPoiPlacement: (placement: PendingPoiPlacement) => void
  onCancelPoiPlacement: () => void
}) {
  const { session } = useSession()
  const doc = session?.doc ?? null
  const isDm = session?.role === 'dm'
  const myPlayerId = getOrCreatePlayerId()
  const { peers } = useConnectionStatus(session)
  const { scenes, activeScene, setSceneScale, setNavigationMode, setConsensusMode, setPartyLeader, setCurrentPoi, switchToScene } =
    useScenes(doc)
  const { tokens, moveToken } = useTokens(doc, activeScene?.id ?? null)

  const [newPoiName, setNewPoiName] = useState('')
  const [connectFromId, setConnectFromId] = useState('')
  const [transitionMessage, setTransitionMessage] = useState<string | null>(null)

  const connectedPlayerIds = peers.filter((p) => p.role === 'player').map((p) => p.playerId)

  const nav = useSceneNavigation(
    doc,
    activeScene,
    isDm,
    connectedPlayerIds,
    tokens,
    moveToken,
    setCurrentPoi,
    switchToScene,
    (linkedSceneName) => {
      setTransitionMessage(`Traveling to ${linkedSceneName}…`)
      setTimeout(() => setTransitionMessage(null), 1200)
    },
  )

  if (!doc || !activeScene) return null
  if (!isDm && activeScene.scale === 'dungeon') return null

  const isDungeon = activeScene.scale === 'dungeon'
  const myTokenIds = tokens.filter((t) => t.ownerId === myPlayerId).map((t) => t.id)
  const isLeader = activeScene.consensusMode === 'leader' && activeScene.partyLeaderId === myPlayerId
  const currentPoi = nav.pois.find((p) => p.id === activeScene.currentPoiId) ?? null
  const reachablePois = currentPoi ? nav.pois.filter((p) => currentPoi.connections.includes(p.id)) : nav.pois

  const handleStartPlacePoi = () => {
    const name = newPoiName.trim()
    if (!name) return
    onRequestPoiPlacement({ name })
    setNewPoiName('')
  }

  const handleToggleConnection = (poiId: string) => {
    if (!connectFromId || connectFromId === poiId) return
    const from = nav.pois.find((p) => p.id === connectFromId)
    if (!from) return
    if (from.connections.includes(poiId)) nav.disconnectPois(connectFromId, poiId)
    else nav.connectPois(connectFromId, poiId)
  }

  return (
    <div className="scene-navigation-panel">
      {transitionMessage && <div className="scene-navigation-panel__transition">{transitionMessage}</div>}

      {isDm && (
        <>
          <h3>Navigation</h3>
          <div className="scene-toolbar__row">
            <label htmlFor="scene-scale">Scale</label>
            <select id="scene-scale" value={activeScene.scale} onChange={(e) => setSceneScale(activeScene.id, e.target.value as SceneScale)}>
              <option value="dungeon">Dungeon</option>
              <option value="town">Town</option>
              <option value="landscape">Landscape</option>
            </select>
            {activeScene.scale === 'town' && (
              <>
                <label htmlFor="nav-mode">Movement</label>
                <select
                  id="nav-mode"
                  value={activeScene.navigationMode ?? 'group'}
                  onChange={(e) => setNavigationMode(activeScene.id, e.target.value as NavigationMode)}
                >
                  <option value="group">Group</option>
                  <option value="individual">Individual</option>
                </select>
              </>
            )}
            {activeScene.scale === 'landscape' && (
              <>
                <label htmlFor="consensus-mode">Consensus</label>
                <select
                  id="consensus-mode"
                  value={activeScene.consensusMode ?? 'vote'}
                  onChange={(e) => setConsensusMode(activeScene.id, e.target.value as ConsensusMode)}
                >
                  <option value="vote">Democratic vote</option>
                  <option value="leader">Leader appointment</option>
                </select>
                {activeScene.consensusMode === 'leader' && (
                  <select
                    value={activeScene.partyLeaderId ?? ''}
                    onChange={(e) => setPartyLeader(activeScene.id, e.target.value || null)}
                  >
                    <option value="">Choose a leader…</option>
                    {peers
                      .filter((p) => p.role === 'player')
                      .map((p) => (
                        <option key={p.playerId} value={p.playerId}>
                          {p.name}
                        </option>
                      ))}
                  </select>
                )}
              </>
            )}
          </div>

          {!isDungeon && (
            <>
              <h3>Points of interest</h3>
              {pendingPoiPlacement ? (
                <div className="token-upload token-upload--pending">
                  <span>Click the map to place "{pendingPoiPlacement.name}" (or cancel)</span>
                  <button type="button" onClick={onCancelPoiPlacement}>
                    Cancel
                  </button>
                </div>
              ) : (
                <div className="scene-toolbar__row">
                  <input value={newPoiName} onChange={(e) => setNewPoiName(e.target.value)} placeholder="New POI name" />
                  <button type="button" onClick={handleStartPlacePoi} disabled={!newPoiName.trim()}>
                    Place on map
                  </button>
                </div>
              )}

              <ul className="character-sheet__row-list">
                {nav.pois.map((poi) => (
                  <li key={poi.id} className="character-sheet__row">
                    <input value={poi.name} onChange={(e) => nav.renamePoi(poi.id, e.target.value)} />
                    <input type="number" value={Math.round(poi.x)} onChange={(e) => nav.movePoi(poi.id, Number(e.target.value), poi.y)} title="X" />
                    <input type="number" value={Math.round(poi.y)} onChange={(e) => nav.movePoi(poi.id, poi.x, Number(e.target.value))} title="Y" />
                    <select value={poi.linkedSceneId ?? ''} onChange={(e) => nav.setLinkedScene(poi.id, e.target.value || null)}>
                      <option value="">No linked scene</option>
                      {scenes
                        .filter((s) => s.id !== activeScene.id)
                        .map((s) => (
                          <option key={s.id} value={s.id}>
                            {s.name}
                          </option>
                        ))}
                    </select>
                    <button
                      type="button"
                      aria-pressed={connectFromId === poi.id}
                      onClick={() => setConnectFromId((prev) => (prev === poi.id ? '' : poi.id))}
                    >
                      {connectFromId === poi.id ? 'Connecting…' : 'Connect from here'}
                    </button>
                    {connectFromId && connectFromId !== poi.id && (
                      <button type="button" onClick={() => handleToggleConnection(poi.id)}>
                        {nav.pois.find((p) => p.id === connectFromId)?.connections.includes(poi.id) ? 'Disconnect' : 'Connect'}
                      </button>
                    )}
                    <button type="button" onClick={() => nav.deletePoi(poi.id)}>
                      Delete
                    </button>
                  </li>
                ))}
                {nav.pois.length === 0 && <li className="character-sheet__hint">No POIs yet.</li>}
              </ul>
            </>
          )}
        </>
      )}

      {!isDm && (
        <div className="scene-navigation-panel__travel">
          <h3>Travel</h3>
          <p className="character-sheet__hint">
            Currently at: {currentPoi?.name ?? 'nowhere set yet'}
            {activeScene.scale === 'landscape' && activeScene.consensusMode === 'leader' && (
              isLeader ? ' — you are the party leader.' : ' — waiting on the party leader to decide.'
            )}
          </p>

          {nav.proposal && activeScene.consensusMode === 'vote' && (
            <div className="scene-navigation-panel__proposal">
              <p>
                {nav.pois.find((p) => p.id === nav.proposal!.targetPoiId)?.name ?? 'Somewhere'} proposed —{' '}
                {Object.values(nav.proposal.votes).filter(Boolean).length} yes / {connectedPlayerIds.length} players
              </p>
              <button type="button" onClick={() => nav.voteOnProposal(myPlayerId, true)}>
                Vote yes
              </button>
              <button type="button" onClick={() => nav.voteOnProposal(myPlayerId, false)}>
                Vote no
              </button>
              {isDm && (
                <button type="button" onClick={() => nav.cancelProposal()}>
                  Cancel proposal
                </button>
              )}
            </div>
          )}

          <ul className="character-sheet__row-list">
            {reachablePois
              .filter((p) => p.id !== currentPoi?.id)
              .map((poi) => {
                const canAct =
                  activeScene.scale === 'town' && (activeScene.navigationMode ?? 'group') === 'individual'
                    ? myTokenIds.length > 0
                    : activeScene.scale === 'landscape' && activeScene.consensusMode === 'leader'
                      ? isLeader
                      : true
                return (
                  <li key={poi.id} className="character-sheet__row">
                    <span>{poi.name}</span>
                    <button
                      type="button"
                      disabled={!canAct}
                      onClick={() =>
                        activeScene.scale === 'town' && (activeScene.navigationMode ?? 'group') === 'individual'
                          ? nav.travelIndividually(myTokenIds, poi.id)
                          : nav.requestGroupTravel(myPlayerId, poi.id)
                      }
                    >
                      {activeScene.scale === 'landscape' && activeScene.consensusMode === 'vote' ? 'Propose' : 'Travel here'}
                    </button>
                  </li>
                )
              })}
            {reachablePois.length === 0 && <li className="character-sheet__hint">No reachable locations yet.</li>}
          </ul>
        </div>
      )}
    </div>
  )
}
