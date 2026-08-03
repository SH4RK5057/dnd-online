import { TokenOwnerAssign } from './TokenOwnerAssign'
import { PreviewAsPlayer } from './PreviewAsPlayer'
import { TokenUploadButton } from './TokenUploadButton'
import { CharacterTokenMenu } from './CharacterTokenMenu'
import { ChestPlacementPanel } from './ChestPlacementPanel'
import { SubTabNav } from './SubTabNav'
import type { PendingTokenPlacement } from '../screens/pendingTokenPlacement'

/** DM-only "Tokens" tab — combines Token Ownership, Preview As, and Token
 * Placement (previously three separate tabs, all DM map/token setup with
 * no strong reason to be split) with a jump-to-section nav since it now has
 * multiple parts stacked in one panel. Ownership and Placement need an
 * active scene; Preview As doesn't, so it's always shown. */
export function TokensPanel({
  sceneId,
  pendingPlacement,
  onRequestPlacement,
  onCancelPlacement,
  previewPlayerId,
  onPreviewPlayerChange,
}: {
  sceneId: string | null
  pendingPlacement: PendingTokenPlacement | null
  onRequestPlacement: (placement: PendingTokenPlacement) => void
  onCancelPlacement: () => void
  previewPlayerId: string | null
  onPreviewPlayerChange: (playerId: string | null) => void
}) {
  const parts = [
    ...(sceneId ? [{ id: 'tokens-ownership', label: 'Ownership' }] : []),
    { id: 'tokens-preview', label: 'Preview As' },
    ...(sceneId ? [{ id: 'tokens-placement', label: 'Placement' }] : []),
  ]

  return (
    <div className="tokens-panel">
      <SubTabNav parts={parts} />
      {sceneId && (
        <section id="tokens-ownership" className="tokens-panel__section">
          <TokenOwnerAssign sceneId={sceneId} />
        </section>
      )}
      <section id="tokens-preview" className="tokens-panel__section">
        <h3>Preview As</h3>
        <PreviewAsPlayer previewPlayerId={previewPlayerId} onChange={onPreviewPlayerChange} />
      </section>
      {sceneId && (
        <section id="tokens-placement" className="tokens-panel__section">
          <h3>Token Placement</h3>
          <TokenUploadButton
            sceneId={sceneId}
            pendingPlacement={pendingPlacement}
            onRequestPlacement={onRequestPlacement}
            onCancelPlacement={onCancelPlacement}
          />
          <CharacterTokenMenu sceneId={sceneId} pendingPlacement={pendingPlacement} onRequestPlacement={onRequestPlacement} />
          <ChestPlacementPanel pendingPlacement={pendingPlacement} onRequestPlacement={onRequestPlacement} />
        </section>
      )}
    </div>
  )
}
