import * as THREE from 'three'
import { STLLoader } from 'three/examples/jsm/loaders/STLLoader.js'

const cache = new Map<string, THREE.BufferGeometry>()
const pending = new Map<string, Promise<THREE.BufferGeometry>>()
const loader = new STLLoader()

/** Already-resolved geometry for a URL, if any — synchronous, mirrors
 * canvas/textureCache.ts's getCachedTexture. */
export function getCachedModelGeometry(url: string): THREE.BufferGeometry | null {
  return cache.get(url) ?? null
}

/**
 * Loads (or returns the cached/in-flight) normalized STL geometry for a URL.
 * `STLLoader.parse` is synchronous once the bytes are in hand, so this is
 * just a fetch + parse, no image-decode step needed (contrast with
 * textureCache.ts's createImageBitmap).
 *
 * Normalization applied so any uploaded mini "just stands" on the plane
 * regardless of how it was modeled:
 * - Rotated -90° around X first: STL miniatures from 3D-printing sources
 *   (Thingiverse, MyMiniFactory, etc.) are near-universally modeled Z-up,
 *   matching how printers slice, but three.js's world is Y-up — without
 *   this the mini renders lying on its back.
 * - Re-centered on X/Z and translated so the bounding box's minimum Y sits
 *   at 0, so it sits ON the plane instead of floating or clipping through it.
 * - Scaled so its height is exactly 1 world unit; canvas3d/Scene3D.tsx then
 *   multiplies that by a per-token target height (from sizeCategory), so a
 *   huge dragon's STL and a medium goblin's STL both come out sensibly
 *   sized regardless of the file's original real-world scale.
 */
export function loadModelGeometry(url: string): Promise<THREE.BufferGeometry> {
  const cached = cache.get(url)
  if (cached) return Promise.resolve(cached)

  let promise = pending.get(url)
  if (!promise) {
    promise = fetch(url)
      .then((response) => response.arrayBuffer())
      .then((buffer) => {
        const geometry = loader.parse(buffer)
        geometry.rotateX(-Math.PI / 2)
        geometry.computeBoundingBox()
        const box = geometry.boundingBox as THREE.Box3
        const size = new THREE.Vector3()
        box.getSize(size)
        const center = new THREE.Vector3()
        box.getCenter(center)
        const height = Math.max(size.y, 1e-6)
        const scale = 1 / height
        geometry.translate(-center.x, -box.min.y, -center.z)
        geometry.scale(scale, scale, scale)
        geometry.computeVertexNormals()
        cache.set(url, geometry)
        pending.delete(url)
        return geometry
      })
    pending.set(url, promise)
  }
  return promise
}
