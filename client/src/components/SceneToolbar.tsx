import { useRef, useState, type ChangeEvent, type FormEvent } from 'react'
import { useSession } from '../session/useSession'
import { useScenes } from '../map/useScenes'
import { exportScene, importSceneFile } from '../dmtools/sceneFile'
import { readJsonFile } from '../dmtools/fileUtils'
import { BLANK_SCENE_HEIGHT_CELLS, BLANK_SCENE_WIDTH_CELLS } from '../map/constants'
import type { GridType } from '../map/types'

interface ScenePreset {
  id: string
  label: string
  fogEnabled: boolean
  ambientBrightness: number
  gridType: GridType
}

const SCENE_PRESETS: ScenePreset[] = [
  { id: 'blank', label: 'Blank (bright, no fog)', fogEnabled: false, ambientBrightness: 1, gridType: 'square' },
  { id: 'dungeon', label: 'Dungeon (dark, fog on)', fogEnabled: true, ambientBrightness: 0.15, gridType: 'square' },
  { id: 'outdoor', label: 'Outdoor (bright, fog on)', fogEnabled: true, ambientBrightness: 1, gridType: 'square' },
  { id: 'outdoor-hex', label: 'Outdoor, hex grid (bright, fog on)', fogEnabled: true, ambientBrightness: 1, gridType: 'hex' },
]

