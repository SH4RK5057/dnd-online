import { useEffect, useState } from 'react'
import { useSession } from '../session/useSession'
import { useScenes } from '../map/useScenes'
import { useTokens } from '../map/useTokens'
import { SceneToolbar } from '../components/SceneToolbar'
import { MapToolRail } from '../components/MapToolRail'
import { CompendiumDrawer } from '../components/CompendiumDrawer'
import { HomebrewEditor } from '../components/HomebrewEditor'
import { RuleOverridesPanel } from '../components/RuleOverridesPanel'
import { MapCanvas } from '../canvas/MapCanvas'
import { monsterSizeToCategory, parseSpeedFeet } from '../content/monsterToToken'
import { footprintCells, snapToSlot } from '../map/sizeCategory'
import { FullscreenEnterIcon, FullscreenExitIcon } from '../components/icons'
import { DEFAULT_WALL_THICKNESS_PX } from '../canvas/WallLayer'
import type { ItemData, MonsterData } from '../content/types'
import type { ToolMode } from '../canvas/interactionMode'
import type { PendingTokenPlacement } from './pendingTokenPlacement'

/** DM-only: designing/editing a scene's structure — walls, lights, tokens,
 * grid/fog settings, and the content (compendium/homebrew/rule overrides)
 * that populates it. Fully swaps out SessionScreen the same way
 * CharacterManagerScreen does — the session/WebRTC connection underneath
 * stays alive, this is just a different view over the same campaign doc.
 * Splitting this out from "Run Campaign" keeps the live-play screen free of
 * editing tools it doesn't need turn-to-turn. Live vision/fog controls and
 * token-ownership assignment live in Run Campaign instead — this screen's
 * DM view is always the plain unmasked one, no preview-as-player here. */
export function SceneBuilderScreen({ onBack }: { onBack: () => void }) {
  const { session } = useSession()
  const doc = session?.doc ?? null
  const { activeSceneId, activeScene } = useScenes(doc)
  const { createToken, setTokenArt, setTokenModel, initTokenFromMonster } = useTokens(doc, activeSceneId)

  const [toolMode, setToolMode] = useState<ToolMode>('move')
  const [snapWalls, setSnapWalls] = useState(false)
  const [wallThickness, setWallThickness] = useState(DEFAULT_WALL_THICKNESS_PX)
  const [wallDoorMode, setWallDoorMode] = useState(false)
  const [isMapFullscreen, setIsMapFullscreen] = useState(false)
  const [pendingPlacement, setPendingPlacement] = useState<PendingTokenPlacement | null>(null)
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

  const effectiveToolMode: ToolMode = pendingPlacement ? 'place-tokens' : toolMode

  const handlePlaceToken = (x: number, y: number) => {
    if (!pendingPlacement || !activeSceneId) return
    const { name, sizeCategory, file, modelFile, monsterInit, hazardSize } = pendingPlacement
    setPendingPlacement(null)
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
    } catch (err) {
      window.alert(err instanceof Error ? err.message : 'Could not add that token.')
    }
  }

  const handleAddMonsterToScene = (monster: MonsterData) => {
    setPendingPlacement({
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
  }

  const handleAddItemToScene = (item: ItemData) => {
    setPendingPlacement({
      name: item.name,
      sizeCategory: 'tiny',
      file: null,
      modelFile: null,
      monsterInit: null,
      characterInit: null,
      hazardSize: null,
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

          <button type="button" onClick={() => setShowCompendium((v) => !v)}>
            {showCompendium ? 'Hide compendium' : 'Show compendium'}
          </button>
          {showCompendium && (
            <CompendiumDrawer
              doc={doc}
              isDm
              onAddMonsterToScene={activeSceneId ? handleAddMonsterToScene : undefined}
              onAddItemToScene={activeSceneId ? handleAddItemToScene : undefined}
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
            wallDoorMode={wallDoorMode}
            onPlaceToken={handlePlaceToken}
            enablePing={false}
            enableAnnotations={false}
          />
          {activeSceneId && (
            <MapToolRail
              sceneId={activeSceneId}
              toolMode={toolMode}
              onToolModeChange={setToolMode}
              snapWalls={snapWalls}
              onSnapWallsChange={setSnapWalls}
              wallThickness={wallThickness}
              onWallThicknessChange={setWallThickness}
              wallDoorMode={wallDoorMode}
              onWallDoorModeChange={setWallDoorMode}
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
