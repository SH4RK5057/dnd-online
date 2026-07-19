import { MAX_UPLOAD_BYTES } from './constants'

export interface CompressedImage {
  blob: Blob
  width: number
  height: number
}

export async function compressImage(
  file: File | Blob,
  opts: { maxDimension: number; quality: number },
): Promise<CompressedImage> {
  if (file.size > MAX_UPLOAD_BYTES) {
    throw new Error(`Image is too large (max ${Math.round(MAX_UPLOAD_BYTES / (1024 * 1024))}MB).`)
  }

  const bitmap = await createImageBitmap(file)
  const scale = Math.min(1, opts.maxDimension / Math.max(bitmap.width, bitmap.height))
  const width = Math.max(1, Math.round(bitmap.width * scale))
  const height = Math.max(1, Math.round(bitmap.height * scale))

  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Canvas 2D context unavailable.')
  ctx.drawImage(bitmap, 0, 0, width, height)
  bitmap.close()

  const blob = await encodeCanvas(canvas, opts.quality)
  return { blob, width, height }
}

async function encodeCanvas(canvas: HTMLCanvasElement, quality: number): Promise<Blob> {
  const webp = await toBlob(canvas, 'image/webp', quality)
  if (webp && webp.type === 'image/webp') return webp
  const jpeg = await toBlob(canvas, 'image/jpeg', quality)
  if (jpeg) return jpeg
  throw new Error('Failed to encode image.')
}

function toBlob(canvas: HTMLCanvasElement, type: string, quality: number): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, type, quality))
}
