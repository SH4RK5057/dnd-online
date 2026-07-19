import { useEffect, useState } from 'react'
import { useSession } from '../session/useSession'
import { useConnectionStatus } from '../session/useConnectionStatus'
import { getOrCreatePlayerId } from '../session/lastSession'
import { useScenes } from '../map/useScenes'
import { useTokens } from '../map/useTokens'
import { ConnectionStatusBadge } from '../components/ConnectionStatusBadge'
import { PeerList } from '../components/PeerList'
import { CopyJoinCode } from '../components/CopyJoinCode'
import { ConnectionErrorPanel } from '../components/ConnectionErrorPanel'
import { SceneToolbar } from '../components/SceneToolbar'
import { TokenUploadButton } from '../components/TokenUploadButton'
import { DrawingToolbar } from '../components/DrawingToolbar'
import { TokenOwnerAssign } from '../components/TokenOwnerAssign'
import { MapCanvas } from '../canvas/MapCanvas'
import type { ToolMode } from '../canvas/interactionMode'
import type { PendingTokenPlacement } from './pendingTokenPlacement'

export function SessionScreen() {
  const { session, sessionMeta, leaveSession } = useSession()
  const { status, peers, failure, retry } = useConnectionStatus(session)
  const { activeSceneId, activeScene } = useScenes(session?.doc ?? null)
  const { tokens, createToken, setTokenArt } = useTokens(session?.doc ?? null, activeSceneId)
  const [toolMode, setToolMode] = useState<ToolMode>('move')
  const [snapWalls, setSnapWalls] = useState(false)
  const [showJoinCode, setShowJoinCode] = useState(true)
  const [pendingPlacement, setPendingPlacement] = useState<PendingTokenPlacement | null>(null)

  useEffect(() => {
    if (!pendingPlacement) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setPendingPlacement(null)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [pendingPlacement])

  if (!session) return null

  const isUnassignedPlayer =
    session.role === 'player' && !!activeScene?.fogEnabled && !tokens.some((t) => t.ownerId === getOrCreatePlayerId())
  const isUnpublishedForPlayer = session.role === 'player' && !!activeScene && activeScene.published === false

  const effectiveToolMode: ToolMode = pendingPlacement ? 'place-tokens' : toolMode

  const handlePlaceToken = (x: number, y: number) => {
    if (!pendingPlacement || !activeSceneId) return
    const { name, sizeCategory, file } = pendingPlacement
    setPendingPlacement(null)
    try {
      const tokenId = createToken({ sceneId: activeSceneId, name, sizeCategory, x, y })
      if (file) void setTokenArt(tokenId, file)
    } catch (err) {
      window.alert(err instanceof Error ? err.message : 'Could not add that token.')
    }
  }

  return (
    <section className="session-screen">
      <header className="session-screen__header">
        <h1>{sessionMeta?.sessionName ?? 'Session'}</h1>
        <ConnectionStatusBadge status={status} />
      </header>

      {session.role === 'dm' && (
        <div className="session-screen__code">
          <button type="button" onClick={() => setShowJoinCode((v) => !v)}>
            {showJoinCode ? 'Hide join code' : 'Show join code'}
          </button>
          {showJoinCode && (
            <>
              <p>Share this code with your players:</p>
              <CopyJoinCode code={session.joinCode} />
            </>
          )}
        </div>
      )}

      {failure && <ConnectionErrorPanel failure={failure} onRetry={retry} />}

      {session.role === 'dm' && <SceneToolbar />}

      {session.role === 'dm' && activeSceneId && (
        <DrawingToolbar
          sceneId={activeSceneId}
          toolMode={toolMode}
          onToolModeChange={setToolMode}
          snapWalls={snapWalls}
          onSnapWallsChange={setSnapWalls}
        />
      )}

      {session.role === 'dm' && activeSceneId && (
        <TokenUploadButton
          sceneId={activeSceneId}
          pendingPlacement={pendingPlacement}
          onRequestPlacement={setPendingPlacement}
          onCancelPlacement={() => setPendingPlacement(null)}
        />
      )}

      {session.role === 'dm' && activeSceneId && <TokenOwnerAssign sceneId={activeSceneId} />}

      {isUnpublishedForPlayer ? (
        <p className="session-screen__notice">Your DM is still setting up this scene. Hang tight!</p>
      ) : (
        <>
          {isUnassignedPlayer && (
            <p className="session-screen__notice">Your DM hasn't assigned you a token on this scene yet.</p>
          )}
          <MapCanvas toolMode={effectiveToolMode} snapWalls={snapWalls} onPlaceToken={handlePlaceToken} />
        </>
      )}

      <div className="session-screen__peers">
        <h2>Who's here</h2>
        <PeerList peers={peers} localName={session.displayName} localRole={session.role} />
      </div>

      <button type="button" onClick={leaveSession}>
        Leave session
      </button>
    </section>
  )
}
