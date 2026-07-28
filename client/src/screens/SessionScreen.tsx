import { useEffect, useRef, useState } from 'react'
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
import { CharacterPanel } from '../components/CharacterPanel'
import { FogLightingPanel } from '../components/FogLightingPanel'
import { TokenOwnerAssign } from '../components/TokenOwnerAssign'
import { PreviewAsPlayer } from '../components/PreviewAsPlayer'
import { AnnotationsPanel } from '../components/AnnotationsPanel'
import { PartyLootPanel } from '../components/PartyLootPanel'
import { SessionRecapPanel } from '../components/SessionRecapPanel'
import { TokenUploadButton } from '../components/TokenUploadButton'
import { DiceRollerPanel } from '../components/DiceRollerPanel'
import { RollLog } from '../components/RollLog'
import { InitiativeTracker } from '../components/InitiativeTracker'
import { TokenHpConditionEditor } from '../components/TokenHpConditionEditor'
import { CompendiumDrawer } from '../components/CompendiumDrawer'
import { TokenInspector } from '../components/TokenInspector'
import { DmNotesPanel } from '../components/DmNotesPanel'
import { HandoutsPanel, PlayerHandoutsView } from '../components/HandoutsPanel'
import { RandomGenerators } from '../components/RandomGenerators'
import { SoundboardPanel } from '../components/SoundboardPanel'
import { CampaignFilesPanel } from '../components/CampaignFilesPanel'
import { ChatPanel } from '../components/ChatPanel'
import { SceneNavigationPanel } from '../components/SceneNavigationPanel'
import { CharacterManagerScreen } from './CharacterManagerScreen'
import { SceneBuilderScreen } from './SceneBuilderScreen'
import { EncounterNotificationBanner } from '../components/EncounterNotificationBanner'
import { PendingOverridesBanner } from '../components/PendingOverridesBanner'
import { useEncounterNotifications } from '../combat/useEncounterNotifications'
import { useUndoManager } from '../undo/useUndoManager'
import { MapCanvas } from '../canvas/MapCanvas'
import type { MeasureShape } from '../canvas/MeasureLayer'
import { FullscreenEnterIcon, FullscreenExitIcon } from '../components/icons'
import { DEFAULT_WALL_THICKNESS_PX } from '../canvas/WallLayer'
import { footprintCells, snapToSlot } from '../map/sizeCategory'
import type { ToolMode } from '../canvas/interactionMode'
import type { PendingPoiPlacement } from './pendingPoiPlacement'
import type { PendingTokenPlacement } from './pendingTokenPlacement'

