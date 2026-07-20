/** Build-time default for a DM's private content mirror — optional, never
 * points anywhere by default. A DM can override it at runtime from the
 * compendium's mirror-import panel (persisted in localStorage), so this is
 * genuinely user-configured, not a hardcoded dependency. */
export const DEFAULT_5ETOOLS_MIRROR_URL: string = import.meta.env.VITE_5ETOOLS_MIRROR_URL ?? ''

const MIRROR_URL_KEY = 'dndonline:mirrorUrl'

export function loadSavedMirrorUrl(): string {
  return localStorage.getItem(MIRROR_URL_KEY) ?? DEFAULT_5ETOOLS_MIRROR_URL
}

export function saveMirrorUrl(url: string): void {
  if (url) localStorage.setItem(MIRROR_URL_KEY, url)
  else localStorage.removeItem(MIRROR_URL_KEY)
}
