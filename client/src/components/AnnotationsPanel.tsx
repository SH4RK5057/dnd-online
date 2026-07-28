import { useSession } from '../session/useSession'
import { useScenes } from '../map/useScenes'
import { useAnnotations } from '../map/useAnnotations'

/** Live-session communication aids: shift-drag anywhere on the map to sketch
 * a temporary annotation (works for DM and players alike, in any mode), and
 * double-click to ping a location. Neither needs its own UI to work — this
 * panel is just the hint text plus a DM-only "clear all" for annotations,
 * matching FogLightingPanel's reasoning for why these live in Run Campaign
 * rather than Scene Builder: they're things you reach for while playing, not
 * while building. */
export function AnnotationsPanel() {
  const { session } = useSession()
  const doc = session?.doc ?? null
  const isDm = session?.role === 'dm'
  const { activeSceneId } = useScenes(doc)
  const { annotations, clearAll } = useAnnotations(doc, activeSceneId, isDm)

  if (!doc) return null

  return (
    <section className="scene-toolbar__section">
      <h3 className="scene-toolbar__heading">Annotations &amp; pings</h3>
      <p className="scene-toolbar__hint">
        Shift-drag anywhere on the map to sketch a temporary annotation — it fades away on its own after about a
        minute. Double-click anywhere to ping that spot for everyone.
      </p>
      <p className="scene-toolbar__hint">
        Ctrl-drag to measure distance. Ctrl+Shift-drag to preview a circle AoE template; Ctrl+Alt-drag for a cone.
        These are personal — only you see your own measurement — and work for the DM and players alike.
      </p>
      {isDm && (
        <button type="button" onClick={clearAll} disabled={annotations.length === 0}>
          Clear all annotations ({annotations.length})
        </button>
      )}
    </section>
  )
}
