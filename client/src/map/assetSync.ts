import { useEffect, useState } from 'react'
import * as Y from 'yjs'
import { ASSET_CHUNK_SIZE, ASSET_CHUNK_WRITE_DELAY_MS } from './constants'
import { getCachedAsset, putCachedAsset } from './localAssetCache'
import type { AssetKind, AssetMeta } from './types'

function assetMetaMap(doc: Y.Doc) {
  return doc.getMap<AssetMeta>('assetMeta')
}
function assetChunksMap(doc: Y.Doc) {
  return doc.getMap<Uint8Array>('assetChunks')
}

export async function sha256Hex(bytes: Uint8Array<ArrayBuffer>): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', bytes)
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

export interface PublishedAsset {
  assetId: string
  meta: AssetMeta
}

/**
 * Writes a compressed image into the shared doc: durable metadata (small,
 * never pruned) plus the binary in small chunks, each chunk its own `.set()`
 * outside a transaction so it broadcasts as its own small update rather than
 * one large message. Also caches the blob locally by content hash so it can
 * be re-published later (e.g. switching back to a scene) without
 * recompressing — see `republishAssetFromCache`.
 */
export async function publishAsset(
  doc: Y.Doc,
  kind: AssetKind,
  blob: Blob,
  dims: { width: number; height: number },
  assetIdOverride?: string,
): Promise<PublishedAsset> {
  const bytes = new Uint8Array(await blob.arrayBuffer())
  const hash = await sha256Hex(bytes)
  await putCachedAsset(hash, blob)

  const assetId = assetIdOverride ?? crypto.randomUUID()
  const totalChunks = Math.max(1, Math.ceil(bytes.byteLength / ASSET_CHUNK_SIZE))
  const meta: AssetMeta = {
    id: assetId,
    kind,
    mimeType: blob.type,
    width: dims.width,
    height: dims.height,
    totalChunks,
    chunkSize: ASSET_CHUNK_SIZE,
    byteLength: bytes.byteLength,
    hash,
  }
  assetMetaMap(doc).set(assetId, meta)

  const chunks = assetChunksMap(doc)
  for (let i = 0; i < totalChunks; i++) {
    const start = i * ASSET_CHUNK_SIZE
    chunks.set(`${assetId}:${i}`, bytes.subarray(start, start + ASSET_CHUNK_SIZE))
    if (i < totalChunks - 1) await delay(ASSET_CHUNK_WRITE_DELAY_MS)
  }

  return { assetId, meta }
}

/**
 * Deletes an asset's binary chunks from the doc to bound how much live binary
 * payload a newly-joining peer's initial sync has to carry in one message.
 * Metadata (hash, dims) is kept so the asset can be republished later.
 */
export function pruneAssetChunks(doc: Y.Doc, assetId: string): void {
  const meta = assetMetaMap(doc).get(assetId)
  if (!meta) return
  const chunks = assetChunksMap(doc)
  doc.transact(() => {
    for (let i = 0; i < meta.totalChunks; i++) {
      chunks.delete(`${assetId}:${i}`)
    }
  })
}

export function isAssetFullyLive(doc: Y.Doc, assetId: string): boolean {
  const meta = assetMetaMap(doc).get(assetId)
  if (!meta) return false
  const chunks = assetChunksMap(doc)
  for (let i = 0; i < meta.totalChunks; i++) {
    if (!chunks.has(`${assetId}:${i}`)) return false
  }
  return true
}

/** Re-writes a previously-pruned asset's chunks from the local cache, under
 * the same assetId, so scenes/tokens referencing it don't need updating.
 * Returns false if the bytes aren't in this browser's local cache (e.g. a
 * different machine, or storage was cleared) — the caller falls back to
 * asking for a fresh upload. */
export async function republishAssetFromCache(doc: Y.Doc, assetId: string): Promise<boolean> {
  const meta = assetMetaMap(doc).get(assetId)
  if (!meta) return false
  const blob = await getCachedAsset(meta.hash)
  if (!blob) return false
  await publishAsset(doc, meta.kind, blob, { width: meta.width, height: meta.height }, assetId)
  return true
}

const objectUrlCache = new Map<string, string>()

/**
 * Resolves an assetId to a usable ObjectURL once all its chunks have arrived
 * (or immediately, if this browser already assembled it once), and keeps
 * resolving on every relevant change (new chunks arriving, or a republish
 * after a prune). Kept for the tab's lifetime rather than revoked on prune —
 * pruning only affects the shared doc, not this peer's own already-assembled
 * bytes, and Phase 2's campaign sizes make the memory cost of that
 * negligible. Not a React hook — safe to call from plain classes (e.g.
 * canvas/TokenLayer.ts managing one subscription per token) as well as from
 * `useAssetUrl` below.
 */
export function subscribeAssetUrl(doc: Y.Doc, assetId: string, onUrl: (url: string) => void): () => void {
  const cached = objectUrlCache.get(assetId)
  if (cached) {
    onUrl(cached)
    return () => {}
  }

  const metaMap = assetMetaMap(doc)
  const chunksMap = assetChunksMap(doc)

  const tryAssemble = () => {
    const meta = metaMap.get(assetId)
    if (!meta) return
    const parts: Uint8Array[] = []
    for (let i = 0; i < meta.totalChunks; i++) {
      const chunk = chunksMap.get(`${assetId}:${i}`)
      if (!chunk) return
      parts.push(chunk)
    }
    const blob = new Blob(parts as BlobPart[], { type: meta.mimeType })
    const objectUrl = URL.createObjectURL(blob)
    objectUrlCache.set(assetId, objectUrl)
    onUrl(objectUrl)
  }

  tryAssemble()

  const onChunksChange = (event: Y.YMapEvent<Uint8Array>) => {
    for (const key of event.changes.keys.keys()) {
      if (key.startsWith(`${assetId}:`)) {
        tryAssemble()
        break
      }
    }
  }
  const onMetaChange = () => tryAssemble()

  chunksMap.observe(onChunksChange)
  metaMap.observe(onMetaChange)
  return () => {
    chunksMap.unobserve(onChunksChange)
    metaMap.unobserve(onMetaChange)
  }
}

export function useAssetUrl(doc: Y.Doc | null, assetId: string | null): string | null {
  const [url, setUrl] = useState<string | null>(() => (assetId ? (objectUrlCache.get(assetId) ?? null) : null))

  useEffect(() => {
    if (!doc || !assetId) {
      setUrl(null)
      return
    }
    setUrl(objectUrlCache.get(assetId) ?? null)
    return subscribeAssetUrl(doc, assetId, setUrl)
  }, [doc, assetId])

  return url
}
