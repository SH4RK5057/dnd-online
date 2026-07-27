import { useEffect, useState } from 'react'
import { useSession } from '../session/useSession'
import { useWalls } from '../map/useWalls'
import { useLights } from '../map/useLights'
import { useTokens } from '../map/useTokens'
import { TokenUploadButton } from './TokenUploadButton'
import { MoveIcon, WallIcon, TorchIcon, TokenPawnIcon } from './icons'
import type { ToolMode } from '../canvas/interactionMode'
import type { PendingTokenPlacement } from '../screens/pendingTokenPlacement'

function colorToHex(color: number): string {
  return '#' + color.toString(16).padStart(6, '0')
}
function hexToColor(hex: string): number {
  return parseInt(hex.slice(1), 16)
}

type OpenPanel = 'walls' | 'lights' | 'tokens' | null

/** DM-only: a slim icon rail floating over the map's left edge, plus a
 * separate options panel floating over its RIGHT edge — deliberately not
 * side by side. They used to be one combined element (icons then a popout
 * immediately to their right), which put an opaque, up-to-300px-wide panel
 * directly over the map right where a DM would naturally click while
 * drawing walls near the top-left — silently swallowing those clicks before
 * they ever reached the canvas. Keeping them on opposite edges leaves the
 * whole map surface clickable except right at each panel's own footprint.
 * Replaces the old always-expanded DrawingToolbar (and TokenUploadButton's
 * sidebar slot) — the rail's `toolMode` icons (Move/Walls/Lights) drive the
 * same exclusive `toolMode` state SessionScreen already owned; Tokens is an
 * independent, non-exclusive popout since token placement is staged via a
 * form and only becomes its own mode once submitted. Annotations/pinging
 * live in Run Campaign instead — they're live-session communication aids,
 * not scene-editing tools, and Scene Builder's canvas disables both outright
 * (see MapCanvas's enablePing/enableAnnotations props). */
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

  const [openPanel, setOpenPanel] = useState<OpenPanel>(null)
  /** Hides the details panel's body while leaving its tool selected and
   * active — distinct from closing it (which deselects the tool and, for
   * walls/lights, drops back to Move). Collapsing is for "I know what I'm
   * doing, get this out of my way for a second," not "I'm done with this
   * tool" — so it must never touch toolMode/openPanel. Re-selecting a tool
   * (including the one already active) always expands back, so a DM never
   * gets stuck wondering why clicking the icon again did nothing. */
  const [collapsed, setCollapsed] = useState(false)

  // A staged token placement (from the compendium's "Add to scene", or a
  // freshly-submitted form in the tokens popout) should surface its "click
  // the map to place" banner even if the rail icon isn't the thing that
  // triggered it.
  useEffect(() => {
    if (pendingPlacement) {
      setOpenPanel('tokens')
      setCollapsed(false)
    }
  }, [pendingPlacement])

  const selectMode = (mode: ToolMode, panel: OpenPanel) => {
    onToolModeChange(mode)
    setOpenPanel(panel)
    setCollapsed(false)
  }

  const toggleNonExclusive = (panel: 'tokens') => {
    setOpenPanel((prev) => (prev === panel ? null : panel))
    setCollapsed(false)
  }

  const closePanel = () => {
    if (openPanel === 'walls' || openPanel === 'lights') onToolModeChange('move')
    setOpenPanel(null)
    setCollapsed(false)
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
  }

  return (
    <>
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
        </div>
      </div>

      {openPanel && (
        <div className={`map-tool-rail__details${collapsed ? ' map-tool-rail__details--collapsed' : ''}`}>
          <div className="map-tool-rail__details-header">
            <h3>{panelTitle[openPanel]}</h3>
            <div className="map-tool-rail__details-actions">
              <button
                type="button"
                className="map-tool-rail__collapse"
                onClick={() => setCollapsed((v) => !v)}
                aria-label={collapsed ? 'Expand' : 'Collapse'}
                title={collapsed ? 'Expand' : 'Collapse — keeps this tool active'}
              >
                {collapsed ? '▸' : '▾'}
              </button>
              <button type="button" className="map-tool-rail__close" onClick={closePanel} aria-label="Close">
                ×
              </button>
            </div>
          </div>

          {!collapsed && (
            <>
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
            </>
          )}
        </div>
      )}
    </>
  )
}
