import { useSession } from '../session/useSession'
import { useScenes } from '../map/useScenes'

/** DM-only: live vision/lighting controls for whichever scene is currently
 * active — fog of war, ambient light, persistent exploration memory, shared
 * vision, and publishing the scene to players. These are things a DM
 * naturally reaches for while actually running a session (dim the room,
 * turn on fog before a fight, reveal the scene once it's ready), not while
 * building one, so this lives in the main session view rather than Scene
 * Builder — unlike SceneToolbar's scene/map/grid sections, which are
 * structural and stay there. */
export function FogLightingPanel() {
  const { session } = useSession()
  const doc = session?.doc ?? null
  const {
    activeScene,
    toggleFog,
    publishScene,
    setAmbientBrightness,
    togglePersistentFog,
    resetExploration,
    toggleSharedVision,
  } = useScenes(doc)

  if (!doc || !activeScene) return null

  const handleResetExploration = () => {
    if (window.confirm(`Reset players' memory of "${activeScene.name}"? They'll see it fogged again until they re-explore.`)) {
      resetExploration(activeScene.id)
    }
  }

  return (
    <section className="scene-toolbar__section">
      <h3 className="scene-toolbar__heading">Fog &amp; lighting</h3>
      <div className="scene-toolbar__row">
        <label htmlFor="fog-enabled">
          <input
            id="fog-enabled"
            type="checkbox"
            checked={activeScene.fogEnabled}
            onChange={(event) => toggleFog(activeScene.id, event.target.checked)}
          />
          Fog of war
        </label>
        <label htmlFor="ambient-brightness">Ambient light ({Math.round((activeScene.ambientBrightness ?? 1) * 100)}%)</label>
        <input
          id="ambient-brightness"
          type="range"
          min={0}
          max={100}
          value={Math.round((activeScene.ambientBrightness ?? 1) * 100)}
          onChange={(event) => setAmbientBrightness(activeScene.id, Number(event.target.value) / 100)}
        />
      </div>

      {activeScene.fogEnabled && (
        <>
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
          <div className="scene-toolbar__row">
            <label htmlFor="shared-vision-enabled">
              <input
                id="shared-vision-enabled"
                type="checkbox"
                checked={activeScene.sharedVisionEnabled ?? false}
                onChange={(event) => toggleSharedVision(activeScene.id, event.target.checked)}
              />
              Share vision between players
            </label>
          </div>
        </>
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
    </section>
  )
}
