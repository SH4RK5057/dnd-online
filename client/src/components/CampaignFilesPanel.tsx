import { useRef, useState } from 'react'
import type * as Y from 'yjs'
import { exportCampaign, importCampaignFile } from '../dmtools/campaignFile'

/** DM-only whole-campaign backup/portability — see dmtools/campaignFile.ts. */
export function CampaignFilesPanel({ doc, sessionName }: { doc: Y.Doc | null; sessionName: string }) {
  const [importError, setImportError] = useState<string | null>(null)
  const [importing, setImporting] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleImport = async (file: File | undefined) => {
    if (!doc || !file) return
    setImportError(null)
    setImporting(true)
    try {
      await importCampaignFile(doc, file)
    } catch (err) {
      setImportError(err instanceof Error ? err.message : 'Could not import that file.')
    } finally {
      setImporting(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  return (
    <div className="campaign-files-panel">
      <p className="compendium-drawer__hint">
        Downloads everything in this campaign — scenes, tokens, characters, homebrew, roll log, notes — as one file,
        on top of the browser's own local storage. Good for backups or moving to another machine. Importing merges
        into the current campaign rather than replacing it.
      </p>
      <div className="dm-notes-panel__new">
        <button type="button" onClick={() => doc && exportCampaign(doc, sessionName)} disabled={!doc}>
          Export campaign file
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept=".dndoc"
          onChange={(e) => void handleImport(e.target.files?.[0])}
          disabled={importing}
        />
      </div>
      {importError && <p className="compendium-drawer__errors">{importError}</p>}
    </div>
  )
}
