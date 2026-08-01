import { useState } from 'react'
import type { CharacterRecord, SpellEntry } from '../character/types'
import type { SpellData } from '../content/types'
import { filterSpells } from '../content/search'

const SPELL_LEVELS = [1, 2, 3, 4, 5, 6, 7, 8, 9]
const MAX_SEARCH_RESULTS = 8

/** Spell-slot totals table (index 0 = level-1 slots) + spellbook list.
 * Slot totals are part of the blueprint (level-derived) so they respect
 * `locked`; the spellbook itself (prepared state, notes, additions) stays
 * editable regardless — spells known/prepared change during normal play. */
export function CharacterSpells({
  character,
  canEdit,
  blueprintEditable,
  onUpdate,
  slotsLocked,
  casterClassName,
  compendiumSpells,
}: {
  character: CharacterRecord
  canEdit: boolean
  blueprintEditable: boolean
  onUpdate: (patch: Partial<Pick<CharacterRecord, 'spellSlotsByLevel' | 'spellSlotsUsedByLevel' | 'spells'>>) => void
  /** True when the character's class is a recognized 5e caster (full/half/
   * pact) — slot totals are then computed automatically from class+level
   * (character/rules.ts's computeSpellSlotsByLevel) and this locks the
   * total inputs, the same "computed field" pattern already used for Max
   * HP. Unrecognized/non-caster classes leave slots freely editable. */
  slotsLocked?: boolean
  casterClassName?: string
  /** SRD + mirror + homebrew spell reference data, for the search-to-add
   * picker below — the same merged compendium the DM's compendium drawer
   * searches (content/useCompendium.ts). */
  compendiumSpells: SpellData[]
}) {
  const [query, setQuery] = useState('')
  const matches = query.trim() ? filterSpells(compendiumSpells, query, 'all', 'all').slice(0, MAX_SEARCH_RESULTS) : []
  const setSlot = (levelIndex: number, value: number) => {
    const next = [...character.spellSlotsByLevel]
    while (next.length <= levelIndex) next.push(0)
    next[levelIndex] = value
    onUpdate({ spellSlotsByLevel: next })
  }

  // Spending/recovering a slot during play is allowed regardless of
  // blueprintEditable/locked — only the total granted at this level is part
  // of the locked blueprint, not how many are currently spent.
  const setUsed = (levelIndex: number, delta: number) => {
    const total = character.spellSlotsByLevel[levelIndex] ?? 0
    const next = [...character.spellSlotsUsedByLevel]
    while (next.length <= levelIndex) next.push(0)
    next[levelIndex] = Math.max(0, Math.min(total, (next[levelIndex] ?? 0) + delta))
    onUpdate({ spellSlotsUsedByLevel: next })
  }

  const updateSpell = (id: string, patch: Partial<SpellEntry>) => {
    onUpdate({ spells: character.spells.map((s) => (s.id === id ? { ...s, ...patch } : s)) })
  }
  const addSpell = () => {
    const spell: SpellEntry = { id: crypto.randomUUID(), name: '', level: 1, prepared: false, notes: '' }
    onUpdate({ spells: [...character.spells, spell] })
  }
  const addSpellFromCompendium = (data: SpellData) => {
    const spell: SpellEntry = { id: crypto.randomUUID(), name: data.name, level: data.level, prepared: false, notes: data.school }
    onUpdate({ spells: [...character.spells, spell] })
    setQuery('')
  }
  const removeSpell = (id: string) => onUpdate({ spells: character.spells.filter((s) => s.id !== id) })

  return (
    <div className="character-sheet__section">
      <h3>Spell slots</h3>
      {slotsLocked && blueprintEditable && (
        <p className="character-sheet__hint">Computed from {casterClassName}'s spellcasting progression.</p>
      )}
      <div className="character-sheet__spell-slots">
        {SPELL_LEVELS.map((level, index) => {
          const total = character.spellSlotsByLevel[index] ?? 0
          const used = character.spellSlotsUsedByLevel[index] ?? 0
          return (
            <label key={level}>
              Lvl {level}
              <input
                type="number"
                min={0}
                max={9}
                value={total}
                disabled={!canEdit || !blueprintEditable || slotsLocked}
                onChange={(e) => setSlot(index, Number(e.target.value))}
              />
              {total > 0 && canEdit && (
                <span className="character-sheet__slot-used">
                  <button type="button" onClick={() => setUsed(index, -1)} disabled={used <= 0}>
                    −
                  </button>
                  {used}/{total} used
                  <button type="button" onClick={() => setUsed(index, 1)} disabled={used >= total}>
                    +
                  </button>
                </span>
              )}
            </label>
          )
        })}
      </div>

      <h3>Spellbook</h3>
      <ul className="character-sheet__row-list">
        {character.spells.map((spell) => (
          <li key={spell.id} className="character-sheet__row">
            <input
              placeholder="Spell name"
              value={spell.name}
              disabled={!canEdit}
              onChange={(e) => updateSpell(spell.id, { name: e.target.value })}
            />
            <input
              type="number"
              min={0}
              max={9}
              title="Spell level"
              value={spell.level}
              disabled={!canEdit}
              onChange={(e) => updateSpell(spell.id, { level: Number(e.target.value) })}
            />
            <label>
              <input
                type="checkbox"
                checked={spell.prepared}
                disabled={!canEdit}
                onChange={(e) => updateSpell(spell.id, { prepared: e.target.checked })}
              />
              Prepared
            </label>
            <input
              placeholder="Notes"
              value={spell.notes}
              disabled={!canEdit}
              onChange={(e) => updateSpell(spell.id, { notes: e.target.value })}
            />
            {canEdit && (
              <button type="button" onClick={() => removeSpell(spell.id)}>
                Remove
              </button>
            )}
          </li>
        ))}
      </ul>
      {canEdit && (
        <div className="character-sheet__compendium-search">
          <input
            placeholder="Search compendium spells to add…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          {matches.length > 0 && (
            <ul className="character-sheet__search-results">
              {matches.map((data) => (
                <li key={data.key}>
                  <button type="button" onClick={() => addSpellFromCompendium(data)}>
                    {data.name}
                    <span className="compendium-drawer__source">
                      {data.level === 0 ? 'Cantrip' : `Lvl ${data.level}`} · {data.school}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
          <button type="button" onClick={addSpell}>
            Add custom spell
          </button>
        </div>
      )}
    </div>
  )
}
