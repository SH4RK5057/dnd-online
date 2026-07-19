import type { LastSession } from './types'

const PLAYER_ID_KEY = 'dndonline:playerId'
const LAST_SESSION_KEY = 'dndonline:lastSession'

/**
 * A stable identity that survives page reloads, unlike Y.Doc's clientID which is
 * regenerated every session. Lets peers recognize "same person rejoining" instead
 * of treating a refresh as a brand-new participant.
 */
export function getOrCreatePlayerId(): string {
  const existing = localStorage.getItem(PLAYER_ID_KEY)
  if (existing) return existing
  const id = crypto.randomUUID()
  localStorage.setItem(PLAYER_ID_KEY, id)
  return id
}

export function saveLastSession(info: LastSession): void {
  localStorage.setItem(LAST_SESSION_KEY, JSON.stringify(info))
}

export function loadLastSession(): LastSession | null {
  const raw = localStorage.getItem(LAST_SESSION_KEY)
  if (!raw) return null
  try {
    return JSON.parse(raw) as LastSession
  } catch {
    return null
  }
}

export function clearLastSession(): void {
  localStorage.removeItem(LAST_SESSION_KEY)
}
