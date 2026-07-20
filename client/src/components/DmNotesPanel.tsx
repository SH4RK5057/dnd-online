import { useState } from 'react'
import type * as Y from 'yjs'
import { useDmNotes } from '../dmtools/useDmNotes'

/** DM-only session journal. See dmtools/useDmNotes.ts for the important
 * caveat this UI surfaces below: "hidden" is a convention, not a real
 * security boundary. */
export function DmNotesPanel({ doc }: { doc: Y.Doc | null }) {
  const { notes, createNote, updateNote, deleteNote } = useDmNotes(doc)
  const [newTitle, setNewTitle] = useState('')
  const [openId, setOpenId] = useState<string | null>(null)

  const handleCreate = () => {
    const title = newTitle.trim() || 'Untitled note'
    const id = createNote(title)
    setNewTitle('')
    setOpenId(id)
  }

  return (
    <div className="dm-notes-panel">
      <p className="compendium-drawer__hint">
        Only the DM's UI shows this panel — but this app has no server, so the note text still syncs to every
        connected player's browser like everything else. Don't put anything here you'd be upset a curious player
        found by poking at devtools.
      </p>
      <div className="dm-notes-panel__new">
        <input value={newTitle} onChange={(e) => setNewTitle(e.target.value)} placeholder="New note title" />
        <button type="button" onClick={handleCreate}>
          Add note
        </button>
      </div>
      <ul className="dm-notes-panel__list">
        {notes.map((note) => (
          <li key={note.id}>
            <div className="dm-notes-panel__item-header">
              <button type="button" onClick={() => setOpenId((prev) => (prev === note.id ? null : note.id))}>
                {note.title}
              </button>
              <button type="button" onClick={() => deleteNote(note.id)}>
                Delete
              </button>
            </div>
            {openId === note.id && (
              <div className="dm-notes-panel__item-body">
                <input value={note.title} onChange={(e) => updateNote(note.id, { title: e.target.value })} />
                <textarea
                  value={note.body}
                  onChange={(e) => updateNote(note.id, { body: e.target.value })}
                  rows={5}
                  placeholder="Notes…"
                />
              </div>
            )}
          </li>
        ))}
        {notes.length === 0 && <li className="character-sheet__hint">No notes yet.</li>}
      </ul>
    </div>
  )
}
