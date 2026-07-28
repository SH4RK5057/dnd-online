import { useState } from 'react'
import type { AbilityKey, AbilityScores, CharacterRecord, SkillId, SkillProficiency } from '../character/types'
import { ABILITY_LABELS, SKILL_LABELS } from '../character/types'
import {
  applyAbilityScoreImprovement,
  applyRacialBonus,
  casterTypeForClass,
  combineAbilityBonuses,
  computeChosenAbilityBonuses,
  computeClassResourceGrants,
  computeInitiativeBonus,
  computeMaxHp,
  computeModifier,
  computeProficiencyBonus,
  computeSaveBonus,
  computeSkillBonus,
  computeSpellSlotsByLevel,
  isValidAbilityScoreImprovement,
  isValidPointBuy,
  isValidStandardArray,
  mergeClassResourceGrants,
  parseHitDiceCount,
  pointBuyCost,
  POINT_BUY_BUDGET,
  SKILL_ABILITY_MAP,
  STANDARD_ARRAY,
  xpToLevel,
} from '../character/rules'
import type { RollCategory } from '../dice/conditions'
import type { UseInventoryActionsResult } from '../character/useInventoryActions'
import type { BackgroundData, ClassData, FeatureChoice, RaceData, SubclassData } from '../content/types'
import { CharacterInventory } from './CharacterInventory'
import { CharacterSpells } from './CharacterSpells'
import { InventoryHistoryList } from './InventoryHistoryPanel'

const LEVELS = Array.from({ length: 20 }, (_, i) => i + 1)

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

/** A race's flat abilityBonuses plus whatever extra bonuses its resolved
 * FeatureChoices grant (e.g. Half-Elf's "choose two abilities") — every
 * applyRacialBonus call site should go through this rather than reading
 * `race.abilityBonuses` directly, so a chosen ability bonus actually takes
 * effect. */
