import type * as Y from 'yjs'
import { BroadcastLog } from './BroadcastLog'
import { PlayerHandoutsView } from './HandoutsPanel'

/** Player-facing "Messages" tab — mirrors the DM's MessagesPanel structure
 * (send-now history + handouts, minus the compose form), so players have
 * one place to check both a persistent log of DM broadcasts (even after
 * dismissing the transient banner) and shared handouts. Deliberately no
 * jump-to-section nav, same reasoning as MessagesPanel. */
export function PlayerMessagesView({ doc, myPlayerId }: { doc: Y.Doc | null; myPlayerId: string }) {
  return (
    <div className="messages-panel">
      <section className="messages-panel__section">
        <h3>DM messages</h3>
        <BroadcastLog doc={doc} viewerId={myPlayerId} isDm={false} />
      </section>
      <section className="messages-panel__section">
        <h3>Handouts</h3>
        <PlayerHandoutsView doc={doc} myPlayerId={myPlayerId} />
      </section>
    </div>
  )
}
