/** Shared DM-only recipient control for anything using the "null = everyone,
 * non-empty array = just these players" targeting convention (HandoutRecord/
 * BroadcastRecord's `visibleToPlayerIds`). Checking "Everyone" clears back
 * to null; checking any specific player switches into array mode; unchecking
 * the last selected player falls back to "Everyone" rather than leaving a
 * silent "visible to no one" state. */
export function PlayerRecipientPicker({
  players,
  value,
  onChange,
}: {
  players: { playerId: string; name: string }[]
  value: string[] | null
  onChange: (next: string[] | null) => void
}) {
  const isEveryone = value === null

  const togglePlayer = (playerId: string) => {
    const current = value ?? []
    const next = current.includes(playerId) ? current.filter((id) => id !== playerId) : [...current, playerId]
    onChange(next.length === 0 ? null : next)
  }

  return (
    <div className="player-recipient-picker">
      <label>
        <input type="checkbox" checked={isEveryone} onChange={() => onChange(null)} />
        Everyone
      </label>
      {players.map((player) => (
        <label key={player.playerId}>
          <input
            type="checkbox"
            checked={!isEveryone && value.includes(player.playerId)}
            onChange={() => togglePlayer(player.playerId)}
          />
          {player.name}
        </label>
      ))}
    </div>
  )
}
