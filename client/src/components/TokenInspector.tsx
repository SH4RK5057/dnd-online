import { useState } from 'react'
import type * as Y from 'yjs'
import { useTokens } from '../map/useTokens'
import { useCompendium, findByKey } from '../content/useCompendium'
import { useCharacters } from '../character/useCharacters'
import { useCampaignSettings } from '../character/useCampaignSettings'
import { useRollLog } from '../dice/useRollLog'
import { parseNotation, rollNotation } from '../dice/notation'
import { StatBlockCard } from './StatBlockCard'
import { CharacterSheet } from './CharacterSheet'
import { AttackRollPanel } from './AttackRollPanel'

/** Shown for ANY selected token, to ANY viewer — unlike
 * TokenHpConditionEditor (which edits HP/conditions and is gated to
 * isDm || isOwner), this is the "what is this thing" panel: the DM gets the
 * full rules/stat-block lookup (pulled from the compendium entry this token
 * was dropped from) plus an editable freeform description; everyone else
 * only ever sees that freeform description, read-only, and only once the DM
 * has written one. */
export function TokenInspector({
  doc,
  sceneId,
  isDm,
  selectedTokenId,
}: {
  doc: Y.Doc | null
  sceneId: string
  isDm: boolean
  selectedTokenId: string | null
}) {
  const { tokens, setTokenDescription } = useTokens(doc, sceneId)
  const compendium = useCompendium(doc)
  const { characters, updateCharacter } = useCharacters(doc)
  const { settings: campaignSettings } = useCampaignSettings(doc)
  const { pushRoll } = useRollLog(doc, isDm)
  const [draftDescription, setDraftDescription] = useState<string | null>(null)
  const [sheetExpanded, setSheetExpanded] = useState(false)

  const token = tokens.find((t) => t.id === selectedTokenId)
  if (!doc || !token) return null

  const entry = token.monsterKey ? findByKey(compendium, token.monsterKey) : null
  const linkedCharacter = token.characterId ? (characters.find((c) => c.id === token.characterId) ?? null) : null

  if (!isDm) {
    if (!token.description) return null
    return (
      <div className="token-inspector">
        <h3>{token.name}</h3>
        <p>{token.description}</p>
      </div>
    )
  }

  const description = draftDescription ?? token.description

  const npcRollLabelName = linkedCharacter?.name ?? token.name

  const handleNpcQuickRoll = (label: string, notation: string) => {
    try {
      const result = rollNotation(parseNotation(notation), 'normal')
      pushRoll({
        playerId: 'npc',
        playerName: npcRollLabelName,
        label,
        notation,
        mode: 'normal',
        terms: result.terms,
        modifier: result.modifier,
        total: result.total,
        requestedBy: null,
        private: false,
      })
    } catch {
      // malformed notation from a manually-typed modifier — ignore
    }
  }

  const handleNpcRawRoll = (label: string, notation: string): number => {
    const result = rollNotation(parseNotation(notation), 'normal')
    pushRoll({
      playerId: 'npc',
      playerName: npcRollLabelName,
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

  return (
    <div className="token-inspector">
      <h3>{token.name} — rules</h3>
      {entry ? (
        <StatBlockCard entry={entry} />
      ) : (
        !token.characterId && (
          <p className="compendium-drawer__hint">No compendium entry linked — add this token from the compendium to see its stat block here.</p>
        )
      )}

      {linkedCharacter && (
        <div className="token-inspector__character-sheet">
          <button type="button" onClick={() => setSheetExpanded((v) => !v)}>
            {sheetExpanded ? 'Hide' : 'Show'} character sheet
          </button>
          {sheetExpanded && (
            <>
              <AttackRollPanel
                character={linkedCharacter}
                targets={tokens.filter((t) => t.id !== token.id)}
                charactersById={new Map(characters.map((c) => [c.id, c]))}
                actingConditions={token.conditions}
                autoResolveEnabled={campaignSettings.autoResolveAttacksEnabled ?? true}
                canRoll
                playerId="npc"
                playerName={npcRollLabelName}
                pushRoll={pushRoll}
              />
              <CharacterSheet
                character={linkedCharacter}
                canEdit
                canRoll
                onUpdate={(patch) => updateCharacter(linkedCharacter.id, patch)}
                onQuickRoll={handleNpcQuickRoll}
                onRawRoll={handleNpcRawRoll}
                races={compendium.races}
                classes={compendium.classes}
                subclasses={compendium.subclasses}
                backgrounds={compendium.backgrounds}
                isDm={isDm}
              />
            </>
          )}
        </div>
      )}

      <h4>Description shown to players</h4>
      <textarea
        value={description}
        onChange={(e) => setDraftDescription(e.target.value)}
        onBlur={() => {
          if (draftDescription !== null) setTokenDescription(token.id, draftDescription)
        }}
        placeholder="Freeform notes players see when they click this token…"
        rows={3}
      />
    </div>
  )
}
