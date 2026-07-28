import { useEffect, useState } from 'react'
import { useSession } from '../session/useSession'
import { getOrCreatePlayerId } from '../session/lastSession'
import { useScenes } from '../map/useScenes'
import { useTokens } from '../map/useTokens'
import { useWalls } from '../map/useWalls'
import { useCombat } from '../combat/useCombat'
import { useCharacters, newBlankCharacter } from '../character/useCharacters'
import { useCompendium } from '../content/useCompendium'
import { useInventoryActions } from '../character/useInventoryActions'
import { useCampaignSettings } from '../character/useCampaignSettings'
import { applyLongRest, applyShortRest, hitDiceAvailable, shortRestHealingNotation } from '../character/rest'
import { takePendingCharacterBind } from '../character/pendingBind'
import {
  exportCharacterToFile,
  getStandaloneCharacter,
  importCharacterFromFile,
  listStandaloneCharacters,
  saveStandaloneCharacter,
} from '../character/standaloneStorage'
import { useRollLog } from '../dice/useRollLog'
import { parseNotation, rollNotation } from '../dice/notation'
import { resolveEffectiveMode, type RollCategory } from '../dice/conditions'
import type { RollMode } from '../dice/types'
import type { CharacterRecord } from '../character/types'
import type { MeasureShape } from '../canvas/MeasureLayer'
import { CharacterSheet } from './CharacterSheet'
import { AttackRollPanel } from './AttackRollPanel'
import { SpellCastPanel } from './SpellCastPanel'

/** In-session: shows the viewer's own campaign character (auto-found by
 * ownerId — this IS the "auto-reconnect to your assigned campaign
 * character" behavior, there's nothing special to do on rejoin, the record
 * is already sitting in the doc). If they don't have one yet, offers to
 * bind a standalone character (picked from local storage or imported fresh)
 * into this campaign, which clones and locks it. */
