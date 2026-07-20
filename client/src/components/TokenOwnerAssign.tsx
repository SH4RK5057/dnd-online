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
        {tokens.map((token) => {
          // A token's owner can be a player who isn't currently connected
          // (they closed their tab, or joined in an earlier session) — the
          // assignment itself is untouched by that (`ownerId` isn't cleared
          // on disconnect), but a plain <select value={token.ownerId}> with
          // no matching <option> for that id silently renders as blank,
          // which looks exactly like "Unassigned" even though it isn't. Add
          // a synthetic option for that case so the dropdown always shows
          // the real assignment, and a DM can't be misled into thinking a
          // still-valid assignment needs fixing (or worse, clear it).
          const ownerIsKnownPlayer = token.ownerId === null || players.some((p) => p.playerId === token.ownerId)
          return (
            <li key={token.id} className="token-owner-assign__item">
              <span>{token.name}</span>
              <select value={token.ownerId ?? ''} onChange={(event) => assignOwner(token.id, event.target.value || null)}>
                <option value="">Unassigned</option>
                {!ownerIsKnownPlayer && token.ownerId && (
                  <option value={token.ownerId}>Player {token.ownerId.slice(0, 8)} (disconnected)</option>
                )}
                {players.map((player) => (
                  <option key={player.playerId} value={player.playerId}>
                    {player.name}
                  </option>
                ))}
              </select>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
