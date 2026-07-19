const DEFAULT_SIGNALING_URLS = ['ws://localhost:4444']

export const SIGNALING_URLS: string[] =
  import.meta.env.VITE_SIGNALING_URLS?.split(',')
    .map((url) => url.trim())
    .filter(Boolean) ?? DEFAULT_SIGNALING_URLS

export const PROTOCOL_VERSION = 1
export const JOIN_CODE_LENGTH = 6

/** How long to wait after entering 'connecting' before declaring failure. */
export const CONNECT_TIMEOUT_MS = 18_000
/** How long a peer that drops can stay in 'reconnecting' before being removed from the roster. */
export const RECONNECT_GRACE_MS = 8_000
