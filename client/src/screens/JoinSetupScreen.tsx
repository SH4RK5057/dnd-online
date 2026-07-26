import { useState, type ChangeEvent, type FormEvent } from 'react'
import { getOrCreatePlayerId } from '../session/lastSession'
import { newBlankCharacter } from '../character/useCharacters'
import { importCharacterFromFile, listStandaloneCharacters, saveStandaloneCharacter } from '../character/standaloneStorage'
import { savePendingCharacterBind } from '../character/pendingBind'
import { CharacterSheet } from '../components/CharacterSheet'
import type { CharacterRecord } from '../character/types'

export function JoinSetupScreen({
  initialCode,
  onSubmit,
  onBack,
}: {
  initialCode?: string
  onSubmit: (code: string, playerName: string) => void
  onBack: () => void
}) {
  const [playerName, setPlayerName] = useState('')
  const [code, setCode] = useState(initialCode ?? '')
  const [error, setError] = useState<string | null>(null)

  const [standaloneList, setStandaloneList] = useState(() => listStandaloneCharacters())
  const [selectedCharacterId, setSelectedCharacterId] = useState('')
  const [editingCharacter, setEditingCharacter] = useState<CharacterRecord | null>(null)

  const refreshStandaloneList = () => setStandaloneList(listStandaloneCharacters())

  const handleCreateCharacter = () => {
    const created = newBlankCharacter(getOrCreatePlayerId(), 'New Character')
    saveStandaloneCharacter(created)
    refreshStandaloneList()
    setSelectedCharacterId(created.id)
    setEditingCharacter(created)
  }

  const handleImportCharacter = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    try {
      const imported = await importCharacterFromFile(file)
      refreshStandaloneList()
      setSelectedCharacterId(imported.id)
      setEditingCharacter(null)
    } catch (err) {
      window.alert(err instanceof Error ? err.message : 'Could not import that file.')
    }
  }

  const handleUpdateEditingCharacter = (patch: Partial<Omit<CharacterRecord, 'id'>>) => {
    if (!editingCharacter) return
    const updated = { ...editingCharacter, ...patch }
    saveStandaloneCharacter(updated)
    setEditingCharacter(updated)
    refreshStandaloneList()
  }

  const handleSelectExisting = (id: string) => {
    setSelectedCharacterId(id)
    setEditingCharacter(null)
  }

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault()
    const trimmedName = playerName.trim()
    const trimmedCode = code.trim()
    if (!trimmedName || !trimmedCode || !selectedCharacterId) return
    setError(null)
    try {
      savePendingCharacterBind(selectedCharacterId)
      onSubmit(trimmedCode, trimmedName)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not join that session.')
    }
  }

  return (
    <section className={editingCharacter ? 'setup-screen setup-screen--wide' : 'setup-screen'}>
      <h1>Join a session</h1>
      <form onSubmit={handleSubmit}>
        <label htmlFor="player-name">Your name</label>
        <input
          id="player-name"
          value={playerName}
          onChange={(event) => setPlayerName(event.target.value)}
          autoFocus
          maxLength={40}
        />
        <label htmlFor="join-code">Join code</label>
        <input
          id="join-code"
          value={code}
          onChange={(event) => setCode(event.target.value)}
          placeholder="ABC-123"
          maxLength={12}
        />

        <label htmlFor="join-character">Your character</label>
        <select id="join-character" value={selectedCharacterId} onChange={(event) => handleSelectExisting(event.target.value)}>
          <option value="">Choose a character…</option>
          {standaloneList.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name || '(unnamed)'}
            </option>
          ))}
        </select>
        <div className="setup-screen__character-actions">
          <button type="button" onClick={handleCreateCharacter}>
            Create new character
          </button>
          <label className="character-panel__import-label">
            Import a character file
            <input type="file" accept="application/json" onChange={(event) => void handleImportCharacter(event)} hidden />
          </label>
        </div>
        {!selectedCharacterId && (
          <p className="setup-screen__hint">Every player needs a character to join — pick one, create one, or import a file.</p>
        )}

        {editingCharacter && (
          <div className="setup-screen__character-editor">
            <p className="setup-screen__hint">Fill in your character below — you can keep editing after you join too.</p>
            <CharacterSheet character={editingCharacter} canEdit canRoll={false} onUpdate={handleUpdateEditingCharacter} onQuickRoll={() => {}} />
          </div>
        )}

        {error && <p className="setup-screen__error">{error}</p>}
        <div className="setup-screen__actions">
          <button type="button" onClick={onBack}>
            Back
          </button>
          <button type="submit" disabled={!playerName.trim() || !code.trim() || !selectedCharacterId}>
            Join session
          </button>
        </div>
      </form>
    </section>
  )
}
