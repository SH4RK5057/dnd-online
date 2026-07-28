import { useEffect, useRef, useState } from 'react'
import * as Y from 'yjs'

export interface UseUndoManagerResult {
  undo: () => void
  redo: () => void
  canUndo: boolean
  canRedo: boolean
}

/**
 * DM misclick safety net — "moved the wrong token, fat-fingered an HP edit."
 * Built on Yjs's own Y.UndoManager rather than a hand-rolled action log:
 * Y.UndoManager only tracks LOCAL transactions on this Y.Doc (Yjs marks
 * updates applied from a remote peer as non-local), so undo here can never
 * revert another connected peer's edits — it naturally only undoes actions
 * this browser tab itself made, which is exactly "undo my last action."
 * Scoped to the maps a DM's map-editing mistakes actually touch — tokens,
 * walls, lights, and characters (HP/conditions/etc. live there) — not
 * rolls/chat/session-log, which are historical records that shouldn't be
 * rewritable, and not combat turn state, to keep this a "fix my mistake"
 * tool rather than a time-travel control.
 */
export function useUndoManager(doc: Y.Doc | null): UseUndoManagerResult {
  const managerRef = useRef<Y.UndoManager | null>(null)
  const [canUndo, setCanUndo] = useState(false)
  const [canRedo, setCanRedo] = useState(false)

  useEffect(() => {
    if (!doc) {
      managerRef.current = null
      setCanUndo(false)
      setCanRedo(false)
      return
    }
    const trackedTypes = ['tokens', 'walls', 'lights', 'characters'].map((name) => doc.getMap(name))
    const manager = new Y.UndoManager(trackedTypes)
    managerRef.current = manager
    const sync = () => {
      setCanUndo(manager.undoStack.length > 0)
      setCanRedo(manager.redoStack.length > 0)
    }
    manager.on('stack-item-added', sync)
    manager.on('stack-item-popped', sync)
    sync()
    return () => {
      manager.destroy()
      managerRef.current = null
    }
  }, [doc])

  return {
    undo: () => managerRef.current?.undo(),
    redo: () => managerRef.current?.redo(),
    canUndo,
    canRedo,
  }
}
