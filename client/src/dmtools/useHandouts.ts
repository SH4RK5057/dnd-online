import { useCallback, useEffect, useState } from 'react'
import * as Y from 'yjs'
import { publishAsset } from '../map/assetSync'
import { HANDOUT_IMAGE_MAX_DIMENSION, HANDOUT_IMAGE_QUALITY } from '../map/constants'
import { compressImage } from '../map/imageCompress'
import type { HandoutRecord } from './types'

function handoutsMap(doc: Y.Doc) {
  return doc.getMap<HandoutRecord>('handouts')
}

export interface UseHandoutsResult {
  handouts: HandoutRecord[]
  createHandout: (name: string) => string
  deleteHandout: (id: string) => void
  setHandoutText: (id: string, text: string) => void
  setHandoutImage: (id: string, file: File) => Promise<void>
  setHandoutShown: (id: string, shown: boolean) => void
  setHandoutVisibleToPlayers: (id: string, playerIds: string[] | null) => void
}

/** DM shares an image and/or text "on demand" — created privately, revealed
 * to players by flipping `shownToPlayers` (same on/off convention as
 * SceneRecord.published), optionally narrowed to a subset of players via
 * `visibleToPlayerIds` instead of broadcasting to everyone. Images reuse the
 * same chunked-sync asset pipeline as maps/tokens (map/assetSync.ts) — kind
 * 'handout', already threaded through AssetKind. */
export function useHandouts(doc: Y.Doc | null): UseHandoutsResult {
  const [handouts, setHandouts] = useState<HandoutRecord[]>([])

  useEffect(() => {
    if (!doc) {
      setHandouts([])
      return
    }
    const m = handoutsMap(doc)
    const sync = () => setHandouts(Array.from(m.values()).sort((a, b) => b.createdAt - a.createdAt))
    sync()
    m.observe(sync)
    return () => m.unobserve(sync)
  }, [doc])

  const patchHandout = useCallback(
    (id: string, patch: Partial<Omit<HandoutRecord, 'id'>>) => {
      if (!doc) return
      const m = handoutsMap(doc)
      const record = m.get(id)
      if (!record) return
      m.set(id, { ...record, ...patch })
    },
    [doc],
  )

  const createHandout = useCallback(
    (name: string): string => {
      if (!doc) throw new Error('No active session.')
      const id = crypto.randomUUID()
      const record: HandoutRecord = {
        id,
        name,
        assetId: null,
        text: '',
        shownToPlayers: false,
        visibleToPlayerIds: null,
        createdAt: Date.now(),
      }
      handoutsMap(doc).set(id, record)
      return id
    },
    [doc],
  )

  const deleteHandout = useCallback(
    (id: string) => {
      if (!doc) return
      handoutsMap(doc).delete(id)
    },
    [doc],
  )

  const setHandoutText = useCallback((id: string, text: string) => patchHandout(id, { text }), [patchHandout])
  const setHandoutShown = useCallback((id: string, shownToPlayers: boolean) => patchHandout(id, { shownToPlayers }), [patchHandout])
  const setHandoutVisibleToPlayers = useCallback(
    (id: string, playerIds: string[] | null) => patchHandout(id, { visibleToPlayerIds: playerIds }),
    [patchHandout],
  )

  const setHandoutImage = useCallback(
    async (id: string, file: File) => {
      if (!doc) return
      const compressed = await compressImage(file, { maxDimension: HANDOUT_IMAGE_MAX_DIMENSION, quality: HANDOUT_IMAGE_QUALITY })
      const { assetId } = await publishAsset(doc, 'handout', compressed.blob, compressed)
      patchHandout(id, { assetId })
    },
    [doc, patchHandout],
  )

  return { handouts, createHandout, deleteHandout, setHandoutText, setHandoutImage, setHandoutShown, setHandoutVisibleToPlayers }
}
