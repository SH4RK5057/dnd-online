import type { CharacterRecord } from './types'
import { normalizeCharacterRecord } from './rules'

const STORAGE_KEY = 'dndonline:standaloneCharacters'

/**
 * Standalone characters — created and edited independent of any campaign —
 * live in this browser's localStorage, keyed by character id, never synced
 * over the network. Joining a campaign clones one of these into the
 * campaign's shared Yjs doc (see useCharacters.bindCharacter); editing the
 * standalone copy afterward never touches the now-locked campaign clone.
 */
function readAll(): CharacterRecord[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as CharacterRecord[]
    return Array.isArray(parsed) ? parsed.map(normalizeCharacterRecord) : []
  } catch {
    return []
  }
}

function writeAll(characters: CharacterRecord[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(characters))
}

export function listStandaloneCharacters(): CharacterRecord[] {
  return readAll().sort((a, b) => b.createdAt - a.createdAt)
}

export function getStandaloneCharacter(id: string): CharacterRecord | null {
  return readAll().find((c) => c.id === id) ?? null
}

export function saveStandaloneCharacter(character: CharacterRecord): void {
  const all = readAll()
  const index = all.findIndex((c) => c.id === character.id)
  if (index === -1) all.push(character)
  else all[index] = character
  writeAll(all)
}

export function deleteStandaloneCharacter(id: string): void {
  writeAll(readAll().filter((c) => c.id !== id))
}

export function exportCharacterToFile(character: CharacterRecord): void {
  const blob = new Blob([JSON.stringify(character, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `${character.name || 'character'}.json`
  a.click()
  URL.revokeObjectURL(url)
}

/** Imports a previously-exported character file, always as a NEW standalone
 * record (fresh id) so importing the same file twice doesn't collide. */
export async function importCharacterFromFile(file: File): Promise<CharacterRecord> {
  const text = await file.text()
  const parsed = JSON.parse(text) as CharacterRecord
  if (!parsed || typeof parsed !== 'object' || !parsed.name) {
    throw new Error('That file doesn’t look like a character export.')
  }
  const character: CharacterRecord = normalizeCharacterRecord({
    ...parsed,
    id: crypto.randomUUID(),
    campaignId: null,
    locked: false,
    createdAt: Date.now(),
  })
  saveStandaloneCharacter(character)
  return character
}
