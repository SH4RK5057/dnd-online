import { useRef } from 'react'

/** Drag handle for the sidebar panel's size, rendered on whichever edge of
 * the panel is adjacent to the map (see SessionScreen's layout). `axis`
 * picks pointer-movement axis and cursor: 'x' for a left/right-positioned
 * panel (dragging left/right resizes width), 'y' for a top/bottom-positioned
 * panel (dragging up/down resizes height). `reverse` flips the drag
 * direction for panels on the right/bottom, where dragging toward the map
 * (left or up) should still grow the panel, matching the left/top case's
 * "drag toward the map to grow" feel instead of being inverted. */
export function SidebarResizeHandle({
  axis,
  reverse,
  size,
  onResize,
}: {
  axis: 'x' | 'y'
  reverse: boolean
  size: number
  onResize: (size: number) => void
}) {
  const dragState = useRef<{ startPos: number; startSize: number } | null>(null)

  const handlePointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    event.preventDefault()
    dragState.current = { startPos: axis === 'x' ? event.clientX : event.clientY, startSize: size }
    const target = event.currentTarget
    target.setPointerCapture(event.pointerId)
  }

  const handlePointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!dragState.current) return
    const pos = axis === 'x' ? event.clientX : event.clientY
    const delta = pos - dragState.current.startPos
    onResize(dragState.current.startSize + (reverse ? -delta : delta))
  }

  const handlePointerUp = (event: React.PointerEvent<HTMLDivElement>) => {
    dragState.current = null
    event.currentTarget.releasePointerCapture(event.pointerId)
  }

  return (
    <div
      className={`sidebar-resize-handle sidebar-resize-handle--${axis}`}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      role="separator"
      aria-orientation={axis === 'x' ? 'vertical' : 'horizontal'}
      title="Drag to resize"
    />
  )
}
