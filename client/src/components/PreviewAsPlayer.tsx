import { useSession } from '../session/useSession'
import { useConnectionStatus } from '../session/useConnectionStatus'

/** DM-only: lets the DM switch their own map view to render exactly what a
 * chosen connected player currently sees — that player's fog mask, computed
 * from their own owned tokens and their own persistent exploration memory,
 * instead of the DM's always-unmasked view. Purely a local rendering choice
 * (see MapCanvas's `previewPlayerId` prop) — nothing here is written to the
 * shared doc. */
export function PreviewAsPlayer({
  previewPlayerId,
  onChange,
}: {
  previewPlayerId: string | null
  onChange: (playerId: string | null) => void
}) {
  const { session } = useSession()
  const { peers } = useConnectionStatus(session)

  const players = peers.filter((peer) => peer.role === 'player')

  return (
    <div className="preview-as-player">
      <label htmlFor="preview-as-player-select">Preview as</label>
      <select
        id="preview-as-player-select"
        value={previewPlayerId ?? ''}
        onChange={(event) => onChange(event.target.value || null)}
      >
        <option value="">My view (DM)</option>
        {players.map((player) => (
          <option key={player.playerId} value={player.playerId}>
            {player.name}
          </option>
        ))}
      </select>
    </div>
  )
}
