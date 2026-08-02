import type { BroadcastRecord } from '../dmtools/types'
import type { CompendiumEntry } from '../content/types'
import { StatBlockCard } from './StatBlockCard'

/** Shown to every connected user (DM included, harmless there — same
 * convention as EncounterNotificationBanner) the moment the DM sends a new
 * broadcast, wherever they're currently looking. `monsterEntry` is resolved
 * by the caller (findByKey against the compendium) since this component
 * doesn't have doc/compendium access itself. */
export function BroadcastNotificationBanner({
  notification,
  monsterEntry,
  onDismiss,
}: {
  notification: BroadcastRecord
  monsterEntry: CompendiumEntry | null
  onDismiss: () => void
}) {
  return (
    <div className="broadcast-notification-banner">
      <div className="broadcast-notification-banner__header">
        <strong>DM broadcast</strong>
        <button type="button" onClick={onDismiss}>
          Dismiss
        </button>
      </div>
      {notification.text && <p>{notification.text}</p>}
      {monsterEntry && <StatBlockCard entry={monsterEntry} />}
    </div>
  )
}
