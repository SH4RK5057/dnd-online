import { useState, type FormEvent } from 'react'

export function JoinSetupScreen({
  initialCode,
  onSubmit,
  onBack,
}: {
  initialCode?: string
  onSubmit: (code: string, playerName: string) => void
  onBack: () => void
}) {
  const [playerName, setPlayerName] = useState('')
  const [code, setCode] = useState(initialCode ?? '')
  const [error, setError] = useState<string | null>(null)

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault()
    const trimmedName = playerName.trim()
    const trimmedCode = code.trim()
    if (!trimmedName || !trimmedCode) return
    setError(null)
    try {
      onSubmit(trimmedCode, trimmedName)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not join that session.')
    }
  }

  return (
    <section className="setup-screen">
      <h1>Join a session</h1>
      <form onSubmit={handleSubmit}>
        <label htmlFor="player-name">Your name</label>
        <input
          id="player-name"
          value={playerName}
          onChange={(event) => setPlayerName(event.target.value)}
          autoFocus
          maxLength={40}
        />
        <label htmlFor="join-code">Join code</label>
        <input
          id="join-code"
          value={code}
          onChange={(event) => setCode(event.target.value)}
          placeholder="ABC-123"
          maxLength={12}
        />
        {error && <p className="setup-screen__error">{error}</p>}
        <div className="setup-screen__actions">
          <button type="button" onClick={onBack}>
            Back
          </button>
          <button type="submit" disabled={!playerName.trim() || !code.trim()}>
            Join session
          </button>
        </div>
      </form>
    </section>
  )
}
