import { useState } from 'react'
import type * as Y from 'yjs'
import { useTokens } from '../map/useTokens'
import { useCompendium, findByKey } from '../content/useCompendium'
import { StatBlockCard } from './StatBlockCard'

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
  const [draftDescription, setDraftDescription] = useState<string | null>(null)

  const token = tokens.find((t) => t.id === selectedTokenId)
  if (!doc || !token) return null

  const entry = token.monsterKey ? findByKey(compendium, token.monsterKey) : null

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

  return (
    <div className="token-inspector">
      <h3>{token.name} — rules</h3>
      {entry ? (
        <StatBlockCard entry={entry} />
      ) : (
        <p className="compendium-drawer__hint">No compendium entry linked — add this token from the compendium to see its stat block here.</p>
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
