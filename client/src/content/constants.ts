/** Edit this to your own mirror repo's raw base URL once you've set one up
 * (see mirrorStorage.ts's doc comment for the expected 5etools-2014-src
 * file layout: data/spells/*.json + index.json, data/bestiary/*.json +
 * index.json, data/items.json, data/items-base.json). For a GitHub repo
 * this is `https://raw.githubusercontent.com/<owner>/<repo>/<branch>` —
 * no trailing path, no trailing slash. Leave empty to skip.
 *
 * A repo URL by itself isn't sensitive — this file is committed to a
 * public repo, so it's fine to have the URL here, but NEVER put an access
 * token in this file. If your mirror is private, enter its token at
 * runtime in the compendium's mirror-import panel instead (loadSavedMirrorToken
 * below) — that's kept in your own browser's local storage only, never
 * committed. */
const MY_MIRROR_REPO_URL = ''

/** Build-time fallback, for anyone who'd rather set this via an env var
 * than edit the constant above (e.g. a per-machine .env without touching
 * tracked source). MY_MIRROR_REPO_URL wins if both are set. Either way, a
 * DM can still override at runtime from the compendium's mirror-import
 * panel (persisted in localStorage) — none of this is a hardcoded
 * dependency, just layered defaults. */
export const DEFAULT_5ETOOLS_MIRROR_URL: string = MY_MIRROR_REPO_URL || import.meta.env.VITE_5ETOOLS_MIRROR_URL || ''

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
