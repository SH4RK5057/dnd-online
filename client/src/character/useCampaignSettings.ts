import { useCallback, useEffect, useState } from 'react'
import * as Y from 'yjs'

const SETTINGS_KEY = 'settings'

export interface CampaignSettingsRecord {
  /** Whether players can trigger a short/long rest right now — a DM might
   * temporarily disable this mid-encounter or during a tense scene where
   * "just rest it off" shouldn't be available. Read as `?? true` so a
   * campaign that predates this field defaults to allowed. */
  restsEnabled: boolean
  /** When true, a weapon attack roll immediately compares its total to the
   * target's AC and sets hit/miss itself; when false, the DM decides hit or
   * miss manually from the roll log. Read as `?? true` so a campaign that
   * predates this field defaults to auto-resolving. */
  autoResolveAttacksEnabled: boolean
}

function settingsMap(doc: Y.Doc) {
  return doc.getMap<CampaignSettingsRecord>('campaignSettings')
}

function defaultSettings(): CampaignSettingsRecord {
  return { restsEnabled: true, autoResolveAttacksEnabled: true }
}

export interface UseCampaignSettingsResult {
  settings: CampaignSettingsRecord
  setRestsEnabled: (enabled: boolean) => void
  setAutoResolveAttacksEnabled: (enabled: boolean) => void
}

/** Campaign-wide DM preferences that don't belong to any single scene or
 * character — currently just the rests-enabled toggle, a singleton record
 * (unlike every other domain in this app, which is a collection). */
export function useCampaignSettings(doc: Y.Doc | null): UseCampaignSettingsResult {
  const [settings, setSettings] = useState<CampaignSettingsRecord>(defaultSettings())

  useEffect(() => {
    if (!doc) {
      setSettings(defaultSettings())
      return
    }
    const m = settingsMap(doc)
    const sync = () => setSettings({ ...defaultSettings(), ...m.get(SETTINGS_KEY) })
    sync()
    m.observe(sync)
    return () => m.unobserve(sync)
  }, [doc])

  const setRestsEnabled = useCallback(
    (enabled: boolean) => {
      if (!doc) return
      const m = settingsMap(doc)
      m.set(SETTINGS_KEY, { ...defaultSettings(), ...m.get(SETTINGS_KEY), restsEnabled: enabled })
    },
    [doc],
  )

  const setAutoResolveAttacksEnabled = useCallback(
    (enabled: boolean) => {
      if (!doc) return
      const m = settingsMap(doc)
      m.set(SETTINGS_KEY, { ...defaultSettings(), ...m.get(SETTINGS_KEY), autoResolveAttacksEnabled: enabled })
    },
    [doc],
  )

  return { settings, setRestsEnabled, setAutoResolveAttacksEnabled }
}
