import type { SizeCategory } from '../map/types'

const SIZE_NAME_TO_CATEGORY: Record<string, SizeCategory> = {
  tiny: 'tiny',
  small: 'small',
  medium: 'medium',
  large: 'large',
  huge: 'huge',
  gargantuan: 'gargantuan',
}

/** Maps a MonsterData.size string (e.g. "Small", "Medium") to this app's
 * SizeCategory token-footprint enum, for encounter drag-and-drop. Falls back
 * to 'medium' for anything unrecognized rather than throwing — size is a
 * cosmetic footprint choice, not worth blocking token creation over. */
export function monsterSizeToCategory(size: string): SizeCategory {
  return SIZE_NAME_TO_CATEGORY[size.trim().toLowerCase()] ?? 'medium'
}

/** Extracts the leading numeric walking speed from a free-text speed string
 * like "30 ft." or "40 ft., fly 60 ft." — just the base movement number, for
 * TokenRecord.speed's flat numeric field. Falls back to 30 (average human
 * walking speed) when nothing numeric is found. */
export function parseSpeedFeet(speed: string): number {
  const match = speed.match(/\d+/)
  return match ? Number(match[0]) : 30
}
