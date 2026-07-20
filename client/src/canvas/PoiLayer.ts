import { Container, Graphics, Text } from 'pixi.js'
import type { PoiRecord } from '../map/poiTypes'

/** Pure renderer for a scene's Points of Interest — markers, labels,
 * connection lines between them, and a highlight on wherever the party
 * currently is (SceneRecord.currentPoiId). Selecting a travel destination
 * happens through components/SceneNavigationPanel.tsx's list UI, not by
 * clicking these markers directly, so (like PingLayer/AnnotationLayer) this
 * has no interactivity of its own. */
export class PoiLayer {
  readonly container = new Container()
  private readonly graphics = new Graphics()
  private readonly labels: Text[] = []

  constructor() {
    this.container.addChild(this.graphics)
  }

  update(pois: PoiRecord[], currentPoiId: string | null, gridSizePx: number): void {
    this.graphics.clear()
    for (const label of this.labels) {
      this.container.removeChild(label)
      label.destroy()
    }
    this.labels.length = 0

    const byId = new Map(pois.map((p) => [p.id, p]))
    const drawnPairs = new Set<string>()
    for (const poi of pois) {
      for (const connectedId of poi.connections) {
        const pairKey = [poi.id, connectedId].sort().join(':')
        if (drawnPairs.has(pairKey)) continue
        drawnPairs.add(pairKey)
        const other = byId.get(connectedId)
        if (!other) continue
        this.graphics
          .moveTo(poi.x * gridSizePx, poi.y * gridSizePx)
          .lineTo(other.x * gridSizePx, other.y * gridSizePx)
          .stroke({ width: 2, color: 0xffffff, alpha: 0.3 })
      }
    }

    for (const poi of pois) {
      const px = poi.x * gridSizePx
      const py = poi.y * gridSizePx
      const isCurrent = poi.id === currentPoiId
      this.graphics.circle(px, py, isCurrent ? 10 : 7).fill({ color: isCurrent ? 0xffd54a : 0x4dabf7, alpha: 0.9 })
      this.graphics.circle(px, py, isCurrent ? 10 : 7).stroke({ width: 2, color: 0xffffff, alpha: 0.8 })
      if (poi.linkedSceneId) {
        this.graphics.circle(px, py, (isCurrent ? 10 : 7) + 5).stroke({ width: 1.5, color: 0xda77f2, alpha: 0.7 })
      }
      const label = new Text({ text: poi.name, style: { fontSize: 12, fill: 0xffffff, fontFamily: 'sans-serif' } })
      label.anchor.set(0.5, 0)
      label.position.set(px, py + (isCurrent ? 14 : 11))
      this.container.addChild(label)
      this.labels.push(label)
    }
  }

  destroy(): void {
    this.container.destroy({ children: true })
  }
}
