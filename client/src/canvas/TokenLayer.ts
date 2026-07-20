import type { Texture } from 'pixi.js'
import { Container } from 'pixi.js'
import type * as Y from 'yjs'
import { subscribeAssetUrl } from '../map/assetSync'
import type { TokenRecord } from '../map/types'
import { getCachedTexture, loadTexture } from './textureCache'
import { TokenSprite, type TokenSpriteCallbacks } from './TokenSprite'

interface Entry {
  sprite: TokenSprite
  unsubscribeTexture: (() => void) | null
  textureUrl: string | null
  texture: Texture | null
  assetId: string | null
}

export interface TokenLayerHandlers {
  onMove: (tokenId: string, gridX: number, gridY: number) => void
  onMoveEnd: (tokenId: string, gridX: number, gridY: number) => void
  onSelect: (tokenId: string) => void
}

/** Manages one TokenSprite per token, diffing against the latest token list
 * each `update()` call, and one texture subscription per token (resolved
 * independently of React — see subscribeAssetUrl in map/assetSync.ts). */
export class TokenLayer {
  readonly container = new Container()
  private readonly entries = new Map<string, Entry>()
  private latestTokens = new Map<string, TokenRecord>()
  private draggable = false
  private selectable = false
  private selectedTokenId: string | null = null
  private handlers: TokenLayerHandlers | null = null

  private resolvedHpByTokenId = new Map<string, { current: number; max: number; temp: number } | null>()

  update(
    doc: Y.Doc,
    tokens: TokenRecord[],
    gridSizePx: number,
    draggable: boolean,
    selectable: boolean,
    selectedTokenId: string | null,
    resolvedHpByTokenId: Map<string, { current: number; max: number; temp: number } | null>,
    handlers: TokenLayerHandlers,
  ): void {
    this.resolvedHpByTokenId = resolvedHpByTokenId
    const interactionChanged = this.draggable !== draggable || this.selectable !== selectable
    this.draggable = draggable
    this.selectable = selectable
    this.selectedTokenId = selectedTokenId
    this.handlers = handlers
    this.latestTokens = new Map(tokens.map((t) => [t.id, t]))

    const seen = new Set<string>()
    for (const token of tokens) {
      seen.add(token.id)
      let entry = this.entries.get(token.id)
      if (!entry || interactionChanged) {
        // Interaction flags (draggable/selectable) are constructor-time on
        // TokenSprite, not part of update() — when they change (e.g. the DM
        // switches out of Move mode), rebuild the sprite rather than trying
        // to mutate its event listeners in place.
        if (entry) {
          entry.unsubscribeTexture?.()
          this.container.removeChild(entry.sprite.container)
          entry.sprite.destroy()
        }
        entry = this.createEntry(token.id)
        this.entries.set(token.id, entry)
        this.container.addChild(entry.sprite.container)
      }
      if (entry.assetId !== token.assetId) {
        entry.unsubscribeTexture?.()
        entry.assetId = token.assetId
        entry.textureUrl = null
        entry.texture = null
        entry.unsubscribeTexture = token.assetId
          ? subscribeAssetUrl(doc, token.assetId, (url) => {
              entry.textureUrl = url
              entry.texture = getCachedTexture(url)
              if (!entry.texture) {
                loadTexture(url).then((texture) => {
                  if (entry.textureUrl !== url) return // superseded by a newer asset
                  entry.texture = texture
                  this.renderEntry(token.id, gridSizePx)
                })
              }
              this.renderEntry(token.id, gridSizePx)
            })
          : null
      }
      this.renderEntry(token.id, gridSizePx)
    }

    for (const [id, entry] of this.entries) {
      if (seen.has(id)) continue
      entry.unsubscribeTexture?.()
      this.container.removeChild(entry.sprite.container)
      entry.sprite.destroy()
      this.entries.delete(id)
    }
  }

  private createEntry(tokenId: string): Entry {
    const callbacks: TokenSpriteCallbacks = {
      onDragMove: (x, y) => this.handlers?.onMove(tokenId, x, y),
      onDragEnd: (x, y) => this.handlers?.onMoveEnd(tokenId, x, y),
      onSelect: () => this.handlers?.onSelect(tokenId),
    }
    return {
      sprite: new TokenSprite({ draggable: this.draggable, selectable: this.selectable }, callbacks),
      unsubscribeTexture: null,
      textureUrl: null,
      texture: null,
      assetId: null,
    }
  }

  private renderEntry(tokenId: string, gridSizePx: number): void {
    const entry = this.entries.get(tokenId)
    const token = this.latestTokens.get(tokenId)
    if (!entry || !token) return
    entry.sprite.update({
      name: token.name,
      sizeCategory: token.sizeCategory,
      gridX: token.x,
      gridY: token.y,
      gridSizePx,
      texture: entry.texture,
      hp: this.resolvedHpByTokenId.get(tokenId) ?? null,
      conditions: token.conditions,
      selected: token.id === this.selectedTokenId,
    })
  }

  destroy(): void {
    for (const entry of this.entries.values()) {
      entry.unsubscribeTexture?.()
      entry.sprite.destroy()
    }
    this.entries.clear()
    this.container.destroy({ children: true })
  }
}
