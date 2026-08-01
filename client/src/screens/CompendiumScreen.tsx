import { useSession } from '../session/useSession'
import { CompendiumDrawer } from '../components/CompendiumDrawer'

/** Standalone reference screen over the merged compendium (SRD + private
 * mirror + homebrew) — spells and items for everyone, monster stat blocks
 * for the DM only (CompendiumDrawer itself hides that tab for players).
 * Split out from the sidebar so looking something up doesn't require
 * scrolling past every other tool panel to reach it. Fully swaps out
 * SessionScreen the same way CharacterManagerScreen/SceneBuilderScreen do —
 * the session/WebRTC connection underneath stays alive. */
export function CompendiumScreen({ onBack }: { onBack: () => void }) {
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
          <CompendiumDrawer doc={session.doc} isDm={session.role === 'dm'} />
        </div>
      </div>
    </section>
  )
}
