import { useCallback, useState } from 'react'

const STORAGE_KEY = 'dndonline:sidebarLayout'

export type SidebarPosition = 'left' | 'right' | 'top' | 'bottom'

const DEFAULT_SIZE = 340
const MIN_SIZE = 220
const MAX_SIZE = 720

interface SidebarLayout {
  position: SidebarPosition
  size: number
}

function loadLayout(): SidebarLayout {
  const raw = localStorage.getItem(STORAGE_KEY)
  if (!raw) return { position: 'left', size: DEFAULT_SIZE }
  try {
    const parsed: unknown = JSON.parse(raw)
    if (typeof parsed !== 'object' || parsed === null) return { position: 'left', size: DEFAULT_SIZE }
    const { position, size } = parsed as Partial<SidebarLayout>
    return {
      position: position === 'left' || position === 'right' || position === 'top' || position === 'bottom' ? position : 'left',
      size: typeof size === 'number' && size >= MIN_SIZE && size <= MAX_SIZE ? size : DEFAULT_SIZE,
    }
  } catch {
    return { position: 'left', size: DEFAULT_SIZE }
  }
}

/**
 * Personal, per-viewer sidebar position/size preference — local to this
 * browser only, same convention as usePanelOrder and the 2D/3D view toggle.
 * `size` is the panel's width in px for a left/right position, or height in
 * px for a top/bottom position (same stored number, its meaning just
 * depends on the current position).
 */
export function useSidebarLayout() {
  const [layout, setLayout] = useState<SidebarLayout>(loadLayout)

  const setPosition = useCallback((position: SidebarPosition) => {
    setLayout((prev) => {
      const next = { ...prev, position }
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
      return next
    })
  }, [])

  const setSize = useCallback((size: number) => {
    const clamped = Math.min(MAX_SIZE, Math.max(MIN_SIZE, size))
    setLayout((prev) => {
      const next = { ...prev, size: clamped }
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
      return next
    })
  }, [])

  return { position: layout.position, size: layout.size, setPosition, setSize, minSize: MIN_SIZE, maxSize: MAX_SIZE }
}
