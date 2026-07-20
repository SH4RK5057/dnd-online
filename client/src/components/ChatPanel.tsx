import { useState } from 'react'
import { useSession } from '../session/useSession'
import { getOrCreatePlayerId } from '../session/lastSession'
import { useChat } from '../chat/useChat'
import type { ChatChannel } from '../chat/types'

/** In-character / out-of-character text chat, visible to and usable by
 * everyone — everyone can see and send in both channels (IC/OOC is a
 * roleplay convention, not a permission boundary). */
export function ChatPanel() {
  const { session } = useSession()
  const doc = session?.doc ?? null
  const isDm = session?.role === 'dm'
  const myPlayerId = getOrCreatePlayerId()
  const { messages, sendMessage } = useChat(doc, isDm)

  const [channel, setChannel] = useState<ChatChannel>('ic')
  const [draft, setDraft] = useState('')

  if (!doc) return null

  const shown = messages.filter((m) => m.channel === channel)

  const handleSend = () => {
    if (!draft.trim()) return
    sendMessage(myPlayerId, session?.displayName ?? 'Player', channel, draft)
    setDraft('')
  }

  return (
    <div className="chat-panel">
      <div className="compendium-drawer__tabs">
        <button type="button" aria-pressed={channel === 'ic'} onClick={() => setChannel('ic')}>
          In character
        </button>
        <button type="button" aria-pressed={channel === 'ooc'} onClick={() => setChannel('ooc')}>
          Out of character
        </button>
      </div>
      <ul className="chat-panel__messages">
        {shown.map((message) => (
          <li key={message.id}>
            <strong>{message.playerName}:</strong> {message.text}
          </li>
        ))}
        {shown.length === 0 && <li className="character-sheet__hint">No messages yet.</li>}
      </ul>
      <div className="chat-panel__compose">
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') handleSend()
          }}
          placeholder={channel === 'ic' ? 'Say something in character…' : 'Chat out of character…'}
        />
        <button type="button" onClick={handleSend} disabled={!draft.trim()}>
          Send
        </button>
      </div>
    </div>
  )
}
