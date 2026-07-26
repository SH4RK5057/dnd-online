const STORAGE_KEY = 'dndonline:pendingCharacterBind'

/** Bridges JoinSetupScreen (which picks/creates/imports a standalone
 * character before a session even exists) to CharacterPanel (which does the
 * actual bindCharacter call once the campaign doc is available) — there's no
 * component that's mounted continuously across that transition, so the
 * chosen character's id is stashed here in the meantime. One-shot: reading
 * it also clears it, so it's never accidentally replayed on a later join. */
export function savePendingCharacterBind(standaloneId: string): void {
  sessionStorage.setItem(STORAGE_KEY, standaloneId)
}

export function takePendingCharacterBind(): string | null {
  const id = sessionStorage.getItem(STORAGE_KEY)
  if (id) sessionStorage.removeItem(STORAGE_KEY)
  return id
}
