import { useCallback, useEffect, useState } from 'react'
import * as Y from 'yjs'
import type { DmNoteRecord } from './types'

function notesMap(doc: Y.Doc) {
  return doc.getMap<DmNoteRecord>('dmNotes')
}

export interface UseDmNotesResult {
  notes: DmNoteRecord[]
  createNote: (title: string) => string
  updateNote: (id: string, patch: Partial<Pick<DmNoteRecord, 'title' | 'body'>>) => void
  deleteNote: (id: string) => void
}

/** DM-only session journal — flat `doc.getMap('dmNotes')`, same convention as
 * every other entity in this app. "Hidden" here is purely a UI convention,
 * not an enforced permission: this app has no server, so the full Yjs doc
 * (including this map) syncs to every connected player's browser the same
 * as everything else — the DM's UI just never renders a panel for it.
 * Genuinely secret information shouldn't go in here; keep that elsewhere. */
export function useDmNotes(doc: Y.Doc | null): UseDmNotesResult {
  const [notes, setNotes] = useState<DmNoteRecord[]>([])

  useEffect(() => {
    if (!doc) {
      setNotes([])
      return
    }
    const notesM = notesMap(doc)
    const sync = () => setNotes(Array.from(notesM.values()).sort((a, b) => b.createdAt - a.createdAt))
    sync()
    notesM.observe(sync)
    return () => notesM.unobserve(sync)
  }, [doc])

  const createNote = useCallback(
    (title: string): string => {
      if (!doc) throw new Error('No active session.')
      const id = crypto.randomUUID()
      notesMap(doc).set(id, { id, title, body: '', createdAt: Date.now() })
      return id
    },
    [doc],
  )

  const updateNote = useCallback(
    (id: string, patch: Partial<Pick<DmNoteRecord, 'title' | 'body'>>) => {
      if (!doc) return
      const m = notesMap(doc)
      const note = m.get(id)
      if (!note) return
      m.set(id, { ...note, ...patch })
    },
    [doc],
  )

  const deleteNote = useCallback(
    (id: string) => {
      if (!doc) return
      notesMap(doc).delete(id)
    },
    [doc],
  )

  return { notes, createNote, updateNote, deleteNote }
}
