import { useState } from 'react'
import type * as Y from 'yjs'
import { generateName, NAME_STYLES, type NameStyle } from '../dmtools/nameGenerator'
import { rollLoot, type LootTier, type LootResult } from '../dmtools/lootGenerator'
import { useCompendium } from '../content/useCompendium'

const STYLE_LABELS: Record<NameStyle, string> = {
  common: 'Common',
  flowing: 'Flowing',
  rugged: 'Rugged',
  guttural: 'Guttural',
}

/** DM-only random generators: NPC names (pure syllable synthesis, no fixed
 * name list) and loot (currency + a flavor trinket + optional real items
 * pulled from whatever's in the compendium — see dmtools/lootGenerator.ts). */
export function RandomGenerators({ doc }: { doc: Y.Doc | null }) {
  const compendium = useCompendium(doc)
  const [nameStyle, setNameStyle] = useState<NameStyle>('common')
  const [names, setNames] = useState<string[]>([])
  const [lootTier, setLootTier] = useState<LootTier>('modest')
  const [loot, setLoot] = useState<LootResult | null>(null)

  const handleGenerateNames = () => {
    setNames(Array.from({ length: 5 }, () => generateName(nameStyle)))
  }

  const handleRollLoot = () => {
    setLoot(rollLoot(lootTier, compendium.items))
  }

  return (
    <div className="random-generators">
      <h3>NPC names</h3>
      <div className="random-generators__row">
        <select value={nameStyle} onChange={(e) => setNameStyle(e.target.value as NameStyle)}>
          {NAME_STYLES.map((style) => (
            <option key={style} value={style}>
              {STYLE_LABELS[style]}
            </option>
          ))}
        </select>
        <button type="button" onClick={handleGenerateNames}>
          Generate 5
        </button>
      </div>
      {names.length > 0 && (
        <ul className="random-generators__names">
          {names.map((name, i) => (
            <li key={i}>{name}</li>
          ))}
        </ul>
      )}

      <h3>Loot</h3>
      <div className="random-generators__row">
        <select value={lootTier} onChange={(e) => setLootTier(e.target.value as LootTier)}>
          <option value="meager">Meager</option>
          <option value="modest">Modest</option>
          <option value="rich">Rich</option>
        </select>
        <button type="button" onClick={handleRollLoot}>
          Roll loot
        </button>
      </div>
      {loot && (
        <div className="random-generators__loot">
          <p>{loot.gold} gp</p>
          {loot.trinket && <p>{loot.trinket}</p>}
          {loot.items.length > 0 && (
            <ul>
              {loot.items.map((item) => (
                <li key={item.key}>{item.name}</li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  )
}
