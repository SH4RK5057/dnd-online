import { useRef, useState, type ChangeEvent, type FormEvent } from 'react'
import { useSession } from '../session/useSession'
import { useScenes } from '../map/useScenes'

export function SceneToolbar() {
  const { session } = useSession()
  const doc = session?.doc ?? null
  const { scenes, activeSceneId, activeScene, createScene, switchToScene, renameScene, deleteScene, setSceneMap, updateGrid } =
    useScenes(doc)

  const [newSceneName, setNewSceneName] = useState('')
  const [mapUploading, setMapUploading] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  if (!doc) return null

  const handleCreateScene = (event: FormEvent) => {
    event.preventDefault()
    const name = newSceneName.trim()
    if (!name) return
    createScene(name)
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
      </div>

      <form className="scene-toolbar__row" onSubmit={handleCreateScene}>
        <input
          value={newSceneName}
          onChange={(event) => setNewSceneName(event.target.value)}
          placeholder="New scene name"
        />
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
          </div>
        </>
      )}
    </div>
  )
}
