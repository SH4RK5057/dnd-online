export type AbilityKey = 'str' | 'dex' | 'con' | 'int' | 'wis' | 'cha'

export type SkillId =
  | 'acrobatics'
  | 'animalHandling'
  | 'arcana'
  | 'athletics'
  | 'deception'
  | 'history'
  | 'insight'
  | 'intimidation'
  | 'investigation'
  | 'medicine'
  | 'nature'
  | 'perception'
  | 'performance'
  | 'persuasion'
  | 'religion'
  | 'sleightOfHand'
  | 'stealth'
  | 'survival'

export type SkillProficiency = 'proficient' | 'expertise'

export interface AbilityScores {
  str: number
  dex: number
  con: number
  int: number
  wis: number
  cha: number
}

export interface InventoryItem {
  id: string
  name: string
  quantity: number
  notes: string
}

export interface SpellEntry {
  id: string
  name: string
  level: number
  prepared: boolean
  notes: string
}

export interface FeatEntry {
  id: string
  name: string
  notes: string
}

/**
 * A character's data. The SAME shape is used for a standalone character
 * (stored locally, see character/standaloneStorage.ts, `campaignId: null`)
 * and a campaign-bound character (stored in the shared Yjs doc,
 * `doc.getMap('characters')`, `campaignId` set). Joining a campaign clones a
 * standalone record into the doc rather than moving it, so the player's
 * local standalone copy stays independently editable.
 *
 * v1 limitation: single class only (`className` is free text, `level` a
 * single number) — proficiency bonus and the spell-slot table both key off
 * total level under this assumption. Multiclassing isn't modeled.
 */
export interface CharacterRecord {
  id: string
  /** Stable playerId (session/lastSession.ts) of the owning player. */
  ownerId: string
  /** Set once this record is bound into a campaign's Yjs doc; null for a
   * standalone (pre-campaign) character living only in localStorage. */
  campaignId: string | null
  /** Once bound to a campaign, the blueprint fields (identity, abilities,
   * level, class, proficiencies) become read-only in the UI — "clones and
   * locks the core character blueprint to prevent mid-session edits." HP,
   * inventory, spell-prepared state, and notes stay editable regardless,
   * since those change during normal play. Always false for standalone
   * characters. */
  locked: boolean
  name: string
  race: string
  className: string
  level: number
  background: string
  alignment: string
  abilities: AbilityScores
  saveProficiencies: Record<AbilityKey, boolean>
  skillProficiencies: Partial<Record<SkillId, SkillProficiency>>
  ac: number
  /** Flat adjustment on top of the Dex modifier (feats, items). */
  initiativeBonus: number
  speed: number
  hp: { max: number; current: number; temp: number }
  /** Free text, e.g. "3d8". */
  hitDice: string
  inventory: InventoryItem[]
  /** Index 0 = level-1 slots ... index 8 = level-9 slots. */
  spellSlotsByLevel: number[]
  spells: SpellEntry[]
  feats: FeatEntry[]
  createdAt: number
}

export const SKILL_LABELS: Record<SkillId, string> = {
  acrobatics: 'Acrobatics',
  animalHandling: 'Animal Handling',
  arcana: 'Arcana',
  athletics: 'Athletics',
  deception: 'Deception',
  history: 'History',
  insight: 'Insight',
  intimidation: 'Intimidation',
  investigation: 'Investigation',
  medicine: 'Medicine',
  nature: 'Nature',
  perception: 'Perception',
  performance: 'Performance',
  persuasion: 'Persuasion',
  religion: 'Religion',
  sleightOfHand: 'Sleight of Hand',
  stealth: 'Stealth',
  survival: 'Survival',
}

export const ABILITY_LABELS: Record<AbilityKey, string> = {
  str: 'Strength',
  dex: 'Dexterity',
  con: 'Constitution',
  int: 'Intelligence',
  wis: 'Wisdom',
  cha: 'Charisma',
}
