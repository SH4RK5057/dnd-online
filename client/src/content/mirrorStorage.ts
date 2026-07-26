/** Private-mirror content ingestion: lets a DM point this app at their own
 * local copy of 5etools-2014-src-shaped JSON (data/spells/*.json,
 * data/bestiary/*.json, data/items.json) — either by picking local files or
 * by configuring VITE_5ETOOLS_MIRROR_URL to fetch from a self-hosted mirror
 * — without any such data ever being bundled into this public codebase.
 * Parsed/normalized results are cached in a local IndexedDB store (separate
 * from y-indexeddb, same pattern as map/localAssetCache.ts) so a DM doesn't
 * need to re-import/re-fetch every session. */
import type { ItemData, MonsterData, SpellData } from './types'
import { normalizeItem, normalizeMonster, normalizeSpell } from './mirrorNormalize'
import { defaultContentCategories, type ContentCategories } from './contentSourceTypes'

const DB_NAME = 'dndonline-content-mirror'
const STORE_NAME = 'content'
const DB_VERSION = 1

export interface MirrorContent {
  spells: SpellData[]
  monsters: MonsterData[]
  items: ItemData[]
  importedAt: number
  /** Empty for a local-file import (nothing shareable to key off of).
   * Otherwise matches contentSourceTypes.ts's sourceKeyFor() for whatever
   * URL/repo this was fetched from, so useCompendium can tell whether this
   * cached content already matches the campaign's currently-configured
   * shared source or needs re-fetching. */
  sourceKey: string
}

export interface MirrorImportResult {
  content: MirrorContent
  errors: string[]
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION)
    req.onupgradeneeded = () => {
      req.result.createObjectStore(STORE_NAME)
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

export async function getCachedMirrorContent(): Promise<MirrorContent | null> {
  const db = await openDb()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly')
    const req = tx.objectStore(STORE_NAME).get('content')
    req.onsuccess = () => resolve((req.result as MirrorContent | undefined) ?? null)
    req.onerror = () => reject(req.error)
  })
}

async function putCachedMirrorContent(content: MirrorContent): Promise<void> {
  const db = await openDb()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite')
    tx.objectStore(STORE_NAME).put(content, 'content')
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
}

export async function clearCachedMirrorContent(): Promise<void> {
  const db = await openDb()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite')
    tx.objectStore(STORE_NAME).delete('content')
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
}

let keyCounter = 0
function nextKey(prefix: string): string {
  keyCounter += 1
  return `mirror:${prefix}-${keyCounter}`
}

/** Classifies one parsed JSON file by its top-level array key — 5etools
 * spell files are `{spell: [...]}`, bestiary files `{monster: [...]}`, the
 * items file `{item: [...]}`. Anything else is reported as an error rather
 * than silently ignored, so a DM importing the wrong file finds out why.
 * A category the DM excluded (per `categories`) is skipped silently — that's
 * a deliberate choice, not an error. */
export function ingestFile(filename: string, json: unknown, into: MirrorContent, errors: string[], categories: ContentCategories): void {
  if (!json || typeof json !== 'object') {
    errors.push(`${filename}: not a JSON object`)
    return
  }
  const obj = json as Record<string, unknown>
  if (Array.isArray(obj.spell)) {
    if (!categories.includeSpells) return
    for (const raw of obj.spell) {
      const spell = normalizeSpell(raw, nextKey('spell'))
      if (spell) into.spells.push(spell)
    }
  } else if (Array.isArray(obj.monster)) {
    if (!categories.includeMonsters) return
    for (const raw of obj.monster) {
      const monster = normalizeMonster(raw, nextKey('monster'))
      if (monster) into.monsters.push(monster)
    }
  } else if (Array.isArray(obj.item)) {
    if (!categories.includeItems) return
    for (const raw of obj.item) {
      const item = normalizeItem(raw, nextKey('item'))
      if (item) into.items.push(item)
    }
  } else {
    errors.push(`${filename}: no recognized "spell"/"monster"/"item" array — expected 5etools-2014-src shape`)
  }
}

