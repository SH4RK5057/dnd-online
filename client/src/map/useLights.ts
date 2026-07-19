import { useCallback, useEffect, useState } from 'react'
import * as Y from 'yjs'
import { DEFAULT_LIGHT_COLOR, DEFAULT_LIGHT_RADIUS_CELLS } from './constants'
import type { LightRecord } from './types'

function lightsMap(doc: Y.Doc) {
  return doc.getMap<LightRecord>('lights')
}

export interface CreateLightInput {
  sceneId: string
  x: number
  y: number
  radius?: number
  color?: number
  attachedTokenId?: string | null
}

export interface UseLightsResult {
  lights: LightRecord[]
  createLight: (input: CreateLightInput) => string
  moveLight: (lightId: string, x: number, y: number) => void
  setLightRadius: (lightId: string, radius: number) => void
  setLightColor: (lightId: string, color: number) => void
  setLightEnabled: (lightId: string, enabled: boolean) => void
  attachLightToToken: (lightId: string, tokenId: string) => void
  detachLight: (lightId: string) => void
  deleteLight: (lightId: string) => void
}

/** Same DM-authoritative-by-convention note as useTokens.ts/useWalls.ts. */
export function useLights(doc: Y.Doc | null, sceneId: string | null): UseLightsResult {
  const [allLights, setAllLights] = useState<LightRecord[]>([])

  useEffect(() => {
    if (!doc) {
      setAllLights([])
      return
    }
    const lightsM = lightsMap(doc)
    const sync = () => setAllLights(Array.from(lightsM.values()))
    sync()
    lightsM.observe(sync)
    return () => lightsM.unobserve(sync)
  }, [doc])

  const patchLight = useCallback(
    (lightId: string, patch: Partial<Omit<LightRecord, 'id'>>) => {
      if (!doc) return
      const lightsM = lightsMap(doc)
      const light = lightsM.get(lightId)
      if (!light) return
      lightsM.set(lightId, { ...light, ...patch })
    },
    [doc],
  )

  const createLight = useCallback(
    (input: CreateLightInput): string => {
      if (!doc) throw new Error('No active session.')
      const id = crypto.randomUUID()
      const record: LightRecord = {
        id,
        sceneId: input.sceneId,
        x: input.x,
        y: input.y,
        radius: input.radius ?? DEFAULT_LIGHT_RADIUS_CELLS,
        color: input.color ?? DEFAULT_LIGHT_COLOR,
        attachedTokenId: input.attachedTokenId ?? null,
        enabled: true,
        createdAt: Date.now(),
      }
      lightsMap(doc).set(id, record)
      return id
    },
    [doc],
  )

  const moveLight = useCallback((lightId: string, x: number, y: number) => patchLight(lightId, { x, y }), [patchLight])
  const setLightRadius = useCallback((lightId: string, radius: number) => patchLight(lightId, { radius }), [patchLight])
  const setLightColor = useCallback((lightId: string, color: number) => patchLight(lightId, { color }), [patchLight])
  const setLightEnabled = useCallback(
    (lightId: string, enabled: boolean) => patchLight(lightId, { enabled }),
    [patchLight],
  )
  const attachLightToToken = useCallback(
    (lightId: string, tokenId: string) => patchLight(lightId, { attachedTokenId: tokenId }),
    [patchLight],
  )
  const detachLight = useCallback((lightId: string) => patchLight(lightId, { attachedTokenId: null }), [patchLight])

  const deleteLight = useCallback(
    (lightId: string) => {
      if (!doc) return
      lightsMap(doc).delete(lightId)
    },
    [doc],
  )

  const lights = sceneId ? allLights.filter((l) => l.sceneId === sceneId) : []

  return {
    lights,
    createLight,
    moveLight,
    setLightRadius,
    setLightColor,
    setLightEnabled,
    attachLightToToken,
    detachLight,
    deleteLight,
  }
}
