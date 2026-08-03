import { Container, Graphics, Text } from 'pixi.js'
import type { TriggerRecord } from '../map/types'

/** DM-only rendering for trigger zones (pressure plates, tripwires) — a
 * thin outline (Pixi's Graphics has no dash primitive, so this uses a
 * lighter stroke/alpha instead of an actual dashed line) + name label,
 * mirroring PoiLayer's per-item label pattern. Hidden triggers only draw
 * when `showHidden` (the unmasked DM); once revealed, or if never hidden,
 * everyone sees the zone — same visibility split as hazard tokens. */
export class TriggerLayer {
  readonly container = new Container()
  private readonly graphics = new Graphics()
  private readonly labels: Text[] = []

  constructor() {
    this.container.addChild(this.graphics)
  }

  update(triggers: TriggerRecord[], gridSizePx: number, showHidden: boolean): void {
    this.graphics.clear()
    for (const label of this.labels) {
      this.container.removeChild(label)
      label.destroy()
    }
    this.labels.length = 0
    if (gridSizePx <= 0) return

    for (const trigger of triggers) {
      if (trigger.hidden && !showHidden) continue
      const x = trigger.x * gridSizePx
      const y = trigger.y * gridSizePx
      const w = trigger.widthCells * gridSizePx
      const h = trigger.heightCells * gridSizePx
      this.graphics.rect(x, y, w, h).stroke({ width: 1.5, color: 0xffa94d, alpha: trigger.hidden ? 0.45 : 0.8 })
      const label = new Text({ text: trigger.name, style: { fontSize: 11, fill: 0xffa94d, fontFamily: 'sans-serif' } })
      label.anchor.set(0, 1)
      label.position.set(x + 2, y - 2)
      this.container.addChild(label)
      this.labels.push(label)
    }
  }

  destroy(): void {
    this.container.destroy({ children: true })
  }
}
