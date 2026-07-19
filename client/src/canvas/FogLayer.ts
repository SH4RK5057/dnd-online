import { Container, Graphics, RenderTexture, Sprite, type Renderer } from 'pixi.js'
import { computeVisibilityPolygon, type Point, type Segment } from '../map/visibility'
import { EXPLORED_MEMORY_BRIGHTNESS } from '../map/constants'
import type { LightRecord, TokenRecord, WallRecord } from '../map/types'

export interface FogInput {
  walls: WallRecord[]
  lights: LightRecord[]
  tokens: TokenRecord[]
  gridSizePx: number
  mapSize: { width: number; height: number }
  /** The viewer's own token(s) — usually one, but a player could conceivably
   * be assigned more than one. */
  ownTokenIds: string[]
  personalVisionRadiusCells: number
  maxVisionRadiusCells: number
  /** Baseline light level before lights/personal-vision are added in — see
   * SceneRecord.ambientBrightness. 0 = pitch black, 1 = fully lit. */
  ambientBrightness: number
  /** Cell keys ("x,y" in grid-cell-integer units) this player has already
   * explored on this scene, from useExploration — rendered dimly even when
   * not currently visible so they never re-fog. */
  exploredCells: Set<string>
}

/**
 * Computes and renders a player's fog-of-war mask: visible = (within the
 * player's own line of sight) AND (ambient light, or illuminated by some
 * enabled light, or within their personal-vision bubble). Never used for
 * the DM, who always sees everything — callers should simply not call
 * `update()` for a DM viewer and leave whatever container this masks
 * unmasked.
 *
 * Rendering approach (verified against pixi.js@8.19.0 source): the
 * ambient+illumination content (a background rect at the scene's ambient
 * brightness, plus 'add'-blended light/personal-vision visibility polygons)
 * is built in an offscreen Container, which then gets a real Pixi *stencil*
 * mask — a Graphics shape unioning every owned token's own max-range LOS
 * polygon — before being rendered into `this.renderTexture`. Using an
 * actual mask (not a multiply-blend trick) matters: multiply blending only
 * affects pixels something is actually drawn over, so pixels outside the
 * LOS polygon that nothing draws over would otherwise be left at whatever
 * the ambient clear set them to — letting ambient light incorrectly bleed
 * through walls into never-visible areas. A real mask forces everything
 * outside the LOS union to the texture's clear color (black) instead.
 *
 * The result is exposed as `.mask`, a Sprite wrapping the RenderTexture —
 * Pixi's default sprite-mask reads the mask's *red* channel (not alpha,
 * despite the name), which both the ambient gray fill and the opaque white
 * light fills satisfy for free.
 *
 * A second step then implements persistent fog-of-exploration: `update()`
 * reads back the masked result via `renderer.extract.pixels` to find which
 * grid cells are genuinely lit up this frame, unions that into the known
 * `exploredCells`, and — for any explored cell that's completely dark this
 * frame (not currently visible at all) — draws a dim EXPLORED_MEMORY_BRIGHTNESS
 * square over just that cell (plain 'normal' blend). A cell the player is
 * actively looking at always shows its true current brightness, even a dim
 * ambient level below the memory floor — the floor only exists to keep
 * cells they've *left* from re-fogging. `update()` returns the
 * newly-discovered cell keys so the caller can persist them.
 */
export class FogLayer {
  readonly mask = new Sprite()
  private renderTexture: RenderTexture | null = null
  private readonly drawGraphics = new Graphics()
  private readonly bgGraphics = new Graphics()
  private readonly illumGraphics = new Graphics()
  private readonly losMaskGraphics = new Graphics()
  private readonly illumContainer = new Container()
  private currentSize: { width: number; height: number } | null = null

  constructor() {
    // Part of the mask machinery only, never drawn as a normal scene object.
    this.mask.renderable = false
    this.illumContainer.addChild(this.bgGraphics, this.illumGraphics)
    this.illumContainer.mask = this.losMaskGraphics
  }

