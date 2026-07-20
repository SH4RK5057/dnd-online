import { useState } from 'react'
import type * as Y from 'yjs'
import { useRuleOverrides, type CreateRuleOverrideInput } from '../content/useRuleOverrides'
import { useCharacters } from '../character/useCharacters'
import type { RuleOverrideRecord } from '../content/ruleOverrides'

const BLANK: CreateRuleOverrideInput = {
  scope: 'campaign',
  sceneId: null,
  targetType: 'globalRule',
  targetKey: '',
  statPath: null,
  label: '',
  value: '',
}

/** DM homebrew rule-modifier engine UI — create/edit/delete named
 * campaign- or scene-wide overrides (see content/ruleOverrides.ts for the
 * resolver other systems can consult). This is a generic registry, not a
 * simulator for every 5e rule — it's the place a DM records "this is
 * different in my game" as structured data instead of just a house-rules
 * note nobody else's code can see. */
export function RuleOverridesPanel({ doc, activeSceneId }: { doc: Y.Doc | null; activeSceneId: string | null }) {
  const { ruleOverrides, createRuleOverride, deleteRuleOverride } = useRuleOverrides(doc)
  const { characters } = useCharacters(doc)
  const [draft, setDraft] = useState<CreateRuleOverrideInput>(BLANK)

  const handleCreate = () => {
    if (!draft.targetKey.trim() || !draft.value.trim()) return
    createRuleOverride({ ...draft, sceneId: draft.scope === 'scene' ? activeSceneId : null })
    setDraft(BLANK)
  }

  const describe = (o: RuleOverrideRecord): string => {
    const scopeLabel = o.scope === 'scene' ? 'this scene' : 'campaign-wide'
    if (o.targetType === 'globalRule') return `${o.targetKey} = "${o.value}" (${scopeLabel})`
    const character = characters.find((c) => c.id === o.targetKey)
    return `${character?.name ?? o.targetKey}.${o.statPath} = "${o.value}" (${scopeLabel})`
  }

  return (
    <div className="rule-overrides-panel">
      {ruleOverrides.length > 0 && (
        <ul className="homebrew-editor__list">
          {ruleOverrides.map((o) => (
            <li key={o.id}>
              <span title={o.label}>{describe(o)}</span>
              <button type="button" onClick={() => deleteRuleOverride(o.id)}>
                Delete
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="homebrew-editor__form">
        <select value={draft.targetType} onChange={(e) => setDraft({ ...draft, targetType: e.target.value as CreateRuleOverrideInput['targetType'], targetKey: '', statPath: null })}>
          <option value="globalRule">Global rule</option>
          <option value="characterStat">Character stat</option>
        </select>
        <select value={draft.scope} onChange={(e) => setDraft({ ...draft, scope: e.target.value as CreateRuleOverrideInput['scope'] })}>
          <option value="campaign">Whole campaign</option>
          <option value="scene" disabled={!activeSceneId}>
            This scene only
          </option>
        </select>

        {draft.targetType === 'globalRule' ? (
          <input
            placeholder="Rule name (e.g. critRange, shortRestMinutes)"
            value={draft.targetKey}
            onChange={(e) => setDraft({ ...draft, targetKey: e.target.value })}
          />
        ) : (
          <>
            <select value={draft.targetKey} onChange={(e) => setDraft({ ...draft, targetKey: e.target.value })}>
              <option value="">Choose a character…</option>
              {characters.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
            <input
              placeholder="Stat path (e.g. ac, speed)"
              value={draft.statPath ?? ''}
              onChange={(e) => setDraft({ ...draft, statPath: e.target.value })}
            />
          </>
        )}

        <input placeholder="New value" value={draft.value} onChange={(e) => setDraft({ ...draft, value: e.target.value })} />
        <input placeholder="Note (optional)" value={draft.label} onChange={(e) => setDraft({ ...draft, label: e.target.value })} />
        <button type="button" onClick={handleCreate} disabled={!draft.targetKey.trim() || !draft.value.trim()}>
          Add override
        </button>
      </div>
    </div>
  )
}
