/** Build-time default for a DM's private content mirror — optional, never
 * points anywhere by default. A DM can override it at runtime from the
 * compendium's mirror-import panel (persisted in localStorage), so this is
 * genuinely user-configured, not a hardcoded dependency. */
export const DEFAULT_5ETOOLS_MIRROR_URL: string = import.meta.env.VITE_5ETOOLS_MIRROR_URL ?? ''

const MIRROR_URL_KEY = 'dndonline:mirrorUrl'
const MIRROR_TOKEN_KEY = 'dndonline:mirrorToken'

export function loadSavedMirrorUrl(): string {
  return localStorage.getItem(MIRROR_URL_KEY) ?? DEFAULT_5ETOOLS_MIRROR_URL
}

export function saveMirrorUrl(url: string): void {
  if (url) localStorage.setItem(MIRROR_URL_KEY, url)
  else localStorage.removeItem(MIRROR_URL_KEY)
}

/** Optional bearer token (e.g. a GitHub personal access token) for fetching
 * a private mirror repo — sent only as an Authorization header on the
 * fetches in mirrorStorage.ts, straight from this browser to the mirror URL.
 * Stored in localStorage like the URL itself; this app has no server to
 * hold it more securely, matching its existing no-backend security model. */
export function loadSavedMirrorToken(): string {
  return localStorage.getItem(MIRROR_TOKEN_KEY) ?? ''
}

export function saveMirrorToken(token: string): void {
  if (token) localStorage.setItem(MIRROR_TOKEN_KEY, token)
  else localStorage.removeItem(MIRROR_TOKEN_KEY)
}
