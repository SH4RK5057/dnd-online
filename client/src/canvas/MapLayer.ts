import { Container, Sprite } from 'pixi.js'
import { loadTexture } from './textureCache'

export class MapLayer {
  readonly container = new Container()
  private sprite: Sprite | null = null
  private currentUrl: string | null = null
  private loadedSize: { width: number; height: number } | null = null

  /** onReady fires once the texture has actually finished loading and
   * `size` reflects its real dimensions (see textureCache.ts — Assets.load
   * only resolves once the image is fully decoded, so there's no placeholder
   * dimension window to guard against here). */
  setTexture(url: string | null, onReady?: () => void): void {
    if (url === this.currentUrl) {
      if (this.loadedSize) onReady?.()
      return
    }
    this.currentUrl = url
    this.loadedSize = null
    if (this.sprite) {
      this.container.removeChild(this.sprite)
      this.sprite.destroy()
      this.sprite = null
    }
    if (!url) return

    loadTexture(url).then((texture) => {
      if (this.currentUrl !== url) return // a newer setTexture() call superseded this one
      this.sprite = new Sprite(texture)
      this.container.addChildAt(this.sprite, 0)
      this.loadedSize = { width: texture.width, height: texture.height }
      onReady?.()
    })
  }

  /** Native pixel size of the current map image, or null if not yet loaded. */
  get size(): { width: number; height: number } | null {
    return this.loadedSize
  }

  destroy(): void {
    this.container.destroy({ children: true })
  }
}
