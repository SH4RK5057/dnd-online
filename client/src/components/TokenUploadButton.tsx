import { useState, type FormEvent } from 'react'
import { useSession } from '../session/useSession'
import { useTokens } from '../map/useTokens'
import { SIZE_LABELS } from '../map/constants'
import type { SizeCategory } from '../map/types'
import type { PendingTokenPlacement } from '../screens/pendingTokenPlacement'

const SIZE_OPTIONS = Object.keys(SIZE_LABELS) as SizeCategory[]

interface TokenUploadButtonProps {
  sceneId: string
  pendingPlacement: PendingTokenPlacement | null
  onRequestPlacement: (placement: PendingTokenPlacement) => void
  onCancelPlacement: () => void
}

export function TokenUploadButton({
  sceneId,
  pendingPlacement,
  onRequestPlacement,
  onCancelPlacement,
}: TokenUploadButtonProps) {
  const { session } = useSession()
  const doc = session?.doc ?? null
  const { tokens, deleteAllTokens } = useTokens(doc, sceneId)

  const [name, setName] = useState('')
  const [sizeCategory, setSizeCategory] = useState<SizeCategory>('medium')
  const [file, setFile] = useState<File | null>(null)
  const [modelFile, setModelFile] = useState<File | null>(null)
  const [isHazard, setIsHazard] = useState(false)
  const [hazardWidth, setHazardWidth] = useState(2)
  const [hazardHeight, setHazardHeight] = useState(2)

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault()
    const trimmed = name.trim()
    if (!trimmed) return
    onRequestPlacement({
      name: trimmed,
      sizeCategory,
      file,
      modelFile,
      monsterInit: null,
      characterInit: null,
      hazardSize: isHazard ? { widthCells: Math.max(1, hazardWidth), heightCells: Math.max(1, hazardHeight) } : null,
    })
    setName('')
    setFile(null)
    setModelFile(null)
  }

  const handleEraseAll = () => {
    if (tokens.length === 0) return
    if (window.confirm(`Delete all ${tokens.length} token(s) on this scene?`)) {
      deleteAllTokens(sceneId)
    }
  }

  if (pendingPlacement) {
    return (
      <div className="token-upload token-upload--pending">
        <span>
          Click the map to place "{pendingPlacement.name}" (or cancel)
        </span>
        <button type="button" onClick={onCancelPlacement}>
          Cancel
        </button>
      </div>
    )
  }

  return (
    <form className="token-upload" onSubmit={handleSubmit}>
      <input value={name} onChange={(event) => setName(event.target.value)} placeholder="Token name" />
      <label>
        <input type="checkbox" checked={isHazard} onChange={(event) => setIsHazard(event.target.checked)} />
        Hazard/trap (custom size, starts hidden)
      </label>
      {isHazard ? (
        <span className="token-upload__hazard-size">
          <input
            type="number"
            min={1}
            value={hazardWidth}
            onChange={(event) => setHazardWidth(Math.max(1, Number(event.target.value)))}
            title="Width (grid cells)"
          />
          ×
          <input
            type="number"
            min={1}
            value={hazardHeight}
            onChange={(event) => setHazardHeight(Math.max(1, Number(event.target.value)))}
            title="Height (grid cells)"
          />
          cells
        </span>
      ) : (
        <select value={sizeCategory} onChange={(event) => setSizeCategory(event.target.value as SizeCategory)}>
          {SIZE_OPTIONS.map((size) => (
            <option key={size} value={size}>
              {SIZE_LABELS[size]}
            </option>
          ))}
        </select>
      )}
      <label className="token-upload__file-label">
        Token image (optional)
        <input type="file" accept="image/*" onChange={(event) => setFile(event.target.files?.[0] ?? null)} />
      </label>
      <label className="token-upload__file-label" title="Used to show this token as a real 3D mini in the 3D flat-plane view">
        3D model, STL (optional)
        <input
          type="file"
          accept=".stl,model/stl,model/x.stl-binary,model/x.stl-ascii"
          onChange={(event) => setModelFile(event.target.files?.[0] ?? null)}
        />
      </label>
      <button type="submit" disabled={!name.trim()}>
        Add token
      </button>
      <button type="button" onClick={handleEraseAll} disabled={tokens.length === 0}>
        Erase all tokens
      </button>
    </form>
  )
}
