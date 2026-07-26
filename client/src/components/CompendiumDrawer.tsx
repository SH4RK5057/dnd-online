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
  const folderInputRef = useRef<HTMLInputElement>(null)
  const [ghOwner, setGhOwner] = useState('')
  const [ghRepo, setGhRepo] = useState('')
  const [ghBranch, setGhBranch] = useState('main')
  const [ghPath, setGhPath] = useState('')
  const [ghToken, setGhToken] = useState(() => loadSavedMirrorToken())

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
      if (folderInputRef.current) folderInputRef.current.value = ''
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

  const handleImportGithubRepo = async () => {
    if (!ghOwner.trim() || !ghRepo.trim()) return
    saveMirrorToken(ghToken.trim())
    setMirrorBusy(true)
    try {
      await compendium.importGithubRepo(ghOwner.trim(), ghRepo.trim(), ghBranch.trim() || 'main', ghPath.trim(), ghToken.trim())
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
            Import your own content from local files, a local folder, or a GitHub repo you point it at — public or
            private. Nothing here is bundled with the app; this only ever fetches from wherever you tell it to,
            straight from your browser.
          </p>

          <h4>Local files or folder</h4>
          <p className="compendium-drawer__hint">
            Pick individual 5etools-2014-src-shaped JSON files, or an entire folder — every recognized file inside
            (at any nesting depth) gets ingested, so folder layout doesn't matter.
          </p>
          <div className="compendium-drawer__mirror-files">
            <input ref={fileInputRef} type="file" accept=".json" multiple onChange={(e) => void handleImportFiles(e.target.files)} disabled={mirrorBusy} />
            <input
              ref={folderInputRef}
              type="file"
              // @ts-expect-error -- webkitdirectory/directory aren't in React's DOM typings but are supported by Chromium/Firefox for folder selection
              webkitdirectory=""
              directory=""
              multiple
              onChange={(e) => void handleImportFiles(e.target.files)}
              disabled={mirrorBusy}
            />
          </div>

          <h4>5etools-shaped mirror URL</h4>
          <p className="compendium-drawer__hint">
            Fetches the conventional 5etools-2014-src layout (data/items.json, data/spells/index.json + files,
            data/bestiary/index.json + files) from a raw.githubusercontent.com base URL.
          </p>
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

          <h4>GitHub repo or folder (any layout)</h4>
          <p className="compendium-drawer__hint">
            Points at any repo (or a subfolder within it) and ingests every .json file found, whatever it's named or
            however it's organized — use this if your repo doesn't match 5etools' exact file layout.
          </p>
          <div className="compendium-drawer__mirror-github">
            <input value={ghOwner} onChange={(e) => setGhOwner(e.target.value)} placeholder="owner" />
            <input value={ghRepo} onChange={(e) => setGhRepo(e.target.value)} placeholder="repo" />
            <input value={ghBranch} onChange={(e) => setGhBranch(e.target.value)} placeholder="branch (default: main)" />
            <input value={ghPath} onChange={(e) => setGhPath(e.target.value)} placeholder="folder path (optional, e.g. data)" />
            <input
              type="password"
              value={ghToken}
              onChange={(e) => setGhToken(e.target.value)}
              placeholder="Access token (only for a private repo)"
            />
            <button
              type="button"
              onClick={() => void handleImportGithubRepo()}
              disabled={mirrorBusy || !ghOwner.trim() || !ghRepo.trim()}
            >
              {mirrorBusy ? 'Importing…' : 'Fetch'}
            </button>
          </div>

          <p className="compendium-drawer__hint">
            For a private GitHub repo: use a personal access token with read access to that repo. The token is saved
            only in this browser's local storage and sent only to GitHub's API/raw-content hosts.
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

      <p className="compendium-drawer__attribution">
        Built-in reference content is drawn from the D&amp;D 5.1 System Reference Document, © Wizards of the Coast
        LLC, licensed under{' '}
        <a href="https://creativecommons.org/licenses/by/4.0/" target="_blank" rel="noreferrer">
          CC BY 4.0
        </a>
        .
      </p>
    </div>
  )
}
