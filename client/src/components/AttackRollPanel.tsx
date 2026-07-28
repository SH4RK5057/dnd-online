import { useState } from 'react'
import type { CharacterRecord } from '../character/types'
import type { ActiveCondition, TokenRecord, WallRecord } from '../map/types'
import type { RollMode } from '../dice/types'
import type { UseRollLogResult } from '../dice/useRollLog'
import { computeModifier, computeProficiencyBonus, resolveTokenAc } from '../character/rules'
import { parseNotation, rollNotation } from '../dice/notation'
import { resolveAttackMode } from '../dice/conditions'
import { hasLineOfSight } from '../map/visibility'
import { tokenFootprintCenter } from '../map/sizeCategory'

/** Weapon-select + target-select + roll-mode attack flow, shared by
 * CharacterPanel (player rolling for their own character) and
 * TokenInspector (DM rolling for an NPC's linked character). Owns the
 * attack-roll mechanics itself (attack bonus, effective mode, AC
 * comparison for auto-resolve) — the caller only supplies who's rolling and
 * a pushRoll function, matching the CharacterSheet/onQuickRoll split where
 * presentational sheets don't own roll mechanics themselves. */
export function AttackRollPanel({
  character,
  targets,
  charactersById,
  actingConditions,
  autoResolveEnabled,
  isMyTurn,
  reactionAvailable,
  onUseReaction,
  playerId,
  playerName,
  pushRoll,
  attackerToken,
  walls,
}: {
  character: CharacterRecord
  targets: TokenRecord[]
  charactersById: Map<string, CharacterRecord>
  actingConditions: ActiveCondition[]
  autoResolveEnabled: boolean
  /** Whose turn it is right now — attacking on your own turn is always
   * allowed. Outside your turn, an attack is only allowed as a reaction
   * (see `reactionAvailable`) — an opportunity attack against something
   * moving away, for instance. */
  isMyTurn: boolean
  /** Whether this attacker still has their reaction this round — lets the
   * roll go through outside `isMyTurn`, consumed via `onUseReaction` once
   * the roll fires. Irrelevant (and ignored) when `isMyTurn` is true. */
  reactionAvailable: boolean
  onUseReaction: () => void
  playerId: string
  playerName: string
  pushRoll: UseRollLogResult['pushRoll']
  /** The attacker's own token, if it's on this scene — needed to compute
   * line of sight. When null (e.g. the caster has no token placed yet),
   * line-of-sight checking is skipped entirely rather than blocking. */
  attackerToken: TokenRecord | null
  walls: WallRecord[]
}) {
  const canRoll = isMyTurn || reactionAvailable
  const [weaponId, setWeaponId] = useState('')
  const [targetId, setTargetId] = useState('')
  const [mode, setMode] = useState<RollMode>('normal')

  if (character.weapons.length === 0) {
    return <p className="character-sheet__hint">Add a weapon on the character sheet's Combat stats section to roll attacks.</p>
  }

  const weapon = character.weapons.find((w) => w.id === weaponId) ?? character.weapons[0]
  const target = targets.find((t) => t.id === targetId) ?? null

  const blockedByWall =
    !!attackerToken &&
    !!target &&
    !hasLineOfSight(
      tokenFootprintCenter(attackerToken.x, attackerToken.y, attackerToken.sizeCategory),
      tokenFootprintCenter(target.x, target.y, target.sizeCategory),
      walls,
    )

  const handleRollAttack = () => {
    if (!weapon || !target || blockedByWall) return
    const abilityMod = computeModifier(character.abilities[weapon.attackAbility])
    const profBonus = weapon.proficient ? computeProficiencyBonus(character.level) : 0
    const attackBonus = abilityMod + profBonus
    const effectiveMode = resolveAttackMode(
      mode,
      actingConditions.map((c) => c.name),
      target.conditions.map((c) => c.name),
      weapon.attackType,
    )
    const notation = `1d20${attackBonus >= 0 ? '+' : ''}${attackBonus}`
    let result
    try {
      result = rollNotation(parseNotation(notation), effectiveMode)
    } catch {
      return
    }
    const targetAc = resolveTokenAc(target, charactersById)
    const damageBonus = abilityMod + weapon.damageBonus
    const outcome: 'pending' | 'hit' | 'miss' =
      autoResolveEnabled && targetAc !== null ? (result.total >= targetAc ? 'hit' : 'miss') : 'pending'
    pushRoll({
      playerId,
      playerName,
      label: `${weapon.name || 'Weapon'} attack`,
      notation,
      mode: effectiveMode,
      terms: result.terms,
      modifier: result.modifier,
      total: result.total,
      requestedBy: null,
      private: false,
      attackContext: {
        targetTokenId: target.id,
        targetName: target.name,
        weaponName: weapon.name || 'Weapon',
        damageDice: weapon.damageDice,
        damageBonus,
        targetAc,
        outcome,
        damageApplied: false,
      },
    })
    if (!isMyTurn) onUseReaction()
  }

  return (
    <div className="attack-roll-panel">
      <label>
        Weapon
        <select value={weapon.id} onChange={(e) => setWeaponId(e.target.value)}>
          {character.weapons.map((w) => (
            <option key={w.id} value={w.id}>
              {w.name || '(unnamed)'}
            </option>
          ))}
        </select>
      </label>
      <label>
        Target
        <select value={target?.id ?? ''} onChange={(e) => setTargetId(e.target.value)}>
          <option value="">Choose a target…</option>
          {targets.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </select>
      </label>
      <div className="character-panel__roll-mode">
        <label>
          <input type="radio" name="attack-roll-mode" checked={mode === 'normal'} onChange={() => setMode('normal')} />
          Normal
        </label>
        <label>
          <input type="radio" name="attack-roll-mode" checked={mode === 'advantage'} onChange={() => setMode('advantage')} />
          Advantage
        </label>
        <label>
          <input type="radio" name="attack-roll-mode" checked={mode === 'disadvantage'} onChange={() => setMode('disadvantage')} />
          Disadvantage
        </label>
      </div>
      {blockedByWall && (
        <p className="character-sheet__hint">
          No line of sight to this target — a wall is in the way. (Resolve manually with the standalone dice roller if
          this should be allowed anyway, e.g. firing through a window.)
        </p>
      )}
      {!isMyTurn && reactionAvailable && (
        <p className="character-sheet__hint">Not your turn — this will use your reaction for an opportunity attack.</p>
      )}
      {!isMyTurn && !reactionAvailable && <p className="character-sheet__hint">Not your turn, and your reaction is already used.</p>}
      <button type="button" disabled={!canRoll || !target || blockedByWall} onClick={handleRollAttack}>
        Roll Attack
      </button>
    </div>
  )
}
