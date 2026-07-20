/** Procedural loot generator — rolls a currency amount plus a small
 * generic-flavor-text trinket list I wrote myself (not any published
 * table), and optionally pulls real items from whatever compendium content
 * is already loaded (SRD/mirror/homebrew — see content/useCompendium.ts),
 * so a DM's own imported/homebrew items show up here too instead of this
 * being a disconnected second item system. */
import type { ItemData } from '../content/types'

export type LootTier = 'meager' | 'modest' | 'rich'

const TIER_GOLD_DICE: Record<LootTier, { count: number; sides: number; flatBonus: number }> = {
  meager: { count: 1, sides: 6, flatBonus: 0 },
  modest: { count: 2, sides: 10, flatBonus: 5 },
  rich: { count: 3, sides: 20, flatBonus: 25 },
}

/** Small filler trinkets for when there's no compendium item to hand out, or
 * just to add flavor alongside one — deliberately vague/mundane, original
 * flavor text, not a rules-mechanical item. */
const TRINKETS = [
  'a tarnished silver locket, empty inside',
  'a small vial of something faintly luminous',
  'a set of weighted dice, always landing the same',
  'a folded map of a place that doesn\'t seem to exist',
  'a single, oddly warm river stone',
  'a brass key with no matching lock in sight',
  'a bundle of dried herbs, smelling of woodsmoke',
  'a cracked pocket mirror',
  'a coin from a currency no merchant recognizes',
  'a feather that never seems to get dirty',
]

export interface LootResult {
  gold: number
  trinket: string | null
  items: ItemData[]
}

export function rollLoot(
  tier: LootTier,
  availableItems: ItemData[],
  options: { includeTrinket?: boolean; itemCount?: number } = {},
  randomSource: () => number = Math.random,
): LootResult {
  const { count, sides, flatBonus } = TIER_GOLD_DICE[tier]
  let gold = flatBonus
  for (let i = 0; i < count; i++) gold += Math.floor(randomSource() * sides) + 1

  const includeTrinket = options.includeTrinket ?? true
  const trinket = includeTrinket ? TRINKETS[Math.floor(randomSource() * TRINKETS.length)] : null

  const itemCount = options.itemCount ?? (tier === 'meager' ? 0 : tier === 'modest' ? 1 : 2)
  const pool = [...availableItems]
  const items: ItemData[] = []
  for (let i = 0; i < itemCount && pool.length > 0; i++) {
    const index = Math.floor(randomSource() * pool.length)
    items.push(pool[index])
    pool.splice(index, 1)
  }

  return { gold, trinket, items }
}
