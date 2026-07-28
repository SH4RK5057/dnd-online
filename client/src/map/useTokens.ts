import { useCallback, useEffect, useState } from 'react'
import * as Y from 'yjs'
import { publishAsset } from './assetSync'
import { TOKEN_IMAGE_MAX_DIMENSION, TOKEN_IMAGE_QUALITY } from './constants'
import { compressImage } from './imageCompress'
import type { SizeCategory, TokenRecord } from './types'

function tokensMap(doc: Y.Doc) {
  return doc.getMap<TokenRecord>('tokens')
}

export interface CreateTokenInput {
  sceneId: string
  name: string
  sizeCategory: SizeCategory
  x: number
  y: number
  assetId?: string | null
  /** Set only for DM-placed hazard/trap tokens — see TokenRecord.hazardSize. */
  hazardSize?: { widthCells: number; heightCells: number } | null
  /** Hazard tokens are placed hidden by default (reveal-on-trigger); other
   * callers omit this and get the normal `false`. */
  hidden?: boolean
}

export interface UseTokensResult {
  tokens: TokenRecord[]
  createToken: (input: CreateTokenInput) => string
  deleteToken: (tokenId: string) => void
  deleteAllTokens: (sceneId: string) => void
  renameToken: (tokenId: string, name: string) => void
  setTokenSize: (tokenId: string, sizeCategory: SizeCategory) => void
  moveToken: (tokenId: string, x: number, y: number) => void
  setTokenArt: (tokenId: string, file: File) => Promise<void>
  assignOwner: (tokenId: string, ownerId: string | null) => void
  linkCharacter: (tokenId: string, characterId: string | null) => void
  setTokenHp: (tokenId: string, hp: { current: number; max: number; temp: number } | null) => void
  setTokenConditions: (tokenId: string, conditions: string[]) => void
  setTokenInitiative: (tokenId: string, initiative: number | null) => void
  setTokenAc: (tokenId: string, ac: number | null) => void
  setTokenSpeed: (tokenId: string, speed: number | null) => void
  setTokenDescription: (tokenId: string, description: string) => void
  setTokenHidden: (tokenId: string, hidden: boolean) => void
  setTokenZ: (tokenId: string, z: number) => void
  setTokenReactionAvailable: (tokenId: string, available: boolean) => void
  setTokenHazardSize: (tokenId: string, size: { widthCells: number; heightCells: number } | null) => void
  /** Encounter drag-and-drop: one atomic patch initializing HP/AC/speed and
   * recording the compendium source, instead of several separate writes. */
  initTokenFromMonster: (
    tokenId: string,
    fields: { monsterKey: string; hp: { current: number; max: number; temp: number }; ac: number; speed: number },
  ) => void
}

/** Note (same as the rest of this app's DM-authoritative model): Yjs has no
 * enforced write permissions — these setters would work from any peer. Only
 * the DM's UI renders controls that call them; that's a UI convention, not a
 * security boundary. */
