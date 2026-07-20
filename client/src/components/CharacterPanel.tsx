import { useState } from 'react'
import { useSession } from '../session/useSession'
import { getOrCreatePlayerId } from '../session/lastSession'
import { useScenes } from '../map/useScenes'
import { useTokens } from '../map/useTokens'
import { useCombat } from '../combat/useCombat'
import { useCharacters, newBlankCharacter } from '../character/useCharacters'
import {
  exportCharacterToFile,
  importCharacterFromFile,
  listStandaloneCharacters,
  saveStandaloneCharacter,
} from '../character/standaloneStorage'
import { useRollLog } from '../dice/useRollLog'
import { parseNotation, rollNotation } from '../dice/notation'
import { resolveEffectiveMode, type RollCategory } from '../dice/conditions'
import type { RollMode } from '../dice/types'
import type { CharacterRecord } from '../character/types'
import { CharacterSheet } from './CharacterSheet'

/** In-session: shows the viewer's own campaign character (auto-found by
 * ownerId — this IS the "auto-reconnect to your assigned campaign
 * character" behavior, there's nothing special to do on rejoin, the record
 * is already sitting in the doc). If they don't have one yet, offers to
 * bind a standalone character (picked from local storage or imported fresh)
 * into this campaign, which clones and locks it. */
export function CharacterPanel() {
  const { session } = useSession()
  const doc = session?.doc ?? null
  const isDm = session?.role === 'dm'
  const myPlayerId = getOrCreatePlayerId()

  const { activeSceneId, activeScene } = useScenes(doc)
  const { tokens } = useTokens(doc, activeSceneId)
  const { combat } = useCombat(doc, activeSceneId)
  const { myCharacter, bindCharacter, updateCharacter } = useCharacters(doc)
  const { pushRoll } = useRollLog(doc, isDm)

  const [standaloneList, setStandaloneList] = useState(() => listStandaloneCharacters())
  const [selectedStandaloneId, setSelectedStandaloneId] = useState('')
  const [rollMode, setRollMode] = useState<RollMode>('normal')

  const character = myCharacter(myPlayerId)

  const refreshStandaloneList = () => setStandaloneList(listStandaloneCharacters())

  const handleCreateStandalone = () => {
    const created = newBlankCharacter(myPlayerId, 'New Character')
    saveStandaloneCharacter(created)
    refreshStandaloneList()
    setSelectedStandaloneId(created.id)
  }

  const handleImport = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    try {
      const imported = await importCharacterFromFile(file)
      refreshStandaloneList()
      setSelectedStandaloneId(imported.id)
    } catch (err) {
      window.alert(err instanceof Error ? err.message : 'Could not import that file.')
    }
  }

  const handleBind = () => {
    if (!session || !selectedStandaloneId) return
    const standalone = standaloneList.find((c) => c.id === selectedStandaloneId)
    if (!standalone) return
    bindCharacter(standalone, myPlayerId, session.roomName)
  }

  if (!doc) return null

  if (!character) {
    return (
      <div className="character-panel">
        <h2>Your character</h2>
        <p className="character-sheet__hint">
          Bind a character to this campaign to get a sheet, HP tracking, and quick-roll buttons.
        </p>
        <div className="character-panel__bind-row">
          <select value={selectedStandaloneId} onChange={(e) => setSelectedStandaloneId(e.target.value)}>
            <option value="">Choose a standalone character…</option>
            {standaloneList.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name || '(unnamed)'}
              </option>
            ))}
          </select>
          <button type="button" onClick={handleBind} disabled={!selectedStandaloneId}>
            Join with this character
          </button>
        </div>
        <div className="character-panel__bind-row">
          <button type="button" onClick={handleCreateStandalone}>
            Create new character
          </button>
          <label className="character-panel__import-label">
            Import a character file
            <input type="file" accept="application/json" onChange={(e) => void handleImport(e)} hidden />
          </label>
        </div>
      </div>
    )
  }

  const myToken = tokens.find((t) => t.characterId === character.id)
  const isMyTurn = !combat.active || combat.currentTokenId === null || combat.currentTokenId === myToken?.id
  const canRoll = isMyTurn

  const handleUpdate = (patch: Partial<Omit<CharacterRecord, 'id'>>) => updateCharacter(character.id, patch)

  const handleQuickRoll = (label: string, notation: string, category: RollCategory) => {
    const effectiveMode = resolveEffectiveMode(rollMode, myToken?.conditions ?? [], category)
    try {
      const parsed = parseNotation(notation)
      const result = rollNotation(parsed, effectiveMode)
      pushRoll({
        playerId: myPlayerId,
        playerName: session?.displayName ?? 'Player',
        label,
        notation,
        mode: effectiveMode,
        terms: result.terms,
        modifier: result.modifier,
        total: result.total,
        requestedBy: null,
      })
    } catch (err) {
      window.alert(err instanceof Error ? err.message : 'Could not roll that.')
    }
  }

  return (
    <div className="character-panel">
      <div className="character-panel__header">
        <h2>Your character</h2>
        <div className="character-panel__roll-mode">
          <label>
            <input type="radio" name="roll-mode" checked={rollMode === 'normal'} onChange={() => setRollMode('normal')} />
            Normal
          </label>
          <label>
            <input type="radio" name="roll-mode" checked={rollMode === 'advantage'} onChange={() => setRollMode('advantage')} />
            Advantage
          </label>
          <label>
            <input type="radio" name="roll-mode" checked={rollMode === 'disadvantage'} onChange={() => setRollMode('disadvantage')} />
            Disadvantage
          </label>
        </div>
        <button type="button" onClick={() => exportCharacterToFile(character)}>
          Export character file
        </button>
      </div>
      {combat.active && !isMyTurn && <p className="character-sheet__hint">It's not your turn — quick-roll buttons are disabled.</p>}
      {!activeScene && <p className="character-sheet__hint">No active scene.</p>}
      <CharacterSheet
        character={character}
        canEdit={isDm || character.ownerId === myPlayerId}
        canRoll={canRoll}
        onUpdate={handleUpdate}
        onQuickRoll={handleQuickRoll}
      />
    </div>
  )
}
