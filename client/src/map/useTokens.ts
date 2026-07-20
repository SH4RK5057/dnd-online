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
  }
}
