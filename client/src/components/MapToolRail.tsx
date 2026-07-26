import { useEffect, useState } from 'react'
import { useSession } from '../session/useSession'
import { useWalls } from '../map/useWalls'
import { useLights } from '../map/useLights'
import { useTokens } from '../map/useTokens'
import { useAnnotations } from '../map/useAnnotations'
import { TokenUploadButton } from './TokenUploadButton'
import { MoveIcon, WallIcon, TorchIcon, TokenPawnIcon, QuillIcon } from './icons'
import type { ToolMode } from '../canvas/interactionMode'
import type { PendingTokenPlacement } from '../screens/pendingTokenPlacement'

function colorToHex(color: number): string {
  return '#' + color.toString(16).padStart(6, '0')
}
function hexToColor(hex: string): number {
  return parseInt(hex.slice(1), 16)
}

type OpenPanel = 'walls' | 'lights' | 'tokens' | 'annotations' | null

/** DM-only floating tool rail over the left edge of the map: a strip of icon
 * buttons for each map-editing tool, with that tool's options appearing in a
 * popout panel to the right. Replaces the old always-expanded DrawingToolbar
 * (and TokenUploadButton's sidebar slot) — the rail's `toolMode` icons (Move/
 * Walls/Lights) drive the same exclusive `toolMode` state SessionScreen
 * already owned; Tokens and Annotations are independent, non-exclusive
 * popouts since neither corresponds 1:1 with the interaction mode (token
 * placement is staged via a form and only becomes its own mode once
 * submitted, and shift-drag annotations work regardless of the active tool). */
export function MapToolRail({
  sceneId,
  toolMode,
  onToolModeChange,
  snapWalls,
  onSnapWallsChange,
  wallThickness,
  onWallThicknessChange,
  pendingPlacement,
  onRequestPlacement,
  onCancelPlacement,
}: {
  sceneId: string
  toolMode: ToolMode
  onToolModeChange: (mode: ToolMode) => void
  snapWalls: boolean
  onSnapWallsChange: (snap: boolean) => void
  wallThickness: number
  onWallThicknessChange: (thickness: number) => void
  pendingPlacement: PendingTokenPlacement | null
  onRequestPlacement: (placement: PendingTokenPlacement) => void
  onCancelPlacement: () => void
}) {
  const { session } = useSession()
  const doc = session?.doc ?? null
  const { walls, deleteWall } = useWalls(doc, sceneId)
  const { lights, setLightRadius, setLightColor, setLightEnabled, attachLightToToken, detachLight, deleteLight } =
    useLights(doc, sceneId)
  const { tokens } = useTokens(doc, sceneId)
  const { annotations, clearAll: clearAllAnnotations } = useAnnotations(doc, sceneId, true)

  const [openPanel, setOpenPanel] = useState<OpenPanel>(null)

  // A staged token placement (from the compendium's "Add to scene", or a
  // freshly-submitted form in the tokens popout) should surface its "click
  // the map to place" banner even if the rail icon isn't the thing that
  // triggered it.
  useEffect(() => {
    if (pendingPlacement) setOpenPanel('tokens')
  }, [pendingPlacement])

  const selectMode = (mode: ToolMode, panel: OpenPanel) => {
    onToolModeChange(mode)
    setOpenPanel(panel)
  }

  const toggleNonExclusive = (panel: 'tokens' | 'annotations') => {
    setOpenPanel((prev) => (prev === panel ? null : panel))
  }

  const closePanel = () => {
    if (openPanel === 'walls' || openPanel === 'lights') onToolModeChange('move')
    setOpenPanel(null)
  }

  const handleClearWalls = () => {
    if (walls.length === 0) return
    if (window.confirm(`Delete all ${walls.length} wall segment(s) on this scene?`)) {
      for (const wall of walls) deleteWall(wall.id)
    }
  }

  const panelTitle: Record<Exclude<OpenPanel, null>, string> = {
    walls: 'Draw Walls',
    lights: 'Place Lights',
    tokens: 'Place Tokens',
    annotations: 'Annotations',
  }

  return (
    <div className="map-tool-rail">
      <div className="map-tool-rail__icons">
        <button type="button" aria-pressed={toolMode === 'move'} title="Move & pan" onClick={() => selectMode('move', null)}>
          <MoveIcon />
        </button>
        <button
          type="button"
          aria-pressed={toolMode === 'draw-walls'}
          title="Draw walls"
          onClick={() => selectMode('draw-walls', 'walls')}
        >
          <WallIcon />
        </button>
        <button
          type="button"
          aria-pressed={toolMode === 'place-lights'}
          title="Place lights"
          onClick={() => selectMode('place-lights', 'lights')}
        >
          <TorchIcon />
        </button>
        <button type="button" aria-pressed={openPanel === 'tokens'} title="Place tokens" onClick={() => toggleNonExclusive('tokens')}>
          <TokenPawnIcon />
        </button>
        <div className="map-tool-rail__divider" />
        <button
          type="button"
          aria-pressed={openPanel === 'annotations'}
          title="Annotations"
          onClick={() => toggleNonExclusive('annotations')}
        >
          <QuillIcon />
        </button>
      </div>

      {openPanel && (
        <div className="map-tool-rail__popout">
          <div className="map-tool-rail__popout-header">
            <h3>{panelTitle[openPanel]}</h3>
            <button type="button" className="map-tool-rail__close" onClick={closePanel} aria-label="Close">
              ×
            </button>
          </div>

          {openPanel === 'walls' && (
            <div className="map-tool-rail__popout-body">
              <p className="map-tool-rail__hint">
                Click to start a wall, click again to add a segment and keep going. Right-click to finish.
                Shift-click a wall to delete it. Drag an existing endpoint to move it.
              </p>
              <label>
                <input type="checkbox" checked={snapWalls} onChange={(event) => onSnapWallsChange(event.target.checked)} />
                Snap to grid
              </label>
              <label className="map-tool-rail__thickness">
                Thickness
                <input
                  type="range"
                  min={1}
                  max={12}
                  value={wallThickness}
                  onChange={(event) => onWallThicknessChange(Number(event.target.value))}
                />
                <span>{wallThickness}px</span>
              </label>
              <button type="button" onClick={handleClearWalls} disabled={walls.length === 0}>
                Clear all walls ({walls.length})
              </button>
            </div>
          )}

          {openPanel === 'lights' && (
            <div className="map-tool-rail__popout-body">
              <p className="map-tool-rail__hint">
                Click empty space to place a light. Drag an existing one to move it (this detaches it from its
                token, if any). Shift-click to delete.
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

          {openPanel === 'tokens' && (
            <div className="map-tool-rail__popout-body">
              <TokenUploadButton
                sceneId={sceneId}
                pendingPlacement={pendingPlacement}
                onRequestPlacement={onRequestPlacement}
                onCancelPlacement={onCancelPlacement}
              />
            </div>
          )}

          {openPanel === 'annotations' && (
            <div className="map-tool-rail__popout-body">
              <p className="map-tool-rail__hint">
                Shift-drag anywhere on empty map to sketch a temporary annotation — works for everyone in any tool
                mode, and fades away on its own after about a minute.
              </p>
              <button type="button" onClick={clearAllAnnotations} disabled={annotations.length === 0}>
                Clear all annotations ({annotations.length})
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
