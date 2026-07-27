import { describe, expect, it } from 'vitest'
import { ingestFile, type MirrorContent } from './mirrorStorage'
import { defaultContentCategories } from './contentSourceTypes'

const SPELL_FILE = { spell: [{ name: 'Test Spell', level: 1 }] }
const MONSTER_FILE = { monster: [{ name: 'Test Monster', cr: '1' }] }
const ITEM_FILE = { item: [{ name: 'Test Item' }] }

function emptyContent(): MirrorContent {
  return { spells: [], monsters: [], items: [], races: [], classes: [], importedAt: 0, sourceKey: '' }
}

describe('ingestFile category filtering', () => {
  it('ingests all three categories by default', () => {
    const content = emptyContent()
    const errors: string[] = []
    ingestFile('spells.json', SPELL_FILE, content, errors, defaultContentCategories())
    ingestFile('bestiary.json', MONSTER_FILE, content, errors, defaultContentCategories())
    ingestFile('items.json', ITEM_FILE, content, errors, defaultContentCategories())
    expect(errors).toEqual([])
    expect(content.spells.map((s) => s.name)).toEqual(['Test Spell'])
    expect(content.monsters.map((m) => m.name)).toEqual(['Test Monster'])
    expect(content.items.map((i) => i.name)).toEqual(['Test Item'])
  })

  it('skips excluded categories silently (no error, nothing ingested)', () => {
    const content = emptyContent()
    const errors: string[] = []
    const monstersOnly = { includeSpells: false, includeMonsters: true, includeItems: false, includeRaces: false, includeClasses: false }
    ingestFile('spells.json', SPELL_FILE, content, errors, monstersOnly)
    ingestFile('bestiary.json', MONSTER_FILE, content, errors, monstersOnly)
    ingestFile('items.json', ITEM_FILE, content, errors, monstersOnly)
    expect(errors).toEqual([])
    expect(content.spells).toEqual([])
    expect(content.monsters.map((m) => m.name)).toEqual(['Test Monster'])
    expect(content.items).toEqual([])
  })

  it('imports only items when spells/monsters are excluded', () => {
    const content = emptyContent()
    const errors: string[] = []
    const itemsOnly = { includeSpells: false, includeMonsters: false, includeItems: true, includeRaces: false, includeClasses: false }
    ingestFile('spells.json', SPELL_FILE, content, errors, itemsOnly)
    ingestFile('bestiary.json', MONSTER_FILE, content, errors, itemsOnly)
    ingestFile('items.json', ITEM_FILE, content, errors, itemsOnly)
    expect(content.spells).toEqual([])
    expect(content.monsters).toEqual([])
    expect(content.items.map((i) => i.name)).toEqual(['Test Item'])
  })

  it('still reports genuinely unrecognized file shapes as errors, category filtering aside', () => {
    const content = emptyContent()
    const errors: string[] = []
    ingestFile('junk.json', { notARecognizedKey: [] }, content, errors, defaultContentCategories())
    expect(errors).toEqual(['junk.json: no recognized "spell"/"monster"/"item"/"race"/"class" array — expected 5etools-2014-src shape'])
  })

  it('reports non-object JSON as an error regardless of categories', () => {
    const content = emptyContent()
    const errors: string[] = []
    ingestFile('weird.json', 'just a string', content, errors, defaultContentCategories())
    expect(errors).toEqual(['weird.json: not a JSON object'])
  })
})
