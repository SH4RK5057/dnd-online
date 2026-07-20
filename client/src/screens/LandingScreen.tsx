import type { LastSession } from '../session/types'

export function LandingScreen({
  lastSession,
  onHost,
  onJoin,
  onCharacters,
  onResume,
}: {
  lastSession: LastSession | null
  onHost: () => void
  onJoin: () => void
  onCharacters: () => void
  onResume: (lastSession: LastSession) => void
}) {
  return (
    <section className="landing-screen">
      <h1>D&D Online</h1>
      <p>A DM-hosted virtual tabletop. Host a session, or join one with a code.</p>

      {lastSession && (
        <div className="landing-screen__resume">
          <p>
            Resume <strong>{lastSession.sessionName}</strong> ({lastSession.code})?
          </p>
          <button type="button" onClick={() => onResume(lastSession)}>
            Resume session
          </button>
        </div>
      )}

      <div className="landing-screen__actions">
        <button type="button" onClick={onHost}>
          Host a session
        </button>
        <button type="button" onClick={onJoin}>
          Join a session
        </button>
        <button type="button" onClick={onCharacters}>
          My Characters
        </button>
      </div>
    </section>
  )
}
