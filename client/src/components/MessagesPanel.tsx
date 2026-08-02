import type * as Y from 'yjs'
import { BroadcastComposer } from './BroadcastComposer'
import { HandoutsPanel } from './HandoutsPanel'
import { BroadcastLog } from './BroadcastLog'
import { getOrCreatePlayerId } from '../session/lastSession'

/** DM-only "send something to players" tool — combines the ways this app
 * pushes content to players (previously separate tabs) since all three are
 * "compose, target some/all players, share" with the same
 * `visibleToPlayerIds` convention: BroadcastComposer (one-shot, transient
 * banner), a log of everything sent (BroadcastLog, so the DM can confirm
 * what already went out), and HandoutsPanel (persistent, toggled-visible,
 * revisitable). Kept as three clearly-labeled sub-sections rather than
 * merged data models — a broadcast and a handout are genuinely different
 * lifetimes, only the UI surface (one tab instead of separate ones) is
 * combined. Deliberately no jump-to-section nav here (unlike TokensPanel/
 * DmToolboxPanel) — three short sections don't need one. */
export function MessagesPanel({ doc }: { doc: Y.Doc | null }) {
  return (
    <div className="messages-panel">
      <section className="messages-panel__section">
        <h3>Send now</h3>
        <BroadcastComposer doc={doc} />
      </section>
      <section className="messages-panel__section">
        <h3>Sent messages</h3>
        <BroadcastLog doc={doc} viewerId={getOrCreatePlayerId()} isDm />
      </section>
      <section className="messages-panel__section">
        <h3>Handouts</h3>
        <HandoutsPanel doc={doc} />
      </section>
    </div>
  )
}
