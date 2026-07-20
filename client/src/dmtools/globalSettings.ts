/** DM preferences that apply ACROSS campaigns — unlike everything else in
 * this app (which lives in a per-campaign Yjs doc, fresh every new
 * session), this is plain localStorage, matching standaloneStorage.ts's
 * precedent for browser-local, campaign-independent data. Currently just
 * houses the soundboard clip library (see useSoundboard.ts) — the seed of
 * ROADMAP.md's "DM file ecosystem: Global Settings" item, extensible to
 * other cross-campaign preferences later without changing this shape. */

export interface SoundboardClipMeta {
  id: string
  name: string
  /** Content hash — the actual audio bytes live in the same local
   * IndexedDB blob cache maps/tokens already use (map/localAssetCache.ts),
   * keyed by this hash, not duplicated into localStorage. */
  hash: string
}

export interface GlobalSettings {
  soundboardClips: SoundboardClipMeta[]
}

const KEY = 'dndonline:globalSettings'

function defaultSettings(): GlobalSettings {
  return { soundboardClips: [] }
}

export function loadGlobalSettings(): GlobalSettings {
  const raw = localStorage.getItem(KEY)
  if (!raw) return defaultSettings()
  try {
    return { ...defaultSettings(), ...(JSON.parse(raw) as Partial<GlobalSettings>) }
  } catch {
    return defaultSettings()
  }
}

export function saveGlobalSettings(settings: GlobalSettings): void {
  localStorage.setItem(KEY, JSON.stringify(settings))
}
