import { useSession } from '../session/useSession'
import { CompendiumDrawer } from '../components/CompendiumDrawer'
import type { ItemData, MonsterData } from '../content/types'

/** Standalone reference screen over the merged compendium (SRD + private
 * mirror + homebrew) — spells and items for everyone, monster stat blocks
 * for the DM only (CompendiumDrawer itself hides that tab for players).
 * Split out from the sidebar so looking something up doesn't require
 * scrolling past every other tool panel to reach it. Fully swaps out
 * SessionScreen the same way CharacterManagerScreen/SceneBuilderScreen do —
 * the session/WebRTC connection underneath stays alive. `onAddMonsterToScene`/
 * `onAddItemToScene` are forwarded straight from SessionScreen, which owns
 * the pending-placement state and closes this screen back to the map once
 * armed, so the DM can click where to drop it. */
export function CompendiumScreen({
  onBack,
  onAddMonsterToScene,
  onAddItemToScene,
}: {
  onBack: () => void
  onAddMonsterToScene?: (monster: MonsterData) => void
  onAddItemToScene?: (item: ItemData) => void
}) {
  const { session } = useSession()
  if (!session) return null

  return (
    <section className="session-screen">
      <header className="session-screen__header">
        <h1>Compendium</h1>
        <button type="button" onClick={onBack}>
          Back
        </button>
      </header>

      <div className="session-screen__body">
        <div className="session-screen__main session-screen__main--compendium">
          <CompendiumDrawer
            doc={session.doc}
            isDm={session.role === 'dm'}
            onAddMonsterToScene={onAddMonsterToScene}
            onAddItemToScene={onAddItemToScene}
          />
        </div>
      </div>
    </section>
  )
}
