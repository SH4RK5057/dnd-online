import { useState } from 'react'
import type { AbilityKey, AbilityScores, CharacterRecord, SkillId, SkillProficiency } from '../character/types'
import { ABILITY_LABELS, SKILL_LABELS } from '../character/types'
import {
  applyRacialBonus,
  computeInitiativeBonus,
  computeMaxHp,
  computeModifier,
  computeProficiencyBonus,
  computeSaveBonus,
  computeSkillBonus,
  isValidPointBuy,
  isValidStandardArray,
  parseHitDiceCount,
  pointBuyCost,
  POINT_BUY_BUDGET,
  SKILL_ABILITY_MAP,
  STANDARD_ARRAY,
} from '../character/rules'
import type { RollCategory } from '../dice/conditions'
import type { UseInventoryActionsResult } from '../character/useInventoryActions'
import type { ClassData, RaceData } from '../content/types'
import { CharacterInventory } from './CharacterInventory'
import { CharacterSpells } from './CharacterSpells'
import { InventoryHistoryList } from './InventoryHistoryPanel'

const ABILITY_KEYS: AbilityKey[] = ['str', 'dex', 'con', 'int', 'wis', 'cha']
const SKILL_IDS = Object.keys(SKILL_ABILITY_MAP) as SkillId[]

type Tab = 'stats' | 'inventory' | 'spells' | 'history'

function fmtMod(mod: number): string {
  return mod >= 0 ? `+${mod}` : `${mod}`
}

/** Which values a Standard Array <select> for `key` may offer: any value not
 * already assigned to another ability, plus whatever `key` is currently set
 * to (so its own current selection always remains a valid option). */
function standardArrayOptionsFor(key: AbilityKey, base: AbilityScores): number[] {
  const usedElsewhere = new Set(ABILITY_KEYS.filter((k) => k !== key).map((k) => base[k]))
  return STANDARD_ARRAY.filter((v) => v === base[key] || !usedElsewhere.has(v))
}