export function CharacterPanel({ onArmTemplate }: { onArmTemplate: (template: { shape: MeasureShape; sizeFt: number }) => void }) {
  const { session } = useSession()
  const doc = session?.doc ?? null
  const isDm = session?.role === 'dm'
  const myPlayerId = getOrCreatePlayerId()

  const { activeSceneId, activeScene } = useScenes(doc)
  const { tokens, setTokenReactionAvailable, setTokenHp } = useTokens(doc, activeSceneId)
  const { walls } = useWalls(doc, activeSceneId)
  const { combat } = useCombat(doc, activeSceneId)
  const { characters, myCharacter, bindCharacter, updateCharacter } = useCharacters(doc)
  const { races, classes, subclasses, backgrounds } = useCompendium(doc)
  const { pushRoll } = useRollLog(doc, isDm)
  const inventoryActions = useInventoryActions(doc, isDm)
  const { settings: campaignSettings, setRestsEnabled, setAutoResolveAttacksEnabled, setPassivePerceptionEnabled } = useCampaignSettings(doc)

  const [standaloneList, setStandaloneList] = useState(() => listStandaloneCharacters())
  const [selectedStandaloneId, setSelectedStandaloneId] = useState('')
  const [rollMode, setRollMode] = useState<RollMode>('normal')
  const [hitDiceToSpend, setHitDiceToSpend] = useState(1)

  const character = myCharacter(myPlayerId)

  // Completes the flow JoinSetupScreen started: a player picks/creates/
  // imports a character before the campaign doc even exists (see
  // pendingBind.ts), so the actual bindCharacter call — which needs the doc
  // and this session's roomName — happens here instead, the first time this
  // panel mounts with a doc available and no character bound yet.
  useEffect(() => {
    if (!doc || !session || character) return
    const pendingId = takePendingCharacterBind()
    if (!pendingId) return
    const standalone = getStandaloneCharacter(pendingId)
    if (!standalone) return
    bindCharacter(standalone, myPlayerId, session.roomName)
  }, [doc, session, character, myPlayerId, bindCharacter])

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
    const effectiveMode = resolveEffectiveMode(rollMode, (myToken?.conditions ?? []).map((c) => c.name), category)
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
        private: false,
      })
    } catch (err) {
      window.alert(err instanceof Error ? err.message : 'Could not roll that.')
    }
  }

  const handleRawRoll = (label: string, notation: string): number => {
    const result = rollNotation(parseNotation(notation), 'normal')
    pushRoll({
      playerId: myPlayerId,
      playerName: session?.displayName ?? 'Player',
      label,
      notation,
      mode: 'normal',
      terms: result.terms,
      modifier: result.modifier,
      total: result.total,
      requestedBy: null,
      private: false,
    })
    return result.total
  }

  const canRest = campaignSettings.restsEnabled ?? true
  const diceAvailable = hitDiceAvailable(character)

  const handleShortRest = () => {
    const count = Math.min(hitDiceToSpend, diceAvailable)
    if (count <= 0) return
    const notation = shortRestHealingNotation(character, count)
    const result = rollNotation(parseNotation(notation), 'normal')
    pushRoll({
      playerId: myPlayerId,
      playerName: session?.displayName ?? 'Player',
      label: 'Short rest healing',
      notation,
      mode: 'normal',
      terms: result.terms,
      modifier: result.modifier,
      total: result.total,
      requestedBy: null,
      private: false,
    })
    handleUpdate(applyShortRest(character, count, Math.max(0, result.total)))
  }

  const handleLongRest = () => handleUpdate(applyLongRest(character))

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

      {isDm && (
        <label className="character-panel__rests-toggle">
          <input type="checkbox" checked={canRest} onChange={(e) => setRestsEnabled(e.target.checked)} />
          Allow players to rest
        </label>
      )}

      {isDm && (
        <label className="character-panel__rests-toggle">
          <input
            type="checkbox"
            checked={campaignSettings.autoResolveAttacksEnabled ?? true}
            onChange={(e) => setAutoResolveAttacksEnabled(e.target.checked)}
          />
          Auto-resolve attacks (compare roll to target AC automatically)
        </label>
      )}

      {isDm && (
        <label className="character-panel__rests-toggle">
          <input
            type="checkbox"
            checked={campaignSettings.passivePerceptionEnabled ?? false}
            onChange={(e) => setPassivePerceptionEnabled(e.target.checked)}
          />
          Passive perception auto-reveal (hidden tokens with a set DC reveal themselves to a player whose passive
          Perception beats it)
        </label>
      )}

      <div className="character-panel__rest-row">
        <button type="button" onClick={handleLongRest} disabled={!canRest}>
          Long rest
        </button>
        <input
          type="number"
          min={1}
          max={Math.max(1, diceAvailable)}
          value={hitDiceToSpend}
          disabled={!canRest || diceAvailable === 0}
          onChange={(e) => setHitDiceToSpend(Number(e.target.value))}
          title="Hit dice to spend"
        />
        <button type="button" onClick={handleShortRest} disabled={!canRest || diceAvailable === 0}>
          Short rest ({diceAvailable} hit {diceAvailable === 1 ? 'die' : 'dice'} left)
        </button>
      </div>
      {!canRest && <p className="character-sheet__hint">The DM has temporarily disabled resting.</p>}

      {combat.active && !isMyTurn && <p className="character-sheet__hint">It's not your turn — quick-roll buttons are disabled.</p>}
      {!activeScene && <p className="character-sheet__hint">No active scene.</p>}

      <h3>Attack</h3>
      <AttackRollPanel
        character={character}
        targets={tokens.filter((t) => t.id !== myToken?.id)}
        charactersById={new Map(characters.map((c) => [c.id, c]))}
        actingConditions={myToken?.conditions ?? []}
        autoResolveEnabled={campaignSettings.autoResolveAttacksEnabled ?? true}
        isMyTurn={isMyTurn}
        reactionAvailable={myToken?.reactionAvailable ?? false}
        onUseReaction={() => myToken && setTokenReactionAvailable(myToken.id, false)}
        playerId={myPlayerId}
        playerName={session?.displayName ?? 'Player'}
        pushRoll={pushRoll}
        attackerToken={myToken ?? null}
        walls={walls}
      />

      <h3>Cast a spell</h3>
      <SpellCastPanel
        character={character}
        targets={tokens.filter((t) => t.id !== myToken?.id)}
        charactersById={new Map(characters.map((c) => [c.id, c]))}
        updateCharacter={updateCharacter}
        setTokenHp={setTokenHp}
        playerId={myPlayerId}
        playerName={session?.displayName ?? 'Player'}
        pushRoll={pushRoll}
        onArmTemplate={onArmTemplate}
      />

      <CharacterSheet
        character={character}
        canEdit={isDm || character.ownerId === myPlayerId}
        canRoll={canRoll}
        onUpdate={handleUpdate}
        onQuickRoll={handleQuickRoll}
        onRawRoll={handleRawRoll}
        inventoryActions={inventoryActions}
        otherCharacters={characters.filter((c) => c.id !== character.id).map((c) => ({ id: c.id, name: c.name }))}
        races={races}
        classes={classes}
        subclasses={subclasses}
        backgrounds={backgrounds}
        isDm={isDm}
      />
    </div>
  )
}
