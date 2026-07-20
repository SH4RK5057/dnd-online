import { describe, expect, it } from 'vitest'
import { computeInitiativeOrder, groupMonsterTokensByName, nextTurn } from './rules'
import type { TokenRecord } from '../map/types'

function token(overrides: Partial<TokenRecord>): TokenRecord {
  return {
    id: 't1',
    sceneId: 's1',
    name: 'Token',
    assetId: null,
    sizeCategory: 'medium',
    x: 0,
    y: 0,
    ownerId: null,
    characterId: null,
    hp: null,
    conditions: [],
    initiative: null,
    monsterKey: null,
    ac: null,
    speed: null,
    description: '',
    createdAt: 0,
    ...overrides,
  }
}

describe('computeInitiativeOrder', () => {
  it('sorts descending by initiative and excludes tokens with no initiative rolled', () => {
    const tokens = [
      token({ id: 'a', initiative: 10 }),
      token({ id: 'b', initiative: 18 }),
      token({ id: 'c', initiative: null }),
      token({ id: 'd', initiative: 18 }),
    ]
    const order = computeInitiativeOrder(tokens)
    expect(order.map((t) => t.id)).toEqual(['b', 'd', 'a']) // b/d tie at 18, broken by id
  })
})

describe('nextTurn', () => {
  const tokens = [
    token({ id: 'a', initiative: 20 }),
    token({ id: 'b', initiative: 15 }),
    token({ id: 'c', initiative: 5 }),
  ]

  it('advances to the next token in initiative order without incrementing the round', () => {
    expect(nextTurn(tokens, 'a')).toEqual({ nextTokenId: 'b', roundIncremented: false })
    expect(nextTurn(tokens, 'b')).toEqual({ nextTokenId: 'c', roundIncremented: false })
  })

  it('wraps back to the top and increments the round', () => {
    expect(nextTurn(tokens, 'c')).toEqual({ nextTokenId: 'a', roundIncremented: true })
  })

  it('restarts at the top without incrementing the round if the current token is gone', () => {
    expect(nextTurn(tokens, 'does-not-exist')).toEqual({ nextTokenId: 'a', roundIncremented: false })
  })

  it('returns a null next token when nobody has initiative', () => {
    expect(nextTurn([token({ id: 'a', initiative: null })], null)).toEqual({ nextTokenId: null, roundIncremented: false })
  })
})

describe('groupMonsterTokensByName', () => {
  it('groups unowned tokens by name and excludes player-owned tokens', () => {
    const tokens = [
      token({ id: 'a', name: 'Goblin', ownerId: null }),
      token({ id: 'b', name: 'Goblin', ownerId: null }),
      token({ id: 'c', name: 'Orc', ownerId: null }),
      token({ id: 'd', name: 'Hero', ownerId: 'p1' }),
    ]
    const groups = groupMonsterTokensByName(tokens)
    expect(groups.get('Goblin')?.map((t) => t.id)).toEqual(['a', 'b'])
    expect(groups.get('Orc')?.map((t) => t.id)).toEqual(['c'])
    expect(groups.has('Hero')).toBe(false)
  })
})
