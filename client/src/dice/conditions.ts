import type { RollMode } from './types'

export type RollCategory = 'attack' | 'abilityCheck' | 'save'

/**
 * A small, hardcoded subset of 5e SRD condition mechanics — just the parts
 * that affect which rolls get disadvantage for the token making them.
 * Deliberately not a full condition-interaction engine (that needs to know
 * about the OTHER token in an attack too, e.g. "attacks against a prone
 * target are at advantage in melee" — out of scope until Phase 5's rules
 * content exists to drive a richer version of this table). This v1 only
 * covers the self-affecting half: "while you have this condition, your own
 * rolls of category X are at disadvantage."
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
