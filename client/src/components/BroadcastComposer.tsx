import { useState } from 'react'
import type * as Y from 'yjs'
import { useBroadcast } from '../dmtools/useBroadcast'
import { useCompendium } from '../content/useCompendium'
import { filterMonsters } from '../content/search'
import { useSession } from '../session/useSession'
import { useConnectionStatus } from '../session/useConnectionStatus'
import { getOrCreatePlayerId } from '../session/lastSession'
import { PlayerRecipientPicker } from './PlayerRecipientPicker'

const MAX_SEARCH_RESULTS = 8

/** DM-only: compose a quick note and/or attach a compendium monster's stat
 * block, then push it right now — see useBroadcast.ts for how this differs
 * from Handouts' persistently-toggled-visible sharing. Defaults to everyone,
 * but can be narrowed to a subset of connected players via
 * PlayerRecipientPicker (same `visibleToPlayerIds` targeting convention as
 * HandoutRecord). The banner itself (BroadcastNotificationBanner) is
 * rendered near the top of SessionScreen for every viewer, not here. */
export function BroadcastComposer({ doc }: { doc: Y.Doc | null }) {
  const { session } = useSession()
  const { peers } = useConnectionStatus(session)
  const players = peers.filter((peer) => peer.role === 'player')
  const { send } = useBroadcast(doc, getOrCreatePlayerId(), session?.role === 'dm')
  const compendium = useCompendium(doc)
  const [text, setText] = useState('')
  const [monsterKey, setMonsterKey] = useState<string | null>(null)
  const [monsterQuery, setMonsterQuery] = useState('')
  const [visibleToPlayerIds, setVisibleToPlayerIds] = useState<string[] | null>(null)

  const monsterMatches = monsterQuery.trim() ? filterMonsters(compendium.monsters, monsterQuery, 'all', 'all').slice(0, MAX_SEARCH_RESULTS) : []
  const selectedMonster = monsterKey ? compendium.monsters.find((m) => m.key === monsterKey) : null

  const handleSend = () => {
    if (!text.trim() && !monsterKey) return
    send(text.trim(), monsterKey, visibleToPlayerIds)
    setText('')
    setMonsterKey(null)
    setMonsterQuery('')
    setVisibleToPlayerIds(null)
  }

  return (
    <div className="broadcast-composer">
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="A note to send right now…"
        rows={3}
      />
      <PlayerRecipientPicker players={players} value={visibleToPlayerIds} onChange={setVisibleToPlayerIds} />
      {selectedMonster ? (
        <p className="character-sheet__hint">
          Attached: {selectedMonster.name}{' '}
          <button type="button" onClick={() => setMonsterKey(null)}>
            Remove
          </button>
        </p>
      ) : (
        <div className="character-sheet__compendium-search">
          <input placeholder="Attach a monster's stat block…" value={monsterQuery} onChange={(e) => setMonsterQuery(e.target.value)} />
          {monsterMatches.length > 0 && (
            <ul className="character-sheet__search-results">
              {monsterMatches.map((data) => (
                <li key={data.key}>
                  <button
                    type="button"
                    onClick={() => {
                      setMonsterKey(data.key)
                      setMonsterQuery('')
                    }}
                  >
                    {data.name}
                    <span className="compendium-drawer__source">{data.type}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
      <button type="button" onClick={handleSend} disabled={!text.trim() && !monsterKey}>
        {visibleToPlayerIds == null ? 'Send to everyone' : `Send to ${visibleToPlayerIds.length} player${visibleToPlayerIds.length === 1 ? '' : 's'}`}
      </button>
    </div>
  )
}
