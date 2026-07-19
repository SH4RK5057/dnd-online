import { useState, type FormEvent } from 'react'

export function HostSetupScreen({
  onSubmit,
  onBack,
}: {
  onSubmit: (dmName: string) => void
  onBack: () => void
}) {
  const [dmName, setDmName] = useState('')

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault()
    const trimmed = dmName.trim()
    if (!trimmed) return
    onSubmit(trimmed)
  }

  return (
    <section className="setup-screen">
      <h1>Host a session</h1>
      <form onSubmit={handleSubmit}>
        <label htmlFor="dm-name">Your name (as DM)</label>
        <input
          id="dm-name"
          value={dmName}
          onChange={(event) => setDmName(event.target.value)}
          autoFocus
          maxLength={40}
        />
        <div className="setup-screen__actions">
          <button type="button" onClick={onBack}>
            Back
          </button>
          <button type="submit" disabled={!dmName.trim()}>
            Start session
          </button>
        </div>
      </form>
    </section>
  )
}
