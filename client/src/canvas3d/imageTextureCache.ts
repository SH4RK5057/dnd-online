import * as THREE from 'three'

/** URL-keyed texture cache for token images in the 3D flat-plane view —
 * same spirit as modelCache.ts's STL geometry cache, just for the flat
 * billboard images tokens without an uploaded 3D model fall back to. */
const cache = new Map<string, THREE.Texture>()
const loader = new THREE.TextureLoader()

export function getCachedImageTexture(url: string): THREE.Texture | null {
  return cache.get(url) ?? null
}

export function loadImageTexture(url: string): Promise<THREE.Texture> {
  const cached = cache.get(url)
  if (cached) return Promise.resolve(cached)
  return new Promise((resolve, reject) => {
    loader.load(
      url,
      (texture) => {
        texture.colorSpace = THREE.SRGBColorSpace
        cache.set(url, texture)
        resolve(texture)
      },
      undefined,
      reject,
    )
  })
}