/** Imports a set of local files the DM picked (a FileList from an
 * `<input type="file" multiple>`), replacing any previously-cached mirror
 * content. Bad/unrecognized files are skipped and reported in `errors`
 * rather than aborting the whole import. `categories` (default: all) limits
 * which of spells/monsters/items get ingested — e.g. pass only
 * `includeMonsters: true` to import just monsters from a folder that also
 * has spell/item files mixed in. */
export async function importMirrorFiles(
  files: FileList | File[],
  categories: ContentCategories = defaultContentCategories(),
): Promise<MirrorImportResult> {
  const content: MirrorContent = { spells: [], monsters: [], items: [], importedAt: Date.now(), sourceKey: '' }
  const errors: string[] = []
  for (const file of Array.from(files)) {
    try {
      const text = await file.text()
      ingestFile(file.name, JSON.parse(text), content, errors, categories)
    } catch (err) {
      errors.push(`${file.name}: ${err instanceof Error ? err.message : 'failed to read/parse'}`)
    }
  }
  await putCachedMirrorContent(content)
  return { content, errors }
}

async function tryFetchJson(url: string, token: string): Promise<unknown | null> {
  try {
    const res = await fetch(url, token ? { headers: { Authorization: `token ${token}` } } : undefined)
    if (!res.ok) return null
    return await res.json()
  } catch {
    return null
  }
}

/** Fetches from a configured mirror URL (5etools-2014-src layout) — any repo
 * the DM points it at, public or private. `token` is optional: pass a
 * GitHub personal access token (or any bearer token your mirror expects) to
 * reach a private repo — raw.githubusercontent.com honors `Authorization:
 * token <PAT>` for repos that token can read, so a URL like
 * `https://raw.githubusercontent.com/<owner>/<repo>/<branch>` plus a token
 * works the same as a public mirror URL alone. The token is only ever used
 * for these fetches, made directly from this browser to GitHub (or wherever
 * the URL points) — it's never sent anywhere else. Tries each content
 * family's index.json first (maps source -> filename) and falls back to a
 * couple of conventional single-file names if no index is found — a
 * mirror's exact layout can vary, so this stays best-effort/resilient
 * rather than requiring one fixed structure. Never throws; every failure is
 * collected into `errors` instead. `sourceKey` is optional — pass
 * contentSourceTypes.ts's sourceKeyFor() when this fetch corresponds to the
 * campaign's shared content source, so useCompendium can recognize this
 * cache as matching it later. `categories` (default: all) skips fetching
 * whole file families that aren't wanted — e.g. with `includeSpells: false`
 * this never even requests the spells index/files. */
export async function fetchMirrorFromUrl(
  baseUrl: string,
  token = '',
  sourceKey = '',
  categories: ContentCategories = defaultContentCategories(),
): Promise<MirrorImportResult> {
  const base = baseUrl.replace(/\/+$/, '')
  const content: MirrorContent = { spells: [], monsters: [], items: [], importedAt: Date.now(), sourceKey }
  const errors: string[] = []

  if (categories.includeItems) {
    // 5etools-2014-src splits items across two files: items.json (magic
    // items) and items-base.json (mundane gear) — fetch both,
    // items-base.json is optional (older/simpler mirrors may only have one).
    const itemsJson = await tryFetchJson(`${base}/data/items.json`, token)
    if (itemsJson) ingestFile('items.json', itemsJson, content, errors, categories)
    else errors.push('data/items.json: not found or unreachable (check the URL, and the token if this is a private repo)')

    const itemsBaseJson = await tryFetchJson(`${base}/data/items-base.json`, token)
    if (itemsBaseJson) ingestFile('items-base.json', itemsBaseJson, content, errors, categories)
  }

  if (categories.includeSpells) await fetchIndexedFamily(base, 'spells', token, content, errors, categories)
  if (categories.includeMonsters) await fetchIndexedFamily(base, 'bestiary', token, content, errors, categories)

  await putCachedMirrorContent(content)
  return { content, errors }
}

