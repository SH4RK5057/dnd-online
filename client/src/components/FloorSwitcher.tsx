import { useScenes } from '../map/useScenes'
import { floorSiblings } from '../map/floorGroups'

/** DM-only tab strip for quickly flipping between floors of one location
 * (a multi-story tower, a stacked dungeon) without leaving the live map for
 * Scene Builder's full scene dropdown — see SceneToolbar.tsx's "Floor"
 * section for how a scene joins a floor group. Renders nothing when the
 * active scene isn't grouped with any sibling (a lone "group of one" isn't
 * a switcher). */
export function FloorSwitcher({ doc }: { doc: Parameters<typeof useScenes>[0] }) {
  const { scenes, activeScene, switchToScene } = useScenes(doc)
  if (!activeScene) return null

  const siblings = floorSiblings(scenes, activeScene)
  if (siblings.length < 2) return null

  return (
    <div className="floor-switcher">
      {siblings.map((scene) => (
        <button
          key={scene.id}
          type="button"
          className={scene.id === activeScene.id ? 'floor-switcher__tab floor-switcher__tab--active' : 'floor-switcher__tab'}
          onClick={() => void switchToScene(scene.id)}
          disabled={scene.id === activeScene.id}
        >
          {scene.name}
        </button>
      ))}
    </div>
  )
}
