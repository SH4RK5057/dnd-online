import { useEffect, useState } from 'react'
import { useSession } from '../session/useSession'
import { useConnectionStatus } from '../session/useConnectionStatus'
import { getOrCreatePlayerId } from '../session/lastSession'
import { useScenes } from '../map/useScenes'
import { useTokens } from '../map/useTokens'
import { usePois } from '../map/usePois'
import { ConnectionStatusBadge } from '../components/ConnectionStatusBadge'
import { PeerList } from '../components/PeerList'
import { CopyJoinCode } from '../components/CopyJoinCode'
import { ConnectionErrorPanel } from '../components/ConnectionErrorPanel'
import { SceneToolbar } from '../components/SceneToolbar'
import { MapToolRail } from '../components/MapToolRail'
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
import { DmNotesPanel } from '../components/DmNotesPanel'
import { HandoutsPanel, PlayerHandoutsView } from '../components/HandoutsPanel'
import { RandomGenerators } from '../components/RandomGenerators'
import { SoundboardPanel } from '../components/SoundboardPanel'
import { CampaignFilesPanel } from '../components/CampaignFilesPanel'
import { ChatPanel } from '../components/ChatPanel'
import { SceneNavigationPanel } from '../components/SceneNavigationPanel'
import { CharacterManagerScreen } from './CharacterManagerScreen'
import { EncounterNotificationBanner } from '../components/EncounterNotificationBanner'
import { useEncounterNotifications } from '../combat/useEncounterNotifications'
import { MapCanvas } from '../canvas/MapCanvas'
import { monsterSizeToCategory, parseSpeedFeet } from '../content/monsterToToken'
import { footprintCells, snapToSlot } from '../map/sizeCategory'
import { FullscreenEnterIcon, FullscreenExitIcon } from '../components/icons'
import { DEFAULT_WALL_THICKNESS_PX } from '../canvas/WallLayer'
import type { MonsterData } from '../content/types'
import type { ToolMode } from '../canvas/interactionMode'
import type { PendingTokenPlacement } from './pendingTokenPlacement'
import type { PendingPoiPlacement } from './pendingPoiPlacement'

