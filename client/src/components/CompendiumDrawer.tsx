import { useRef, useState } from 'react'
import type * as Y from 'yjs'
import { useCompendium } from '../content/useCompendium'
import { filterItems, filterMonsters, filterSpells } from '../content/search'
import { loadSavedMirrorToken, loadSavedMirrorUrl, saveMirrorToken, saveMirrorUrl } from '../content/constants'
import { StatBlockCard } from './StatBlockCard'
import type { MonsterData } from '../content/types'

type Tab = 'spells' | 'monsters' | 'items'

/** Searchable/filterable reference drawer over the merged compendium (SRD
 * fallback + private mirror import + homebrew). DM-only "Add to scene"
 * button on monster cards is the encounter drag-and-drop entry point —
 * "drag" here means "click to place", matching this app's existing
 * click-to-place pattern for tokens/walls/lights rather than introducing a
 * new native HTML drag-and-drop interaction for one feature. */
export function CompendiumDrawer({
  doc,
  isDm,
  onAddMonsterToScene,
}: {
  doc: Y.Doc | null
  isDm: boolean
  onAddMonsterToScene?: (monster: MonsterData) => void
}) {
  const compendium = useCompendium(doc)
  const [tab, setTab] = useState<Tab>('spells')
  const [query, setQuery] = useState('')
  const [spellLevel, setSpellLevel] = useState<number | 'all'>('all')
  const [spellSchool, setSpellSchool] = useState<string | 'all'>('all')
  const [monsterCr, setMonsterCr] = useState<string | 'all'>('all')
  const [monsterType, setMonsterType] = useState<string | 'all'>('all')
  const [itemType, setItemType] = useState<string | 'all'>('all')
  const [selectedKey, setSelectedKey] = useState<string | null>(null)
  const [mirrorUrl, setMirrorUrl] = useState(() => loadSavedMirrorUrl())
  const [mirrorToken, setMirrorToken] = useState(() => loadSavedMirrorToken())
  const [mirrorBusy, setMirrorBusy] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const spells = filterSpells(compendium.spells, query, spellLevel, spellSchool)
  const monsters = filterMonsters(compendium.monsters, query, monsterCr, monsterType)
  const items = filterItems(compendium.items, query, itemType)

  const schools = Array.from(new Set(compendium.spells.map((s) => s.school))).sort()
  const crs = Array.from(new Set(compendium.monsters.map((m) => m.cr))).sort()
  const itemTypes = Array.from(new Set(compendium.items.map((i) => i.type))).sort()

  const selectedEntry =
    tab === 'spells'
      ? spells.find((s) => s.key === selectedKey)
      : tab === 'monsters'
        ? monsters.find((m) => m.key === selectedKey)
        : items.find((i) => i.key === selectedKey)

  const handleImportFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return
    setMirrorBusy(true)
    try {
      await compendium.importMirrorLocalFiles(files)
    } finally {
      setMirrorBusy(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  const handleImportUrl = async () => {
    if (!mirrorUrl.trim()) return
    saveMirrorUrl(mirrorUrl.trim())
    saveMirrorToken(mirrorToken.trim())
    setMirrorBusy(true)
    try {
      await compendium.importMirrorUrl(mirrorUrl.trim(), mirrorToken.trim())
    } finally {
      setMirrorBusy(false)
    }
  }

  return (
    <div className="compendium-drawer">
      <div className="compendium-drawer__tabs">
        <button type="button" aria-pressed={tab === 'spells'} onClick={() => { setTab('spells'); setSelectedKey(null) }}>
          Spells ({spells.length})
        </button>
        <button type="button" aria-pressed={tab === 'monsters'} onClick={() => { setTab('monsters'); setSelectedKey(null) }}>
          Monsters ({monsters.length})
        </button>
        <button type="button" aria-pressed={tab === 'items'} onClick={() => { setTab('items'); setSelectedKey(null) }}>
          Items ({items.length})
        </button>
      </div>

      <input
        className="compendium-drawer__search"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder={`Search ${tab} by name…`}
      />

      {tab === 'spells' && (
        <div className="compendium-drawer__filters">
          <select value={spellLevel} onChange={(e) => setSpellLevel(e.target.value === 'all' ? 'all' : Number(e.target.value))}>
            <option value="all">Any level</option>
            {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map((lvl) => (
              <option key={lvl} value={lvl}>
                {lvl === 0 ? 'Cantrip' : `Level ${lvl}`}
              </option>
            ))}
          </select>
          <select value={spellSchool} onChange={(e) => setSpellSchool(e.target.value)}>
            <option value="all">Any school</option>
            {schools.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </div>
      )}

      {tab === 'monsters' && (
        <div className="compendium-drawer__filters">
          <select value={monsterCr} onChange={(e) => setMonsterCr(e.target.value)}>
            <option value="all">Any CR</option>
            {crs.map((cr) => (
              <option key={cr} value={cr}>
                CR {cr}
              </option>
            ))}
          </select>
          <input value={monsterType === 'all' ? '' : monsterType} onChange={(e) => setMonsterType(e.target.value || 'all')} placeholder="Type contains…" />
        </div>
      )}

      {tab === 'items' && (
        <div className="compendium-drawer__filters">
          <select value={itemType} onChange={(e) => setItemType(e.target.value)}>
            <option value="all">Any type</option>
            {itemTypes.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </div>
      )}

      <div className="compendium-drawer__body">
        <ul className="compendium-drawer__list">
          {(tab === 'spells' ? spells : tab === 'monsters' ? monsters : items).map((entry) => (
            <li key={entry.key}>
              <button type="button" aria-pressed={selectedKey === entry.key} onClick={() => setSelectedKey(entry.key)}>
                {entry.name}
                <span className="compendium-drawer__source">{entry.source}</span>
              </button>
            </li>
          ))}
        </ul>

        {selectedEntry && (
          <div className="compendium-drawer__detail">
            <StatBlockCard
              entry={
                tab === 'spells'
                  ? { kind: 'spell', data: selectedEntry as (typeof spells)[number] }
                  : tab === 'monsters'
                    ? { kind: 'monster', data: selectedEntry as (typeof monsters)[number] }
                    : { kind: 'item', data: selectedEntry as (typeof items)[number] }
              }
            />
            {isDm && tab === 'monsters' && onAddMonsterToScene && (
              <button type="button" onClick={() => onAddMonsterToScene(selectedEntry as MonsterData)}>
                Add to scene
              </button>
            )}
          </div>
        )}
      </div>

      {isDm && (
        <details className="compendium-drawer__mirror">
          <summary>Private mirror import</summary>
          <p className="compendium-drawer__hint">
            Import your own local 5etools-2014-src-shaped JSON files (data/spells/*.json, data/bestiary/*.json,
            data/items.json), or fetch from any mirror URL you point it at — public or private. Nothing here is
            bundled with the app; this only ever fetches from wherever you tell it to, straight from your browser.
          </p>
          <input ref={fileInputRef} type="file" accept=".json" multiple onChange={(e) => void handleImportFiles(e.target.files)} disabled={mirrorBusy} />
          <div className="compendium-drawer__mirror-url">
            <input
              value={mirrorUrl}
              onChange={(e) => setMirrorUrl(e.target.value)}
              placeholder="e.g. https://raw.githubusercontent.com/<owner>/<repo>/<branch>"
            />
            <input
              type="password"
              value={mirrorToken}
              onChange={(e) => setMirrorToken(e.target.value)}
              placeholder="Access token (only for a private repo)"
            />
            <button type="button" onClick={() => void handleImportUrl()} disabled={mirrorBusy || !mirrorUrl.trim()}>
              {mirrorBusy ? 'Importing…' : 'Fetch'}
            </button>
          </div>
          <p className="compendium-drawer__hint">
            For a private GitHub repo: use a raw.githubusercontent.com URL (owner/repo/branch, no trailing path) and
            a personal access token with read access to that repo. The token is saved only in this browser's local
            storage and sent only to the URL above.
          </p>
          {compendium.mirrorImportedAt && (
            <p className="compendium-drawer__hint">Last imported {new Date(compendium.mirrorImportedAt).toLocaleString()}</p>
          )}
          {compendium.mirrorErrors.length > 0 && (
            <ul className="compendium-drawer__errors">
              {compendium.mirrorErrors.map((err, i) => (
                <li key={i}>{err}</li>
              ))}
            </ul>
          )}
        </details>
      )}
    </div>
  )
}