export function SessionScreen() {
  const { session, sessionMeta, leaveSession } = useSession()
  const { status, peers, failure, retry } = useConnectionStatus(session)
  const { scenes, activeSceneId, activeScene, switchToScene } = useScenes(session?.doc ?? null)
  const { notification, dismiss: dismissNotification } = useEncounterNotifications(session?.doc ?? null, scenes)
  const { undo, redo, canUndo, canRedo } = useUndoManager(session?.role === 'dm' ? (session?.doc ?? null) : null)
  const { tokens, createToken, setTokenArt } = useTokens(session?.doc ?? null, activeSceneId)
  const { createPoi } = usePois(session?.doc ?? null, activeSceneId)
  const [showCharacterManager, setShowCharacterManager] = useState(false)
  const [showSceneBuilder, setShowSceneBuilder] = useState(false)
  const [isMapFullscreen, setIsMapFullscreen] = useState(false)
  const [showJoinCode, setShowJoinCode] = useState(true)
  const [pendingPoiPlacement, setPendingPoiPlacement] = useState<PendingPoiPlacement | null>(null)
  const [pendingTokenPlacement, setPendingTokenPlacement] = useState<PendingTokenPlacement | null>(null)
  const [previewPlayerId, setPreviewPlayerId] = useState<string | null>(null)
  const [selectedTokenId, setSelectedTokenId] = useState<string | null>(null)
  const [showCharacterSheetFullscreen, setShowCharacterSheetFullscreen] = useState(false)
  /** Set by SpellCastPanel (inside CharacterPanel or TokenInspector) when a
   * spell's AoE template is armed — lives here, above the fullscreen
   * character-sheet swap below, so arming a template from the character
   * sheet survives switching back to the map view to actually place it. */
  const [armedTemplate, setArmedTemplate] = useState<{ shape: MeasureShape; sizeFt: number } | null>(null)
  const [showDiceRoller, setShowDiceRoller] = useState(true)
  const [showInitiativeTracker, setShowInitiativeTracker] = useState(true)
  const [showCompendium, setShowCompendium] = useState(false)
  const [showTokenPlacement, setShowTokenPlacement] = useState(false)
  const [showDmNotes, setShowDmNotes] = useState(false)
  const [showHandouts, setShowHandouts] = useState(false)
  const [showRandomGenerators, setShowRandomGenerators] = useState(false)
  const [showSoundboard, setShowSoundboard] = useState(false)
  const [showCampaignFiles, setShowCampaignFiles] = useState(false)
  const [showChat, setShowChat] = useState(true)
  const [showSessionRecap, setShowSessionRecap] = useState(false)

  useEffect(() => {
    if (!notification) return
    const timer = setTimeout(dismissNotification, 12_000)
    return () => clearTimeout(timer)
  }, [notification, dismissNotification])

  useEffect(() => {
    if (session?.role !== 'dm') return
    const onKeyDown = (event: KeyboardEvent) => {
      if (!(event.ctrlKey || event.metaKey) || event.key.toLowerCase() !== 'z') return
      const target = event.target as HTMLElement | null
      // Don't hijack Ctrl+Z inside a text field — that should undo typing, not a map edit.
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) return
      event.preventDefault()
      if (event.shiftKey) redo()
      else undo()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [session?.role, undo, redo])

  useEffect(() => {
    if (!pendingPoiPlacement) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setPendingPoiPlacement(null)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [pendingPoiPlacement])

  useEffect(() => {
    if (!pendingTokenPlacement) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setPendingTokenPlacement(null)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [pendingTokenPlacement])

  useEffect(() => {
    if (!isMapFullscreen) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setIsMapFullscreen(false)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [isMapFullscreen])

  // A campaign without its DM isn't usable — once a player's peer list has
  // shown a DM at least once, losing them again (past useConnectionStatus's
  // own reconnect grace period, so a brief drop doesn't trigger this) means
  // the DM closed the app/tab. Rather than leaving players stuck staring at
  // a session with no host, send them back to the main menu.
  const dmEverSeenRef = useRef(false)
  useEffect(() => {
    if (!session || session.role !== 'player') {
      dmEverSeenRef.current = false
      return
    }
    const dmPresent = peers.some((peer) => peer.role === 'dm')
    if (dmPresent) {
      dmEverSeenRef.current = true
      return
    }
    if (dmEverSeenRef.current) {
      dmEverSeenRef.current = false
      window.alert('The DM has disconnected. Returning to the main menu.')
      leaveSession()
    }
  }, [session, peers, leaveSession])

  if (!session) return null

  // Scene building, character building, and the in-session character sheet
  // are all entirely separate views that fully swap out this screen, the
  // same way — the session/WebRTC connection stays alive underneath (owned
  // by SessionProvider above this component, not by anything unmounted
  // here) and picks back up exactly where it was once the player/DM returns.
  if (showCharacterManager) {
    return <CharacterManagerScreen onBack={() => setShowCharacterManager(false)} />
  }
  if (showSceneBuilder) {
    return <SceneBuilderScreen onBack={() => setShowSceneBuilder(false)} />
  }
  if (showCharacterSheetFullscreen) {
    return (
      <section className="character-fullscreen-screen">
        <header className="session-screen__header">
          <h1>Your Character</h1>
          <button type="button" onClick={() => setShowCharacterSheetFullscreen(false)}>
            Back to session
          </button>
        </header>
        <CharacterPanel onArmTemplate={setArmedTemplate} />
      </section>
    )
  }

  const isUnassignedPlayer =
    session.role === 'player' && !!activeScene?.fogEnabled && !tokens.some((t) => t.ownerId === getOrCreatePlayerId())
  const isUnpublishedForPlayer = session.role === 'player' && !!activeScene && activeScene.published === false

  const isPreviewingPlayer = session.role === 'dm' && previewPlayerId !== null
  const effectiveToolMode: ToolMode = isPreviewingPlayer
    ? 'move'
    : pendingTokenPlacement
      ? 'place-tokens'
      : pendingPoiPlacement
        ? 'place-pois'
        : 'move'

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
    if (!pendingTokenPlacement || !activeSceneId) return
    const { name, sizeCategory, file, hazardSize } = pendingTokenPlacement
    setPendingTokenPlacement(null)
    try {
      const footprint = hazardSize ? Math.max(hazardSize.widthCells, hazardSize.heightCells) : footprintCells(sizeCategory)
      const snappedX = snapToSlot(x, footprint)
      const snappedY = snapToSlot(y, footprint)
      const tokenId = createToken({
        sceneId: activeSceneId,
        name,
        sizeCategory,
        x: snappedX,
        y: snappedY,
        hazardSize,
        hidden: !!hazardSize,
      })
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
        {session.role === 'dm' && (
          <div className="session-screen__undo-redo" title="Undo/redo token, wall, light, and character edits — a misclick safety net, not a general time machine. Keyboard: Ctrl+Z / Ctrl+Shift+Z.">
            <button type="button" onClick={undo} disabled={!canUndo}>
              ↶ Undo
            </button>
            <button type="button" onClick={redo} disabled={!canRedo}>
              ↷ Redo
            </button>
          </div>
        )}
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

      {session.role === 'dm' && <PendingOverridesBanner doc={session.doc} />}

      <div className="session-screen__body">
        <div className="session-screen__panel">
          {session.role === 'dm' && (
            <>
              <div className="session-screen__mode-switcher">
                <button type="button" onClick={() => setShowSceneBuilder(true)}>
                  Scene Builder
                </button>
                <button type="button" onClick={() => setShowCharacterManager(true)}>
                  Character Builder
                </button>
              </div>

              <FogLightingPanel />

              {activeSceneId && <TokenOwnerAssign sceneId={activeSceneId} />}

              <PreviewAsPlayer previewPlayerId={previewPlayerId} onChange={setPreviewPlayerId} />

              {activeSceneId && (
                <>
                  <button type="button" onClick={() => setShowTokenPlacement((v) => !v)}>
                    {showTokenPlacement ? 'Hide token placement' : 'Show token placement'}
                  </button>
                  {showTokenPlacement && (
                    <TokenUploadButton
                      sceneId={activeSceneId}
                      pendingPlacement={pendingTokenPlacement}
                      onRequestPlacement={setPendingTokenPlacement}
                      onCancelPlacement={() => setPendingTokenPlacement(null)}
                    />
                  )}
                </>
              )}

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

          <SceneNavigationPanel
            pendingPoiPlacement={pendingPoiPlacement}
            onRequestPoiPlacement={setPendingPoiPlacement}
            onCancelPoiPlacement={() => setPendingPoiPlacement(null)}
          />

          <AnnotationsPanel />

          <PartyLootPanel />

          <button type="button" onClick={() => setShowSessionRecap((v) => !v)}>
            {showSessionRecap ? 'Hide session recap' : 'Show session recap'}
          </button>
          {showSessionRecap && <SessionRecapPanel />}

          {/* Dice, initiative, chat, handouts, and the compendium lookup are
              shared between DM and players — everyone rolls dice and sees
              the initiative order, and a DM can play their own character
              same as anyone. The character sheet itself opens full-screen
              (see showCharacterSheetFullscreen above) rather than cramming
              into this narrow sidebar. */}
          <button type="button" onClick={() => setShowCharacterSheetFullscreen(true)}>
            Open character sheet
          </button>

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

          <button type="button" onClick={() => setShowCompendium((v) => !v)}>
            {showCompendium ? 'Hide compendium' : 'Show compendium'}
          </button>
          {showCompendium && <CompendiumDrawer doc={session.doc} isDm={session.role === 'dm'} />}

          {session.role === 'player' && (
            <>
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
            <TokenInspector
              doc={session.doc}
              sceneId={activeSceneId}
              isDm={session.role === 'dm'}
              selectedTokenId={selectedTokenId}
              onArmTemplate={setArmedTemplate}
            />
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
                snapWalls={false}
                wallThickness={DEFAULT_WALL_THICKNESS_PX}
                onPlaceToken={handlePlaceToken}
                onPlacePoi={handlePlacePoi}
                previewPlayerId={session.role === 'dm' ? previewPlayerId : null}
                selectedTokenId={selectedTokenId}
                onSelectToken={(tokenId) => setSelectedTokenId((prev) => (prev === tokenId ? null : tokenId))}
                armedTemplate={armedTemplate}
                onArmedTemplatePlaced={() => setArmedTemplate(null)}
              />
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
