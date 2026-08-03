import { Container, Graphics } from 'pixi.js'
import type { TerrainRecord, TerrainType } from '../map/types'

/** Preset render color per terrain type — see TerrainRecord's doc comment
 * for why this is a fixed picklist rather than a DM-chosen color. */
const TERRAIN_COLORS: Record<TerrainType, number> = {
  water: 0x2a6fb0,
  lava: 0xcc3300,
  acid: 0x7fbf3f,
  ice: 0xb8e6ff,
  mud: 0x6b4a2a,
  difficult: 0x8a7a5c,
}

/** Renders every TerrainRecord on the active scene as a filled, semi-
 * transparent rectangle — purely cosmetic geography, same rendering
 * approach as GridLayer.ts (one Graphics, fully redrawn on update()). */
export class TerrainLayer {
  readonly container = new Container()
  private readonly graphics = new Graphics()

  constructor() {
    this.container.addChild(this.graphics)
  }

  update(terrain: TerrainRecord[], gridSizePx: number): void {
    this.graphics.clear()
    if (gridSizePx <= 0) return
    for (const patch of terrain) {
      this.graphics
        .rect(patch.x * gridSizePx, patch.y * gridSizePx, patch.widthCells * gridSizePx, patch.heightCells * gridSizePx)
        .fill({ color: TERRAIN_COLORS[patch.terrainType], alpha: 0.35 })
    }
  }

  destroy(): void {
    this.container.destroy({ children: true })
  }
}