export function useTokens(doc: Y.Doc | null, sceneId: string | null): UseTokensResult {
  const [allTokens, setAllTokens] = useState<TokenRecord[]>([])

  useEffect(() => {
    if (!doc) {
      setAllTokens([])
      return
    }
    const tokensM = tokensMap(doc)
    const sync = () => setAllTokens(Array.from(tokensM.values()))
    sync()
    tokensM.observe(sync)
    return () => tokensM.unobserve(sync)
  }, [doc])

  const patchToken = useCallback(
    (tokenId: string, patch: Partial<Omit<TokenRecord, 'id'>>) => {
      if (!doc) return
      const tokensM = tokensMap(doc)
      const token = tokensM.get(tokenId)
      if (!token) return
      tokensM.set(tokenId, { ...token, ...patch })
    },
    [doc],
  )

  const createToken = useCallback(
    (input: CreateTokenInput): string => {
      if (!doc) throw new Error('No active session.')
      const id = crypto.randomUUID()
      const record: TokenRecord = {
        id,
        sceneId: input.sceneId,
        name: input.name,
        assetId: input.assetId ?? null,
        sizeCategory: input.sizeCategory,
        x: input.x,
        y: input.y,
        ownerId: null,
        characterId: null,
        hp: null,
        conditions: [],
        initiative: null,
        monsterKey: null,
        ac: null,
        speed: null,
        description: '',
        hidden: input.hidden ?? false,
        z: 0,
        reactionAvailable: true,
        hazardSize: input.hazardSize ?? null,
        createdAt: Date.now(),
      }
      tokensMap(doc).set(id, record)
      return id
    },
    [doc],
  )

  const deleteToken = useCallback(
    (tokenId: string) => {
      if (!doc) return
      tokensMap(doc).delete(tokenId)
    },
    [doc],
  )

  const deleteAllTokens = useCallback(
    (sceneId: string) => {
      if (!doc) return
      const tokensM = tokensMap(doc)
      doc.transact(() => {
        tokensM.forEach((token, tokenId) => {
          if (token.sceneId === sceneId) tokensM.delete(tokenId)
        })
      })
    },
    [doc],
  )

  const renameToken = useCallback((tokenId: string, name: string) => patchToken(tokenId, { name }), [patchToken])
  const setTokenSize = useCallback(
    (tokenId: string, sizeCategory: SizeCategory) => patchToken(tokenId, { sizeCategory }),
    [patchToken],
  )
  const moveToken = useCallback((tokenId: string, x: number, y: number) => patchToken(tokenId, { x, y }), [patchToken])
  const assignOwner = useCallback(
    (tokenId: string, ownerId: string | null) => patchToken(tokenId, { ownerId }),
    [patchToken],
  )
  const linkCharacter = useCallback(
    (tokenId: string, characterId: string | null) => patchToken(tokenId, { characterId }),
    [patchToken],
  )
  const setTokenHp = useCallback(
    (tokenId: string, hp: { current: number; max: number; temp: number } | null) => patchToken(tokenId, { hp }),
    [patchToken],
  )
  const setTokenConditions = useCallback(
    (tokenId: string, conditions: string[]) => patchToken(tokenId, { conditions }),
    [patchToken],
  )
  const setTokenInitiative = useCallback(
    (tokenId: string, initiative: number | null) => patchToken(tokenId, { initiative }),
    [patchToken],
  )
  const setTokenAc = useCallback((tokenId: string, ac: number | null) => patchToken(tokenId, { ac }), [patchToken])
  const setTokenSpeed = useCallback((tokenId: string, speed: number | null) => patchToken(tokenId, { speed }), [patchToken])
  const setTokenDescription = useCallback(
    (tokenId: string, description: string) => patchToken(tokenId, { description }),
    [patchToken],
  )
  const setTokenHidden = useCallback((tokenId: string, hidden: boolean) => patchToken(tokenId, { hidden }), [patchToken])
  const setTokenZ = useCallback((tokenId: string, z: number) => patchToken(tokenId, { z }), [patchToken])
  const setTokenReactionAvailable = useCallback(
    (tokenId: string, available: boolean) => patchToken(tokenId, { reactionAvailable: available }),
    [patchToken],
  )
  const setTokenHazardSize = useCallback(
    (tokenId: string, size: { widthCells: number; heightCells: number } | null) => patchToken(tokenId, { hazardSize: size }),
    [patchToken],
  )
  const initTokenFromMonster = useCallback(
    (
      tokenId: string,
      fields: { monsterKey: string; hp: { current: number; max: number; temp: number }; ac: number; speed: number },
    ) => patchToken(tokenId, fields),
    [patchToken],
  )

  const setTokenArt = useCallback(
    async (tokenId: string, file: File) => {
      if (!doc) return
      const compressed = await compressImage(file, { maxDimension: TOKEN_IMAGE_MAX_DIMENSION, quality: TOKEN_IMAGE_QUALITY })
      const { assetId } = await publishAsset(doc, 'token', compressed.blob, compressed)
      patchToken(tokenId, { assetId })
    },
    [doc, patchToken],
  )

  const tokens = sceneId ? allTokens.filter((t) => t.sceneId === sceneId) : []

  return {
    tokens,
    createToken,
    deleteToken,
    deleteAllTokens,
    renameToken,
    setTokenSize,
    moveToken,
    setTokenArt,
    assignOwner,
    linkCharacter,
    setTokenHp,
    setTokenConditions,
    setTokenInitiative,
    setTokenAc,
    setTokenSpeed,
    setTokenDescription,
    setTokenHidden,
    setTokenZ,
    setTokenReactionAvailable,
    setTokenHazardSize,
    initTokenFromMonster,
  }
}

/** Every token across every scene in this doc, unfiltered — for consumers
 * (e.g. RollLog's attack-damage application) that need to look up a token
 * by id without already knowing which scene it's on. The setter functions
 * from useTokens work regardless of the sceneId passed to it (patchToken
 * only ever looks a token up by id), so callers needing both reads and
 * writes across scenes can pair this with `useTokens(doc, null)`. */
export function useAllTokens(doc: Y.Doc | null): TokenRecord[] {
  const [allTokens, setAllTokens] = useState<TokenRecord[]>([])

  useEffect(() => {
    if (!doc) {
      setAllTokens([])
      return
    }
    const tokensM = tokensMap(doc)
    const sync = () => setAllTokens(Array.from(tokensM.values()))
    sync()
    tokensM.observe(sync)
    return () => tokensM.unobserve(sync)
  }, [doc])

  return allTokens
}