function effectiveAbilityBonusesFor(race: RaceData | null, featureChoices: Record<string, string[]>): Partial<Record<AbilityKey, number>> {
  if (!race) return {}
  return combineAbilityBonuses(race.abilityBonuses, computeChosenAbilityBonuses(race, featureChoices))
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
  subclasses,
  backgrounds,
  isDm,
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
  subclasses: SubclassData[]
  /** SRD-only reference data — see BackgroundData's doc comment. */
  backgrounds: BackgroundData[]
  /** Distinct from `canEdit` (isDm || isOwner) — gates DM-only actions on
   * custom overrides (approve/reject) where the owning player themselves
   * shouldn't be able to self-approve their own proposal. False in the
   * standalone (pre-campaign) editors, where there's no DM/campaign yet. */
  isDm: boolean
}) {
  const [tab, setTab] = useState<Tab>('stats')
  const blueprintEditable = canEdit && !character.locked
  const profBonus = computeProficiencyBonus(character.level)
  const hitDiceTotal = parseHitDiceCount(character.hitDice)

  const rollTitle = canRoll ? undefined : "Not your turn"

  const selectedRace = races.find((r) => r.name === character.race) ?? null
  const selectedClass = classes.find((c) => c.name === character.className) ?? null
  const selectedBackground = backgrounds.find((b) => b.name === character.background) ?? null
  const selectedSubclass = subclasses.find((s) => s.name === character.subclassName && s.className === character.className) ?? null
  const allowedSkillIds = selectedClass ? new Set(selectedClass.skillChoices) : null
  const restrictSkillsToClass = blueprintEditable && !!selectedClass
  const proficientSkillCount = SKILL_IDS.filter(
    (id) => allowedSkillIds?.has(id) && character.skillProficiencies[id],
  ).length
  const availableSubclasses = selectedClass ? subclasses.filter((s) => s.className === selectedClass.name) : []
  const needsSubclassChoice = !!selectedClass && character.level >= selectedClass.subclassLevel && !character.subclassName

  // Level-up wizard: a guided, rule-following mutation of level/abilities/HP/
  // resources/subclass, gated by `canEdit` rather than `blueprintEditable` —
  // unlike the free-text blueprint inputs above (locked once bound to a
  // campaign to prevent silent drift), progressing through XP thresholds
  // during play is exactly the kind of change a "locked" character should
  // still be able to do.
  const eligibleLevel = xpToLevel(character.xp)
  const canLevelUp = canEdit && character.level < 20 && eligibleLevel > character.level
  const nextLevel = character.level + 1
  const [levelUpOpen, setLevelUpOpen] = useState(false)
  const [hpMethod, setHpMethod] = useState<'roll' | 'average'>('average')
  const [rolledHp, setRolledHp] = useState<number | null>(null)
  const [asiChoice, setAsiChoice] = useState<'asi' | 'feat'>('asi')
  const [asiChanges, setAsiChanges] = useState<Partial<Record<AbilityKey, number>>>({})
  const [featName, setFeatName] = useState('')
  const [levelUpSubclass, setLevelUpSubclass] = useState('')
  const needsAsiThisLevelUp = !!selectedClass?.asiLevels.includes(nextLevel) && !character.resolvedAsiLevels.includes(nextLevel)
  const needsSubclassThisLevelUp = !!selectedClass && nextLevel >= selectedClass.subclassLevel && !character.subclassName
  const asiValid = asiChoice === 'asi' ? isValidAbilityScoreImprovement(asiChanges) : featName.trim().length > 0
  const canConfirmLevelUp = (!needsAsiThisLevelUp || asiValid) && (!needsSubclassThisLevelUp || levelUpSubclass !== '')

  function openLevelUp() {
    setLevelUpOpen(true)
    setHpMethod('average')
    setRolledHp(null)
    setAsiChoice('asi')
    setAsiChanges({})
    setFeatName('')
    setLevelUpSubclass('')
  }

  function handleConfirmLevelUp() {
    let nextBaseAbilities = character.baseAbilities
    let nextFeats = character.feats
    let nextResolvedAsi = character.resolvedAsiLevels
    if (needsAsiThisLevelUp) {
      if (asiChoice === 'asi') {
        nextBaseAbilities = applyAbilityScoreImprovement(character.baseAbilities, asiChanges)
      } else {
        nextFeats = [...character.feats, { id: crypto.randomUUID(), name: featName.trim(), notes: '' }]
      }
      nextResolvedAsi = [...character.resolvedAsiLevels, nextLevel]
    }
    const nextAbilities = applyRacialBonus(nextBaseAbilities, effectiveAbilityBonusesFor(selectedRace, character.featureChoices))
    const patch: Partial<CharacterRecord> = {
      level: nextLevel,
      baseAbilities: nextBaseAbilities,
      abilities: nextAbilities,
      resolvedAsiLevels: nextResolvedAsi,
      feats: nextFeats,
    }
    if (needsSubclassThisLevelUp && levelUpSubclass) patch.subclassName = levelUpSubclass
    if (selectedClass) {
      const average = Math.floor(selectedClass.hitDie / 2) + 1
      const conMod = computeModifier(nextAbilities.con)
      const hpGain = (hpMethod === 'roll' ? (rolledHp ?? average) : average) + conMod
      patch.hitDice = `${nextLevel}d${selectedClass.hitDie}`
      patch.hp = { ...character.hp, max: character.hp.max + hpGain, current: character.hp.current + hpGain }
      patch.resources = mergeClassResourceGrants(character.resources, computeClassResourceGrants(character.className, nextLevel, nextAbilities))
      Object.assign(patch, recomputedSpellSlots(character.className, nextLevel))
    }
    onUpdate(patch)
    setLevelUpOpen(false)
  }

  function handleAsiPointChange(key: AbilityKey, delta: number) {
    const current = asiChanges[key] ?? 0
    const next = current + delta
    const nextChanges = { ...asiChanges }
    if (next <= 0) delete nextChanges[key]
    else nextChanges[key] = next
    setAsiChanges(nextChanges)
  }

  const asiPointsSpent = Object.values(asiChanges).reduce((sum, v) => sum + (v ?? 0), 0)

  /** Recomputes `hp.max` (and clamps `hp.current` down if it now exceeds the
   * new max) from the currently-selected class's hit die — shared by every
   * handler that can change level, class, or Constitution. No-op (returns an
   * empty patch) when no class is selected, so callers can always spread
   * this in unconditionally. */
  function recomputedHp(hitDie: number, level: number, abilities: AbilityScores): Partial<CharacterRecord> {
    const maxHp = computeMaxHp(hitDie, level, computeModifier(abilities.con))
    return { hp: { ...character.hp, max: maxHp, current: Math.min(character.hp.current, maxHp) } }
  }

  /** Recomputes spell slot totals from the standard 5e progression for this
   * class/level, clamping already-spent slots down if the total shrank —
   * shared by every handler that can change class or level. Returns an
   * empty patch (no-op) for a class this app doesn't recognize as a caster
   * (including mirror-imported/homebrew ones), so those keep whatever
   * slots were manually entered instead of being silently zeroed. */
  function recomputedSpellSlots(className: string, level: number): Partial<CharacterRecord> {
    if (casterTypeForClass(className) === 'none') return {}
    const spellSlotsByLevel = computeSpellSlotsByLevel(className, level)
    const spellSlotsUsedByLevel = character.spellSlotsUsedByLevel.map((used, i) => Math.min(used, spellSlotsByLevel[i] ?? 0))
    return { spellSlotsByLevel, spellSlotsUsedByLevel }
  }

  function handleAbilityMethodChange(method: CharacterRecord['abilityMethod']) {
    const nextBase: AbilityScores =
      method === 'standard'
        ? { str: 15, dex: 14, con: 13, int: 12, wis: 10, cha: 8 }
        : method === 'pointBuy'
          ? { str: 8, dex: 8, con: 8, int: 8, wis: 8, cha: 8 }
          : character.baseAbilities
    const abilities = applyRacialBonus(nextBase, effectiveAbilityBonusesFor(selectedRace, character.featureChoices))
    onUpdate({
      abilityMethod: method,
      baseAbilities: nextBase,
      abilities,
      ...(selectedClass ? recomputedHp(selectedClass.hitDie, character.level, abilities) : {}),
    })
  }

  /** Manual mode is clamped to [3,18] — no legitimate 5e ability-generation
   * method (Standard Array, Point Buy, or rolling) produces a base score
   * outside that range without magic, so free typing can't be used to set
   * every ability to 20. Point Buy changes that would exceed the 27-point
   * budget (or leave the buyable 8-15 range) are rejected outright rather
   * than merely flagged, since the existing "over budget" hint alone didn't
   * stop anything from actually being saved. */
  function handleBaseAbilityChange(key: AbilityKey, value: number) {
    let nextValue = value
    if (character.abilityMethod === 'manual') {
      nextValue = Math.min(18, Math.max(3, value))
    } else if (character.abilityMethod === 'pointBuy') {
      nextValue = Math.min(15, Math.max(8, value))
    }
    const nextBase = { ...character.baseAbilities, [key]: nextValue }
    if (character.abilityMethod === 'pointBuy' && pointBuyCost(nextBase) > POINT_BUY_BUDGET) return
    const abilities = applyRacialBonus(nextBase, effectiveAbilityBonusesFor(selectedRace, character.featureChoices))
    onUpdate({
      baseAbilities: nextBase,
      abilities,
      ...(selectedClass ? recomputedHp(selectedClass.hitDie, character.level, abilities) : {}),
    })
  }

  function handleRaceChange(name: string) {
    const race = races.find((r) => r.name === name) ?? null
    const abilities = applyRacialBonus(character.baseAbilities, effectiveAbilityBonusesFor(race, character.featureChoices))
    onUpdate({
      race: name,
      abilities,
      ...(race ? { speed: race.speed } : {}),
      ...(selectedClass ? recomputedHp(selectedClass.hitDie, character.level, abilities) : {}),
    })
  }

  /** A background grants exactly 2 fixed skill proficiencies (no player
   * choice, per SRD) — swapping backgrounds removes the OLD background's
   * skills (only if still 'proficient', so an independently-upgraded or
   * otherwise-granted skill isn't clobbered) and grants the NEW one's. */
  function handleBackgroundChange(name: string) {
    const newBg = backgrounds.find((b) => b.name === name) ?? null
    const next = { ...character.skillProficiencies }
    for (const skill of selectedBackground?.skillProficiencies ?? []) {
      if (next[skill] === 'proficient') delete next[skill]
    }
    for (const skill of newBg?.skillProficiencies ?? []) {
      if (!next[skill]) next[skill] = 'proficient'
    }
    onUpdate({ background: name, skillProficiencies: next })
  }

  /** Shared handler for every FeatureChoice this sheet renders — race
   * choices (Draconic Ancestry, Half-Elf's ability/skill picks) and class/
   * subclass feature choices (Fighting Style) alike. Recomputing
   * `abilities`/`hp` unconditionally is harmless even for choices that
   * don't affect them (e.g. Fighting Style): computeChosenAbilityBonuses
   * only reacts to race choices with `grantsAbilityBonus` set, so anything
   * else is a no-op. For a `grantsSkillProficiency` choice (Half-Elf's
   * Skill Versatility), also grants/revokes 'proficient' in
   * skillProficiencies for the skills added/removed by THIS choice —
   * doesn't touch a skill this choice didn't grant, even if it happens to
   * already be proficient some other way (class pick, another choice). */
  function handleFeatureChoiceChange(choice: FeatureChoice, selectedKeys: string[]) {
    const previousKeys = character.featureChoices[choice.id] ?? []
    const nextFeatureChoices = { ...character.featureChoices, [choice.id]: selectedKeys }
    let nextSkillProficiencies = character.skillProficiencies
    if (choice.grantsSkillProficiency) {
      const next = { ...character.skillProficiencies }
      for (const key of previousKeys) {
        if (!selectedKeys.includes(key) && next[key as SkillId] === 'proficient') delete next[key as SkillId]
      }
      for (const key of selectedKeys) {
        if (!next[key as SkillId]) next[key as SkillId] = 'proficient'
      }
      nextSkillProficiencies = next
    }
    const abilities = applyRacialBonus(character.baseAbilities, effectiveAbilityBonusesFor(selectedRace, nextFeatureChoices))
    onUpdate({
      featureChoices: nextFeatureChoices,
      skillProficiencies: nextSkillProficiencies,
      abilities,
      ...(selectedClass ? recomputedHp(selectedClass.hitDie, character.level, abilities) : {}),
    })
  }

  function handleClassChange(name: string) {
    const cls = classes.find((c) => c.name === name) ?? null
    if (!cls) {
      onUpdate({ className: name, subclassName: '' })
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
      // A subclass belongs to a specific class — switching classes always
      // clears whatever subclass was chosen for the old one.
      subclassName: '',
      saveProficiencies,
      skillProficiencies,
      hitDice: `${character.level}d${cls.hitDie}`,
      ...recomputedHp(cls.hitDie, character.level, character.abilities),
      ...recomputedSpellSlots(name, character.level),
    })
  }

  function handleLevelChange(level: number) {
    onUpdate({
      level,
      ...(selectedClass
        ? { hitDice: `${level}d${selectedClass.hitDie}`, ...recomputedHp(selectedClass.hitDie, level, character.abilities) }
        : {}),
      ...recomputedSpellSlots(character.className, level),
    })
  }

  /** Renders one FeatureChoice's control — a single <select> when only one
   * option may be picked (Draconic Ancestry, Fighting Style), or a
   * checkbox list capped at `count` when more than one may be (Half-Elf's
   * "choose two abilities"), matching the same capped-checkbox pattern
   * already used for skill-proficiency picks. */
  function renderFeatureChoice(choice: FeatureChoice) {
    const selected = character.featureChoices[choice.id] ?? []
    const resolved = selected.length >= choice.count
    if (choice.count === 1) {
      return (
        <label key={choice.id}>
          {choice.label}
          {!resolved && ' (required)'}
          <select
            value={selected[0] ?? ''}
            disabled={!blueprintEditable}
            onChange={(e) => handleFeatureChoiceChange(choice, e.target.value ? [e.target.value] : [])}
          >
            <option value="">Select…</option>
            {choice.options.map((opt) => (
              <option key={opt.key} value={opt.key}>
                {opt.name}
                {opt.description ? ` — ${opt.description}` : ''}
              </option>
            ))}
          </select>
        </label>
      )
    }
    return (
      <div key={choice.id}>
        <strong>
          {choice.label} ({selected.length}/{choice.count} chosen)
        </strong>
        <ul className="character-sheet__row-list">
          {choice.options.map((opt) => {
            const checked = selected.includes(opt.key)
            const atCap = !checked && selected.length >= choice.count
            return (
              <li key={opt.key}>
                <label>
                  <input
                    type="checkbox"
                    checked={checked}
                    disabled={!blueprintEditable || atCap}
                    onChange={(e) => {
                      const next = e.target.checked ? [...selected, opt.key] : selected.filter((k) => k !== opt.key)
                      handleFeatureChoiceChange(choice, next)
                    }}
                  />
                  {opt.name}
                  {opt.description ? ` — ${opt.description}` : ''}
                </label>
              </li>
            )
          })}
        </ul>
      </div>
    )
  }

  const [overrideLabel, setOverrideLabel] = useState('')
  const [overrideValue, setOverrideValue] = useState('')

  /** A player's proposed override starts 'pending' — nothing else in this
   * app treats a pending override as mechanically active, it's purely a
   * request the DM must approve. A DM adding one directly is trusted
   * immediately, same as every other DM-authored entity in this app. */
  function handleAddOverride() {
    if (!overrideLabel.trim() || !overrideValue.trim()) return
    const override = {
      id: crypto.randomUUID(),
      label: overrideLabel.trim(),
      value: overrideValue.trim(),
      createdBy: isDm ? ('dm' as const) : ('player' as const),
      status: isDm ? ('approved' as const) : ('pending' as const),
      createdAt: Date.now(),
    }
    onUpdate({ overrides: [...character.overrides, override] })
    setOverrideLabel('')
    setOverrideValue('')
  }

  function handleSetOverrideStatus(id: string, status: 'approved' | 'rejected') {
    onUpdate({ overrides: character.overrides.map((o) => (o.id === id ? { ...o, status } : o)) })
  }

  function handleRemoveOverride(id: string) {
    onUpdate({ overrides: character.overrides.filter((o) => o.id !== id) })
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
            {selectedClass && character.level >= selectedClass.subclassLevel && (
              <label>
                Subclass
                <select
                  value={character.subclassName}
                  disabled={!blueprintEditable}
                  onChange={(e) => onUpdate({ subclassName: e.target.value })}
                >
                  <option value="">Select a subclass…</option>
                  {availableSubclasses.map((s) => (
                    <option key={s.key} value={s.name}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </label>
            )}
            <label>
              Level
              <select value={character.level} disabled={!blueprintEditable} onChange={(e) => handleLevelChange(Number(e.target.value))}>
                {LEVELS.map((lvl) => (
                  <option key={lvl} value={lvl}>
                    {lvl}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Background
              <select value={character.background} disabled={!blueprintEditable} onChange={(e) => handleBackgroundChange(e.target.value)}>
                <option value="">Select a background…</option>
                {backgrounds.map((b) => (
                  <option key={b.key} value={b.name}>
                    {b.name}
                  </option>
                ))}
              </select>
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
          {needsSubclassChoice && (
            <p className="character-sheet__hint">A subclass must be chosen at level {selectedClass!.subclassLevel}.</p>
          )}

          <p className="character-sheet__hint">Proficiency bonus: {fmtMod(profBonus)}</p>

          {(selectedRace || selectedClass || selectedBackground) && (
            <>
              <h3>Features & traits</h3>
              {selectedBackground && (
                <div className="character-sheet__features-group">
                  <strong>{selectedBackground.name}</strong>
                  <ul className="character-sheet__row-list">
                    <li>Skill proficiencies: {selectedBackground.skillProficiencies.map((s) => SKILL_LABELS[s]).join(', ')}</li>
                    <li>
                      <strong>{selectedBackground.feature.name}:</strong> {selectedBackground.feature.entries.join(' ')}
                    </li>
                  </ul>
                </div>
              )}
              {selectedRace && (selectedRace.traits.length > 0 || selectedRace.choices.length > 0) && (
                <div className="character-sheet__features-group">
                  <strong>{selectedRace.name}</strong>
                  <ul className="character-sheet__row-list">
                    {selectedRace.traits.map((trait, i) => (
                      <li key={i}>{trait}</li>
                    ))}
                  </ul>
                  {selectedRace.choices.map((choice) => renderFeatureChoice(choice))}
                </div>
              )}
              {selectedClass && (
                <div className="character-sheet__features-group">
                  <strong>{selectedClass.name}</strong>
                  <ul className="character-sheet__row-list">
                    {selectedClass.features
                      .filter((f) => f.level <= character.level)
                      .map((f) => (
                        <li key={`${f.level}-${f.name}`}>
                          <strong>
                            Lvl {f.level} — {f.name}:
                          </strong>{' '}
                          {f.entries.join(' ')}
                          {f.choice && <div>{renderFeatureChoice(f.choice)}</div>}
                        </li>
                      ))}
                  </ul>
                </div>
              )}
              {selectedSubclass && (
                <div className="character-sheet__features-group">
                  <strong>{selectedSubclass.name}</strong>
                  <ul className="character-sheet__row-list">
                    {selectedSubclass.features
                      .filter((f) => f.level <= character.level)
                      .map((f) => (
                        <li key={`${f.level}-${f.name}`}>
                          <strong>
                            Lvl {f.level} — {f.name}:
                          </strong>{' '}
                          {f.entries.join(' ')}
                          {f.choice && <div>{renderFeatureChoice(f.choice)}</div>}
                        </li>
                      ))}
                  </ul>
                </div>
              )}
            </>
          )}

          <h3>Experience & leveling</h3>
          <div className="character-sheet__xp">
            <label>
              XP
              <input
                type="number"
                min={0}
                value={character.xp}
                disabled={!canEdit}
                onChange={(e) => onUpdate({ xp: Math.max(0, Number(e.target.value)) })}
              />
            </label>
            <span className="character-sheet__hint">
              {eligibleLevel > character.level ? `Eligible for level ${nextLevel}` : `Level ${character.level}`}
            </span>
            {canLevelUp && !levelUpOpen && (
              <button type="button" onClick={openLevelUp}>
                Level Up to {nextLevel}
              </button>
            )}
          </div>

          {levelUpOpen && (
            <div className="character-sheet__level-up">
              <h4>Leveling up to {nextLevel}</h4>
              {selectedClass && (
                <div className="character-sheet__level-up-section">
                  <strong>Hit points</strong>
                  <label>
                    <input
                      type="radio"
                      name="hp-method"
                      checked={hpMethod === 'average'}
                      onChange={() => setHpMethod('average')}
                    />
                    Take average ({Math.floor(selectedClass.hitDie / 2) + 1} + Con modifier)
                  </label>
                  <label>
                    <input type="radio" name="hp-method" checked={hpMethod === 'roll'} onChange={() => setHpMethod('roll')} />
                    Roll 1d{selectedClass.hitDie} + Con modifier
                  </label>
                  {hpMethod === 'roll' && (
                    <>
                      <button type="button" onClick={() => setRolledHp(Math.floor(Math.random() * selectedClass.hitDie) + 1)}>
                        Roll
                      </button>
                      {rolledHp !== null && <span>Rolled: {rolledHp}</span>}
                    </>
                  )}
                </div>
              )}

              {needsAsiThisLevelUp && (
                <div className="character-sheet__level-up-section">
                  <strong>Ability Score Improvement</strong>
                  <label>
                    <input type="radio" name="asi-choice" checked={asiChoice === 'asi'} onChange={() => setAsiChoice('asi')} />
                    Increase ability scores (+2 to one, or +1 to two)
                  </label>
                  <label>
                    <input type="radio" name="asi-choice" checked={asiChoice === 'feat'} onChange={() => setAsiChoice('feat')} />
                    Take a feat instead
                  </label>
                  {asiChoice === 'asi' ? (
                    <>
                      <p className="character-sheet__hint">Points spent: {asiPointsSpent} / 2</p>
                      <ul className="character-sheet__row-list">
                        {ABILITY_KEYS.map((key) => (
                          <li key={key}>
                            {ABILITY_LABELS[key]}
                            <button
                              type="button"
                              disabled={(asiChanges[key] ?? 0) <= 0}
                              onClick={() => handleAsiPointChange(key, -1)}
                            >
                              −
                            </button>
                            {asiChanges[key] ?? 0}
                            <button
                              type="button"
                              disabled={asiPointsSpent >= 2 || (asiChanges[key] ?? 0) >= 2}
                              onClick={() => handleAsiPointChange(key, 1)}
                            >
                              +
                            </button>
                          </li>
                        ))}
                      </ul>
                    </>
                  ) : (
                    <label>
                      Feat name
                      <input value={featName} onChange={(e) => setFeatName(e.target.value)} placeholder="e.g. Alert" />
                    </label>
                  )}
                </div>
              )}

              {needsSubclassThisLevelUp && (
                <div className="character-sheet__level-up-section">
                  <strong>Choose a subclass</strong>
                  <select value={levelUpSubclass} onChange={(e) => setLevelUpSubclass(e.target.value)}>
                    <option value="">Select a subclass…</option>
                    {availableSubclasses.map((s) => (
                      <option key={s.key} value={s.name}>
                        {s.name}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <div className="character-sheet__level-up-actions">
                <button type="button" onClick={handleConfirmLevelUp} disabled={!canConfirmLevelUp}>
                  Confirm Level Up
                </button>
                <button type="button" onClick={() => setLevelUpOpen(false)}>
                  Cancel
                </button>
              </div>
            </div>
          )}

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
              <input
                value={character.hitDice}
                disabled={!blueprintEditable || !!selectedClass}
                onChange={(e) => onUpdate({ hitDice: e.target.value })}
              />
            </label>
            {selectedClass && blueprintEditable && (
              <span className="character-sheet__hint">Computed from {selectedClass.name}'s hit die × level.</span>
            )}
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
                onChange={(e) =>
                  onUpdate({ hp: { ...character.hp, current: Math.max(0, Math.min(character.hp.max + character.hp.temp, Number(e.target.value))) } })
                }
              />
            </label>
            <label>
              Max
              <input
                type="number"
                value={character.hp.max}
                disabled={!blueprintEditable || !!selectedClass}
                onChange={(e) => {
                  const max = Math.max(1, Number(e.target.value))
                  onUpdate({ hp: { ...character.hp, max, current: Math.min(character.hp.current, max + character.hp.temp) } })
                }}
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
                onChange={(e) => onUpdate({ hp: { ...character.hp, temp: Math.max(0, Number(e.target.value)) } })}
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

          <h3>Custom overrides</h3>
          <p className="character-sheet__hint">
            House-rule tweaks specific to this character (e.g. "Speed = 35"). Ones you propose need DM approval
            before they're official — a DM adding one here is approved immediately.
          </p>
          {character.overrides.length > 0 && (
            <ul className="character-sheet__row-list">
              {character.overrides.map((o) => (
                <li key={o.id} className="character-sheet__row">
                  <span>
                    <strong>{o.label}</strong> = {o.value}
                  </span>
                  <span className={`character-sheet__override-status character-sheet__override-status--${o.status}`}>
                    {o.status === 'pending' ? 'Pending DM approval' : o.status === 'approved' ? 'Approved' : 'Rejected'}
                  </span>
                  {isDm && o.status === 'pending' && (
                    <>
                      <button type="button" onClick={() => handleSetOverrideStatus(o.id, 'approved')}>
                        Approve
                      </button>
                      <button type="button" onClick={() => handleSetOverrideStatus(o.id, 'rejected')}>
                        Reject
                      </button>
                    </>
                  )}
                  {canEdit && (
                    <button type="button" onClick={() => handleRemoveOverride(o.id)}>
                      Remove
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}
          {canEdit && (
            <div className="character-sheet__row">
              <input placeholder="What (e.g. Speed)" value={overrideLabel} onChange={(e) => setOverrideLabel(e.target.value)} />
              <input placeholder="New value (e.g. 35)" value={overrideValue} onChange={(e) => setOverrideValue(e.target.value)} />
              <button type="button" onClick={handleAddOverride} disabled={!overrideLabel.trim() || !overrideValue.trim()}>
                Propose override
              </button>
            </div>
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
        <CharacterSpells
          character={character}
          canEdit={canEdit}
          blueprintEditable={blueprintEditable}
          onUpdate={onUpdate}
          slotsLocked={casterTypeForClass(character.className) !== 'none'}
          casterClassName={selectedClass?.name}
        />
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
