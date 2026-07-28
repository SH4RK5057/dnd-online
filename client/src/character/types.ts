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

/** A generic class/character resource beyond spell slots and hit dice — ki
 * points, rage uses, sorcery points, bardic inspiration, whatever a given
 * class or feature grants. Deliberately generic rather than a fixed list of
 * named resources, since which ones apply depends on class/level/features
 * this app doesn't model in depth. */
export interface ResourceEntry {
  id: string
  name: string
  current: number
  max: number
}

/** A character's own melee/ranged weapon for the attack-roll flow (see
 * components/AttackRollPanel.tsx) — distinct from the freeform `inventory`
 * list, which has no mechanical stats. `damageBonus` is a flat extra (magic
 * weapon, etc.) on top of the attackAbility modifier, which is added
 * automatically at roll time. */
export interface WeaponEntry {
  id: string
  name: string
  attackAbility: AbilityKey
  /** e.g. "1d8" */
  damageDice: string
  damageBonus: number
  proficient: boolean
}

export type CharacterOverrideStatus = 'pending' | 'approved' | 'rejected'

/** A player- or DM-authored tweak to a rule/stat for THIS character
 * specifically — e.g. "Speed = 35" or "Darkvision = 90 ft." Deliberately
 * freeform (label + value strings), the same philosophy as
 * content/ruleOverrides.ts's campaign-wide DM rule-override engine, but
 * attached to the character record itself rather than a campaign's Yjs doc
 * — that's what lets it travel with a standalone character into whatever
 * campaign later binds it, before any DM/campaign doc exists yet.
 * Player-authored overrides start 'pending' and shouldn't be treated as
 * mechanically active by anything reading them until a DM sets them
 * 'approved'; DM-authored ones start 'approved' immediately. */
export interface CharacterOverrideRecord {
  id: string
  label: string
  value: string
  createdBy: 'player' | 'dm'
  status: CharacterOverrideStatus
  createdAt: number
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
  /** Chosen subclass name (e.g. "Champion"), matching a SubclassData's
   * `name` for this class — empty until chosen. Required once `level`
   * reaches the class's `subclassLevel` (character/rules.ts's level-up
   * flow blocks advancing further without one). */
  subclassName: string
  level: number
  /** Total experience points earned — character/rules.ts's xpToLevel()
   * compares this against the standard 5e XP table to determine whether a
   * "Level Up" is available; leveling up itself is a deliberate action, not
   * automatic just because xp crossed a threshold. */
  xp: number
  /** Levels at which this character has already resolved its Ability Score
   * Improvement choice (either an ability bump or a feat, added to `feats`)
   * — prevents re-prompting at the same level after leveling past it. */
  resolvedAsiLevels: number[]
  /** Selected option key(s) for each FeatureChoice this character has
   * resolved (content/types.ts) — e.g. `{'draconic-ancestry': ['red']}` or
   * `{'half-elf-ability-choice': ['dex', 'wis']}`, keyed by the choice's
   * `id`. A choice's `id` is globally unique across this app's hand-authored
   * SRD data, so no race/class namespacing is needed. */
  featureChoices: Record<string, string[]>
  background: string
  alignment: string
  /** Final, derived scores — base (pre-racial) + the selected race's
   * abilityBonuses. This is what every other consumer (rules.ts,
   * TokenSprite, etc.) reads; nothing changes for them. */
  abilities: AbilityScores
  /** How `abilities` was generated — drives which UI (standard array /
   * point buy / manual) is shown and how `baseAbilities` should be
   * validated. 'manual' also covers rolled-stat entry (bounded, not free). */
  abilityMethod: 'standard' | 'pointBuy' | 'manual'
  /** Pre-racial-bonus scores — `abilities` is always recomputed as
   * `baseAbilities` + the selected race's abilityBonuses. */
  baseAbilities: AbilityScores
  saveProficiencies: Record<AbilityKey, boolean>
  skillProficiencies: Partial<Record<SkillId, SkillProficiency>>
  ac: number
  /** Flat adjustment on top of the Dex modifier (feats, items). */
  initiativeBonus: number
  speed: number
  hp: { max: number; current: number; temp: number }
  /** Free text, e.g. "3d8" — the die count is parsed out for hit-dice
   * tracking (character/rest.ts parseHitDiceCount), the rest is cosmetic. */
  hitDice: string
  /** How many of `hitDice`'s total count have been spent (short rest) and
   * not yet recovered (long rest regains half, rounded down, min 1). */
  hitDiceUsed: number
  inventory: InventoryItem[]
  /** Index 0 = level-1 slots ... index 8 = level-9 slots — the total granted
   * at this level. */
  spellSlotsByLevel: number[]
  /** Same indexing as spellSlotsByLevel — how many of each level are
   * currently spent. A long rest resets every entry to 0. */
  spellSlotsUsedByLevel: number[]
  /** Other class/feature resources (ki, rage uses, etc.) — see ResourceEntry. */
  resources: ResourceEntry[]
  spells: SpellEntry[]
  feats: FeatEntry[]
  /** Player- or DM-proposed custom rule/stat tweaks for this character —
   * see CharacterOverrideRecord's doc comment. */
  overrides: CharacterOverrideRecord[]
  /** Death saving throws — only meaningful (shown/rolled) while
   * `hp.current === 0`. Reset to {0,0} whenever current HP moves back above
   * 0 by any means (heal, rest, damage-application helper). 3 successes =
   * stabilized, 3 failures = dead; both cap at 3, never higher. */
  deathSaves: { successes: number; failures: number }
  /** Name of the spell currently being concentrated on, '' if none. Purely
   * player/DM-declared — nothing enforces that a spell was actually cast. */
  concentratingOn: string
  /** Set by the damage-application helper (character/rules.ts
   * computeDamagePatch) when this character takes damage while
   * concentrating — the DC (5e rule: max(10, floor(damage/2))) for the
   * Constitution save the sheet then prompts for. Null when no check is
   * pending. */
  pendingConcentrationCheckDc: number | null
  weapons: WeaponEntry[]
  /** Standard 5e coin denominations this character personally carries —
   * separate from the shared party pool (loot/usePartyLoot.ts), which is
   * for treasure not yet split up. */
  currency: { pp: number; gp: number; ep: number; sp: number; cp: number }
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
