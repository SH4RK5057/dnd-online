import { useRef, useState } from 'react'
import type * as Y from 'yjs'
import { useHandouts } from '../dmtools/useHandouts'
import { useAssetUrl } from '../map/assetSync'
import { useSession } from '../session/useSession'
import { useConnectionStatus } from '../session/useConnectionStatus'
import { PlayerRecipientPicker } from './PlayerRecipientPicker'

function HandoutImage({ doc, assetId }: { doc: Y.Doc | null; assetId: string | null }) {
  const url = useAssetUrl(doc, assetId)
  if (!url) return null
  return <img src={url} alt="" className="handouts-panel__image" />
}

/** DM-only management: create, upload an image and/or write text, and
 * toggle each handout visible to players "on demand". */
export function HandoutsPanel({ doc }: { doc: Y.Doc | null }) {
  const { handouts, createHandout, deleteHandout, setHandoutText, setHandoutImage, setHandoutShown, setHandoutVisibleToPlayers } =
    useHandouts(doc)
  const { session } = useSession()
  const { peers } = useConnectionStatus(session)
  const players = peers.filter((peer) => peer.role === 'player')
  const [newName, setNewName] = useState('')
  const [openId, setOpenId] = useState<string | null>(null)
  const [uploadingId, setUploadingId] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleCreate = () => {
    const name = newName.trim() || 'Untitled handout'
    const id = createHandout(name)
    setNewName('')
    setOpenId(id)
  }

  const handleUpload = async (id: string, file: File | undefined) => {
    if (!file) return
    setUploadingId(id)
    try {
      await setHandoutImage(id, file)
    } finally {
      setUploadingId(null)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  return (
    <div className="handouts-panel">
      <div className="dm-notes-panel__new">
        <input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="New handout name" />
        <button type="button" onClick={handleCreate}>
          Add handout
        </button>
      </div>
      <ul className="dm-notes-panel__list">
        {handouts.map((handout) => (
          <li key={handout.id}>
            <div className="dm-notes-panel__item-header">
              <button type="button" onClick={() => setOpenId((prev) => (prev === handout.id ? null : handout.id))}>
                {handout.name} {handout.shownToPlayers && <span className="compendium-drawer__source">visible</span>}
              </button>
              <label>
                <input
                  type="checkbox"
                  checked={handout.shownToPlayers}
                  onChange={(e) => setHandoutShown(handout.id, e.target.checked)}
                />
                Show to players
              </label>
              {handout.shownToPlayers && (
                <PlayerRecipientPicker
                  players={players}
                  value={handout.visibleToPlayerIds}
                  onChange={(next) => setHandoutVisibleToPlayers(handout.id, next)}
                />
              )}
              <button type="button" onClick={() => deleteHandout(handout.id)}>
                Delete
              </button>
            </div>
            {openId === handout.id && (
              <div className="dm-notes-panel__item-body">
                <HandoutImage doc={doc} assetId={handout.assetId} />
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  onChange={(e) => void handleUpload(handout.id, e.target.files?.[0])}
                  disabled={uploadingId === handout.id}
                />
                <textarea
                  value={handout.text}
                  onChange={(e) => setHandoutText(handout.id, e.target.value)}
                  rows={4}
                  placeholder="Optional text (a letter, a note, flavor text)…"
                />
              </div>
            )}
          </li>
        ))}
        {handouts.length === 0 && <li className="character-sheet__hint">No handouts yet.</li>}
      </ul>
    </div>
  )
}

/** Player-facing view — only handouts the DM has flipped to shown, and
 * further narrowed to this viewer if the DM targeted a subset of players. */
export function PlayerHandoutsView({ doc, myPlayerId }: { doc: Y.Doc | null; myPlayerId: string }) {
  const { handouts } = useHandouts(doc)
  const visible = handouts.filter(
    (h) => h.shownToPlayers && (h.visibleToPlayerIds == null || h.visibleToPlayerIds.includes(myPlayerId)),
  )

  if (visible.length === 0) return <p className="character-sheet__hint">Nothing shared yet.</p>

  return (
    <ul className="dm-notes-panel__list">
      {visible.map((handout) => (
        <li key={handout.id}>
          <div className="dm-notes-panel__item-body">
            <h3>{handout.name}</h3>
            <HandoutImage doc={doc} assetId={handout.assetId} />
            {handout.text && <p>{handout.text}</p>}
          </div>
        </li>
      ))}
    </ul>
  )
}
