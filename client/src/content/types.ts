import type { AbilityKey, SkillId } from '../character/types'

/** Where a piece of compendium content came from. `srd` = the small
 * hand-authored SRD 5.1 (CC-BY-4.0) fallback baked into this app; `mirror` =
 * imported at runtime from a user-configured private 5etools-shaped mirror
 * (local files or VITE_5ETOOLS_MIRROR_URL) — never bundled into the public
 * codebase; `homebrew` = DM-authored, stored flat in the campaign's Yjs doc. */
export type ContentSource = 'srd' | 'mirror' | 'homebrew'

/** Stable lookup key across all three sources, e.g. "srd:fireball",
 * "mirror:goblin", "homebrew:<uuid>". For homebrew this is just the Yjs map
 * key (the record's own `id`) prefixed with its source. */
export type ContentKey = string

export interface SpellData {
  key: ContentKey
  source: ContentSource
  name: string
  level: number // 0 = cantrip
  school: string // e.g. "Evocation" (already expanded from 5etools' single-letter codes)
  castingTime: string
  range: string
  components: string
  duration: string
  classes: string[]
  /** Description paragraphs — may contain {@tag ...} markup, see tagParser.ts. */
  entries: string[]
}

export interface MonsterAction {
  name: string
  entries: string[]
}

export interface MonsterData {
  key: ContentKey
  source: ContentSource
  name: string
  size: string
  type: string
  alignment: string
  ac: number
  acNote: string
  hp: number
  hitDice: string
  speed: string
  abilities: { str: number; dex: number; con: number; int: number; wis: number; cha: number }
  savingThrows: string
  skills: string
  damageResistances: string
  damageImmunities: string
  conditionImmunities: string
  senses: string
  languages: string
  cr: string
  traits: MonsterAction[]
  actions: MonsterAction[]
  legendaryActions: MonsterAction[]
}

export interface ItemData {
  key: ContentKey
  source: ContentSource
  name: string
  type: string
  rarity: string
  weight: string
  value: string
  entries: string[]
}

/** Character-creation reference data — deliberately much thinner than a full
 * 5etools race entry (no subraces, no trait mechanics beyond a flat ability
 * bonus): just enough to drive rule-enforced character creation (racial
 * ability bonus, speed) plus a flavor-text summary. */
export interface RaceData {
  key: ContentKey
  source: ContentSource
  name: string
  size: string
  speed: number
  abilityBonuses: Partial<Record<AbilityKey, number>>
  traits: string[]
}

/** One class or subclass feature gained at a specific level — deliberately
 * just a name + reference text, not a structured mechanical effect: most 5e
 * features (Fighting Style options, Metamagic, Maneuvers, spell-known
 * changes, etc.) can't be reduced to a generic numeric formula. The handful
 * of features this app DOES model mechanically (class resource pools like
 * Rage/Ki/Sorcery Points) are computed separately by
 * character/rules.ts's computeClassResourceGrants, keyed off className+level
 * rather than off this text. */
export interface ClassFeatureData {
  level: number
  name: string
  entries: string[]
}

/** Character-creation reference data for classes — single-class only (see
 * CharacterRecord's v1 limitation doc comment), just enough to drive rule
 * enforcement: hit die for HP, the class's two fixed saving-throw
 * proficiencies, its starting-skill choice list/count, which levels grant an
 * Ability Score Improvement, the level at which a subclass must be chosen,
 * and reference text for features gained along the way. */
export interface ClassData {
  key: ContentKey
  source: ContentSource
  name: string
  hitDie: number
  savingThrows: AbilityKey[]
  skillChoices: SkillId[]
  skillChoiceCount: number
  /** Levels at which this class grants an Ability Score Improvement (or
   * feat) — defaults to the standard [4,8,12,16,19] when not otherwise
   * known; a few classes (Fighter, Rogue) get extra ones. */
  asiLevels: number[]
  /** Level at which a subclass must be chosen — 1, 2, or 3 depending on
   * class; defaults to 3 (the most common case) when not otherwise known. */
  subclassLevel: number
  features: ClassFeatureData[]
}

/** A subclass (e.g. Champion for Fighter, Life Domain for Cleric) — SRD +
 * mirror only, same as races/classes (see character-creation scope notes).
 * `className` matches the parent ClassData's `name` (not its `key`) so this
 * stays simple string-matched the same way race/class selection is. */
export interface SubclassData {
  key: ContentKey
  source: ContentSource
  name: string
  className: string
  features: ClassFeatureData[]
}

export type CompendiumEntry =
  | { kind: 'spell'; data: SpellData }
  | { kind: 'monster'; data: MonsterData }
  | { kind: 'item'; data: ItemData }
  | { kind: 'race'; data: RaceData }
  | { kind: 'class'; data: ClassData }
  | { kind: 'subclass'; data: SubclassData }

/** Flat Yjs record shapes for DM-authored homebrew content — identical field
 * shape to the normalized content types above (source is always 'homebrew'),
 * just with `id`/`createdAt` added to match this app's usual CRDT record
 * convention (doc.getMap<Record>('name'), flat {id, ...fields, createdAt}). */
export interface HomebrewSpellRecord extends Omit<SpellData, 'key' | 'source'> {
  id: string
  createdAt: number
}
export interface HomebrewMonsterRecord extends Omit<MonsterData, 'key' | 'source'> {
  id: string
  createdAt: number
}
export interface HomebrewItemRecord extends Omit<ItemData, 'key' | 'source'> {
  id: string
  createdAt: number
}
