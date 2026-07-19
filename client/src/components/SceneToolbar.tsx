import { useRef, useState, type ChangeEvent, type FormEvent } from 'react'
import { useSession } from '../session/useSession'
import { useScenes } from '../map/useScenes'
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
    publishScene,
    setAmbientBrightness,
    togglePersistentFog,
    resetExploration,
  } = useScenes(doc)

  const [newSceneName, setNewSceneName] = useState('')
  const [newScenePresetId, setNewScenePresetId] = useState(SCENE_PRESETS[0].id)
  const [mapUploading, setMapUploading] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

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

  const handleResetExploration = () => {
    if (!activeScene) return
    if (window.confirm(`Reset players' memory of "${activeScene.name}"? They'll see it fogged again until they re-explore.`)) {
      resetExploration(activeScene.id)
    }
  }

  return (
    <div className="scene-toolbar">
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

      {activeScene && (
        <>
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
            <label htmlFor="fog-enabled">
              <input
                id="fog-enabled"
                type="checkbox"
                checked={activeScene.fogEnabled}
                onChange={(event) => toggleFog(activeScene.id, event.target.checked)}
              />
              Fog of war
            </label>
            <label htmlFor="ambient-brightness">
              Ambient light ({Math.round((activeScene.ambientBrightness ?? 1) * 100)}%)
            </label>
            <input
              id="ambient-brightness"
              type="range"
              min={0}
              max={100}
              value={Math.round((activeScene.ambientBrightness ?? 1) * 100)}
              onChange={(event) => setAmbientBrightness(activeScene.id, Number(event.target.value) / 100)}
            />
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

          {activeScene.fogEnabled && (
            <div className="scene-toolbar__row">
              <label htmlFor="persistent-fog-enabled">
                <input
                  id="persistent-fog-enabled"
                  type="checkbox"
                  checked={activeScene.persistentFogEnabled ?? true}
                  onChange={(event) => togglePersistentFog(activeScene.id, event.target.checked)}
                />
                Remember explored areas
              </label>
              <button type="button" onClick={handleResetExploration}>
                Reset players' memory of this scene
              </button>
            </div>
          )}

          <div className="scene-toolbar__row">
            <label htmlFor="scene-published">
              <input
                id="scene-published"
                type="checkbox"
                checked={activeScene.published !== false}
                onChange={(event) => publishScene(activeScene.id, event.target.checked)}
              />
              Visible to players
            </label>
            {activeScene.published === false && (
              <span className="scene-toolbar__hint">Players see a "not ready yet" message until you turn this on.</span>
            )}
          </div>
        </>
      )}
    </div>
  )
}
