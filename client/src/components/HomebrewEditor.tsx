import { useRef, useState } from 'react'
import type * as Y from 'yjs'
import { useHomebrewContent } from '../content/useHomebrewContent'
import { downloadJson, readJsonFile } from '../dmtools/fileUtils'
import type { HomebrewItemRecord, HomebrewMonsterRecord, HomebrewSpellRecord, MonsterAction } from '../content/types'

type Tab = 'spells' | 'monsters' | 'items'

/** Parses simple "Name: description text" lines into MonsterAction entries —
 * one action per line, kept intentionally simple rather than building a
 * full multi-paragraph sub-editor for traits/actions/legendary actions. */
function parseActionLines(text: string): MonsterAction[] {
  return text
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const colon = line.indexOf(':')
      return colon === -1 ? { name: '', entries: [line] } : { name: line.slice(0, colon).trim(), entries: [line.slice(colon + 1).trim()] }
    })
}
function actionsToLines(actions: MonsterAction[]): string {
  return actions.map((a) => (a.name ? `${a.name}: ${a.entries.join(' ')}` : a.entries.join(' '))).join('\n')
}

const BLANK_SPELL: Omit<HomebrewSpellRecord, 'id' | 'createdAt'> = {
  name: '',
  level: 0,
  school: '',
  castingTime: '',
  range: '',
  components: '',
  duration: '',
  classes: [],
  entries: [],
}
const BLANK_MONSTER: Omit<HomebrewMonsterRecord, 'id' | 'createdAt'> = {
  name: '',
  size: 'Medium',
  type: '',
  alignment: '',
  ac: 10,
  acNote: '',
  hp: 10,
  hitDice: '',
  speed: '30 ft.',
  abilities: { str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 10 },
  savingThrows: '',
  skills: '',
  damageResistances: '',
  damageImmunities: '',
  conditionImmunities: '',
  senses: '',
  languages: '',
  cr: '',
  traits: [],
  actions: [],
  legendaryActions: [],
}
const BLANK_ITEM: Omit<HomebrewItemRecord, 'id' | 'createdAt'> = {
  name: '',
  type: '',
  rarity: 'none',
  weight: '',
  value: '',
  entries: [],
}

/** Standalone DM editor for custom spells/monsters/items, saved flat into
 * the campaign's Yjs doc (content/useHomebrewContent.ts) so they sync to
 * players and show up in the compendium (content/useCompendium.ts)
 * alongside the SRD/mirror sources. */
