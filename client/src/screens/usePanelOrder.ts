import { useCallback, useState } from 'react'

const STORAGE_PREFIX = 'dndonline:panelOrder:'

function loadOrder(key: string): string[] {
  const raw = localStorage.getItem(STORAGE_PREFIX + key)
  if (!raw) return []
  try {
    const parsed: unknown = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === 'string') : []
  } catch {
    return []
  }
}

function saveOrder(key: string, order: string[]): void {
  localStorage.setItem(STORAGE_PREFIX + key, JSON.stringify(order))
}

export interface UsePanelOrderResult {
  /** `availableIds`, reordered by the viewer's saved preference — any id
   * not yet in the saved order (new section, or first time this viewer has
   * seen it) is appended in its `availableIds` position; any saved id no
   * longer present (a section that's currently hidden by its own
   * conditions, e.g. no active scene) is simply skipped rather than
   * dropped from the stored order, so it reappears in the right spot once
   * relevant again. */
  orderedIds: (availableIds: string[]) => string[]
  moveUp: (id: string, availableIds: string[]) => void
  moveDown: (id: string, availableIds: string[]) => void
}

/**
 * Persists a personal, per-viewer ordering preference for a group of
 * reorderable tool tabs (see screens/SessionScreen.tsx's tool-tab strip) —
 * local to this browser only, never synced through the Yjs doc, same
 * convention as the 2D/3D view toggle and other per-viewer display
 * preferences. `storageKey` scopes independent orderings for different tab
 * groups (e.g. DM vs player see different tool sets, so each gets its own
 * saved order).
 */
export function usePanelOrder(storageKey: string): UsePanelOrderResult {
  const [savedOrder, setSavedOrder] = useState<string[]>(() => loadOrder(storageKey))

  const orderedIds = useCallback(
    (availableIds: string[]): string[] => {
      const available = new Set(availableIds)
      const ordered = savedOrder.filter((id) => available.has(id))
      const seen = new Set(ordered)
      for (const id of availableIds) {
        if (!seen.has(id)) ordered.push(id)
      }
      return ordered
    },
    [savedOrder],
  )

  const move = useCallback(
    (id: string, availableIds: string[], direction: -1 | 1) => {
      const current = orderedIds(availableIds)
      const index = current.indexOf(id)
      const swapWith = index + direction
      if (index === -1 || swapWith < 0 || swapWith >= current.length) return
      const next = [...current]
      ;[next[index], next[swapWith]] = [next[swapWith], next[index]]
      setSavedOrder(next)
      saveOrder(storageKey, next)
    },
    [orderedIds, storageKey],
  )

  const moveUp = useCallback((id: string, availableIds: string[]) => move(id, availableIds, -1), [move])
  const moveDown = useCallback((id: string, availableIds: string[]) => move(id, availableIds, 1), [move])

  return { orderedIds, moveUp, moveDown }
}
