import { useCallback, useEffect, useRef, useState } from 'react'
import { sha256Hex } from '../map/assetSync'
import { getCachedAsset, putCachedAsset } from '../map/localAssetCache'
import { loadGlobalSettings, saveGlobalSettings, type SoundboardClipMeta } from './globalSettings'

export interface UseSoundboardResult {
  clips: SoundboardClipMeta[]
  addClip: (file: File) => Promise<void>
  removeClip: (id: string) => void
  /** Multiple clips can play at once (an ambience loop plus a one-shot
   * effect on top) — each tracked independently by clip id. */
  play: (id: string, options?: { loop?: boolean }) => Promise<void>
  stop: (id: string) => void
  stopAll: () => void
  playingIds: Set<string>
}

/** DM-local audio playback only — deliberately never synced to players
 * (ROADMAP.md's Decisions section already puts voice/video out of scope;
 * streaming ambience audio to remote peers would be the same kind of
 * infrastructure this app intentionally doesn't build). This plays on
 * whatever speakers the DM's own machine is connected to, same as a DM
 * running music from a phone next to the table. Clips persist across
 * campaigns (see globalSettings.ts) since a DM's ambience library isn't
 * tied to any one game. */
export function useSoundboard(): UseSoundboardResult {
  const [clips, setClips] = useState<SoundboardClipMeta[]>(() => loadGlobalSettings().soundboardClips)
  const [playingIds, setPlayingIds] = useState<Set<string>>(new Set())
  const audioElementsRef = useRef<Map<string, HTMLAudioElement>>(new Map())

  useEffect(() => {
    const audioElements = audioElementsRef.current
    return () => {
      for (const audio of audioElements.values()) audio.pause()
      audioElements.clear()
    }
  }, [])

  const persistClips = useCallback((next: SoundboardClipMeta[]) => {
    setClips(next)
    saveGlobalSettings({ ...loadGlobalSettings(), soundboardClips: next })
  }, [])

  const addClip = useCallback(
    async (file: File) => {
      const bytes = new Uint8Array(await file.arrayBuffer())
      const hash = await sha256Hex(bytes)
      await putCachedAsset(hash, file)
      const meta: SoundboardClipMeta = { id: crypto.randomUUID(), name: file.name, hash }
      persistClips([...loadGlobalSettings().soundboardClips, meta])
    },
    [persistClips],
  )

  const stop = useCallback((id: string) => {
    const audio = audioElementsRef.current.get(id)
    if (audio) {
      audio.pause()
      audioElementsRef.current.delete(id)
    }
    setPlayingIds((prev) => {
      if (!prev.has(id)) return prev
      const next = new Set(prev)
      next.delete(id)
      return next
    })
  }, [])

  const stopAll = useCallback(() => {
    for (const id of audioElementsRef.current.keys()) stop(id)
  }, [stop])

  const removeClip = useCallback(
    (id: string) => {
      stop(id)
      persistClips(loadGlobalSettings().soundboardClips.filter((c) => c.id !== id))
    },
    [persistClips, stop],
  )

  const play = useCallback(
    async (id: string, options: { loop?: boolean } = {}) => {
      const meta = loadGlobalSettings().soundboardClips.find((c) => c.id === id)
      if (!meta) return
      const blob = await getCachedAsset(meta.hash)
      if (!blob) return
      stop(id) // restart from the top if it's already playing
      const audio = new Audio(URL.createObjectURL(blob))
      audio.loop = options.loop ?? false
      audio.addEventListener('ended', () => stop(id))
      audioElementsRef.current.set(id, audio)
      setPlayingIds((prev) => new Set(prev).add(id))
      void audio.play()
    },
    [stop],
  )

  return { clips, addClip, removeClip, play, stop, stopAll, playingIds }
}
