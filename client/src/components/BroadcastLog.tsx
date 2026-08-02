import type * as Y from 'yjs'
import { useBroadcast } from '../dmtools/useBroadcast'
import { useCompendium, findByKey } from '../content/useCompendium'
import { StatBlockCard } from './StatBlockCard'

/** Persistent, newest-first log of every broadcast this viewer was allowed
 * to see (see useBroadcast.ts's `history`) — so dismissing (or missing) the
 * transient banner doesn't lose the message. Shared between the DM's
 * Messages tab (sees everything they sent) and the player-facing Messages
 * tab (sees only untargeted broadcasts, or ones that targeted them). */
export function BroadcastLog({ doc, viewerId, isDm }: { doc: Y.Doc | null; viewerId: string; isDm: boolean }) {
  const { history } = useBroadcast(doc, viewerId, isDm)
  const compendium = useCompendium(doc)

  if (history.length === 0) return <p className="character-sheet__hint">No messages yet.</p>

  return (
    <ul className="broadcast-log">
      {history.map((record) => (
        <li key={record.id} className="broadcast-log__item">
          <span className="broadcast-log__time">{new Date(record.sentAt).toLocaleString()}</span>
          {record.text && <p>{record.text}</p>}
          {record.monsterKey &&
            (() => {
              const entry = findByKey(compendium, record.monsterKey)
              return entry ? <StatBlockCard entry={entry} /> : null
            })()}
        </li>
      ))}
    </ul>
  )
}
