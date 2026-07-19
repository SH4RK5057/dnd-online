import type { ConnectionFailureInfo } from '../session/types'

export function ConnectionErrorPanel({
  failure,
  onRetry,
}: {
  failure: ConnectionFailureInfo
  onRetry: () => void
}) {
  return (
    <div className="connection-error-panel" role="alert">
      <p>{failure.message}</p>
      <button type="button" onClick={onRetry}>
        Retry
      </button>
    </div>
  )
}
