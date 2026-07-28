import { useState } from 'react'
import type { CharacterRecord } from '../character/types'
import type { TokenRecord } from '../map/types'
import type { MeasureShape } from '../canvas/MeasureLayer'
import type { UseRollLogResult } from '../dice/useRollLog'
import { ABILITY_LABELS } from '../character/types'
import { computeSaveBonus, computeSpellSaveDc, applyDamage, computeDamagePatch, resolveTokenHp } from '../character/rules'
import { parseNotation, rollNotation } from '../dice/notation'
import { SRD_SPELL_EFFECTS } from '../content/srdData'
import type { SpellEffectData } from '../content/types'

function shapeToMeasureShape(shape: SpellEffectData['areaShape']): MeasureShape {
  if (shape === 'sphere') return 'circle'
  return shape
}

/**
 * Lets a caster pick one of their known spells that matches a hand-authored
 * SRD area-effect entry (SRD_SPELL_EFFECTS), arm the map's AoE template to
 * that spell's exact shape/size (see MapCanvas's `armedTemplate` prop),
 * compute its save DC, roll its damage once, and resolve each token caught
 * in the template (DM/caster manually checks them off — the template is a
 * visual aid, not hit-tested geometry) with an individual save against that
 * shared damage roll.
 */
export function SpellCastPanel({
  character,
  targets,
  charactersById,
  updateCharacter,
  setTokenHp,
  playerId,
  playerName,
  pushRoll,
  onArmTemplate,
}: {
  character: CharacterRecord
  targets: TokenRecord[]
  charactersById: Map<string, CharacterRecord>
  updateCharacter: (characterId: string, patch: Partial<Omit<CharacterRecord, 'id'>>) => void
  setTokenHp: (tokenId: string, hp: { current: number; max: number; temp: number } | null) => void
  playerId: string
  playerName: string
  pushRoll: UseRollLogResult['pushRoll']
  onArmTemplate: (template: { shape: MeasureShape; sizeFt: number }) => void
}) {
  const [spellName, setSpellName] = useState('')
  const [checkedTargets, setCheckedTargets] = useState<Set<string>>(new Set())
  const [rolledDamage, setRolledDamage] = useState<number | null>(null)

  const knownEffectSpells = character.spells
    .map((s) => SRD_SPELL_EFFECTS.find((e) => e.name.toLowerCase() === s.name.trim().toLowerCase()))
    .filter((e): e is SpellEffectData => !!e)

  if (knownEffectSpells.length === 0) {
    return (
      <p className="character-sheet__hint">
        No area-effect spells recognized on this character's spell list yet — add one of: {SRD_SPELL_EFFECTS.map((e) => e.name).join(', ')}.
      </p>
    )
  }

  const effect = knownEffectSpells.find((e) => e.name === spellName) ?? knownEffectSpells[0]
  const dc = computeSpellSaveDc(character)

  const toggleTarget = (tokenId: string) => {
    setCheckedTargets((prev) => {
      const next = new Set(prev)
      if (next.has(tokenId)) next.delete(tokenId)
      else next.add(tokenId)
      return next
    })
  }

  const handleRollDamage = () => {
    let result
    try {
      result = rollNotation(parseNotation(effect.damageDice), 'normal')
    } catch {
      return
    }
    pushRoll({
      playerId,
      playerName,
      label: `${effect.name} damage`,
      notation: effect.damageDice,
      mode: 'normal',
      terms: result.terms,
      modifier: result.modifier,
      total: result.total,
      requestedBy: null,
      private: false,
    })
    setRolledDamage(result.total)
  }

  const handleResolveSaves = () => {
    if (rolledDamage === null) return
    for (const tokenId of checkedTargets) {
      const target = targets.find((t) => t.id === tokenId)
      if (!target) continue
      const targetCharacter = target.characterId ? charactersById.get(target.characterId) : null
      const saveBonus = targetCharacter ? computeSaveBonus(targetCharacter, effect.savingThrow) : 0
      const notation = `1d20${saveBonus >= 0 ? '+' : ''}${saveBonus}`
      let saveResult
      try {
        saveResult = rollNotation(parseNotation(notation), 'normal')
      } catch {
        continue
      }
      const saved = dc !== null ? saveResult.total >= dc : false
      const damageTaken = saved ? (effect.savingThrowEffect === 'negates' ? 0 : Math.floor(rolledDamage / 2)) : rolledDamage
      pushRoll({
        playerId,
        playerName: target.name,
        label: `${effect.name} save (${ABILITY_LABELS[effect.savingThrow]})`,
        notation,
        mode: 'normal',
        terms: saveResult.terms,
        modifier: saveResult.modifier,
        total: saveResult.total,
        requestedBy: null,
        private: false,
      })
      if (damageTaken <= 0) continue
      if (targetCharacter) {
        updateCharacter(targetCharacter.id, computeDamagePatch(targetCharacter, damageTaken))
      } else {
        const resolved = resolveTokenHp(target, charactersById)
        if (resolved && !resolved.fromCharacter) setTokenHp(target.id, applyDamage({ ...resolved }, damageTaken))
      }
    }
    setRolledDamage(null)
    setCheckedTargets(new Set())
  }

  return (
    <div className="attack-roll-panel">
      <label>
        Spell
        <select value={effect.name} onChange={(e) => setSpellName(e.target.value)}>
          {knownEffectSpells.map((e) => (
            <option key={e.name} value={e.name}>
              {e.name}
            </option>
          ))}
        </select>
      </label>
      <p className="character-sheet__hint">
        {effect.areaShape} {effect.areaSizeFt} ft{effect.rangeFt > 0 ? `, range ${effect.rangeFt} ft` : ' (self)'} —{' '}
        {ABILITY_LABELS[effect.savingThrow]} save {dc !== null ? `DC ${dc}` : '(no spellcasting ability for this class)'},{' '}
        {effect.savingThrowEffect === 'half' ? 'half damage on success' : 'no damage on success'}, {effect.damageDice} damage
      </p>
      <button type="button" onClick={() => onArmTemplate({ shape: shapeToMeasureShape(effect.areaShape), sizeFt: effect.areaSizeFt })}>
        Arm template (drag on the map to place)
      </button>

      <button type="button" onClick={handleRollDamage}>
        Roll damage
      </button>
      {rolledDamage !== null && (
        <>
          <p className="character-sheet__hint">Rolled {rolledDamage} damage. Check off everyone caught in the template, then resolve saves.</p>
          <ul className="character-sheet__row-list">
            {targets.map((t) => (
              <li key={t.id} className="character-sheet__row">
                <label>
                  <input type="checkbox" checked={checkedTargets.has(t.id)} onChange={() => toggleTarget(t.id)} />
                  {t.name}
                </label>
              </li>
            ))}
          </ul>
          <button type="button" onClick={handleResolveSaves} disabled={checkedTargets.size === 0}>
            Resolve saves &amp; apply
          </button>
        </>
      )}
    </div>
  )
}