export function HomebrewEditor({ doc }: { doc: Y.Doc | null }) {
  const homebrew = useHomebrewContent(doc)
  const [tab, setTab] = useState<Tab>('spells')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [spellDraft, setSpellDraft] = useState(BLANK_SPELL)
  const [monsterDraft, setMonsterDraft] = useState(BLANK_MONSTER)
  const [itemDraft, setItemDraft] = useState(BLANK_ITEM)
  const [importError, setImportError] = useState<string | null>(null)
  const importInputRef = useRef<HTMLInputElement>(null)

  const resetDrafts = () => {
    setEditingId(null)
    setSpellDraft(BLANK_SPELL)
    setMonsterDraft(BLANK_MONSTER)
    setItemDraft(BLANK_ITEM)
  }

  const handleSaveSpell = () => {
    if (!spellDraft.name.trim()) return
    if (editingId) homebrew.updateHomebrewSpell(editingId, spellDraft)
    else homebrew.createHomebrewSpell(spellDraft)
    resetDrafts()
  }
  const handleSaveMonster = () => {
    if (!monsterDraft.name.trim()) return
    if (editingId) homebrew.updateHomebrewMonster(editingId, monsterDraft)
    else homebrew.createHomebrewMonster(monsterDraft)
    resetDrafts()
  }
  const handleSaveItem = () => {
    if (!itemDraft.name.trim()) return
    if (editingId) homebrew.updateHomebrewItem(editingId, itemDraft)
    else homebrew.createHomebrewItem(itemDraft)
    resetDrafts()
  }

  const handleImport = async (file: File | undefined) => {
    if (!file) return
    setImportError(null)
    try {
      const parsed = (await readJsonFile(file)) as Record<string, unknown>
      if (!parsed || typeof parsed !== 'object' || typeof parsed.name !== 'string') {
        throw new Error('Not a recognizable homebrew file.')
      }
      const { id: _id, createdAt: _createdAt, ...rest } = parsed
      if ('abilities' in parsed) {
        homebrew.createHomebrewMonster(rest as Omit<HomebrewMonsterRecord, 'id' | 'createdAt'>)
        setTab('monsters')
      } else if ('level' in parsed && 'school' in parsed) {
        homebrew.createHomebrewSpell(rest as Omit<HomebrewSpellRecord, 'id' | 'createdAt'>)
        setTab('spells')
      } else {
        homebrew.createHomebrewItem(rest as Omit<HomebrewItemRecord, 'id' | 'createdAt'>)
        setTab('items')
      }
    } catch (err) {
      setImportError(err instanceof Error ? err.message : 'Could not import that file.')
    } finally {
      if (importInputRef.current) importInputRef.current.value = ''
    }
  }

  return (
    <div className="homebrew-editor">
      <div className="dm-notes-panel__new">
        <input
          ref={importInputRef}
          type="file"
          accept=".json"
          onChange={(e) => void handleImport(e.target.files?.[0])}
        />
      </div>
      {importError && <p className="compendium-drawer__errors">{importError}</p>}

      <div className="compendium-drawer__tabs">
        <button type="button" aria-pressed={tab === 'spells'} onClick={() => { setTab('spells'); resetDrafts() }}>
          Spells ({homebrew.homebrewSpells.length})
        </button>
        <button type="button" aria-pressed={tab === 'monsters'} onClick={() => { setTab('monsters'); resetDrafts() }}>
          Monsters ({homebrew.homebrewMonsters.length})
        </button>
        <button type="button" aria-pressed={tab === 'items'} onClick={() => { setTab('items'); resetDrafts() }}>
          Items ({homebrew.homebrewItems.length})
        </button>
      </div>

      {tab === 'spells' && (
        <>
          <ul className="homebrew-editor__list">
            {homebrew.homebrewSpells.map((s) => (
              <li key={s.id}>
                {s.name}
                <button type="button" onClick={() => { setEditingId(s.id); setSpellDraft(s) }}>
                  Edit
                </button>
                <button type="button" onClick={() => downloadJson(`${s.name || 'spell'}.json`, s)}>
                  Export
                </button>
                <button type="button" onClick={() => homebrew.deleteHomebrewSpell(s.id)}>
                  Delete
                </button>
              </li>
            ))}
          </ul>
          <div className="homebrew-editor__form">
            <input placeholder="Name" value={spellDraft.name} onChange={(e) => setSpellDraft({ ...spellDraft, name: e.target.value })} />
            <input
              type="number"
              placeholder="Level (0 = cantrip)"
              value={spellDraft.level}
              onChange={(e) => setSpellDraft({ ...spellDraft, level: Number(e.target.value) })}
            />
            <input placeholder="School" value={spellDraft.school} onChange={(e) => setSpellDraft({ ...spellDraft, school: e.target.value })} />
            <input placeholder="Casting time" value={spellDraft.castingTime} onChange={(e) => setSpellDraft({ ...spellDraft, castingTime: e.target.value })} />
            <input placeholder="Range" value={spellDraft.range} onChange={(e) => setSpellDraft({ ...spellDraft, range: e.target.value })} />
            <input placeholder="Components" value={spellDraft.components} onChange={(e) => setSpellDraft({ ...spellDraft, components: e.target.value })} />
            <input placeholder="Duration" value={spellDraft.duration} onChange={(e) => setSpellDraft({ ...spellDraft, duration: e.target.value })} />
            <input
              placeholder="Classes (comma-separated)"
              value={spellDraft.classes.join(', ')}
              onChange={(e) => setSpellDraft({ ...spellDraft, classes: e.target.value.split(',').map((c) => c.trim()).filter(Boolean) })}
            />
            <textarea
              placeholder="Description (one paragraph per line; {@dice 8d6} etc. tags supported)"
              rows={4}
              value={spellDraft.entries.join('\n')}
              onChange={(e) => setSpellDraft({ ...spellDraft, entries: e.target.value.split('\n') })}
            />
            <button type="button" onClick={handleSaveSpell} disabled={!spellDraft.name.trim()}>
              {editingId ? 'Save changes' : 'Create spell'}
            </button>
            {editingId && <button type="button" onClick={resetDrafts}>Cancel</button>}
          </div>
        </>
      )}

      {tab === 'monsters' && (
        <>
          <ul className="homebrew-editor__list">
            {homebrew.homebrewMonsters.map((m) => (
              <li key={m.id}>
                {m.name}
                <button type="button" onClick={() => { setEditingId(m.id); setMonsterDraft(m) }}>
                  Edit
                </button>
                <button type="button" onClick={() => downloadJson(`${m.name || 'monster'}.json`, m)}>
                  Export
                </button>
                <button type="button" onClick={() => homebrew.deleteHomebrewMonster(m.id)}>
                  Delete
                </button>
              </li>
            ))}
          </ul>
          <div className="homebrew-editor__form">
            <input placeholder="Name" value={monsterDraft.name} onChange={(e) => setMonsterDraft({ ...monsterDraft, name: e.target.value })} />
            <input placeholder="Size" value={monsterDraft.size} onChange={(e) => setMonsterDraft({ ...monsterDraft, size: e.target.value })} />
            <input placeholder="Type" value={monsterDraft.type} onChange={(e) => setMonsterDraft({ ...monsterDraft, type: e.target.value })} />
            <input placeholder="Alignment" value={monsterDraft.alignment} onChange={(e) => setMonsterDraft({ ...monsterDraft, alignment: e.target.value })} />
            <input type="number" placeholder="AC" value={monsterDraft.ac} onChange={(e) => setMonsterDraft({ ...monsterDraft, ac: Number(e.target.value) })} />
            <input type="number" placeholder="HP" value={monsterDraft.hp} onChange={(e) => setMonsterDraft({ ...monsterDraft, hp: Number(e.target.value) })} />
            <input placeholder="Hit dice (e.g. 2d6)" value={monsterDraft.hitDice} onChange={(e) => setMonsterDraft({ ...monsterDraft, hitDice: e.target.value })} />
            <input placeholder="Speed (e.g. 30 ft.)" value={monsterDraft.speed} onChange={(e) => setMonsterDraft({ ...monsterDraft, speed: e.target.value })} />
            <input placeholder="Challenge rating" value={monsterDraft.cr} onChange={(e) => setMonsterDraft({ ...monsterDraft, cr: e.target.value })} />
            <div className="homebrew-editor__abilities">
              {(['str', 'dex', 'con', 'int', 'wis', 'cha'] as const).map((key) => (
                <label key={key}>
                  {key.toUpperCase()}
                  <input
                    type="number"
                    value={monsterDraft.abilities[key]}
                    onChange={(e) => setMonsterDraft({ ...monsterDraft, abilities: { ...monsterDraft.abilities, [key]: Number(e.target.value) } })}
                  />
                </label>
              ))}
            </div>
            <input placeholder="Senses" value={monsterDraft.senses} onChange={(e) => setMonsterDraft({ ...monsterDraft, senses: e.target.value })} />
            <input placeholder="Languages" value={monsterDraft.languages} onChange={(e) => setMonsterDraft({ ...monsterDraft, languages: e.target.value })} />
            <textarea
              placeholder="Traits — one per line, Name: description"
              rows={2}
              value={actionsToLines(monsterDraft.traits)}
              onChange={(e) => setMonsterDraft({ ...monsterDraft, traits: parseActionLines(e.target.value) })}
            />
            <textarea
              placeholder="Actions — one per line, Name: description"
              rows={3}
              value={actionsToLines(monsterDraft.actions)}
              onChange={(e) => setMonsterDraft({ ...monsterDraft, actions: parseActionLines(e.target.value) })}
            />
            <textarea
              placeholder="Legendary actions — one per line, Name: description"
              rows={2}
              value={actionsToLines(monsterDraft.legendaryActions)}
              onChange={(e) => setMonsterDraft({ ...monsterDraft, legendaryActions: parseActionLines(e.target.value) })}
            />
            <button type="button" onClick={handleSaveMonster} disabled={!monsterDraft.name.trim()}>
              {editingId ? 'Save changes' : 'Create monster'}
            </button>
            {editingId && <button type="button" onClick={resetDrafts}>Cancel</button>}
          </div>
        </>
      )}

      {tab === 'items' && (
        <>
          <ul className="homebrew-editor__list">
            {homebrew.homebrewItems.map((i) => (
              <li key={i.id}>
                {i.name}
                <button type="button" onClick={() => { setEditingId(i.id); setItemDraft(i) }}>
                  Edit
                </button>
                <button type="button" onClick={() => downloadJson(`${i.name || 'item'}.json`, i)}>
                  Export
                </button>
                <button type="button" onClick={() => homebrew.deleteHomebrewItem(i.id)}>
                  Delete
                </button>
              </li>
            ))}
          </ul>
          <div className="homebrew-editor__form">
            <input placeholder="Name" value={itemDraft.name} onChange={(e) => setItemDraft({ ...itemDraft, name: e.target.value })} />
            <input placeholder="Type" value={itemDraft.type} onChange={(e) => setItemDraft({ ...itemDraft, type: e.target.value })} />
            <input placeholder="Rarity" value={itemDraft.rarity} onChange={(e) => setItemDraft({ ...itemDraft, rarity: e.target.value })} />
            <input placeholder="Weight" value={itemDraft.weight} onChange={(e) => setItemDraft({ ...itemDraft, weight: e.target.value })} />
            <input placeholder="Value" value={itemDraft.value} onChange={(e) => setItemDraft({ ...itemDraft, value: e.target.value })} />
            <textarea
              placeholder="Description (one paragraph per line)"
              rows={3}
              value={itemDraft.entries.join('\n')}
              onChange={(e) => setItemDraft({ ...itemDraft, entries: e.target.value.split('\n') })}
            />
            <button type="button" onClick={handleSaveItem} disabled={!itemDraft.name.trim()}>
              {editingId ? 'Save changes' : 'Create item'}
            </button>
            {editingId && <button type="button" onClick={resetDrafts}>Cancel</button>}
          </div>
        </>
      )}
    </div>
  )
}
