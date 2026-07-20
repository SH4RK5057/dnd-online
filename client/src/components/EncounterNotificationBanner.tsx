import type { EncounterNotification } from '../combat/useEncounterNotifications'

/** Shown to every connected user (DM included, harmless there) whenever
 * combat starts on ANY scene, not just the one currently being viewed —
 * covers the split-party case where a player might be looking at a
 * different scene, or a different part of the map, when a fight breaks out
 * elsewhere. See combat/useEncounterNotifications.ts for the "only fire on
 * a genuinely new start" logic. */
export function EncounterNotificationBanner({
  notification,
  isViewingScene,
  onGoToScene,
  onDismiss,
}: {
  notification: EncounterNotification
  isViewingScene: boolean
  onGoToScene: () => void
  onDismiss: () => void
}) {
  return (
    <div className="encounter-notification-banner">
      <span>
        Encounter started on <strong>{notification.sceneName}</strong>!
      </span>
      {!isViewingScene && (
        <button type="button" onClick={onGoToScene}>
          Go to scene
        </button>
      )}
      <button type="button" onClick={onDismiss}>
        Dismiss
      </button>
    </div>
  )
}
