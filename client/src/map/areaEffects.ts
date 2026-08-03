import type { AbilityKey, CharacterRecord } from '../character/types'
import { ABILITY_LABELS } from '../character/types'
import { computeSaveBonus, applyDamage, computeDamagePatch, resolveTokenHp } from '../character/rules'
import { parseNotation, rollNotation } from '../dice/notation'
import type { UseRollLogResult } from '../dice/useRollLog'
import type { TokenRecord } from './types'

/** A trap/hazardous-terrain/trigger's mechanical payload — same shape as
 * SpellCastPanel's ad-hoc spell effect, but with a DM-authored fixed DC
 * instead of one derived from a caster's spellcasting ability. */
export interface AreaEffect {
  damageDice: string
  savingThrow: AbilityKey
  saveDc: number
  savingThrowEffect: 'half' | 'negates'
}

export interface AreaEffectContext {
  pushRoll: UseRollLogResult['pushRoll']
  updateCharacter: (characterId: string, patch: Partial<Omit<CharacterRecord, 'id'>>) => void
  setTokenHp: (tokenId: string, hp: { current: number; max: number; temp: number } | null) => void
  /** Shown as the roll log entries' label prefix, e.g. "Spike trap", "Lava". */
  sourceName: string
}

/**
 * Automatic (no DM clicks) version of SpellCastPanel's roll-damage ->
 * roll-each-target's-save -> apply pipeline, for traps, hazardous terrain,
 * and triggers: rolls damage once, rolls each target's save, and applies +
 * logs it exactly like a DM-run spell cast. Silently skips a target with no
 * resolvable HP (e.g. an unlinked token with hp null), same as
 * SpellCastPanel does.
 */
export function resolveAreaEffect(
  effect: AreaEffect,
  targets: Pick<TokenRecord, 'id' | 'name' | 'characterId' | 'hp'>[],
  charactersById: Map<string, CharacterRecord>,
  ctx: AreaEffectContext,
  randomSource: () => number = Math.random,
): void {
  let damageResult
  try {
    damageResult = rollNotation(parseNotation(effect.damageDice), 'normal', randomSource)
  } catch {
    return
  }
  ctx.pushRoll({
    playerId: 'system',
    playerName: ctx.sourceName,
    label: `${ctx.sourceName} damage`,
    notation: effect.damageDice,
    mode: 'normal',
    terms: damageResult.terms,
    modifier: damageResult.modifier,
    total: damageResult.total,
    requestedBy: null,
    private: false,
  })
  const rolledDamage = damageResult.total

  for (const target of targets) {
    const targetCharacter = target.characterId ? charactersById.get(target.characterId) : null
    const saveBonus = targetCharacter ? computeSaveBonus(targetCharacter, effect.savingThrow) : 0
    const notation = `1d20${saveBonus >= 0 ? '+' : ''}${saveBonus}`
    let saveResult
    try {
      saveResult = rollNotation(parseNotation(notation), 'normal', randomSource)
    } catch {
      continue
    }
    const saved = saveResult.total >= effect.saveDc
    const damageTaken = saved ? (effect.savingThrowEffect === 'negates' ? 0 : Math.floor(rolledDamage / 2)) : rolledDamage
    ctx.pushRoll({
      playerId: 'system',
      playerName: target.name,
      label: `${ctx.sourceName} save (${ABILITY_LABELS[effect.savingThrow]})`,
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
      ctx.updateCharacter(targetCharacter.id, computeDamagePatch(targetCharacter, damageTaken))
    } else {
      const resolved = resolveTokenHp(target, charactersById)
      if (resolved && !resolved.fromCharacter) ctx.setTokenHp(target.id, applyDamage({ ...resolved }, damageTaken))
    }
  }
}