export function CharacterSheet({
  character,
  canEdit,
  canRoll,
  onUpdate,
  onQuickRoll,
  inventoryActions,
  otherCharacters,
  races,
  classes,
}: {
  character: CharacterRecord
  /** isDm || isOwner — gates every edit control. */
  canEdit: boolean
  /** Turn-gating: false while combat is active and it isn't this
   * character's turn — quick-roll buttons disable instead of hide, with a
   * tooltip, so the sheet's layout doesn't jump around turn to turn. */
  canRoll: boolean
  onUpdate: (patch: Partial<Omit<CharacterRecord, 'id'>>) => void
  onQuickRoll: (label: string, notation: string, category: RollCategory) => void
  /** Omitted in the standalone (pre-campaign) character editor — there's no
   * shared doc or other characters to log/transfer against there, so
   * inventory add/remove falls back to plain onUpdate with no history. */
  inventoryActions?: UseInventoryActionsResult
  otherCharacters?: { id: string; name: string }[]
  /** SRD + mirror race/class reference data — drives the race/class dropdowns
   * and rule enforcement (racial ability bonus, save proficiencies, skill
   * choice cap, computed max HP). */
  races: RaceData[]
  classes: ClassData[]
}) {
  const [tab, setTab] = useState<Tab>('stats')
  const blueprintEditable = canEdit && !character.locked
  const profBonus = computeProficiencyBonus(character.level)
  const hitDiceTotal = parseHitDiceCount(character.hitDice)

  const rollTitle = canRoll ? undefined : "Not your turn"

  const selectedRace = races.find((r) => r.name === character.race) ?? null
  const selectedClass = classes.find((c) => c.name === character.className) ?? null
  const allowedSkillIds = selectedClass ? new Set(selectedClass.skillChoices) : null
  const restrictSkillsToClass = blueprintEditable && !!selectedClass
  const proficientSkillCount = SKILL_IDS.filter(
    (id) => allowedSkillIds?.has(id) && character.skillProficiencies[id],
  ).length

  /** Recomputes `hp.max` (and clamps `hp.current` down if it now exceeds the
   * new max) from the currently-selected class's hit die — shared by every
   * handler that can change level, class, or Constitution. No-op (returns an
   * empty patch) when no class is selected, so callers can always spread
   * this in unconditionally. */
  function recomputedHp(hitDie: number, level: number, abilities: AbilityScores): Partial<CharacterRecord> {
    const maxHp = computeMaxHp(hitDie, level, computeModifier(abilities.con))
    return { hp: { ...character.hp, max: maxHp, current: Math.min(character.hp.current, maxHp) } }
  }

  function handleAbilityMethodChange(method: CharacterRecord['abilityMethod']) {
    const nextBase: AbilityScores =
      method === 'standard'
        ? { str: 15, dex: 14, con: 13, int: 12, wis: 10, cha: 8 }
        : method === 'pointBuy'
          ? { str: 8, dex: 8, con: 8, int: 8, wis: 8, cha: 8 }
          : character.baseAbilities
    const abilities = applyRacialBonus(nextBase, selectedRace?.abilityBonuses ?? {})
    onUpdate({
      abilityMethod: method,
      baseAbilities: nextBase,
      abilities,
      ...(selectedClass ? recomputedHp(selectedClass.hitDie, character.level, abilities) : {}),
    })
  }

  function handleBaseAbilityChange(key: AbilityKey, value: number) {
    const nextBase = { ...character.baseAbilities, [key]: value }
    const abilities = applyRacialBonus(nextBase, selectedRace?.abilityBonuses ?? {})
    onUpdate({
      baseAbilities: nextBase,
      abilities,
      ...(selectedClass ? recomputedHp(selectedClass.hitDie, character.level, abilities) : {}),
    })
  }

  function handleRaceChange(name: string) {
    const race = races.find((r) => r.name === name) ?? null
    const abilities = applyRacialBonus(character.baseAbilities, race?.abilityBonuses ?? {})
    onUpdate({
      race: name,
      abilities,
      ...(race ? { speed: race.speed } : {}),
      ...(selectedClass ? recomputedHp(selectedClass.hitDie, character.level, abilities) : {}),
    })
  }

  function handleClassChange(name: string) {
    const cls = classes.find((c) => c.name === name) ?? null
    if (!cls) {
      onUpdate({ className: name })
      return
    }
    const saveProficiencies = ABILITY_KEYS.reduce(
      (acc, k) => {
        acc[k] = cls.savingThrows.includes(k)
        return acc
      },
      {} as Record<AbilityKey, boolean>,
    )
    const allowed = new Set(cls.skillChoices)
    const skillProficiencies = Object.fromEntries(
      Object.entries(character.skillProficiencies).filter(([skill]) => allowed.has(skill as SkillId)),
    ) as Partial<Record<SkillId, SkillProficiency>>
    onUpdate({
      className: name,
      saveProficiencies,
      skillProficiencies,
      hitDice: `${character.level}d${cls.hitDie}`,
      ...recomputedHp(cls.hitDie, character.level, character.abilities),
    })
  }

  function handleLevelChange(level: number) {
    onUpdate({
      level,
      ...(selectedClass
        ? { hitDice: `${level}d${selectedClass.hitDie}`, ...recomputedHp(selectedClass.hitDie, level, character.abilities) }
        : {}),
    })
  }

  return (
    <div className="character-sheet">
      <div className="character-sheet__tabs">
        <button type="button" aria-pressed={tab === 'stats'} onClick={() => setTab('stats')}>
          Stats
        </button>
        <button type="button" aria-pressed={tab === 'inventory'} onClick={() => setTab('inventory')}>
          Inventory
        </button>
        <button type="button" aria-pressed={tab === 'spells'} onClick={() => setTab('spells')}>
          Spells
        </button>
        {inventoryActions && (
          <button type="button" aria-pressed={tab === 'history'} onClick={() => setTab('history')}>
            History
          </button>
        )}
      </div>

      {character.locked && (
        <p className="character-sheet__hint">
          This character's core blueprint is locked for this campaign. Edit your standalone copy and rejoin to update it.
        </p>
      )}

      {tab === 'stats' && (
        <div className="character-sheet__section">
          <div className="character-sheet__identity">
            <label>
              Name
              <input value={character.name} disabled={!blueprintEditable} onChange={(e) => onUpdate({ name: e.target.value })} />
            </label>
            <label>
              Race
              <select value={character.race} disabled={!blueprintEditable} onChange={(e) => handleRaceChange(e.target.value)}>
                <option value="">Select a race…</option>
                {races.map((r) => (
                  <option key={r.key} value={r.name}>
                    {r.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Class
              <select value={character.className} disabled={!blueprintEditable} onChange={(e) => handleClassChange(e.target.value)}>
                <option value="">Select a class…</option>
                {classes.map((c) => (
                  <option key={c.key} value={c.name}>
                    {c.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Level
              <input
                type="number"
                min={1}
                max={20}
                value={character.level}
                disabled={!blueprintEditable}
                onChange={(e) => handleLevelChange(Number(e.target.value))}
              />
            </label>
            <label>
              Background
              <input
                value={character.background}
                disabled={!blueprintEditable}
                onChange={(e) => onUpdate({ background: e.target.value })}
              />
            </label>
            <label>
              Alignment
              <input
                value={character.alignment}
                disabled={!blueprintEditable}
                onChange={(e) => onUpdate({ alignment: e.target.value })}
              />
            </label>
          </div>

          <p className="character-sheet__hint">Proficiency bonus: {fmtMod(profBonus)}</p>

          <h3>Abilities & saving throws</h3>
          <label>
            Ability score method
            <select
              value={character.abilityMethod}
              disabled={!blueprintEditable}
              onChange={(e) => handleAbilityMethodChange(e.target.value as CharacterRecord['abilityMethod'])}
            >
              <option value="standard">Standard Array</option>
              <option value="pointBuy">Point Buy</option>
              <option value="manual">Manual / Rolled</option>
            </select>
          </label>
          {character.abilityMethod === 'pointBuy' && (
            <p className="character-sheet__hint">
              Points spent: {pointBuyCost(character.baseAbilities)} / {POINT_BUY_BUDGET}
              {!isValidPointBuy(character.baseAbilities) && ' — over budget'}
            </p>
          )}
          {character.abilityMethod === 'standard' && !isValidStandardArray(character.baseAbilities) && (
            <p className="character-sheet__hint">Each of {STANDARD_ARRAY.join(', ')} must be used exactly once.</p>
          )}
          {selectedClass && (
            <p className="character-sheet__hint">
              Saving throw proficiencies are locked to {selectedClass.name}'s: {selectedClass.savingThrows.map((k) => ABILITY_LABELS[k]).join(', ')}.
            </p>
          )}
          <ul className="character-sheet__ability-list">
            {ABILITY_KEYS.map((key) => {
              const baseScore = character.baseAbilities[key]
              const finalScore = character.abilities[key]
              const mod = computeModifier(finalScore)
              const saveBonus = computeSaveBonus(character, key)
              const racialBonus = selectedRace?.abilityBonuses[key] ?? 0
              return (
                <li key={key} className="character-sheet__ability-row">
                  <span className="character-sheet__ability-label">{ABILITY_LABELS[key]}</span>
                  {character.abilityMethod === 'standard' ? (
                    <select
                      value={baseScore}
                      disabled={!blueprintEditable}
                      onChange={(e) => handleBaseAbilityChange(key, Number(e.target.value))}
                    >
                      {standardArrayOptionsFor(key, character.baseAbilities).map((value) => (
                        <option key={value} value={value}>
                          {value}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <input
                      type="number"
                      min={character.abilityMethod === 'pointBuy' ? 8 : undefined}
                      max={character.abilityMethod === 'pointBuy' ? 15 : undefined}
                      value={baseScore}
                      disabled={!blueprintEditable}
                      onChange={(e) => handleBaseAbilityChange(key, Number(e.target.value))}
                    />
                  )}
                  {racialBonus !== 0 && <span className="character-sheet__hint">{fmtMod(racialBonus)} racial</span>}
                  <span>
                    {finalScore} ({fmtMod(mod)})
                  </span>
                  <button type="button" disabled={!canRoll} title={rollTitle} onClick={() => onQuickRoll(ABILITY_LABELS[key], `1d20${mod >= 0 ? '+' : ''}${mod}`, 'abilityCheck')}>
                    Check
                  </button>
                  <label className="character-sheet__save-toggle">
                    <input
                      type="checkbox"
                      checked={character.saveProficiencies[key]}
                      disabled={!blueprintEditable || !!selectedClass}
                      onChange={(e) =>
                        onUpdate({ saveProficiencies: { ...character.saveProficiencies, [key]: e.target.checked } })
                      }
                    />
                    Save prof.
                  </label>
                  <span>{fmtMod(saveBonus)}</span>
                  <button
                    type="button"
                    disabled={!canRoll}
                    title={rollTitle}
                    onClick={() => onQuickRoll(`${ABILITY_LABELS[key]} save`, `1d20${saveBonus >= 0 ? '+' : ''}${saveBonus}`, 'save')}
                  >
                    Save
                  </button>
                </li>
              )
            })}
          </ul>

          <h3>Skills</h3>
          {restrictSkillsToClass && (
            <p className="character-sheet__hint">
              {selectedClass!.name} may choose {selectedClass!.skillChoiceCount} skill{selectedClass!.skillChoiceCount === 1 ? '' : 's'} from
              its list ({proficientSkillCount}/{selectedClass!.skillChoiceCount} chosen).
            </p>
          )}
          <ul className="character-sheet__skill-list">
            {SKILL_IDS.map((skillId) => {
              const bonus = computeSkillBonus(character, skillId)
              const proficiency = character.skillProficiencies[skillId]
              const allowedForClass = !restrictSkillsToClass || (allowedSkillIds?.has(skillId) ?? false)
              const atCap = restrictSkillsToClass && !proficiency && proficientSkillCount >= (selectedClass?.skillChoiceCount ?? 0)
              const skillDisabled = !blueprintEditable || (restrictSkillsToClass && (!allowedForClass || atCap))
              return (
                <li key={skillId} className="character-sheet__skill-row">
                  <span className="character-sheet__skill-label">
                    {SKILL_LABELS[skillId]} ({ABILITY_LABELS[SKILL_ABILITY_MAP[skillId]].slice(0, 3)})
                  </span>
                  <select
                    value={proficiency ?? ''}
                    disabled={skillDisabled}
                    onChange={(e) => {
                      const value = e.target.value as SkillProficiency | ''
                      const next = { ...character.skillProficiencies }
                      if (value) next[skillId] = value
                      else delete next[skillId]
                      onUpdate({ skillProficiencies: next })
                    }}
                  >
                    <option value="">Untrained</option>
                    <option value="proficient">Proficient</option>
                    {!restrictSkillsToClass && <option value="expertise">Expertise</option>}
                  </select>
                  <span>{fmtMod(bonus)}</span>
                  <button
                    type="button"
                    disabled={!canRoll}
                    title={rollTitle}
                    onClick={() => onQuickRoll(SKILL_LABELS[skillId], `1d20${bonus >= 0 ? '+' : ''}${bonus}`, 'abilityCheck')}
                  >
                    Roll
                  </button>
                </li>
              )
            })}
          </ul>

          <h3>Combat stats</h3>
          <div className="character-sheet__combat-stats">
            <label>
              AC
              <input type="number" value={character.ac} disabled={!blueprintEditable} onChange={(e) => onUpdate({ ac: Number(e.target.value) })} />
            </label>
            <label>
              Initiative bonus
              <input
                type="number"
                value={character.initiativeBonus}
                disabled={!blueprintEditable}
                onChange={(e) => onUpdate({ initiativeBonus: Number(e.target.value) })}
              />
            </label>
            <span>Total initiative: {fmtMod(computeInitiativeBonus(character))}</span>
            <label>
              Speed
              <input
                type="number"
                value={character.speed}
                disabled={!blueprintEditable}
                onChange={(e) => onUpdate({ speed: Number(e.target.value) })}
              />
            </label>
            <label>
              Hit dice
              <input value={character.hitDice} disabled={!blueprintEditable} onChange={(e) => onUpdate({ hitDice: e.target.value })} />
            </label>
            {hitDiceTotal > 0 && canEdit && (
              <span className="character-sheet__slot-used">
                <button
                  type="button"
                  onClick={() => onUpdate({ hitDiceUsed: Math.max(0, character.hitDiceUsed - 1) })}
                  disabled={character.hitDiceUsed <= 0}
                >
                  −
                </button>
                {character.hitDiceUsed}/{hitDiceTotal} spent
                <button
                  type="button"
                  onClick={() => onUpdate({ hitDiceUsed: Math.min(hitDiceTotal, character.hitDiceUsed + 1) })}
                  disabled={character.hitDiceUsed >= hitDiceTotal}
                >
                  +
                </button>
              </span>
            )}
          </div>

          <h3>Hit points</h3>
          <div className="character-sheet__hp">
            <label>
              Current
              <input
                type="number"
                value={character.hp.current}
                disabled={!canEdit}
                onChange={(e) => onUpdate({ hp: { ...character.hp, current: Number(e.target.value) } })}
              />
            </label>
            <label>
              Max
              <input
                type="number"
                value={character.hp.max}
                disabled={!blueprintEditable || !!selectedClass}
                onChange={(e) => onUpdate({ hp: { ...character.hp, max: Number(e.target.value) } })}
              />
            </label>
            {selectedClass && blueprintEditable && (
              <span className="character-sheet__hint">Computed from {selectedClass.name}'s hit die + Constitution.</span>
            )}
            <label>
              Temp
              <input
                type="number"
                value={character.hp.temp}
                disabled={!canEdit}
                onChange={(e) => onUpdate({ hp: { ...character.hp, temp: Number(e.target.value) } })}
              />
            </label>
          </div>

          <h3>Resources</h3>
          <ul className="character-sheet__row-list">
            {character.resources.map((resource) => (
              <li key={resource.id} className="character-sheet__row">
                <input
                  placeholder="Name (e.g. Ki points)"
                  value={resource.name}
                  disabled={!canEdit}
                  onChange={(e) =>
                    onUpdate({
                      resources: character.resources.map((r) => (r.id === resource.id ? { ...r, name: e.target.value } : r)),
                    })
                  }
                />
                <span className="character-sheet__slot-used">
                  <button
                    type="button"
                    disabled={!canEdit || resource.current <= 0}
                    onClick={() =>
                      onUpdate({
                        resources: character.resources.map((r) =>
                          r.id === resource.id ? { ...r, current: Math.max(0, r.current - 1) } : r,
                        ),
                      })
                    }
                  >
                    −
                  </button>
                  {resource.current}/{resource.max}
                  <button
                    type="button"
                    disabled={!canEdit || resource.current >= resource.max}
                    onClick={() =>
                      onUpdate({
                        resources: character.resources.map((r) =>
                          r.id === resource.id ? { ...r, current: Math.min(r.max, r.current + 1) } : r,
                        ),
                      })
                    }
                  >
                    +
                  </button>
                </span>
                <label>
                  Max
                  <input
                    type="number"
                    min={0}
                    value={resource.max}
                    disabled={!canEdit}
                    onChange={(e) => {
                      const max = Math.max(0, Number(e.target.value))
                      onUpdate({
                        resources: character.resources.map((r) =>
                          r.id === resource.id ? { ...r, max, current: Math.min(r.current, max) } : r,
                        ),
                      })
                    }}
                  />
                </label>
                {canEdit && (
                  <button
                    type="button"
                    onClick={() => onUpdate({ resources: character.resources.filter((r) => r.id !== resource.id) })}
                  >
                    Remove
                  </button>
                )}
              </li>
            ))}
          </ul>
          {canEdit && (
            <button
              type="button"
              onClick={() =>
                onUpdate({
                  resources: [...character.resources, { id: crypto.randomUUID(), name: '', current: 1, max: 1 }],
                })
              }
            >
              Add resource
            </button>
          )}
        </div>
      )}

      {tab === 'inventory' && (
        <CharacterInventory
          character={character}
          canEdit={canEdit}
          onUpdate={onUpdate}
          inventoryActions={inventoryActions}
          otherCharacters={otherCharacters}
        />
      )}

      {tab === 'spells' && (
        <CharacterSpells character={character} canEdit={canEdit} blueprintEditable={blueprintEditable} onUpdate={onUpdate} />
      )}

      {tab === 'history' && inventoryActions && (
        <div className="character-sheet__section">
          <h3>Inventory history</h3>
          <InventoryHistoryList entries={inventoryActions.history} />
        </div>
      )}
    </div>
  )
}
