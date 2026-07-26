import { useEffect, useState } from 'react'
import { useSession } from '../session/useSession'
import { useScenes } from '../map/useScenes'
import { useTokens } from '../map/useTokens'
import { SceneToolbar } from '../components/SceneToolbar'
import { MapToolRail } from '../components/MapToolRail'
import { TokenOwnerAssign } from '../components/TokenOwnerAssign'
import { PreviewAsPlayer } from '../components/PreviewAsPlayer'
import { CompendiumDrawer } from '../components/CompendiumDrawer'
import { HomebrewEditor } from '../components/HomebrewEditor'
import { RuleOverridesPanel } from '../components/RuleOverridesPanel'
import { MapCanvas } from '../canvas/MapCanvas'
import { monsterSizeToCategory, parseSpeedFeet } from '../content/monsterToToken'
import { footprintCells, snapToSlot } from '../map/sizeCategory'
import { FullscreenEnterIcon, FullscreenExitIcon } from '../components/icons'
import { DEFAULT_WALL_THICKNESS_PX } from '../canvas/WallLayer'
import type { MonsterData } from '../content/types'
import type { ToolMode } from '../canvas/interactionMode'
import type { PendingTokenPlacement } from './pendingTokenPlacement'

/** DM-only: designing/editing a scene's structure — walls, lights, tokens,
 * grid/fog settings, and the content (compendium/homebrew/rule overrides)
 * that populates it. Fully swaps out SessionScreen the same way
 * CharacterManagerScreen does — the session/WebRTC connection underneath
 * stays alive, this is just a different view over the same campaign doc.
 * Splitting this out from "Run Campaign" keeps the live-play screen free of
 * editing tools it doesn't need turn-to-turn. */
export function SceneBuilderScreen({ onBack }: { onBack: () => void }) {
  const { session } = useSession()
  const doc = session?.doc ?? null
  const { activeSceneId, activeScene } = useScenes(doc)
  const { createToken, setTokenArt, initTokenFromMonster } = useTokens(doc, activeSceneId)

  const [toolMode, setToolMode] = useState<ToolMode>('move')
  const [snapWalls, setSnapWalls] = useState(false)
  const [wallThickness, setWallThickness] = useState(DEFAULT_WALL_THICKNESS_PX)
  const [isMapFullscreen, setIsMapFullscreen] = useState(false)
  const [pendingPlacement, setPendingPlacement] = useState<PendingTokenPlacement | null>(null)
  const [previewPlayerId, setPreviewPlayerId] = useState<string | null>(null)
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

  useEffect(() => {
    if (!isMapFullscreen) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setIsMapFullscreen(false)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [isMapFullscreen])

  const isPreviewingPlayer = previewPlayerId !== null
  const effectiveToolMode: ToolMode = isPreviewingPlayer ? 'move' : pendingPlacement ? 'place-tokens' : toolMode

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

  if (!session) return null

  return (
    <section className="session-screen">
      <header className="session-screen__header">
        <h1>Scene Builder</h1>
        <button type="button" onClick={onBack}>
          Back
        </button>
      </header>

      <div className="session-screen__body">
        <div className="session-screen__panel">
          <SceneToolbar />

          {activeSceneId && <TokenOwnerAssign sceneId={activeSceneId} />}

          <PreviewAsPlayer previewPlayerId={previewPlayerId} onChange={setPreviewPlayerId} />

          <button type="button" onClick={() => setShowCompendium((v) => !v)}>
            {showCompendium ? 'Hide compendium' : 'Show compendium'}
          </button>
          {showCompendium && (
            <CompendiumDrawer
              doc={doc}
              isDm
              onAddMonsterToScene={activeSceneId && !isPreviewingPlayer ? handleAddMonsterToScene : undefined}
            />
          )}

          <button type="button" onClick={() => setShowHomebrewEditor((v) => !v)}>
            {showHomebrewEditor ? 'Hide homebrew editor' : 'Show homebrew editor'}
          </button>
          {showHomebrewEditor && <HomebrewEditor doc={doc} />}

          <button type="button" onClick={() => setShowRuleOverrides((v) => !v)}>
            {showRuleOverrides ? 'Hide rule overrides' : 'Show rule overrides'}
          </button>
          {showRuleOverrides && <RuleOverridesPanel doc={doc} activeSceneId={activeSceneId} />}
        </div>

        <div className={`session-screen__main${isMapFullscreen ? ' session-screen__main--fullscreen' : ''}`}>
          <MapCanvas
            toolMode={effectiveToolMode}
            snapWalls={snapWalls}
            wallThickness={wallThickness}
            onPlaceToken={handlePlaceToken}
            previewPlayerId={previewPlayerId}
          />
          {activeSceneId && !isPreviewingPlayer && (
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
        </div>
      </div>

      {!activeScene && <p className="session-screen__notice">Create a scene to start building.</p>}
    </section>
  )
}
