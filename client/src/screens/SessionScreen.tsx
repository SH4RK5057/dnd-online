import { lazy, Suspense, useEffect, useRef, useState, type ReactNode } from 'react'
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
import { TokenInspector } from '../components/TokenInspector'
import { DmNotesPanel } from '../components/DmNotesPanel'
import { HandoutsPanel, PlayerHandoutsView } from '../components/HandoutsPanel'
import { BroadcastComposer } from '../components/BroadcastComposer'
import { BroadcastNotificationBanner } from '../components/BroadcastNotificationBanner'
import { RandomGenerators } from '../components/RandomGenerators'
import { SoundboardPanel } from '../components/SoundboardPanel'
import { CampaignFilesPanel } from '../components/CampaignFilesPanel'
import { ChatPanel } from '../components/ChatPanel'
import { SceneNavigationPanel } from '../components/SceneNavigationPanel'
import { FloorSwitcher } from '../components/FloorSwitcher'
import { CharacterTokenMenu } from '../components/CharacterTokenMenu'
import { CharacterManagerScreen } from './CharacterManagerScreen'
import { SceneBuilderScreen } from './SceneBuilderScreen'
import { CompendiumScreen } from './CompendiumScreen'
import { EncounterNotificationBanner } from '../components/EncounterNotificationBanner'
import { PendingOverridesBanner } from '../components/PendingOverridesBanner'
import { useEncounterNotifications } from '../combat/useEncounterNotifications'
import { useBroadcast } from '../dmtools/useBroadcast'
import { useCompendium, findByKey } from '../content/useCompendium'
import { useUndoManager } from '../undo/useUndoManager'
import { usePanelOrder } from './usePanelOrder'
import { useSidebarLayout, type SidebarPosition } from './useSidebarLayout'
import { SidebarResizeHandle } from '../components/SidebarResizeHandle'
import { DiceOverlay } from '../components/DiceOverlay'
import { MapCanvas } from '../canvas/MapCanvas'
// Lazy: three.js + OrbitControls are a real chunk of weight (canvas3d/*)
// that only the personal 3D-view toggle ever needs — most sessions spend
// their whole time in the 2D map, so this keeps that weight out of the
// initial bundle instead of every viewer paying for it up front.
const Scene3D = lazy(() => import('../canvas3d/Scene3D').then((m) => ({ default: m.Scene3D })))
import type { MeasureShape } from '../canvas/MeasureLayer'
import { FullscreenEnterIcon, FullscreenExitIcon } from '../components/icons'
import { DEFAULT_WALL_THICKNESS_PX } from '../canvas/WallLayer'
import { footprintCells, snapToSlot } from '../map/sizeCategory'
import { monsterSizeToCategory, parseSpeedFeet } from '../content/monsterToToken'
import type { ItemData, MonsterData } from '../content/types'
import type { ToolMode } from '../canvas/interactionMode'
import type { PendingPoiPlacement } from './pendingPoiPlacement'
import type { PendingTokenPlacement } from './pendingTokenPlacement'

