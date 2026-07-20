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

const DB_NAME = 'dndonline-content-mirror'
const STORE_NAME = 'content'
const DB_VERSION = 1

export interface MirrorContent {
  spells: SpellData[]
  monsters: MonsterData[]
  items: ItemData[]
  importedAt: number
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
 * than silently ignored, so a DM importing the wrong file finds out why. */
function ingestFile(filename: string, json: unknown, into: MirrorContent, errors: string[]): void {
  if (!json || typeof json !== 'object') {
    errors.push(`${filename}: not a JSON object`)
    return
  }
  const obj = json as Record<string, unknown>
  if (Array.isArray(obj.spell)) {
    for (const raw of obj.spell) {
      const spell = normalizeSpell(raw, nextKey('spell'))
      if (spell) into.spells.push(spell)
    }
  } else if (Array.isArray(obj.monster)) {
    for (const raw of obj.monster) {
      const monster = normalizeMonster(raw, nextKey('monster'))
      if (monster) into.monsters.push(monster)
    }
  } else if (Array.isArray(obj.item)) {
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
 * rather than aborting the whole import. */
export async function importMirrorFiles(files: FileList | File[]): Promise<MirrorImportResult> {
  const content: MirrorContent = { spells: [], monsters: [], items: [], importedAt: Date.now() }
  const errors: string[] = []
  for (const file of Array.from(files)) {
    try {
      const text = await file.text()
      ingestFile(file.name, JSON.parse(text), content, errors)
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
 * collected into `errors` instead. */
export async function fetchMirrorFromUrl(baseUrl: string, token = ''): Promise<MirrorImportResult> {
  const base = baseUrl.replace(/\/+$/, '')
  const content: MirrorContent = { spells: [], monsters: [], items: [], importedAt: Date.now() }
  const errors: string[] = []

  const itemsJson = await tryFetchJson(`${base}/data/items.json`, token)
  if (itemsJson) ingestFile('items.json', itemsJson, content, errors)
  else errors.push('data/items.json: not found or unreachable (check the URL, and the token if this is a private repo)')

  await fetchIndexedFamily(base, 'spells', token, content, errors)
  await fetchIndexedFamily(base, 'bestiary', token, content, errors)

  await putCachedMirrorContent(content)
  return { content, errors }
}

async function fetchIndexedFamily(
  base: string,
  folder: string,
  token: string,
  content: MirrorContent,
  errors: string[],
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
    if (json) ingestFile(`${folder}/${filename}`, json, content, errors)
    else errors.push(`${folder}/${filename}: not found or unreachable`)
  }
}
