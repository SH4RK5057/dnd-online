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
import { PreviewAsPlayer } from '../components/PreviewAsPlayer'
import { CharacterPanel } from '../components/CharacterPanel'
import { DiceRollerPanel } from '../components/DiceRollerPanel'
import { RollLog } from '../components/RollLog'
import { InitiativeTracker } from '../components/InitiativeTracker'
import { TokenHpConditionEditor } from '../components/TokenHpConditionEditor'
import { CompendiumDrawer } from '../components/CompendiumDrawer'
import { HomebrewEditor } from '../components/HomebrewEditor'
import { RuleOverridesPanel } from '../components/RuleOverridesPanel'
import { TokenInspector } from '../components/TokenInspector'
import { MapCanvas } from '../canvas/MapCanvas'
import { monsterSizeToCategory, parseSpeedFeet } from '../content/monsterToToken'
import type { MonsterData } from '../content/types'
import type { ToolMode } from '../canvas/interactionMode'
import type { PendingTokenPlacement } from './pendingTokenPlacement'

export function SessionScreen() {
  const { session, sessionMeta, leaveSession } = useSession()
  const { status, peers, failure, retry } = useConnectionStatus(session)
  const { activeSceneId, activeScene } = useScenes(session?.doc ?? null)
  const { tokens, createToken, setTokenArt, initTokenFromMonster } = useTokens(session?.doc ?? null, activeSceneId)
  const [toolMode, setToolMode] = useState<ToolMode>('move')
  const [snapWalls, setSnapWalls] = useState(false)
  const [showJoinCode, setShowJoinCode] = useState(true)
  const [pendingPlacement, setPendingPlacement] = useState<PendingTokenPlacement | null>(null)
  const [previewPlayerId, setPreviewPlayerId] = useState<string | null>(null)
  const [selectedTokenId, setSelectedTokenId] = useState<string | null>(null)
  const [showCharacterSheet, setShowCharacterSheet] = useState(true)
  const [showDiceRoller, setShowDiceRoller] = useState(true)
  const [showInitiativeTracker, setShowInitiativeTracker] = useState(true)
  const [showCompendium, setShowCompendium] = useState(false)
  const [showHomebrewEditor, setShowHomebrewEditor] = useState(false)
  const [showRuleOverrides, setShowRuleOverrides] = useState(false)

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

  const isPreviewingPlayer = session.role === 'dm' && previewPlayerId !== null
  const effectiveToolMode: ToolMode = isPreviewingPlayer ? 'move' : pendingPlacement ? 'place-tokens' : toolMode

  const handlePlaceToken = (x: number, y: number) => {
    if (!pendingPlacement || !activeSceneId) return
    const { name, sizeCategory, file, monsterInit } = pendingPlacement
    setPendingPlacement(null)
    try {
      const tokenId = createToken({ sceneId: activeSceneId, name, sizeCategory, x, y })
      if (file) void setTokenArt(tokenId, file)
      if (monsterInit) initTokenFromMonster(tokenId, monsterInit)
    } catch (err) {
      window.alert(err instanceof Error ? err.message : 'Could not add that token.')
    }
  }

  const handleAddMonsterToScene = (monster: MonsterData) => {
    setPendingPlacement({
      name: monster.name,
      sizeCategory: monsterSizeToCategory(monster.size),
      file: null,
      monsterInit: {
        monsterKey: monster.key,
        hp: { current: monster.hp, max: monster.hp, temp: 0 },
        ac: monster.ac,
        speed: parseSpeedFeet(monster.speed),
      },
    })
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

      <div className="session-screen__body">
        <div className="session-screen__panel">
          {session.role === 'dm' && (
            <>
              <SceneToolbar />

              {activeSceneId && !isPreviewingPlayer && (
                <DrawingToolbar
                  sceneId={activeSceneId}
                  toolMode={toolMode}
                  onToolModeChange={setToolMode}
                  snapWalls={snapWalls}
                  onSnapWallsChange={setSnapWalls}
                />
              )}

              {activeSceneId && !isPreviewingPlayer && (
                <TokenUploadButton
                  sceneId={activeSceneId}
                  pendingPlacement={pendingPlacement}
                  onRequestPlacement={setPendingPlacement}
                  onCancelPlacement={() => setPendingPlacement(null)}
                />
              )}

              {activeSceneId && <TokenOwnerAssign sceneId={activeSceneId} />}

              <PreviewAsPlayer previewPlayerId={previewPlayerId} onChange={setPreviewPlayerId} />

              <button type="button" onClick={() => setShowCompendium((v) => !v)}>
                {showCompendium ? 'Hide compendium' : 'Show compendium'}
              </button>
              {showCompendium && (
                <CompendiumDrawer
                  doc={session.doc}
                  isDm
                  onAddMonsterToScene={activeSceneId && !isPreviewingPlayer ? handleAddMonsterToScene : undefined}
                />
              )}

              <button type="button" onClick={() => setShowHomebrewEditor((v) => !v)}>
                {showHomebrewEditor ? 'Hide homebrew editor' : 'Show homebrew editor'}
              </button>
              {showHomebrewEditor && <HomebrewEditor doc={session.doc} />}

              <button type="button" onClick={() => setShowRuleOverrides((v) => !v)}>
                {showRuleOverrides ? 'Hide rule overrides' : 'Show rule overrides'}
              </button>
              {showRuleOverrides && <RuleOverridesPanel doc={session.doc} activeSceneId={activeSceneId} />}
            </>
          )}

          {/* Character sheet, dice, and initiative are shared between DM and
              players — everyone rolls dice and sees the initiative order,
              and a DM can play their own character same as anyone. */}
          <button type="button" onClick={() => setShowCharacterSheet((v) => !v)}>
            {showCharacterSheet ? 'Hide character sheet' : 'Show character sheet'}
          </button>
          {showCharacterSheet && <CharacterPanel />}

          <button type="button" onClick={() => setShowDiceRoller((v) => !v)}>
            {showDiceRoller ? 'Hide dice roller' : 'Show dice roller'}
          </button>
          {showDiceRoller && (
            <>
              <DiceRollerPanel />
              <RollLog />
            </>
          )}

          <button type="button" onClick={() => setShowInitiativeTracker((v) => !v)}>
            {showInitiativeTracker ? 'Hide initiative tracker' : 'Show initiative tracker'}
          </button>
          {showInitiativeTracker && <InitiativeTracker />}

          {session.role === 'player' && (
            <>
              <button type="button" onClick={() => setShowCompendium((v) => !v)}>
                {showCompendium ? 'Hide compendium' : 'Show compendium'}
              </button>
              {showCompendium && <CompendiumDrawer doc={session.doc} isDm={false} />}
            </>
          )}

          {activeSceneId && selectedTokenId && (
            <TokenHpConditionEditor
              sceneId={activeSceneId}
              selectedTokenId={selectedTokenId}
              onClose={() => setSelectedTokenId(null)}
            />
          )}
          {activeSceneId && selectedTokenId && (
            <TokenInspector doc={session.doc} sceneId={activeSceneId} isDm={session.role === 'dm'} selectedTokenId={selectedTokenId} />
          )}
        </div>

        <div className="session-screen__main">
          {isUnpublishedForPlayer ? (
            <p className="session-screen__notice">Your DM is still setting up this scene. Hang tight!</p>
          ) : (
            <>
              {isUnassignedPlayer && (
                <p className="session-screen__notice">Your DM hasn't assigned you a token on this scene yet.</p>
              )}
              <MapCanvas
                toolMode={effectiveToolMode}
                snapWalls={snapWalls}
                onPlaceToken={handlePlaceToken}
                previewPlayerId={session.role === 'dm' ? previewPlayerId : null}
                selectedTokenId={selectedTokenId}
                onSelectToken={(tokenId) => setSelectedTokenId((prev) => (prev === tokenId ? null : tokenId))}
              />
            </>
          )}
        </div>
      </div>

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