export function SessionScreen() {
  const { session, sessionMeta, leaveSession } = useSession()
  const { status, peers, failure, retry } = useConnectionStatus(session)
  const { scenes, activeSceneId, activeScene, switchToScene } = useScenes(session?.doc ?? null)
  const { notification, dismiss: dismissNotification } = useEncounterNotifications(session?.doc ?? null, scenes)
  const { tokens, createToken, setTokenArt, initTokenFromMonster } = useTokens(session?.doc ?? null, activeSceneId)
  const { createPoi } = usePois(session?.doc ?? null, activeSceneId)
  const [dmMode, setDmMode] = useState<'build' | 'run'>('build')
  const [showCharacterManager, setShowCharacterManager] = useState(false)
  const [toolMode, setToolMode] = useState<ToolMode>('move')
  const [snapWalls, setSnapWalls] = useState(false)
  const [wallThickness, setWallThickness] = useState(DEFAULT_WALL_THICKNESS_PX)
  const [isMapFullscreen, setIsMapFullscreen] = useState(false)
  const [showJoinCode, setShowJoinCode] = useState(true)
  const [pendingPlacement, setPendingPlacement] = useState<PendingTokenPlacement | null>(null)
  const [pendingPoiPlacement, setPendingPoiPlacement] = useState<PendingPoiPlacement | null>(null)
  const [previewPlayerId, setPreviewPlayerId] = useState<string | null>(null)
  const [selectedTokenId, setSelectedTokenId] = useState<string | null>(null)
  const [showCharacterSheet, setShowCharacterSheet] = useState(true)
  const [showDiceRoller, setShowDiceRoller] = useState(true)
  const [showInitiativeTracker, setShowInitiativeTracker] = useState(true)
  const [showCompendium, setShowCompendium] = useState(false)
  const [showHomebrewEditor, setShowHomebrewEditor] = useState(false)
  const [showRuleOverrides, setShowRuleOverrides] = useState(false)
  const [showDmNotes, setShowDmNotes] = useState(false)
  const [showHandouts, setShowHandouts] = useState(false)
  const [showRandomGenerators, setShowRandomGenerators] = useState(false)
  const [showSoundboard, setShowSoundboard] = useState(false)
  const [showCampaignFiles, setShowCampaignFiles] = useState(false)
  const [showChat, setShowChat] = useState(true)

  useEffect(() => {
    if (!notification) return
    const timer = setTimeout(dismissNotification, 12_000)
    return () => clearTimeout(timer)
  }, [notification, dismissNotification])

  useEffect(() => {
    if (!pendingPlacement) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setPendingPlacement(null)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [pendingPlacement])

  useEffect(() => {
    if (!pendingPoiPlacement) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setPendingPoiPlacement(null)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [pendingPoiPlacement])

  useEffect(() => {
    if (!isMapFullscreen) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setIsMapFullscreen(false)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [isMapFullscreen])

  if (!session) return null

  if (showCharacterManager) {
    // Character building/editing is entirely local-storage-based and doesn't
    // touch the campaign doc at all, so it can run as a full swap-in view —
    // the session/WebRTC connection stays alive underneath (owned by
    // SessionProvider above this component, not by anything unmounted here)
    // and picks back up exactly where it was once the DM returns.
    return <CharacterManagerScreen onBack={() => setShowCharacterManager(false)} />
  }

  const isUnassignedPlayer =
    session.role === 'player' && !!activeScene?.fogEnabled && !tokens.some((t) => t.ownerId === getOrCreatePlayerId())
  const isUnpublishedForPlayer = session.role === 'player' && !!activeScene && activeScene.published === false

  const isPreviewingPlayer = session.role === 'dm' && previewPlayerId !== null
  const effectiveToolMode: ToolMode = isPreviewingPlayer
    ? 'move'
    : pendingPlacement
      ? 'place-tokens'
      : pendingPoiPlacement
        ? 'place-pois'
        : toolMode

  const handlePlacePoi = (x: number, y: number) => {
    if (!pendingPoiPlacement || !activeSceneId) return
    const { name } = pendingPoiPlacement
    setPendingPoiPlacement(null)
    try {
      createPoi(activeSceneId, name, x, y)
    } catch (err) {
      window.alert(err instanceof Error ? err.message : 'Could not add that POI.')
    }
  }

  const handlePlaceToken = (x: number, y: number) => {
    if (!pendingPlacement || !activeSceneId) return
    const { name, sizeCategory, file, monsterInit } = pendingPlacement
    setPendingPlacement(null)
    try {
      const footprint = footprintCells(sizeCategory)
      const snappedX = snapToSlot(x, footprint)
      const snappedY = snapToSlot(y, footprint)
      const tokenId = createToken({ sceneId: activeSceneId, name, sizeCategory, x: snappedX, y: snappedY })
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

      {notification && (
        <EncounterNotificationBanner
          notification={notification}
          isViewingScene={notification.sceneId === activeSceneId}
          onGoToScene={() => {
            void switchToScene(notification.sceneId)
            dismissNotification()
          }}
          onDismiss={dismissNotification}
        />
      )}

      <div className="session-screen__body">
        <div className="session-screen__panel">
          {session.role === 'dm' && (
            <>
              <div className="session-screen__mode-switcher">
                <button type="button" aria-pressed={dmMode === 'build'} onClick={() => setDmMode('build')}>
                  Scene Builder
                </button>
                <button type="button" aria-pressed={dmMode === 'run'} onClick={() => setDmMode('run')}>
                  Run Campaign
                </button>
                <button type="button" onClick={() => setShowCharacterManager(true)}>
                  Character Builder
                </button>
              </div>

              {dmMode === 'build' && (
                <>
                  <SceneToolbar />

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

              {dmMode === 'run' && (
                <>
                  <button type="button" onClick={() => setShowDmNotes((v) => !v)}>
                    {showDmNotes ? 'Hide DM notes' : 'Show DM notes'}
                  </button>
                  {showDmNotes && <DmNotesPanel doc={session.doc} />}

                  <button type="button" onClick={() => setShowHandouts((v) => !v)}>
                    {showHandouts ? 'Hide handouts' : 'Show handouts'}
                  </button>
                  {showHandouts && <HandoutsPanel doc={session.doc} />}

                  <button type="button" onClick={() => setShowRandomGenerators((v) => !v)}>
                    {showRandomGenerators ? 'Hide random generators' : 'Show random generators'}
                  </button>
                  {showRandomGenerators && <RandomGenerators doc={session.doc} />}

                  <button type="button" onClick={() => setShowSoundboard((v) => !v)}>
                    {showSoundboard ? 'Hide soundboard' : 'Show soundboard'}
                  </button>
                  {showSoundboard && <SoundboardPanel />}

                  <button type="button" onClick={() => setShowCampaignFiles((v) => !v)}>
                    {showCampaignFiles ? 'Hide campaign files' : 'Show campaign files'}
                  </button>
                  {showCampaignFiles && (
                    <CampaignFilesPanel doc={session.doc} sessionName={sessionMeta?.sessionName ?? 'campaign'} />
                  )}
                </>
              )}
            </>
          )}

          <SceneNavigationPanel
            pendingPoiPlacement={pendingPoiPlacement}
            onRequestPoiPlacement={setPendingPoiPlacement}
            onCancelPoiPlacement={() => setPendingPoiPlacement(null)}
          />

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

          <button type="button" onClick={() => setShowChat((v) => !v)}>
            {showChat ? 'Hide chat' : 'Show chat'}
          </button>
          {showChat && <ChatPanel />}

          {session.role === 'player' && (
            <>
              <button type="button" onClick={() => setShowCompendium((v) => !v)}>
                {showCompendium ? 'Hide compendium' : 'Show compendium'}
              </button>
              {showCompendium && <CompendiumDrawer doc={session.doc} isDm={false} />}

              <button type="button" onClick={() => setShowHandouts((v) => !v)}>
                {showHandouts ? 'Hide handouts' : 'Show handouts'}
              </button>
              {showHandouts && <PlayerHandoutsView doc={session.doc} />}
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

        <div className={`session-screen__main${isMapFullscreen ? ' session-screen__main--fullscreen' : ''}`}>
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
                wallThickness={wallThickness}
                onPlaceToken={handlePlaceToken}
                onPlacePoi={handlePlacePoi}
                previewPlayerId={session.role === 'dm' ? previewPlayerId : null}
                selectedTokenId={selectedTokenId}
                onSelectToken={(tokenId) => setSelectedTokenId((prev) => (prev === tokenId ? null : tokenId))}
              />
              {session.role === 'dm' && activeSceneId && !isPreviewingPlayer && (
                <MapToolRail
                  sceneId={activeSceneId}
                  toolMode={toolMode}
                  onToolModeChange={setToolMode}
                  snapWalls={snapWalls}
                  onSnapWallsChange={setSnapWalls}
                  wallThickness={wallThickness}
                  onWallThicknessChange={setWallThickness}
                  pendingPlacement={pendingPlacement}
                  onRequestPlacement={setPendingPlacement}
                  onCancelPlacement={() => setPendingPlacement(null)}
                />
              )}
              <button
                type="button"
                className="session-screen__fullscreen-toggle"
                onClick={() => setIsMapFullscreen((v) => !v)}
                title={isMapFullscreen ? 'Exit fullscreen' : 'Fullscreen map'}
              >
                {isMapFullscreen ? <FullscreenExitIcon /> : <FullscreenEnterIcon />}
              </button>
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
