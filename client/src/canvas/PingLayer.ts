import { Application, Container, Graphics, Text } from 'pixi.js'
import type { PingRecord } from '../map/pingTypes'

/** How long the ripple animation takes to fully expand and fade — shorter
 * than usePings.ts's PING_LIFETIME_MS (the doc-level expiry), so the ring
 * has always finished fading before the record itself gets swept away. */
const RIPPLE_DURATION_MS = 1500
const MAX_RADIUS_PX = 60

interface Entry {
  ring: Graphics
  label: Text
  startedAt: number
  x: number
  y: number
}

/** Renders every active ping (map/usePings.ts) as an expanding, fading ring
 * plus the pinging player's name — "flash a visual ripple/label on the map
 * for their peers." Visible to everyone regardless of fog, same as lights'
 * on-canvas icons (a communication aid, not a vision mechanic). Driven by
 * the Pixi ticker for smooth animation, unlike this app's other layers
 * (which only redraw when their React-side data actually changes). */
export class PingLayer {
  readonly container = new Container()
  private readonly entries = new Map<string, Entry>()
  private gridSizePx = 1
  private readonly app: Application

  constructor(app: Application) {
    this.app = app
    app.ticker.add(this.tick)
  }

  update(pings: PingRecord[], gridSizePx: number): void {
    this.gridSizePx = gridSizePx
    const seen = new Set<string>()
    for (const ping of pings) {
      seen.add(ping.id)
      if (this.entries.has(ping.id)) continue
      const ring = new Graphics()
      const label = new Text({
        text: ping.playerName,
        style: { fontSize: 12, fill: 0xffe066, fontFamily: 'sans-serif' },
      })
      label.anchor.set(0.5, 1)
      this.container.addChild(ring, label)
      this.entries.set(ping.id, { ring, label, startedAt: ping.createdAt, x: ping.x, y: ping.y })
    }
    for (const [id, entry] of this.entries) {
      if (seen.has(id)) continue
      this.container.removeChild(entry.ring, entry.label)
      entry.ring.destroy()
      entry.label.destroy()
      this.entries.delete(id)
    }
  }

  private tick = () => {
    const now = Date.now()
    for (const entry of this.entries.values()) {
      const t = Math.min(1, (now - entry.startedAt) / RIPPLE_DURATION_MS)
      const px = entry.x * this.gridSizePx
      const py = entry.y * this.gridSizePx
      entry.ring.clear()
      entry.ring.circle(px, py, t * MAX_RADIUS_PX).stroke({ width: 3, color: 0xffe066, alpha: 1 - t })
      entry.ring.circle(px, py, 4).fill({ color: 0xffe066, alpha: 1 - t })
      entry.label.position.set(px, py - MAX_RADIUS_PX * 0.4 - 4)
      entry.label.alpha = 1 - t
    }
  }

  destroy(): void {
    this.app.ticker.remove(this.tick)
    for (const entry of this.entries.values()) {
      entry.ring.destroy()
      entry.label.destroy()
    }
    this.container.destroy({ children: true })
  }
}
