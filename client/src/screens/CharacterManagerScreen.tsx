import { useState } from 'react'
import { getOrCreatePlayerId } from '../session/lastSession'
import { newBlankCharacter } from '../character/useCharacters'
import {
  deleteStandaloneCharacter,
  exportCharacterToFile,
  importCharacterFromFile,
  listStandaloneCharacters,
  saveStandaloneCharacter,
} from '../character/standaloneStorage'
import type { CharacterRecord } from '../character/types'
import { CharacterSheet } from '../components/CharacterSheet'
import { useCompendium } from '../content/useCompendium'

/** Standalone character creation/editing, fully decoupled from any active
 * campaign — reachable from the landing screen before hosting or joining a
 * session. Characters live in this browser's localStorage; joining a
 * campaign later clones one of these in (see CharacterPanel.bindCharacter). */
export function CharacterManagerScreen({ onBack }: { onBack: () => void }) {
  const [characters, setCharacters] = useState(() => listStandaloneCharacters())
  const [selectedId, setSelectedId] = useState<string | null>(characters[0]?.id ?? null)
  const { races, classes, subclasses, backgrounds } = useCompendium(null)

  const refresh = () => setCharacters(listStandaloneCharacters())
  const selected = characters.find((c) => c.id === selectedId) ?? null

  const handleCreate = () => {
    const created = newBlankCharacter(getOrCreatePlayerId(), 'New Character')
    saveStandaloneCharacter(created)
    refresh()
    setSelectedId(created.id)
  }

  const handleImport = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    try {
      const imported = await importCharacterFromFile(file)
      refresh()
      setSelectedId(imported.id)
    } catch (err) {
      window.alert(err instanceof Error ? err.message : 'Could not import that file.')
    }
  }

  const handleDelete = (id: string) => {
    if (!window.confirm('Delete this character? This cannot be undone.')) return
    deleteStandaloneCharacter(id)
    refresh()
    if (selectedId === id) setSelectedId(null)
  }

  const handleUpdate = (patch: Partial<Omit<CharacterRecord, 'id'>>) => {
    if (!selected) return
    const updated = { ...selected, ...patch }
    saveStandaloneCharacter(updated)
    setCharacters((prev) => prev.map((c) => (c.id === updated.id ? updated : c)))
  }

  return (
    <section className="character-manager-screen">
      <header className="session-screen__header">
        <h1>My Characters</h1>
        <button type="button" onClick={onBack}>
          Back
        </button>
      </header>
      <p>
        Create and edit characters independent of any campaign. Export a character to a file to back it up or move it
        to another browser; import a file to bring one in. Joining a campaign later will bind one of these — the
        campaign gets its own locked copy, and this standalone copy stays yours to keep editing.
      </p>

      <div className="character-manager-screen__body">
        <div className="character-manager-screen__list">
          <button type="button" onClick={handleCreate}>
            Create new character
          </button>
          <label className="character-panel__import-label">
            Import a character file
            <input type="file" accept="application/json" onChange={(e) => void handleImport(e)} hidden />
          </label>
          <ul className="token-owner-assign__list">
            {characters.map((c) => (
              <li key={c.id} className="token-owner-assign__item">
                <button
                  type="button"
                  aria-pressed={c.id === selectedId}
                  onClick={() => setSelectedId(c.id)}
                >
                  {c.name || '(unnamed)'}
                </button>
                <button type="button" onClick={() => handleDelete(c.id)}>
                  Delete
                </button>
              </li>
            ))}
          </ul>
          {characters.length === 0 && <p className="character-sheet__hint">No characters yet.</p>}
        </div>

        <div className="character-manager-screen__sheet">
          {selected ? (
            <>
              <button type="button" onClick={() => exportCharacterToFile(selected)}>
                Export character file
              </button>
              <CharacterSheet
                character={selected}
                canEdit
                canRoll={false}
                onUpdate={handleUpdate}
                onQuickRoll={() => {}}
                races={races}
                classes={classes}
                subclasses={subclasses}
                backgrounds={backgrounds}
              />
            </>
          ) : (
            <p className="character-sheet__hint">Select or create a character to edit it.</p>
          )}
        </div>
      </div>
    </section>
  )
}
