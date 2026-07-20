import { useCallback, useEffect, useState } from 'react'
import * as Y from 'yjs'
import type { ChatChannel, ChatMessageRecord } from './types'

const MAX_CHAT_MESSAGES = 300

function chatMap(doc: Y.Doc) {
  return doc.getMap<ChatMessageRecord>('chatMessages')
}

export interface UseChatResult {
  messages: ChatMessageRecord[]
  sendMessage: (playerId: string, playerName: string, channel: ChatChannel, text: string) => void
}

/** In-character / out-of-character text chat — same shared-doc-map +
 * client-side-sort + DM-only-trims pattern as dice/useRollLog.ts. Both
 * channels live in one map (filtered client-side by `channel`) rather than
 * two separate maps, since they're the same kind of thing with the same
 * trimming/ordering rules. */
export function useChat(doc: Y.Doc | null, isDm: boolean): UseChatResult {
  const [messages, setMessages] = useState<ChatMessageRecord[]>([])

  useEffect(() => {
    if (!doc) {
      setMessages([])
      return
    }
    const m = chatMap(doc)
    const sync = () => setMessages(Array.from(m.values()).sort((a, b) => a.createdAt - b.createdAt))
    sync()
    m.observe(sync)
    return () => m.unobserve(sync)
  }, [doc])

  useEffect(() => {
    if (!doc || !isDm) return
    const excess = messages.length - MAX_CHAT_MESSAGES
    if (excess <= 0) return
    const m = chatMap(doc)
    const oldestFirst = [...messages].sort((a, b) => a.createdAt - b.createdAt)
    doc.transact(() => {
      for (let i = 0; i < excess; i++) m.delete(oldestFirst[i].id)
    })
  }, [doc, isDm, messages])

  const sendMessage = useCallback(
    (playerId: string, playerName: string, channel: ChatChannel, text: string) => {
      if (!doc || !text.trim()) return
      const id = crypto.randomUUID()
      chatMap(doc).set(id, { id, playerId, playerName, channel, text: text.trim(), createdAt: Date.now() })
    },
    [doc],
  )

  return { messages, sendMessage }
}
