import { useSession } from '../session/useSession'
import { useConnectionStatus } from '../session/useConnectionStatus'
import { useTokens } from '../map/useTokens'

/** DM-only: assigns each token on the active scene to a connected player, so
 * fog-of-war (FogLayer) knows which token to compute a given player's view
 * from. Rendered after PeerList rather than folded into it — PeerList is a
 * dumb prop-driven component shared by both DM and player views, and giving
 * it scene/token data + DM-only gating would break that reusable contract. */
export function TokenOwnerAssign({ sceneId }: { sceneId: string }) {
  const { session } = useSession()
  const doc = session?.doc ?? null
  const { peers } = useConnectionStatus(session)
  const { tokens, assignOwner } = useTokens(doc, sceneId)

  const players = peers.filter((peer) => peer.role === 'player')

  if (tokens.length === 0) return null

  return (
    <div className="token-owner-assign">
      <h2>Token ownership</h2>
      <p className="drawing-toolbar__hint">Which player's view fog-of-war computes from, per token on this scene.</p>
      <ul className="token-owner-assign__list">
        {tokens.map((token) => (
          <li key={token.id} className="token-owner-assign__item">
            <span>{token.name}</span>
            <select value={token.ownerId ?? ''} onChange={(event) => assignOwner(token.id, event.target.value || null)}>
              <option value="">Unassigned</option>
              {players.map((player) => (
                <option key={player.playerId} value={player.playerId}>
                  {player.name}
                </option>
              ))}
            </select>
          </li>
        ))}
      </ul>
    </div>
  )
}
