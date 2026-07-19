import { ImageSource, Texture } from 'pixi.js'

const cache = new Map<string, Texture>()
const pending = new Map<string, Promise<Texture>>()

/** Already-resolved texture for a URL, if any — synchronous, for render code
 * that just wants "whatever we have right now, or nothing yet". */
export function getCachedTexture(url: string): Texture | null {
  return cache.get(url) ?? null
}

/**
 * Loads (or returns the cached/in-flight) texture for a URL.
 *
 * Deliberately bypasses PixiJS's `Assets`/`Cache` system: `Assets.load(url)`
 * (and `Texture.from(url)`, which in v8 only reads the Cache rather than
 * loading like v7 did) both pick a loader by sniffing the URL's file
 * extension or MIME-sniffing a data: URL — see loadTextures.js's `test()`.
 * Our URLs are `blob:` with no extension, so that check always fails and
 * Assets.load() resolves null. Building the Texture directly from a decoded
 * ImageBitmap sidesteps extension-based format detection entirely.
 */
export function loadTexture(url: string): Promise<Texture> {
  const cached = cache.get(url)
  if (cached) return Promise.resolve(cached)

  let promise = pending.get(url)
  if (!promise) {
    promise = fetch(url)
      .then((response) => response.blob())
      .then((blob) => createImageBitmap(blob))
      .then((bitmap) => {
        const texture = new Texture({ source: new ImageSource({ resource: bitmap }) })
        cache.set(url, texture)
        pending.delete(url)
        return texture
      })
    pending.set(url, promise)
  }
  return promise
}