interface GithubTreeEntry {
  path: string
  type: string
}

/** Imports from any GitHub repo/folder regardless of its internal layout —
 * unlike fetchMirrorFromUrl (which only looks for the fixed 5etools-2014-src
 * filenames), this lists the whole repo tree in one call and ingests every
 * `.json` file under `path` (or the whole repo if `path` is empty),
 * recognizing the same {spell:[...]}/{monster:[...]}/{item:[...]} shapes via
 * ingestFile. Lets a DM point this at any subset of their own private
 * dataset without needing to match 5etools' exact folder/file naming.
 * `sourceKey`/`categories` are optional — see fetchMirrorFromUrl's doc
 * comment. Since files here can be named/organized arbitrarily, excluded
 * categories are filtered at ingest time (post-fetch) rather than skipping
 * network requests up front — every .json under `path` still gets fetched,
 * just not all of it kept. */
export async function fetchGithubRepo(
  owner: string,
  repo: string,
  branch: string,
  path: string,
  token = '',
  sourceKey = '',
  categories: ContentCategories = defaultContentCategories(),
): Promise<MirrorImportResult> {
  const content: MirrorContent = { spells: [], monsters: [], items: [], importedAt: Date.now(), sourceKey }
  const errors: string[] = []
  const headers: Record<string, string> = { Accept: 'application/vnd.github+json' }
  if (token) headers.Authorization = `token ${token}`

  let treeJson: unknown
  try {
    const res = await fetch(
      `https://api.github.com/repos/${owner}/${repo}/git/trees/${encodeURIComponent(branch)}?recursive=1`,
      { headers },
    )
    if (!res.ok) {
      errors.push(`Could not list ${owner}/${repo}@${branch}: ${res.status} ${res.statusText}`)
      return { content, errors }
    }
    treeJson = await res.json()
  } catch (err) {
    errors.push(`Could not reach the GitHub API: ${err instanceof Error ? err.message : 'network error'}`)
    return { content, errors }
  }

  const tree = treeJson as { tree?: GithubTreeEntry[]; truncated?: boolean }
  const prefix = path.replace(/^\/+|\/+$/g, '')
  const jsonPaths = (tree.tree ?? [])
    .filter((e) => e.type === 'blob' && e.path.endsWith('.json'))
    .filter((e) => !prefix || e.path === prefix || e.path.startsWith(`${prefix}/`))
    .map((e) => e.path)

  if (tree.truncated) {
    errors.push('GitHub truncated this repo\'s file listing (very large repo) — narrow the folder path to make sure everything under it is fetched.')
  }
  if (jsonPaths.length === 0) {
    errors.push(`No .json files found under "${prefix || '/'}" in ${owner}/${repo}@${branch}.`)
  }

  const rawBase = `https://raw.githubusercontent.com/${owner}/${repo}/${branch}`
  for (const filePath of jsonPaths) {
    const json = await tryFetchJson(`${rawBase}/${filePath}`, token)
    if (json) ingestFile(filePath, json, content, errors, categories)
    else errors.push(`${filePath}: not found or unreachable`)
  }

  await putCachedMirrorContent(content)
  return { content, errors }
}

async function fetchIndexedFamily(
  base: string,
  folder: string,
  token: string,
  content: MirrorContent,
  errors: string[],
  categories: ContentCategories,
): Promise<void> {
  const index = await tryFetchJson(`${base}/data/${folder}/index.json`, token)
  const filenames: string[] = []
  if (index && typeof index === 'object') {
    filenames.push(...Object.values(index as Record<string, string>))
  }
  if (filenames.length === 0) {
    // No index — fall back to the most common single-source filename for this family.
    filenames.push(folder === 'spells' ? 'spells-phb.json' : 'bestiary-mm.json')
  }
  for (const filename of filenames) {
    const json = await tryFetchJson(`${base}/data/${folder}/${filename}`, token)
    if (json) ingestFile(`${folder}/${filename}`, json, content, errors, categories)
    else errors.push(`${folder}/${filename}: not found or unreachable`)
  }
}
