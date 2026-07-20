import { useEffect, useRef, useState, type RefObject } from 'react'
import { Application } from 'pixi.js'

/**
 * Owns a PIXI.Application's async init/teardown lifecycle for a container div.
 * PIXI v8's `app.init()` is async, which React 19 StrictMode's mount->cleanup->
 * remount dance can race: if cleanup fires before init resolves, the `cancelled`
 * flag makes the init callback self-destroy instead of attaching a canvas to a
 * dead component.
 */
export function usePixiApp(containerRef: RefObject<HTMLDivElement | null>): Application | null {
  const [app, setApp] = useState<Application | null>(null)
  const appRef = useRef<Application | null>(null)

  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    let cancelled = false
    const instance = new Application()

    void instance
      .init({
        backgroundAlpha: 0,
        resizeTo: container,
        antialias: true,
      })
      .then(() => {
        if (cancelled) {
          instance.destroy(true, { children: true, texture: true })
          return
        }
        container.appendChild(instance.canvas)
        // Right-click is used to cancel an in-progress wall chain (WallLayer);
        // suppress the browser's native context menu so it doesn't pop up over it.
        instance.canvas.addEventListener('contextmenu', (e) => e.preventDefault())
        appRef.current = instance
        setApp(instance)
      })

    // `resizeTo` alone only reacts to the window's own 'resize' event, not to
    // the container changing size on its own (e.g. our mobile breakpoint
    // switching the side panel from row to column layout, which narrows the
    // canvas without the window itself resizing) — a ResizeObserver catches
    // that case too, keeping the canvas from overflowing its column.
    const resizeObserver = new ResizeObserver(() => appRef.current?.resize())
    resizeObserver.observe(container)

    return () => {
      cancelled = true
      resizeObserver.disconnect()
      if (appRef.current) {
        appRef.current.destroy(true, { children: true, texture: true })
        appRef.current = null
        setApp(null)
      }
    }
  }, [containerRef])

  return app
}
