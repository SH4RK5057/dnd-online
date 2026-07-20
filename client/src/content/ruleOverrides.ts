/** DM homebrew rule-modifier engine. This is a small, generic registry +
 * resolver — not an attempt to hook every one of 5e's rules; it gives the DM
 * a place to declare "X is different in this campaign/scene" as data
 * (`{@globalRule critRange} = "19-20"`, or "this character's AC is 18 for
 * this scene"), and any other system in the app can look a value up through
 * `resolveGlobalRule`/`resolveCharacterStatOverride` instead of hardcoding
 * the 5e default when it wants to respect DM overrides. */

export type RuleOverrideScope = 'campaign' | 'scene'
export type RuleOverrideTarget = 'globalRule' | 'characterStat'

export interface RuleOverrideRecord {
  id: string
  scope: RuleOverrideScope
  /** Required (a scene id) when scope === 'scene', null for campaign-wide. */
  sceneId: string | null
  targetType: RuleOverrideTarget
  /** globalRule: an arbitrary rule name, e.g. "critRange", "shortRestMinutes".
   * characterStat: the target character's id. */
  targetKey: string
  /** Only meaningful for targetType 'characterStat' — which field is
   * overridden, e.g. "ac", "speed". Null for 'globalRule'. */
  statPath: string | null
  /** Human-readable note, e.g. "Gritty realism: short rests take 8 hours". */
  label: string
  /** Freeform value — the DM writes it, consumers parse what they expect
   * (a number string, a dice expression, etc). Kept as a string rather than
   * a typed union since the set of possible rules/stats is open-ended. */
  value: string
  createdAt: number
}

/** Scene-scoped overrides win over campaign-wide ones for the same key —
 * "more specific wins" — since a scene override is a deliberate one-off
 * exception a DM is more likely to have just set. */
export function resolveGlobalRule(
  overrides: RuleOverrideRecord[],
  key: string,
  context: { sceneId: string | null },
): string | null {
  const sceneMatch = overrides.find(
    (o) => o.targetType === 'globalRule' && o.targetKey === key && o.scope === 'scene' && o.sceneId === context.sceneId,
  )
  if (sceneMatch) return sceneMatch.value
  const campaignMatch = overrides.find((o) => o.targetType === 'globalRule' && o.targetKey === key && o.scope === 'campaign')
  return campaignMatch?.value ?? null
}

export function resolveCharacterStatOverride(
  overrides: RuleOverrideRecord[],
  characterId: string,
  statPath: string,
  context: { sceneId: string | null },
): string | null {
  const sceneMatch = overrides.find(
    (o) =>
      o.targetType === 'characterStat' &&
      o.targetKey === characterId &&
      o.statPath === statPath &&
      o.scope === 'scene' &&
      o.sceneId === context.sceneId,
  )
  if (sceneMatch) return sceneMatch.value
  const campaignMatch = overrides.find(
    (o) => o.targetType === 'characterStat' && o.targetKey === characterId && o.statPath === statPath && o.scope === 'campaign',
  )
  return campaignMatch?.value ?? null
}
