import { Graphics, RenderTexture, Sprite, type Renderer } from 'pixi.js'
import { computeVisibilityPolygon, type Point, type Segment } from '../map/visibility'
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
}

/**
 * Computes and renders a player's fog-of-war mask: visible = (within the
 * player's own line of sight) AND (illuminated by some enabled light, or
 * within their personal-vision bubble). Never used for the DM, who always
 * sees everything — callers should simply not call `update()` for a DM
 * viewer and leave whatever container this masks unmasked.
 *
 * Rendering approach (see Phase 3 plan for the reasoning, verified against
 * pixi.js@8.19.0 source): one RenderTexture, two draw passes into it.
 * Pass 1 draws the union of illumination sources (lights + the personal-
 * vision bubble, both computed via the same visibility-polygon function)
 * with normal blending, opaque white — multiple overlapping white shapes in
 * one pass already union correctly without needing 'add' blend. Pass 2
 * draws the player's own max-range LOS polygon with 'multiply' blend on
 * top, which ANDs it against whatever pass 1 lit up. The result is exposed
 * as `.mask`, a Sprite wrapping the RenderTexture — Pixi's default
 * sprite-mask reads the mask's *red* channel (not alpha, despite the name),
 * which opaque white fills satisfy for free.
 */
export class FogLayer {
  readonly mask = new Sprite()
  private renderTexture: RenderTexture | null = null
  private readonly drawGraphics = new Graphics()
  private currentSize: { width: number; height: number } | null = null

  constructor() {
    // Part of the mask machinery only, never drawn as a normal scene object.
    this.mask.renderable = false
  }

  update(renderer: Renderer, input: FogInput): void {
    const { mapSize, gridSizePx, walls, lights, tokens, ownTokenIds, personalVisionRadiusCells, maxVisionRadiusCells } =
      input

    this.ensureRenderTexture(mapSize)
    if (!this.renderTexture) return

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
      // sight at all, so the whole map stays fogged. (The user-facing "your
      // DM hasn't assigned you a token" message is a separate UI concern.)
      this.drawGraphics.clear()
      renderer.render({ container: this.drawGraphics, target: this.renderTexture, clear: true, clearColor: 0x000000 })
      return
    }

    const resolveLightPos = (light: LightRecord): Point => {
      if (light.attachedTokenId) {
        const token = tokensById.get(light.attachedTokenId)
        if (token) return { x: token.x * gridSizePx, y: token.y * gridSizePx }
      }
      return { x: light.x * gridSizePx, y: light.y * gridSizePx }
    }

    // Pass 1: union of illumination (lights + personal vision), normal blend.
    this.drawGraphics.clear()
    this.drawGraphics.blendMode = 'normal'
    for (const light of lights) {
      if (!light.enabled) continue
      const pos = resolveLightPos(light)
      const polygon = computeVisibilityPolygon(pos, wallSegmentsPx, light.radius * gridSizePx)
      fillPolygon(this.drawGraphics, polygon)
    }
    for (const token of ownTokens) {
      const pos: Point = { x: token.x * gridSizePx, y: token.y * gridSizePx }
      const polygon = computeVisibilityPolygon(pos, wallSegmentsPx, personalVisionRadiusCells * gridSizePx)
      fillPolygon(this.drawGraphics, polygon)
    }
    renderer.render({ container: this.drawGraphics, target: this.renderTexture, clear: true, clearColor: 0x000000 })

    // Pass 2: the viewer's own max-range LOS, multiply blend — ANDs against pass 1.
    this.drawGraphics.clear()
    this.drawGraphics.blendMode = 'multiply'
    for (const token of ownTokens) {
      const pos: Point = { x: token.x * gridSizePx, y: token.y * gridSizePx }
      const polygon = computeVisibilityPolygon(pos, wallSegmentsPx, maxVisionRadiusCells * gridSizePx)
      fillPolygon(this.drawGraphics, polygon)
    }
    renderer.render({ container: this.drawGraphics, target: this.renderTexture, clear: false })
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
  }
}

function fillPolygon(g: Graphics, polygon: Point[]): void {
  if (polygon.length < 3) return
  g.poly(polygon.flatMap((p) => [p.x, p.y])).fill({ color: 0xffffff, alpha: 1 })
}
