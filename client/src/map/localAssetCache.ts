// A plain local IndexedDB key-value store for compressed image bytes, keyed by
// content hash. Deliberately separate from y-indexeddb (which mirrors the
// *synced* doc) — this cache never syncs to peers, it just lets the DM's own
// browser re-publish a previously-uploaded image (e.g. switching back to an
// earlier scene) without re-uploading or re-compressing the original file.

const DB_NAME = 'dndonline-asset-cache'
const STORE_NAME = 'assets'
const DB_VERSION = 1

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

export async function getCachedAsset(hash: string): Promise<Blob | null> {
  const db = await openDb()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly')
    const req = tx.objectStore(STORE_NAME).get(hash)
    req.onsuccess = () => resolve((req.result as Blob | undefined) ?? null)
    req.onerror = () => reject(req.error)
  })
}

export async function putCachedAsset(hash: string, blob: Blob): Promise<void> {
  const db = await openDb()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite')
    tx.objectStore(STORE_NAME).put(blob, hash)
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
}
