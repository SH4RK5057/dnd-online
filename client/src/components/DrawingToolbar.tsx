import { useSession } from '../session/useSession'
import { useWalls } from '../map/useWalls'
import { useLights } from '../map/useLights'
import { useTokens } from '../map/useTokens'
import { useAnnotations } from '../map/useAnnotations'
import type { ToolMode } from '../canvas/interactionMode'

function colorToHex(color: number): string {
  return '#' + color.toString(16).padStart(6, '0')
}
function hexToColor(hex: string): number {
  return parseInt(hex.slice(1), 16)
}

export function DrawingToolbar({
  sceneId,
  toolMode,
  onToolModeChange,
  snapWalls,
  onSnapWallsChange,
}: {
  sceneId: string
  toolMode: ToolMode
  onToolModeChange: (mode: ToolMode) => void
  snapWalls: boolean
  onSnapWallsChange: (snap: boolean) => void
}) {
  const { session } = useSession()
  const doc = session?.doc ?? null
  const { walls, deleteWall } = useWalls(doc, sceneId)
  const { lights, setLightRadius, setLightColor, setLightEnabled, attachLightToToken, detachLight, deleteLight } =
    useLights(doc, sceneId)
  const { tokens } = useTokens(doc, sceneId)
  const { annotations, clearAll: clearAllAnnotations } = useAnnotations(doc, sceneId, true)

  const handleClearWalls = () => {
    if (walls.length === 0) return
    if (window.confirm(`Delete all ${walls.length} wall segment(s) on this scene?`)) {
      for (const wall of walls) deleteWall(wall.id)
    }
  }

  return (
    <div className="drawing-toolbar">
      <div className="drawing-toolbar__modes">
        <button type="button" aria-pressed={toolMode === 'move'} onClick={() => onToolModeChange('move')}>
          Move
        </button>
        <button type="button" aria-pressed={toolMode === 'draw-walls'} onClick={() => onToolModeChange('draw-walls')}>
          Draw Walls
        </button>
        <button type="button" aria-pressed={toolMode === 'place-lights'} onClick={() => onToolModeChange('place-lights')}>
          Place Lights
        </button>
        <button type="button" aria-pressed={toolMode === 'place-pois'} onClick={() => onToolModeChange('place-pois')}>
          Place POIs
        </button>
      </div>

      {toolMode === 'draw-walls' && (
        <div className="drawing-toolbar__panel">
          <p className="drawing-toolbar__hint">
            Click to start a wall, click again to add a segment and keep going. Right-click to finish. Shift-click a
            wall to delete it. Drag an existing endpoint to move it.
          </p>
          <label>
            <input
              type="checkbox"
              checked={snapWalls}
              onChange={(event) => onSnapWallsChange(event.target.checked)}
            />
            Snap to grid
          </label>
          <button type="button" onClick={handleClearWalls} disabled={walls.length === 0}>
            Clear all walls ({walls.length})
          </button>
        </div>
      )}

      <div className="drawing-toolbar__panel">
        <p className="drawing-toolbar__hint">
          Shift-drag anywhere on empty map to sketch a temporary annotation — works for everyone in any tool mode,
          and fades away on its own after about a minute.
        </p>
        <button type="button" onClick={clearAllAnnotations} disabled={annotations.length === 0}>
          Clear all annotations ({annotations.length})
        </button>
      </div>

      {toolMode === 'place-lights' && (
        <div className="drawing-toolbar__panel drawing-toolbar__panel--column">
          <p className="drawing-toolbar__hint">
            Click empty space to place a light. Drag an existing one to move it (this detaches it from its token, if
            any). Shift-click to delete.
          </p>
          {lights.length > 0 && (
            <ul className="light-list">
              {lights.map((light) => (
                <li key={light.id} className="light-list__item">
                  <input
                    type="color"
                    value={colorToHex(light.color)}
                    onChange={(event) => setLightColor(light.id, hexToColor(event.target.value))}
                    title="Light color"
                  />
                  <input
                    type="number"
                    min={1}
                    max={60}
                    value={light.radius}
                    onChange={(event) => setLightRadius(light.id, Number(event.target.value))}
                    title="Radius (grid cells)"
                  />
                  <select
                    value={light.attachedTokenId ?? ''}
                    onChange={(event) =>
                      event.target.value ? attachLightToToken(light.id, event.target.value) : detachLight(light.id)
                    }
                  >
                    <option value="">Unattached</option>
                    {tokens.map((token) => (
                      <option key={token.id} value={token.id}>
                        {token.name}
                      </option>
                    ))}
                  </select>
                  <label>
                    <input
                      type="checkbox"
                      checked={light.enabled}
                      onChange={(event) => setLightEnabled(light.id, event.target.checked)}
                    />
                    On
                  </label>
                  <button type="button" onClick={() => deleteLight(light.id)}>
                    Delete
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  )
}
