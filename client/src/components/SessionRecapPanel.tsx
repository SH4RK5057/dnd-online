import { useSession } from '../session/useSession'
import { getOrCreatePlayerId } from '../session/lastSession'
import { useRollLog } from '../dice/useRollLog'
import { useChat } from '../chat/useChat'
import { useSessionEvents } from '../sessionLog/useSessionEvents'

type RecapItem =
  | { type: 'roll'; createdAt: number; text: string }
  | { type: 'chat'; createdAt: number; text: string }
  | { type: 'event'; createdAt: number; text: string }

/**
 * "What happened this session" — merges the roll log, chat log, and combat
 * start/end events (see sessionLog/useSessionEvents.ts) into one
 * chronological (oldest-first, unlike the other logs' newest-first feeds —
 * a recap reads like a story) timeline. Deliberately just the raw merged
 * history, not a written-prose summary — see ROADMAP.md's Phase 9 for why
 * (no AI-text-generation dependency in this app). Visible to everyone, same
 * party-wide-transparency reasoning as the individual logs it merges.
 */
export function SessionRecapPanel() {
  const { session } = useSession()
  const doc = session?.doc ?? null
  const isDm = session?.role === 'dm'
  const myPlayerId = getOrCreatePlayerId()
  const { rolls } = useRollLog(doc, isDm)
  const { messages } = useChat(doc, isDm)
  const { events } = useSessionEvents(doc, isDm)

  if (!doc) return null

  const items: RecapItem[] = [
    ...rolls
      .filter((r) => !r.private || isDm || r.playerId === myPlayerId)
      .map((r): RecapItem => ({
        type: 'roll',
        createdAt: r.createdAt,
        text: `🎲 ${r.playerName}${r.label ? ` — ${r.label}` : ''}: ${r.total}`,
      })),
    ...messages.map((m): RecapItem => ({
      type: 'chat',
      createdAt: m.createdAt,
      text: `💬 [${m.channel === 'ic' ? 'IC' : 'OOC'}] ${m.playerName}: ${m.text}`,
    })),
    ...events.map((e): RecapItem => ({ type: 'event', createdAt: e.createdAt, text: `⚔ ${e.label}` })),
  ].sort((a, b) => a.createdAt - b.createdAt)

  return (
    <div className="session-recap">
      <h2>Session recap</h2>
      {items.length === 0 ? (
        <p className="character-sheet__hint">Nothing's happened yet.</p>
      ) : (
        <ul className="session-recap__list">
          {items.map((item, i) => (
            <li key={i} className={`session-recap__item session-recap__item--${item.type}`}>
              {item.text}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
