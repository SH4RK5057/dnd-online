import type { RollMode } from './types'

export type RollCategory = 'attack' | 'abilityCheck' | 'save'

/**
 * A small, hardcoded subset of 5e SRD condition mechanics — just the parts
 * that affect which rolls get disadvantage for the token making them. This
 * v1 only covers the self-affecting half: "while you have this condition,
 * your own rolls of category X are at disadvantage." The other half — how a
 * TARGET's conditions affect attacks made against it — is
 * TARGET_CONDITION_ROLL_EFFECTS/resolveAttackMode below.
 */
export const CONDITION_ROLL_EFFECTS: Record<string, { disadvantageOn: RollCategory[] }> = {
  Blinded: { disadvantageOn: ['attack'] },
  Poisoned: { disadvantageOn: ['attack', 'abilityCheck'] },
  Frightened: { disadvantageOn: ['attack', 'abilityCheck'] },
  Restrained: { disadvantageOn: ['attack'] },
  Prone: { disadvantageOn: ['attack'] },
  Exhaustion: { disadvantageOn: ['attack', 'abilityCheck', 'save'] },
}

export const KNOWN_CONDITIONS: string[] = Object.keys(CONDITION_ROLL_EFFECTS).concat([
  'Charmed',
  'Deafened',
  'Grappled',
  'Incapacitated',
  'Invisible',
  'Paralyzed',
  'Petrified',
  'Stunned',
  'Unconscious',
])

/**
 * Automated status-effect evaluation: given the base roll mode a player
 * picked and the acting token's active conditions, returns the mode that
 * should actually be used. Advantage and disadvantage from any source
 * cancel out to normal (standard 5e rule) rather than stacking or
 * overriding a player's explicit advantage pick.
 */
export function resolveEffectiveMode(baseMode: RollMode, conditions: string[], category: RollCategory): RollMode {
  const conditionForcesDisadvantage = conditions.some((c) => CONDITION_ROLL_EFFECTS[c]?.disadvantageOn.includes(category))
  if (!conditionForcesDisadvantage) return baseMode
  if (baseMode === 'advantage') return 'normal'
  return 'disadvantage'
}

export type WeaponAttackType = 'melee' | 'ranged'

interface TargetConditionEffect {
  meleeAdvantage?: boolean
  rangedAdvantage?: boolean
  meleeDisadvantage?: boolean
  rangedDisadvantage?: boolean
}

/**
 * The other half of condition-roll interactions: how a condition on the
 * TARGET being attacked affects the attacker's roll, which (unlike
 * CONDITION_ROLL_EFFECTS above) also depends on whether the attack is melee
 * or ranged — e.g. a Prone target is easier to hit in melee but harder at
 * range. Auto-crit rules some of these conditions also grant (Paralyzed/
 * Unconscious: a hit from within 5 ft. is a critical) aren't modeled — this
 * table only covers advantage/disadvantage.
 */
export const TARGET_CONDITION_ROLL_EFFECTS: Record<string, TargetConditionEffect> = {
  Blinded: { meleeAdvantage: true, rangedAdvantage: true },
  Invisible: { meleeDisadvantage: true, rangedDisadvantage: true },
  Paralyzed: { meleeAdvantage: true, rangedAdvantage: true },
  Petrified: { meleeAdvantage: true, rangedAdvantage: true },
  Prone: { meleeAdvantage: true, rangedDisadvantage: true },
  Restrained: { meleeAdvantage: true, rangedAdvantage: true },
  Stunned: { meleeAdvantage: true, rangedAdvantage: true },
  Unconscious: { meleeAdvantage: true, rangedAdvantage: true },
}

/**
 * Attack-roll mode combining three sources: the roller's own explicit pick,
 * the attacker's own conditions (CONDITION_ROLL_EFFECTS), and the target's
 * conditions (TARGET_CONDITION_ROLL_EFFECTS), which depend on melee vs.
 * ranged. Advantage and disadvantage from any combination of sources cancel
 * out to normal (standard 5e rule) rather than stacking.
 */
export function resolveAttackMode(
  baseMode: RollMode,
  attackerConditions: string[],
  targetConditions: string[],
  attackType: WeaponAttackType,
): RollMode {
  let hasAdvantage = baseMode === 'advantage'
  let hasDisadvantage =
    baseMode === 'disadvantage' || attackerConditions.some((c) => CONDITION_ROLL_EFFECTS[c]?.disadvantageOn.includes('attack'))

  for (const condition of targetConditions) {
    const effect = TARGET_CONDITION_ROLL_EFFECTS[condition]
    if (!effect) continue
    if (attackType === 'melee') {
      if (effect.meleeAdvantage) hasAdvantage = true
      if (effect.meleeDisadvantage) hasDisadvantage = true
    } else {
      if (effect.rangedAdvantage) hasAdvantage = true
      if (effect.rangedDisadvantage) hasDisadvantage = true
    }
  }

  if (hasAdvantage && hasDisadvantage) return 'normal'
  if (hasAdvantage) return 'advantage'
  if (hasDisadvantage) return 'disadvantage'
  return 'normal'
}
