import type * as Y from 'yjs'
import { RandomGenerators } from './RandomGenerators'
import { SoundboardPanel } from './SoundboardPanel'
import { CampaignFilesPanel } from './CampaignFilesPanel'
import { SubTabNav } from './SubTabNav'

const PARTS = [
  { id: 'toolbox-generators', label: 'Generators' },
  { id: 'toolbox-soundboard', label: 'Soundboard' },
  { id: 'toolbox-files', label: 'Campaign Files' },
]

/** DM-only "DM Toolbox" tab — combines Random Generators, Soundboard, and
 * Campaign Files, three low-frequency utility tools that don't each need
 * their own dedicated tab, with a jump-to-section nav since it now has
 * multiple parts stacked in one panel. */
export function DmToolboxPanel({ doc, sessionName }: { doc: Y.Doc | null; sessionName: string }) {
  return (
    <div className="dm-toolbox-panel">
      <SubTabNav parts={PARTS} />
      <section id="toolbox-generators" className="dm-toolbox-panel__section">
        <h3>Random Generators</h3>
        <RandomGenerators doc={doc} />
      </section>
      <section id="toolbox-soundboard" className="dm-toolbox-panel__section">
        <h3>Soundboard</h3>
        <SoundboardPanel />
      </section>
      <section id="toolbox-files" className="dm-toolbox-panel__section">
        <h3>Campaign Files</h3>
        <CampaignFilesPanel doc={doc} sessionName={sessionName} />
      </section>
    </div>
  )
}