export function SessionScreen() {
  const { session, sessionMeta, leaveSession } = useSession()
  const { status, peers, failure, retry } = useConnectionStatus(session)
  const { scenes, activeSceneId, activeScene, switchToScene } = useScenes(session?.doc ?? null)
  const { notification, dismiss: dismissNotification } = useEncounterNotifications(session?.doc ?? null, scenes)
  const { notification: broadcastNotification, dismiss: dismissBroadcast } = useBroadcast(session?.doc ?? null)
  const compendium = useCompendium(session?.doc ?? null)
  const { undo, redo, canUndo, canRedo } = useUndoManager(session?.role === 'dm' ? (session?.doc ?? null) : null)
  const { tokens, createToken, setTokenArt, setTokenModel, initTokenFromMonster, linkCharacter, assignOwner } = useTokens(
    session?.doc ?? null,
    activeSceneId,
  )
  const { createPoi } = usePois(session?.doc ?? null, activeSceneId)
  const [showCharacterManager, setShowCharacterManager] = useState(false)
  const [showSceneBuilder, setShowSceneBuilder] = useState(false)
  const [showCompendium, setShowCompendium] = useState(false)
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
  /** Personal display preference, not synced — each viewer picks 2D or 3D
   * for their own screen independently (see canvas3d/Scene3D.tsx's doc
   * comment for what 3D mode does and doesn't support in v1). */
  const [view3d, setView3d] = useState(false)
  /** Player-only "over-the-shoulder" first-person mode within the 3D view —
   * see canvas3d/Scene3D.tsx's Scene3DProps.perspectiveMode doc comment.
   * Personal, not synced, same as view3d. */
  const [perspectiveMode, setPerspectiveMode] = useState(false)
  // Populated by MapCanvas (always mounted, see below) via onBoardCanvasHandle
  // — Scene3D calls this to render its plane as a live texture of the 2D
  // canvas's own rendering instead of reimplementing it.
  const boardCanvasExtractorRef = useRef<(() => HTMLCanvasElement | null) | null>(null)
  // Side-panel tool tab order — DM and player see different tool sets, so
  // each role's arrangement is saved independently.
  const panelOrder = usePanelOrder(`session:${session?.role ?? 'unknown'}`)
  const sidebarLayout = useSidebarLayout()
  // Tool-select-first sidebar: which single tool's detail panel is showing,
  // instead of a tall stacked accordion of every section at once. Not
  // persisted — defaults back to the first tab each time the screen mounts.
  const [activeSectionId, setActiveSectionId] = useState<string | null>(null)

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

  // Armed from the Compendium screen's "Add to scene" buttons — lives here
  // (not in CompendiumScreen) because pendingTokenPlacement/handlePlaceToken
  // already live here, and closing back to the map is what lets the DM
  // actually click somewhere to place it.
  const handleAddMonsterToScene = (monster: MonsterData) => {
    setPendingTokenPlacement({
      name: monster.name,
      sizeCategory: monsterSizeToCategory(monster.size),
      file: null,
      modelFile: null,
      monsterInit: {
        monsterKey: monster.key,
        hp: { current: monster.hp, max: monster.hp, temp: 0 },
        ac: monster.ac,
        speed: parseSpeedFeet(monster.speed),
      },
      characterInit: null,
      hazardSize: null,
    })
    setShowCompendium(false)
  }

  const handleAddItemToScene = (item: ItemData) => {
    setPendingTokenPlacement({
      name: item.name,
      sizeCategory: 'tiny',
      file: null,
      modelFile: null,
      monsterInit: null,
      characterInit: null,
      hazardSize: null,
    })
    setShowCompendium(false)
  }

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
  if (showCompendium) {
    return (
      <CompendiumScreen
        onBack={() => setShowCompendium(false)}
        onAddMonsterToScene={session.role === 'dm' && activeSceneId ? handleAddMonsterToScene : undefined}
        onAddItemToScene={session.role === 'dm' && activeSceneId ? handleAddItemToScene : undefined}
      />
    )
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
    const { name, sizeCategory, file, modelFile, monsterInit, characterInit, hazardSize } = pendingTokenPlacement
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
      if (modelFile) void setTokenModel(tokenId, modelFile)
      if (monsterInit) initTokenFromMonster(tokenId, monsterInit)
      if (characterInit) {
        linkCharacter(tokenId, characterInit.characterId)
        assignOwner(tokenId, characterInit.ownerId)
      }
    } catch (err) {
      window.alert(err instanceof Error ? err.message : 'Could not add that token.')
    }
  }

  return (
    <section className="session-screen">
      <DiceOverlay />
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

      {broadcastNotification && (
        <BroadcastNotificationBanner
          notification={broadcastNotification}
          monsterEntry={broadcastNotification.monsterKey ? findByKey(compendium, broadcastNotification.monsterKey) : null}
          onDismiss={dismissBroadcast}
        />
      )}

      {session.role === 'dm' && <PendingOverridesBanner doc={session.doc} />}

      <div className="session-screen__body" data-position={sidebarLayout.position}>
        <div
          className="session-screen__panel"
          style={
            sidebarLayout.position === 'left' || sidebarLayout.position === 'right'
              ? { flexBasis: sidebarLayout.size, width: sidebarLayout.size, order: sidebarLayout.position === 'right' ? 3 : 1 }
              : { flexBasis: sidebarLayout.size, height: sidebarLayout.size, order: sidebarLayout.position === 'bottom' ? 3 : 1 }
          }
        >
          <label className="session-screen__sidebar-position">
            Sidebar
            <select
              value={sidebarLayout.position}
              onChange={(e) => sidebarLayout.setPosition(e.target.value as SidebarPosition)}
            >
              <option value="left">Left</option>
              <option value="right">Right</option>
              <option value="top">Top</option>
              <option value="bottom">Bottom</option>
            </select>
          </label>

          {session.role === 'dm' && (
            <div className="session-screen__mode-switcher">
              <button type="button" onClick={() => setShowSceneBuilder(true)}>
                Scene Builder
              </button>
              <button type="button" onClick={() => setShowCharacterManager(true)}>
                Character Builder
              </button>
            </div>
          )}

          {/* Dice, initiative, chat, handouts, and the compendium lookup are
              shared between DM and players — everyone rolls dice and sees
              the initiative order, and a DM can play their own character
              same as anyone. The character sheet itself opens full-screen
              rather than cramming into this narrow sidebar. */}
          <button type="button" onClick={() => setShowCharacterSheetFullscreen(true)}>
            Open character sheet
          </button>
          <button type="button" onClick={() => setShowCompendium(true)}>
            Compendium
          </button>

          {(() => {
            type Section = { id: string; title: string; content: ReactNode }

            const dmOnlySections: Section[] =
              session.role !== 'dm'
                ? []
                : [
                    { id: 'fog-lighting', title: 'Fog & Lighting', content: <FogLightingPanel /> },
                    ...(activeSceneId
                      ? [{ id: 'token-owner', title: 'Token Ownership', content: <TokenOwnerAssign sceneId={activeSceneId} /> }]
                      : []),
                    {
                      id: 'preview-as-player',
                      title: 'Preview As',
                      content: <PreviewAsPlayer previewPlayerId={previewPlayerId} onChange={setPreviewPlayerId} />,
                    },
                    ...(activeSceneId
                      ? [
                          {
                            id: 'token-placement',
                            title: 'Token Placement',
                            content: (
                              <>
                                <TokenUploadButton
                                  sceneId={activeSceneId}
                                  pendingPlacement={pendingTokenPlacement}
                                  onRequestPlacement={setPendingTokenPlacement}
                                  onCancelPlacement={() => setPendingTokenPlacement(null)}
                                />
                                <CharacterTokenMenu
                                  sceneId={activeSceneId}
                                  pendingPlacement={pendingTokenPlacement}
                                  onRequestPlacement={setPendingTokenPlacement}
                                />
                              </>
                            ),
                          },
                        ]
                      : []),
                    { id: 'dm-notes', title: 'DM Notes', content: <DmNotesPanel doc={session.doc} /> },
                    { id: 'handouts-dm', title: 'Handouts', content: <HandoutsPanel doc={session.doc} /> },
                    { id: 'broadcast', title: 'Broadcast', content: <BroadcastComposer doc={session.doc} /> },
                    {
                      id: 'random-generators',
                      title: 'Random Generators',
                      content: <RandomGenerators doc={session.doc} />,
                    },
                    { id: 'soundboard', title: 'Soundboard', content: <SoundboardPanel /> },
                    {
                      id: 'campaign-files',
                      title: 'Campaign Files',
                      content: <CampaignFilesPanel doc={session.doc} sessionName={sessionMeta?.sessionName ?? 'campaign'} />,
                    },
                  ]

            const sharedSections: Section[] = [
              // SceneNavigationPanel itself renders nothing for a player on a
              // 'dungeon'-scale scene (those keep free token movement, no
              // travel/POI UI at all — see its own doc comment) — omitting
              // the section entirely here means a player never sees an empty,
              // pointlessly-selectable "Navigation" tab in that case.
              ...(session.role === 'dm' || activeScene?.scale !== 'dungeon'
                ? [
                    {
                      id: 'scene-navigation',
                      title: 'Navigation',
                      content: (
                        <SceneNavigationPanel
                          pendingPoiPlacement={pendingPoiPlacement}
                          onRequestPoiPlacement={setPendingPoiPlacement}
                          onCancelPoiPlacement={() => setPendingPoiPlacement(null)}
                        />
                      ),
                    },
                  ]
                : []),
              { id: 'annotations', title: 'Annotations & Pings', content: <AnnotationsPanel /> },
              { id: 'party-loot', title: 'Party Loot', content: <PartyLootPanel /> },
              { id: 'session-recap', title: 'Session Recap', content: <SessionRecapPanel /> },
              {
                id: 'dice-roller',
                title: 'Dice Roller',
                content: (
                  <>
                    <DiceRollerPanel />
                    <RollLog />
                  </>
                ),
              },
              { id: 'initiative-tracker', title: 'Initiative', content: <InitiativeTracker onArmTemplate={setArmedTemplate} /> },
              { id: 'chat', title: 'Chat', content: <ChatPanel /> },
            ]

            const playerOnlySections: Section[] =
              session.role !== 'player'
                ? []
                : [
                    {
                      id: 'handouts-player',
                      title: 'Handouts',
                      content: <PlayerHandoutsView doc={session.doc} myPlayerId={getOrCreatePlayerId()} />,
                    },
                  ]

            const allSections = session.role === 'dm' ? [...dmOnlySections, ...sharedSections] : [...sharedSections, ...playerOnlySections]
            const sectionsById = new Map(allSections.map((s) => [s.id, s]))
            const availableIds = allSections.map((s) => s.id)
            const orderedIds = panelOrder.orderedIds(availableIds)
            const activeId = activeSectionId && sectionsById.has(activeSectionId) ? activeSectionId : (orderedIds[0] ?? null)
            const activeSection = activeId ? sectionsById.get(activeId) : null
            const activeIndex = activeId ? orderedIds.indexOf(activeId) : -1

            return (
              <>
                <div className="session-screen__tool-tabs">
                  {orderedIds.map((id) => {
                    const section = sectionsById.get(id)
                    if (!section) return null
                    return (
                      <button
                        key={id}
                        type="button"
                        className={id === activeId ? 'session-screen__tool-tab session-screen__tool-tab--active' : 'session-screen__tool-tab'}
                        onClick={() => setActiveSectionId(id)}
                      >
                        {section.title}
                      </button>
                    )
                  })}
                </div>
                {activeSection && (
                  <div className="session-screen__tool-detail">
                    <div className="session-screen__tool-detail-header">
                      <h3>{activeSection.title}</h3>
                      <div className="session-screen__tool-detail-move">
                        <button
                          type="button"
                          onClick={() => panelOrder.moveUp(activeSection.id, availableIds)}
                          disabled={activeIndex <= 0}
                          title="Move tab earlier"
                        >
                          ←
                        </button>
                        <button
                          type="button"
                          onClick={() => panelOrder.moveDown(activeSection.id, availableIds)}
                          disabled={activeIndex === -1 || activeIndex >= orderedIds.length - 1}
                          title="Move tab later"
                        >
                          →
                        </button>
                      </div>
                    </div>
                    {activeSection.content}
                  </div>
                )}
              </>
            )
          })()}

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

        <SidebarResizeHandle
          axis={sidebarLayout.position === 'left' || sidebarLayout.position === 'right' ? 'x' : 'y'}
          reverse={sidebarLayout.position === 'right' || sidebarLayout.position === 'bottom'}
          size={sidebarLayout.size}
          onResize={sidebarLayout.setSize}
        />

        <div
          className={`session-screen__main${isMapFullscreen ? ' session-screen__main--fullscreen' : ''}`}
          style={{ order: sidebarLayout.position === 'right' || sidebarLayout.position === 'bottom' ? 1 : 3 }}
        >
          {isUnpublishedForPlayer ? (
            <p className="session-screen__notice">Your DM is still setting up this scene. Hang tight!</p>
          ) : (
            <>
              {isUnassignedPlayer && (
                <p className="session-screen__notice">Your DM hasn't assigned you a token on this scene yet.</p>
              )}
              {session.role === 'dm' && <FloorSwitcher doc={session.doc} />}
              {view3d && (
                <Suspense fallback={<p className="session-screen__notice">Loading 3D view…</p>}>
                  <Scene3D
                    getBoardCanvas={() => boardCanvasExtractorRef.current?.() ?? null}
                    selectedTokenId={selectedTokenId}
                    onSelectToken={(tokenId) => setSelectedTokenId((prev) => (prev === tokenId ? null : tokenId))}
                    perspectiveMode={perspectiveMode}
                  />
                </Suspense>
              )}
              {/* Stays mounted (just hidden) even in 3D view — its Pixi
                  renderer keeps computing fog/tokens/walls in the background
                  so Scene3D can read a live, always-correct extraction of it
                  (see MapCanvas's onBoardCanvasHandle doc comment) rather than
                  reimplementing any of that rendering a second time. */}
              <div style={view3d ? { display: 'none' } : undefined}>
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
                  onBoardCanvasHandle={(extract) => {
                    boardCanvasExtractorRef.current = extract
                  }}
                />
              </div>
              <button
                type="button"
                className="session-screen__3d-toggle"
                onClick={() => setView3d((v) => !v)}
                title={view3d ? 'Switch back to the 2D map' : 'Switch to the 3D flat-plane view (STL minis)'}
              >
                {view3d ? '2D map' : '3D view'}
              </button>
              {view3d && session.role !== 'dm' && (
                <button
                  type="button"
                  className="session-screen__perspective-toggle"
                  onClick={() => setPerspectiveMode((v) => !v)}
                  title={
                    perspectiveMode
                      ? 'Switch back to the free-orbit board view'
                      : 'Switch to first-person view, following your own token'
                  }
                >
                  {perspectiveMode ? 'Board view' : 'First-person'}
                </button>
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