  update(renderer: Renderer, input: FogInput): string[] {
    const {
      mapSize,
      gridSizePx,
      walls,
      lights,
      tokens,
      ownTokenIds,
      personalVisionRadiusCells,
      maxVisionRadiusCells,
      ambientBrightness,
      exploredCells,
    } = input

    this.ensureRenderTexture(mapSize)
    if (!this.renderTexture) return []

    const ambientGray = Math.round(Math.min(1, Math.max(0, ambientBrightness)) * 255)
    const ambientColor = (ambientGray << 16) | (ambientGray << 8) | ambientGray

    const wallSegmentsPx: Segment[] = walls.map((w) => ({
      x1: w.x1 * gridSizePx,
      y1: w.y1 * gridSizePx,
      x2: w.x2 * gridSizePx,
      y2: w.y2 * gridSizePx,
    }))

    const tokensById = new Map(tokens.map((t) => [t.id, t]))
    const ownTokens = ownTokenIds.map((id) => tokensById.get(id)).filter((t): t is TokenRecord => !!t)

    if (ownTokens.length === 0) {
      // No token assigned to this viewer — nothing is in their line of
      // sight at all, so the whole map stays fogged regardless of ambient
      // light (fail closed). (The user-facing "your DM hasn't assigned you
      // a token" message is a separate UI concern.)
      this.drawGraphics.clear()
      renderer.render({ container: this.drawGraphics, target: this.renderTexture, clear: true, clearColor: 0x000000 })
      return []
    }

    const resolveLightPos = (light: LightRecord): Point => {
      if (light.attachedTokenId) {
        const token = tokensById.get(light.attachedTokenId)
        if (token) return { x: token.x * gridSizePx, y: token.y * gridSizePx }
      }
      return { x: light.x * gridSizePx, y: light.y * gridSizePx }
    }

    // Ambient + illumination content, to be clipped by the LOS mask below.
    this.bgGraphics.clear()
    this.bgGraphics.rect(0, 0, mapSize.width, mapSize.height).fill({ color: ambientColor })

    this.illumGraphics.clear()
    this.illumGraphics.blendMode = 'add'
    for (const light of lights) {
      if (!light.enabled) continue
      const pos = resolveLightPos(light)
      const polygon = computeVisibilityPolygon(pos, wallSegmentsPx, light.radius * gridSizePx)
      fillPolygon(this.illumGraphics, polygon)
    }
    for (const token of ownTokens) {
      const pos: Point = { x: token.x * gridSizePx, y: token.y * gridSizePx }
      const polygon = computeVisibilityPolygon(pos, wallSegmentsPx, personalVisionRadiusCells * gridSizePx)
      fillPolygon(this.illumGraphics, polygon)
    }

    // LOS mask: union of every owned token's own max-range visibility polygon.
    this.losMaskGraphics.clear()
    for (const token of ownTokens) {
      const pos: Point = { x: token.x * gridSizePx, y: token.y * gridSizePx }
      const polygon = computeVisibilityPolygon(pos, wallSegmentsPx, maxVisionRadiusCells * gridSizePx)
      fillPolygon(this.losMaskGraphics, polygon)
    }

    renderer.render({ container: this.illumContainer, target: this.renderTexture, clear: true, clearColor: 0x000000 })

    // Persistent fog-of-exploration: find which cells are genuinely lit up
    // this frame, union into the known explored set, then dim-stamp any
    // explored cell that's currently darker than the memory floor.
    const cols = Math.max(1, Math.ceil(mapSize.width / gridSizePx))
    const rows = Math.max(1, Math.ceil(mapSize.height / gridSizePx))
    const extracted = renderer.extract.pixels({ target: this.renderTexture })
    const { pixels, width: pxWidth, height: pxHeight } = extracted

    const cellRed = (cx: number, cy: number): number => {
      const px = Math.min(pxWidth - 1, Math.floor((cx + 0.5) * gridSizePx))
      const py = Math.min(pxHeight - 1, Math.floor((cy + 0.5) * gridSizePx))
      return pixels[(py * pxWidth + px) * 4]
    }

    const newlyExplored: string[] = []
    const allExplored = new Set(exploredCells)
    for (let cy = 0; cy < rows; cy++) {
      for (let cx = 0; cx < cols; cx++) {
        if (cellRed(cx, cy) <= 5) continue
        const key = `${cx},${cy}`
        if (!allExplored.has(key)) {
          allExplored.add(key)
          newlyExplored.push(key)
        }
      }
    }

    // Only stamp cells that aren't currently visible at all (true live red
    // <= 5) — a cell you're actively looking at should show its real
    // current brightness (even a dim ambient level), not get bumped up to
    // the memory floor just because it's also been explored before.
    const memoryGray = Math.round(EXPLORED_MEMORY_BRIGHTNESS * 255)
    const dimCells: Array<[number, number]> = []
    for (const key of allExplored) {
      const [cx, cy] = key.split(',').map(Number)
      if (cellRed(cx, cy) <= 5) dimCells.push([cx, cy])
    }

    if (dimCells.length > 0) {
      this.drawGraphics.clear()
      this.drawGraphics.blendMode = 'normal'
      for (const [cx, cy] of dimCells) {
        this.drawGraphics
          .rect(cx * gridSizePx, cy * gridSizePx, gridSizePx, gridSizePx)
          .fill({ color: (memoryGray << 16) | (memoryGray << 8) | memoryGray, alpha: 1 })
      }
      renderer.render({ container: this.drawGraphics, target: this.renderTexture, clear: false })
    }

    return newlyExplored
  }

  private ensureRenderTexture(mapSize: { width: number; height: number }): void {
    if (this.currentSize && this.currentSize.width === mapSize.width && this.currentSize.height === mapSize.height) {
      return
    }
    this.renderTexture?.destroy(true)
    this.renderTexture = RenderTexture.create({ width: mapSize.width, height: mapSize.height })
    this.mask.texture = this.renderTexture
    this.currentSize = { width: mapSize.width, height: mapSize.height }
  }

  destroy(): void {
    this.renderTexture?.destroy(true)
    this.mask.destroy()
    this.illumContainer.destroy({ children: true })
  }
}

function fillPolygon(g: Graphics, polygon: Point[]): void {
  if (polygon.length < 3) return
  g.poly(polygon.flatMap((p) => [p.x, p.y])).fill({ color: 0xffffff, alpha: 1 })
}
