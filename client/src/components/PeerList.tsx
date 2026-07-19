import type { PeerInfo } from '../session/types'

export function PeerList({ peers, localName, localRole }: { peers: PeerInfo[]; localName: string; localRole: string }) {
  if (peers.length === 0) {
    return <p className="peer-list__empty">No one else has joined yet.</p>
  }

  return (
    <ul className="peer-list">
      <li className="peer-list__item">
        <span className="peer-list__name">{localName} (you)</span>
        <span className="peer-list__role">{localRole}</span>
      </li>
      {peers.map((peer) => (
        <li key={peer.playerId} className="peer-list__item">
          <span className="peer-list__name">{peer.name}</span>
          <span className="peer-list__role">{peer.role}</span>
          {peer.connectionState === 'reconnecting' && (
            <span className="peer-list__state">reconnecting…</span>
          )}
        </li>
      ))}
    </ul>
  )
}
