import { useState, type FormEvent } from 'react'
import { useSession } from '../session/useSession'
import { useTokens } from '../map/useTokens'
import { SIZE_LABELS } from '../map/constants'
import type { SizeCategory } from '../map/types'

const SIZE_OPTIONS = Object.keys(SIZE_LABELS) as SizeCategory[]

export function TokenUploadButton({ sceneId }: { sceneId: string }) {
  const { session } = useSession()
  const doc = session?.doc ?? null
  const { tokens, createToken, setTokenArt, deleteAllTokens } = useTokens(doc, sceneId)

  const [name, setName] = useState('')
  const [sizeCategory, setSizeCategory] = useState<SizeCategory>('medium')
  const [file, setFile] = useState<File | null>(null)
  const [busy, setBusy] = useState(false)

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault()
    const trimmed = name.trim()
    if (!trimmed) return
    setBusy(true)
    try {
      const tokenId = createToken({ sceneId, name: trimmed, sizeCategory, x: 0, y: 0 })
      if (file) {
        await setTokenArt(tokenId, file)
      }
      setName('')
      setFile(null)
    } catch (err) {
      window.alert(err instanceof Error ? err.message : 'Could not add that token.')
    } finally {
      setBusy(false)
    }
  }

  const handleEraseAll = () => {
    if (tokens.length === 0) return
    if (window.confirm(`Delete all ${tokens.length} token(s) on this scene?`)) {
      deleteAllTokens(sceneId)
    }
  }

  return (
    <form className="token-upload" onSubmit={(event) => void handleSubmit(event)}>
      <input value={name} onChange={(event) => setName(event.target.value)} placeholder="Token name" />
      <select value={sizeCategory} onChange={(event) => setSizeCategory(event.target.value as SizeCategory)}>
        {SIZE_OPTIONS.map((size) => (
          <option key={size} value={size}>
            {SIZE_LABELS[size]}
          </option>
        ))}
      </select>
      <input type="file" accept="image/*" onChange={(event) => setFile(event.target.files?.[0] ?? null)} />
      <button type="submit" disabled={!name.trim() || busy}>
        {busy ? 'Adding…' : 'Add token'}
      </button>
      <button type="button" onClick={handleEraseAll} disabled={tokens.length === 0}>
        Erase all tokens
      </button>
    </form>
  )
}
