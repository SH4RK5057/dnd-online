import { useState, type FormEvent } from 'react'
import { TERRAIN_LABELS } from '../map/constants'
import type { TerrainType } from '../map/types'
import type { AreaEffect } from '../map/areaEffects'
import type { PendingTerrainPlacement } from '../screens/pendingTerrainPlacement'
import { AreaEffectFields } from './AreaEffectFields'

const TERRAIN_OPTIONS = Object.keys(TERRAIN_LABELS) as TerrainType[]

interface TerrainPaintPanelProps {
  pendingPlacement: PendingTerrainPlacement | null
  onRequestPlacement: (placement: PendingTerrainPlacement) => void
  onCancelPlacement: () => void
}

/** DM-only: paint a rectangular terrain patch — pick a type + size, then
 * click the map to place its top-left corner, same staged click-to-place
 * flow TokenUploadButton already uses for tokens/hazards. */
export function TerrainPaintPanel({ pendingPlacement, onRequestPlacement, onCancelPlacement }: TerrainPaintPanelProps) {
  const [terrainType, setTerrainType] = useState<TerrainType>('water')
  const [widthCells, setWidthCells] = useState(3)
  const [heightCells, setHeightCells] = useState(3)
  const [effect, setEffect] = useState<AreaEffect | null>(null)

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault()
    onRequestPlacement({ terrainType, widthCells: Math.max(1, widthCells), heightCells: Math.max(1, heightCells), effect })
  }

  if (pendingPlacement) {
    return (
      <div className="token-upload token-upload--pending">
        <span>
          Click the map to place a {pendingPlacement.widthCells}×{pendingPlacement.heightCells}{' '}
          {TERRAIN_LABELS[pendingPlacement.terrainType].toLowerCase()} patch (or cancel)
        </span>
        <button type="button" onClick={onCancelPlacement}>
          Cancel
        </button>
      </div>
    )
  }

  return (
    <form className="token-upload" onSubmit={handleSubmit}>
      <select value={terrainType} onChange={(event) => setTerrainType(event.target.value as TerrainType)}>
        {TERRAIN_OPTIONS.map((type) => (
          <option key={type} value={type}>
            {TERRAIN_LABELS[type]}
          </option>
        ))}
      </select>
      <span className="token-upload__hazard-size">
        <input
          type="number"
          min={1}
          value={widthCells}
          onChange={(event) => setWidthCells(Math.max(1, Number(event.target.value)))}
          title="Width (grid cells)"
        />
        ×
        <input
          type="number"
          min={1}
          value={heightCells}
          onChange={(event) => setHeightCells(Math.max(1, Number(event.target.value)))}
          title="Height (grid cells)"
        />
        cells
      </span>
      <AreaEffectFields label="Hazardous (deals damage on entry)" value={effect} onChange={setEffect} />
      <button type="submit">Paint terrain</button>
    </form>
  )
}
