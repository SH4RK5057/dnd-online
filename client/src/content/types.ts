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

/** One option within a FeatureChoice — e.g. a single Draconic Ancestry
 * ("Red — Fire") or a single Fighting Style ("Archery"). `key` is what
 * actually gets stored in CharacterRecord.featureChoices; `name`/
 * `description` are display-only. */
export interface FeatureChoiceOption {
  key: string
  name: string
  description?: string
}

/** A choice a player must make to fully resolve a race or class feature —
 * e.g. Dragonborn's Draconic Ancestry (pick 1 of 10, determines breath
 * weapon damage type), a Fighting Style (pick 1 of several), or Half-Elf's
 * Skill Versatility (pick 2 of any skill). `count` is how many distinct
 * options must be picked (1 for most choices; 2 for "choose two" cases).
 * `grantsAbilityBonus` is set only when this choice's options ARE ability
 * keys and picking one grants a flat bonus to it (Half-Elf's ability
 * choice) — see character/rules.ts's computeChosenAbilityBonuses.
 * `grantsSkillProficiency` is set only when this choice's options ARE
 * SkillIds and picking one grants proficiency in it (Half-Elf's Skill
 * Versatility) — handled directly in CharacterSheet.tsx since it patches
 * `skillProficiencies`, not `abilities`. */
export interface FeatureChoice {
  id: string
  label: string
  count: number
  options: FeatureChoiceOption[]
  grantsAbilityBonus?: number
  grantsSkillProficiency?: boolean
}

/** Character-creation reference data for backgrounds — SRD-authored only
 * (no mirror import, no homebrew editor in this pass — see
 * character-creation scope notes). Deliberately thin: just the 2 fixed
 * skill proficiencies every SRD background grants plus a short feature
 * summary; tool/language proficiencies and starting equipment aren't
 * modeled, consistent with this app's inventory being a plain unmechanical
 * list. */
export interface BackgroundData {
  key: ContentKey
  source: ContentSource
  name: string
  skillProficiencies: SkillId[]
  feature: { name: string; entries: string[] }
}

/** Character-creation reference data — deliberately much thinner than a full
 * 5etools race entry (no subraces): just enough to drive rule-enforced
 * character creation (racial ability bonus, speed, choice-bearing traits
 * like a Dragonborn's breath weapon) plus a flavor-text summary. */
export interface RaceData {
  key: ContentKey
  source: ContentSource
  name: string
  size: string
  speed: number
  abilityBonuses: Partial<Record<AbilityKey, number>>
  traits: string[]
  /** SRD-authored only for now — mirror-imported races always get [] since
   * reliably detecting arbitrary choice patterns in raw 5etools race JSON
   * isn't feasible generically (see mirrorNormalize.ts's doc comments). */
  choices: FeatureChoice[]
}

/** One class or subclass feature gained at a specific level — mostly just a
 * name + reference text (most 5e features — Metamagic, Invocations,
 * Maneuvers, spell-known changes, etc. — can't be reduced to a generic
 * numeric formula), but a feature that requires picking one thing from a
 * list (Fighting Style, a subclass's signature choice) can carry a
 * `choice`. The handful of features this app models mechanically as
 * numeric pools (Rage/Ki/Sorcery Points) are computed separately by
 * character/rules.ts's computeClassResourceGrants, keyed off
 * className+level rather than off this text. */
export interface ClassFeatureData {
  level: number
  name: string
  entries: string[]
  choice?: FeatureChoice
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
  | { kind: 'background'; data: BackgroundData }

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
