import type { ConnectionStatus } from '../session/types'

const LABELS: Record<ConnectionStatus, string> = {
  idle: 'Idle',
  connecting: 'Connecting…',
  connected: 'Connected',
  reconnecting: 'Reconnecting…',
  failed: 'Connection failed',
}

export function ConnectionStatusBadge({ status }: { status: ConnectionStatus }) {
  return (
    <span className={`status-badge status-badge--${status}`}>
      <span className="status-badge__dot" aria-hidden="true" />
      {LABELS[status]}
    </span>
  )
}
