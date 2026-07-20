import * as Y from 'yjs'

/** Whole-campaign backup/portability as a local file — downloads the raw
 * Yjs doc state (every scene, token, character, roll log entry, homebrew
 * item, everything) as a single binary file, re-importable later on this
 * machine or another one. This is on top of the existing IndexedDB
 * persistence (which can be cleared by the browser), not a replacement for
 * it. Local file only, never uploaded anywhere — matches the DM-hosted,
 * no-server decision in ROADMAP.md's Phase 1. Importing merges into the
 * current doc rather than replacing it — Yjs updates are safe to apply on
 * top of live state (each operation carries its own logical clock, so it
 * can't silently undo newer concurrent edits from other connected peers). */

export function exportCampaign(doc: Y.Doc, sessionName: string): void {
  const bytes = Y.encodeStateAsUpdate(doc)
  const blob = new Blob([bytes as BlobPart], { type: 'application/octet-stream' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  const safeName = sessionName.replace(/[^a-z0-9-_]+/gi, '_').slice(0, 60) || 'campaign'
  a.href = url
  a.download = `${safeName}-${new Date().toISOString().slice(0, 10)}.dndoc`
  a.click()
  URL.revokeObjectURL(url)
}

export async function importCampaignFile(doc: Y.Doc, file: File): Promise<void> {
  const bytes = new Uint8Array(await file.arrayBuffer())
  Y.applyUpdate(doc, bytes)
}
