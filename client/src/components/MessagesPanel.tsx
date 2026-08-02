import type * as Y from 'yjs'
import { BroadcastComposer } from './BroadcastComposer'
import { HandoutsPanel } from './HandoutsPanel'

/** DM-only "send something to players" tool — combines the two ways this
 * app pushes content to players (previously separate tabs) since both are
 * "compose, target some/all players, share" with the same
 * `visibleToPlayerIds` convention: BroadcastComposer (one-shot, transient
 * banner) and HandoutsPanel (persistent, toggled-visible, revisitable).
 * Kept as two clearly-labeled sub-sections rather than merged data models —
 * a broadcast and a handout are genuinely different lifetimes, only the UI
 * surface (one tab instead of two) is combined. */
export function MessagesPanel({ doc }: { doc: Y.Doc | null }) {
  return (
    <div className="messages-panel">
      <section className="messages-panel__section">
        <h3>Send now</h3>
        <BroadcastComposer doc={doc} />
      </section>
      <section className="messages-panel__section">
        <h3>Handouts</h3>
        <HandoutsPanel doc={doc} />
      </section>
    </div>
  )
}
