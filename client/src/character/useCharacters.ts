import { useCallback, useEffect, useState } from 'react'
import * as Y from 'yjs'
import type { CharacterRecord } from './types'
import { emptyAbilityScores, normalizeCharacterRecord } from './rules'

function charactersMap(doc: Y.Doc) {
  return doc.getMap<CharacterRecord>('characters')
}

export interface UseCharactersResult {
  /** Every character bound to this campaign (this doc), regardless of owner. */
  characters: CharacterRecord[]
  /** This viewer's own character in this campaign, if any — the "auto-reconnect
   * to assigned campaign character" behavior is just this: nothing special
   * happens on rejoin, the record is already in the doc and this still finds it. */
  myCharacter: (playerId: string) => CharacterRecord | null
  /** Clones a standalone character (see standaloneStorage.ts) into this
   * campaign's doc, locked so its blueprint can't be edited mid-session. */
  bindCharacter: (standalone: CharacterRecord, ownerId: string, campaignId: string) => string
  updateCharacter: (characterId: string, patch: Partial<Omit<CharacterRecord, 'id'>>) => void
  deleteCharacter: (characterId: string) => void
  reassignOwner: (characterId: string, ownerId: string) => void
}

/** Note (same as the rest of this app's DM-authoritative model): Yjs has no
 * enforced write permissions — these setters would work from any peer. Only
 * the DM's or the owning player's UI renders controls that call them; that's
 * a UI convention, not a security boundary. */
export function useCharacters(doc: Y.Doc | null): UseCharactersResult {
  const [characters, setCharacters] = useState<CharacterRecord[]>([])

  useEffect(() => {
    if (!doc) {
      setCharacters([])
      return
    }
    const charactersM = charactersMap(doc)
    const sync = () => setCharacters(Array.from(charactersM.values()).map(normalizeCharacterRecord))
    sync()
    charactersM.observe(sync)
    return () => charactersM.unobserve(sync)
  }, [doc])

  const myCharacter = useCallback(
    (playerId: string) => characters.find((c) => c.ownerId === playerId) ?? null,
    [characters],
  )

  const bindCharacter = useCallback(
    (standalone: CharacterRecord, ownerId: string, campaignId: string): string => {
      if (!doc) throw new Error('No active session.')
      const id = crypto.randomUUID()
      const record: CharacterRecord = normalizeCharacterRecord({
        ...standalone,
        id,
        ownerId,
        campaignId,
        locked: true,
        createdAt: Date.now(),
      })
      charactersMap(doc).set(id, record)
      return id
    },
    [doc],
  )

  const updateCharacter = useCallback(
    (characterId: string, patch: Partial<Omit<CharacterRecord, 'id'>>) => {
      if (!doc) return
      const charactersM = charactersMap(doc)
      const character = charactersM.get(characterId)
      if (!character) return
      charactersM.set(characterId, { ...character, ...patch })
    },
    [doc],
  )

  const deleteCharacter = useCallback(
    (characterId: string) => {
      if (!doc) return
      charactersMap(doc).delete(characterId)
    },
    [doc],
  )

  const reassignOwner = useCallback(
    (characterId: string, ownerId: string) => updateCharacter(characterId, { ownerId }),
    [updateCharacter],
  )

  return { characters, myCharacter, bindCharacter, updateCharacter, deleteCharacter, reassignOwner }
}

export function newBlankCharacter(ownerId: string, name: string): CharacterRecord {
  return {
    id: crypto.randomUUID(),
    ownerId,
    campaignId: null,
    locked: false,
    name,
    race: '',
    className: '',
    level: 1,
    background: '',
    alignment: '',
    abilities: emptyAbilityScores(),
    abilityMethod: 'manual',
    baseAbilities: emptyAbilityScores(),
    saveProficiencies: { str: false, dex: false, con: false, int: false, wis: false, cha: false },
    skillProficiencies: {},
    ac: 10,
    initiativeBonus: 0,
    speed: 30,
    hp: { max: 10, current: 10, temp: 0 },
    hitDice: '1d8',
    hitDiceUsed: 0,
    inventory: [],
    spellSlotsByLevel: [],
    spellSlotsUsedByLevel: [],
    resources: [],
    spells: [],
    feats: [],
    createdAt: Date.now(),
  }
}
