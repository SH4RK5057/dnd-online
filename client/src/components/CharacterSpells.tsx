import type { CharacterRecord, SpellEntry } from '../character/types'

const SPELL_LEVELS = [1, 2, 3, 4, 5, 6, 7, 8, 9]

/** Spell-slot totals table (index 0 = level-1 slots) + spellbook list.
 * Slot totals are part of the blueprint (level-derived) so they respect
 * `locked`; the spellbook itself (prepared state, notes, additions) stays
 * editable regardless — spells known/prepared change during normal play. */
export function CharacterSpells({
  character,
  canEdit,
  blueprintEditable,
  onUpdate,
}: {
  character: CharacterRecord
  canEdit: boolean
  blueprintEditable: boolean
  onUpdate: (patch: Partial<Pick<CharacterRecord, 'spellSlotsByLevel' | 'spellSlotsUsedByLevel' | 'spells'>>) => void
}) {
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
  const removeSpell = (id: string) => onUpdate({ spells: character.spells.filter((s) => s.id !== id) })

  return (
    <div className="character-sheet__section">
      <h3>Spell slots</h3>
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
                disabled={!canEdit || !blueprintEditable}
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
        <button type="button" onClick={addSpell}>
          Add spell
        </button>
      )}
    </div>
  )
}
