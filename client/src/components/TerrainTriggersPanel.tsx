import { TerrainPaintPanel } from './TerrainPaintPanel'
import { TriggerBuilderPanel } from './TriggerBuilderPanel'
import { SubTabNav } from './SubTabNav'
import type { PendingTerrainPlacement } from '../screens/pendingTerrainPlacement'
import type { PendingTriggerPlacement } from '../screens/pendingTriggerPlacement'

/** DM-only "Terrain & Triggers" tab — the two genuinely new scene-authoring
 * tools in this batch (as opposed to trap effects/chests, which extend
 * existing token-placement UI), so they get their own tab with a
 * jump-to-section nav like Tokens/DM Toolbox already have. */
export function TerrainTriggersPanel({
  sceneId,
  pendingTerrainPlacement,
  onRequestTerrainPlacement,
  onCancelTerrainPlacement,
  pendingTriggerPlacement,
  onRequestTriggerPlacement,
  onCancelTriggerPlacement,
}: {
  sceneId: string | null
  pendingTerrainPlacement: PendingTerrainPlacement | null
  onRequestTerrainPlacement: (placement: PendingTerrainPlacement) => void
  onCancelTerrainPlacement: () => void
  pendingTriggerPlacement: PendingTriggerPlacement | null
  onRequestTriggerPlacement: (placement: PendingTriggerPlacement) => void
  onCancelTriggerPlacement: () => void
}) {
  const parts = [
    { id: 'terrain-triggers-terrain', label: 'Terrain' },
    { id: 'terrain-triggers-triggers', label: 'Triggers' },
  ]

  return (
    <div className="terrain-triggers-panel">
      <SubTabNav parts={parts} />
      <section id="terrain-triggers-terrain" className="terrain-triggers-panel__section">
        <h3>Terrain</h3>
        <TerrainPaintPanel
          pendingPlacement={pendingTerrainPlacement}
          onRequestPlacement={onRequestTerrainPlacement}
          onCancelPlacement={onCancelTerrainPlacement}
        />
      </section>
      <section id="terrain-triggers-triggers" className="terrain-triggers-panel__section">
        <h3>Triggers</h3>
        {sceneId && (
          <TriggerBuilderPanel
            sceneId={sceneId}
            pendingPlacement={pendingTriggerPlacement}
            onRequestPlacement={onRequestTriggerPlacement}
            onCancelPlacement={onCancelTriggerPlacement}
          />
        )}
      </section>
    </div>
  )
}
