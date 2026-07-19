import { useSession } from '../session/useSession'
import { useWalls } from '../map/useWalls'
import type { ToolMode } from '../canvas/interactionMode'

export function DrawingToolbar({
  sceneId,
  toolMode,
  onToolModeChange,
}: {
  sceneId: string
  toolMode: ToolMode
  onToolModeChange: (mode: ToolMode) => void
}) {
  const { session } = useSession()
  const doc = session?.doc ?? null
  const { walls, deleteWall } = useWalls(doc, sceneId)

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
      </div>

      {toolMode === 'draw-walls' && (
        <div className="drawing-toolbar__panel">
          <p className="drawing-toolbar__hint">
            Click to start a wall, click again to add a segment and keep going. Right-click to finish. Shift-click a
            wall to delete it.
          </p>
          <button type="button" onClick={handleClearWalls} disabled={walls.length === 0}>
            Clear all walls ({walls.length})
          </button>
        </div>
      )}
    </div>
  )
}
