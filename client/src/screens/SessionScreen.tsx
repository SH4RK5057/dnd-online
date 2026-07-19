import { useSession } from '../session/useSession'
import { useConnectionStatus } from '../session/useConnectionStatus'
import { ConnectionStatusBadge } from '../components/ConnectionStatusBadge'
import { PeerList } from '../components/PeerList'
import { CopyJoinCode } from '../components/CopyJoinCode'
import { ConnectionErrorPanel } from '../components/ConnectionErrorPanel'

export function SessionScreen() {
  const { session, sessionMeta, leaveSession } = useSession()
  const { status, peers, failure, retry } = useConnectionStatus(session)

  if (!session) return null

  return (
    <section className="session-screen">
      <header className="session-screen__header">
        <h1>{sessionMeta?.sessionName ?? 'Session'}</h1>
        <ConnectionStatusBadge status={status} />
      </header>

      {session.role === 'dm' && (
        <div className="session-screen__code">
          <p>Share this code with your players:</p>
          <CopyJoinCode code={session.joinCode} />
        </div>
      )}

      {failure && <ConnectionErrorPanel failure={failure} onRetry={retry} />}

      <div className="session-screen__peers">
        <h2>Who's here</h2>
        <PeerList peers={peers} localName={session.displayName} localRole={session.role} />
      </div>

      <button type="button" onClick={leaveSession}>
        Leave session
      </button>
    </section>
  )
}
