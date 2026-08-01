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
  /** When true, a hidden token with a set perceptionDc auto-reveals itself
   * to a player the moment their passive Perception would beat that DC as
   * their live sight reaches it (see canvas/MapCanvas.tsx's fog effect).
   * Read as `?? false` so a campaign that predates this field defaults to
   * off — auto-revealing hidden things is a bigger behavior change than the
   * other defaults-on toggles, so this one opts in instead. */
  passivePerceptionEnabled: boolean
  /** Highest level a character can level up to in this campaign, or null
   * for no cap (the default). Doesn't retroactively lower an
   * already-higher-level character — it only gates the level-up wizard
   * from advancing further (see CharacterSheet.tsx's canLevelUp). */
  levelCap: number | null
}

function settingsMap(doc: Y.Doc) {
  return doc.getMap<CampaignSettingsRecord>('campaignSettings')
}

function defaultSettings(): CampaignSettingsRecord {
  return { restsEnabled: true, autoResolveAttacksEnabled: true, passivePerceptionEnabled: false, levelCap: null }
}

export interface UseCampaignSettingsResult {
  settings: CampaignSettingsRecord
  setRestsEnabled: (enabled: boolean) => void
  setAutoResolveAttacksEnabled: (enabled: boolean) => void
  setPassivePerceptionEnabled: (enabled: boolean) => void
  setLevelCap: (cap: number | null) => void
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

  const setPassivePerceptionEnabled = useCallback(
    (enabled: boolean) => {
      if (!doc) return
      const m = settingsMap(doc)
      m.set(SETTINGS_KEY, { ...defaultSettings(), ...m.get(SETTINGS_KEY), passivePerceptionEnabled: enabled })
    },
    [doc],
  )

  const setLevelCap = useCallback(
    (cap: number | null) => {
      if (!doc) return
      const m = settingsMap(doc)
      const clamped = cap === null ? null : Math.max(1, Math.min(20, Math.round(cap)))
      m.set(SETTINGS_KEY, { ...defaultSettings(), ...m.get(SETTINGS_KEY), levelCap: clamped })
    },
    [doc],
  )

  return { settings, setRestsEnabled, setAutoResolveAttacksEnabled, setPassivePerceptionEnabled, setLevelCap }
}
