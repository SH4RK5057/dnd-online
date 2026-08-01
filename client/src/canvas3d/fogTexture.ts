import { computeVisibilityPolygon, type Point, type Segment } from '../map/visibility'
import type { LightRecord, TokenRecord, WallRecord } from '../map/types'

export interface FogTextureInput {
  walls: WallRecord[]
  lights: LightRecord[]
  tokens: TokenRecord[]
  gridSizePx: number
  ownTokenIds: string[]
  personalVisionRadiusCells: number
  maxVisionRadiusCells: number
  ambientBrightness: number
  exploredCells: Set<string>
  persistentFogEnabled: boolean
  pxPerCell: number
}

/**
 * The 3D flat-plane view's equivalent of canvas/FogLayer.ts, drawn straight
 * onto a 2D canvas instead of Pixi's stencil-mask pipeline — reuses the
 * exact same pure visibility math (map/visibility.ts) so the two views
 * always agree on what's actually visible. Rather than a separate mask
 * object, this paints visibility as this canvas's own ALPHA channel:
 * fully opaque where lit, fully transparent where never explored, and
 * everything in between for dim ambient light — meant to be composited
 * onto the already-drawn map+walls+grid canvas via `'destination-in'` (see
 * canvas3d/Scene3D.tsx), so hidden/dim areas fall through to transparent
 * and reveal the (near-black) scene background behind the plane. No-ops
 * (returns without drawing) when there's no owned token — same fail-closed
 * "nothing visible" behavior as FogLayer for an unassigned viewer.
 */
export function drawFogOverlay(ctx: CanvasRenderingContext2D, width: number, height: number, input: FogTextureInput): void {
  const {
    walls,
    lights,
    tokens,
    gridSizePx,
    ownTokenIds,
    personalVisionRadiusCells,
    maxVisionRadiusCells,
    ambientBrightness,
    exploredCells,
    persistentFogEnabled,
    pxPerCell,
  } = input

  ctx.clearRect(0, 0, width, height)

  const tokensById = new Map(tokens.map((t) => [t.id, t]))
  const ownTokens = ownTokenIds.map((id) => tokensById.get(id)).filter((t): t is TokenRecord => !!t)
  if (ownTokens.length === 0) return // fail closed: nothing assigned, nothing visible

  // Wall coordinates converted from grid cells to this texture's own px
  // scale (pxPerCell), not the scene's real gridSizePx — same conversion
  // the grid lines and map image already go through.
  const wallSegments: Segment[] = walls.map((w) => ({
    x1: (w.x1 * pxPerCell * gridSizePx) / gridSizePx,
    y1: (w.y1 * pxPerCell * gridSizePx) / gridSizePx,
    x2: (w.x2 * pxPerCell * gridSizePx) / gridSizePx,
    y2: (w.y2 * pxPerCell * gridSizePx) / gridSizePx,
  }))
  // (the gridSizePx/gridSizePx above is a no-op left in deliberately readable
  // form — walls are already in cell units, so only pxPerCell applies)

  const resolveLightPos = (light: LightRecord): Point => {
    if (light.attachedTokenId) {
      const token = tokensById.get(light.attachedTokenId)
      if (token) return { x: token.x * pxPerCell, y: token.y * pxPerCell }
    }
    return { x: light.x * pxPerCell, y: light.y * pxPerCell }
  }

  // 1. Persistent-explored-but-not-currently-live cells: fully revealed,
  // everywhere explored, unclipped — overwritten below wherever the live
  // LOS clip actually covers them.
  if (persistentFogEnabled) {
    ctx.globalCompositeOperation = 'source-over'
    ctx.fillStyle = 'rgba(255, 255, 255, 1)'
    for (const key of exploredCells) {
      const [cx, cy] = key.split(',').map(Number)
      ctx.fillRect(cx * pxPerCell, cy * pxPerCell, pxPerCell, pxPerCell)
    }
  }

  // 2. Live line-of-sight region: clip to the union of every owned token's
  // own max-range visibility polygon, then fully overwrite (not blend) with
  // the ambient level, then additively brighten with lights/personal vision.
  ctx.save()
  ctx.beginPath()
  for (const token of ownTokens) {
    const pos: Point = { x: token.x * pxPerCell, y: token.y * pxPerCell }
    const polygon = computeVisibilityPolygon(pos, wallSegments, maxVisionRadiusCells * pxPerCell)
    addPolygonSubpath(ctx, polygon)
  }
  ctx.clip()

  ctx.globalCompositeOperation = 'copy'
  ctx.fillStyle = `rgba(255, 255, 255, ${Math.min(1, Math.max(0, ambientBrightness))})`
  ctx.fillRect(0, 0, width, height)

  ctx.globalCompositeOperation = 'lighter'
  ctx.fillStyle = 'rgba(255, 255, 255, 1)'
  for (const light of lights) {
    if (!light.enabled) continue
    const pos = resolveLightPos(light)
    const polygon = computeVisibilityPolygon(pos, wallSegments, light.radius * pxPerCell)
    fillPolygon(ctx, polygon)
  }
  for (const token of ownTokens) {
    const pos: Point = { x: token.x * pxPerCell, y: token.y * pxPerCell }
    const polygon = computeVisibilityPolygon(pos, wallSegments, personalVisionRadiusCells * pxPerCell)
    fillPolygon(ctx, polygon)
  }

  ctx.restore() // drops the clip and any composite-operation changes
}

function addPolygonSubpath(ctx: CanvasRenderingContext2D, polygon: Point[]): void {
  if (polygon.length < 3) return
  ctx.moveTo(polygon[0].x, polygon[0].y)
  for (let i = 1; i < polygon.length; i++) ctx.lineTo(polygon[i].x, polygon[i].y)
  ctx.closePath()
}

function fillPolygon(ctx: CanvasRenderingContext2D, polygon: Point[]): void {
  if (polygon.length < 3) return
  ctx.beginPath()
  addPolygonSubpath(ctx, polygon)
  ctx.fill()
}