export function SceneToolbar() {
  const { session } = useSession()
  const doc = session?.doc ?? null
  const {
    scenes,
    activeSceneId,
    activeScene,
    createScene,
    switchToScene,
    renameScene,
    deleteScene,
    resetScene,
    setSceneMap,
    updateGrid,
    toggleFog,
    setAmbientBrightness,
  } = useScenes(doc)

  const [newSceneName, setNewSceneName] = useState('')
  const [newScenePresetId, setNewScenePresetId] = useState(SCENE_PRESETS[0].id)
  const [mapUploading, setMapUploading] = useState(false)
  const [sceneImportError, setSceneImportError] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const sceneFileInputRef = useRef<HTMLInputElement>(null)

  if (!doc) return null

  const handleCreateScene = (event: FormEvent) => {
    event.preventDefault()
    const name = newSceneName.trim()
    if (!name) return
    const id = createScene(name)
    const preset = SCENE_PRESETS.find((p) => p.id === newScenePresetId)
    if (preset) {
      updateGrid(id, { gridType: preset.gridType })
      toggleFog(id, preset.fogEnabled)
      setAmbientBrightness(id, preset.ambientBrightness)
    }
    setNewSceneName('')
  }

  const handleMapUpload = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file || !activeScene) return
    setMapUploading(true)
    try {
      await setSceneMap(activeScene.id, file)
    } catch (err) {
      window.alert(err instanceof Error ? err.message : 'Could not upload that image.')
    } finally {
      setMapUploading(false)
    }
  }

  const handleDeleteScene = () => {
    if (!activeScene) return
    if (scenes.length <= 1) {
      window.alert("Can't delete the only scene.")
      return
    }
    if (window.confirm(`Delete scene "${activeScene.name}"? This removes its map and tokens.`)) {
      deleteScene(activeScene.id)
    }
  }

  const handleResetScene = () => {
    if (!activeScene) return
    if (window.confirm(`Reset scene "${activeScene.name}" back to blank? This removes its map, tokens, walls, and lights.`)) {
      resetScene(activeScene.id)
    }
  }

  const handleImportScene = async (file: File | undefined) => {
    if (!doc || !file) return
    setSceneImportError(null)
    try {
      const parsed = await readJsonFile(file)
      const newSceneId = importSceneFile(doc, parsed)
      if (!newSceneId) {
        setSceneImportError('Not a recognizable scene file.')
        return
      }
      await switchToScene(newSceneId)
    } catch (err) {
      setSceneImportError(err instanceof Error ? err.message : 'Could not import that file.')
    } finally {
      if (sceneFileInputRef.current) sceneFileInputRef.current.value = ''
    }
  }

  return (
    <div className="scene-toolbar">
      <section className="scene-toolbar__section">
        <h3 className="scene-toolbar__heading">Scene</h3>
        <div className="scene-toolbar__row">
          <label htmlFor="scene-select">Scene</label>
          <select
            id="scene-select"
            value={activeSceneId ?? ''}
            onChange={(event) => void switchToScene(event.target.value)}
          >
            {scenes.length === 0 && <option value="">No scenes yet</option>}
            {scenes.map((scene) => (
              <option key={scene.id} value={scene.id}>
                {scene.name}
              </option>
            ))}
          </select>
          <button type="button" onClick={handleDeleteScene} disabled={!activeScene}>
            Delete scene
          </button>
          <button type="button" onClick={handleResetScene} disabled={!activeScene}>
            Reset scene
          </button>
        </div>

        <div className="scene-toolbar__row">
          <button
            type="button"
            onClick={() => activeScene && exportScene(doc, activeScene.id)}
            disabled={!activeScene}
          >
            Export this scene
          </button>
          <label htmlFor="scene-import-file">Import scene file</label>
          <input
            id="scene-import-file"
            ref={sceneFileInputRef}
            type="file"
            accept=".json"
            onChange={(event) => void handleImportScene(event.target.files?.[0])}
          />
        </div>
        {sceneImportError && <p className="compendium-drawer__errors">{sceneImportError}</p>}

        <form className="scene-toolbar__row" onSubmit={handleCreateScene}>
          <input
            value={newSceneName}
            onChange={(event) => setNewSceneName(event.target.value)}
            placeholder="New scene name"
          />
          <select value={newScenePresetId} onChange={(event) => setNewScenePresetId(event.target.value)}>
            {SCENE_PRESETS.map((preset) => (
              <option key={preset.id} value={preset.id}>
                {preset.label}
              </option>
            ))}
          </select>
          <button type="submit" disabled={!newSceneName.trim()}>
            Add scene
          </button>
        </form>
      </section>

      {activeScene && (
        <>
          <section className="scene-toolbar__section">
            <h3 className="scene-toolbar__heading">Map</h3>
            <div className="scene-toolbar__row">
              <label htmlFor="scene-name">Name</label>
              <input
                id="scene-name"
                value={activeScene.name}
                onChange={(event) => renameScene(activeScene.id, event.target.value)}
              />
            </div>

            <div className="scene-toolbar__row">
              <button type="button" onClick={() => fileInputRef.current?.click()} disabled={mapUploading}>
                {mapUploading ? 'Uploading…' : activeScene.mapAssetId ? 'Replace map image' : 'Upload map image'}
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={(event) => void handleMapUpload(event)}
                hidden
              />
            </div>
          </section>

          <section className="scene-toolbar__section">
            <h3 className="scene-toolbar__heading">Grid</h3>
            <div className="scene-toolbar__row">
              <label htmlFor="grid-size">Grid size (px)</label>
              <input
                id="grid-size"
                type="number"
                min={8}
                max={512}
                value={activeScene.gridSizePx}
                onChange={(event) => updateGrid(activeScene.id, { gridSizePx: Number(event.target.value) })}
              />
              <label htmlFor="grid-visible">
                <input
                  id="grid-visible"
                  type="checkbox"
                  checked={activeScene.gridVisible}
                  onChange={(event) => updateGrid(activeScene.id, { gridVisible: event.target.checked })}
                />
                Show grid
              </label>
              <label htmlFor="grid-type">Grid style</label>
              <select
                id="grid-type"
                value={activeScene.gridType ?? 'square'}
                onChange={(event) => updateGrid(activeScene.id, { gridType: event.target.value as 'square' | 'hex' })}
              >
                <option value="square">Square</option>
                <option value="hex">Hexagon</option>
              </select>
            </div>

            {!activeScene.mapAssetId && (
              <div className="scene-toolbar__row">
                <label htmlFor="blank-width">Canvas size (cells), no background yet</label>
                <input
                  id="blank-width"
                  type="number"
                  min={5}
                  max={200}
                  value={activeScene.blankWidthCells ?? BLANK_SCENE_WIDTH_CELLS}
                  onChange={(event) => updateGrid(activeScene.id, { blankWidthCells: Number(event.target.value) })}
                  title="Width (cells)"
                />
                <span>×</span>
                <input
                  id="blank-height"
                  type="number"
                  min={5}
                  max={200}
                  value={activeScene.blankHeightCells ?? BLANK_SCENE_HEIGHT_CELLS}
                  onChange={(event) => updateGrid(activeScene.id, { blankHeightCells: Number(event.target.value) })}
                  title="Height (cells)"
                />
              </div>
            )}
          </section>
        </>
      )}
    </div>
  )
}
