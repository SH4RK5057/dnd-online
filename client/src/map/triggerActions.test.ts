import { describe, expect, it, vi } from 'vitest'
import { applyTriggerActions, shouldTriggerFire } from './triggerActions'
import type { AreaEffect } from './areaEffects'

function makeCtx() {
  return {
    toggleDoor: vi.fn(),
    revealToken: vi.fn(),
    spawnToken: vi.fn(),
    applyEffect: vi.fn(),
  }
}

const effect: AreaEffect = { damageDice: '1d6', savingThrow: 'dex', saveDc: 12, savingThrowEffect: 'half' }

describe('applyTriggerActions', () => {
  it('calls toggleDoor with the action wallId/open', () => {
    const ctx = makeCtx()
    applyTriggerActions([{ type: 'toggleDoor', wallId: 'w1', open: true }], ctx)
    expect(ctx.toggleDoor).toHaveBeenCalledWith('w1', true)
    expect(ctx.revealToken).not.toHaveBeenCalled()
    expect(ctx.spawnToken).not.toHaveBeenCalled()
    expect(ctx.applyEffect).not.toHaveBeenCalled()
  })

  it('calls revealToken with the action tokenId', () => {
    const ctx = makeCtx()
    applyTriggerActions([{ type: 'revealToken', tokenId: 't1' }], ctx)
    expect(ctx.revealToken).toHaveBeenCalledWith('t1')
  })

  it('calls spawnToken with the action monsterKey/x/y', () => {
    const ctx = makeCtx()
    applyTriggerActions([{ type: 'spawnToken', monsterKey: 'srd:goblin', x: 3, y: 4 }], ctx)
    expect(ctx.spawnToken).toHaveBeenCalledWith('srd:goblin', 3, 4)
  })

  it('calls applyEffect with the action effect', () => {
    const ctx = makeCtx()
    applyTriggerActions([{ type: 'applyEffect', effect }], ctx)
    expect(ctx.applyEffect).toHaveBeenCalledWith(effect)
  })

  it('runs every action in sequence for a multi-action trigger', () => {
    const ctx = makeCtx()
    applyTriggerActions(
      [
        { type: 'toggleDoor', wallId: 'w1', open: true },
        { type: 'spawnToken', monsterKey: 'srd:goblin', x: 1, y: 2 },
      ],
      ctx,
    )
    expect(ctx.toggleDoor).toHaveBeenCalledTimes(1)
    expect(ctx.spawnToken).toHaveBeenCalledTimes(1)
  })

  it('is a no-op for an empty action list', () => {
    const ctx = makeCtx()
    applyTriggerActions([], ctx)
    expect(ctx.toggleDoor).not.toHaveBeenCalled()
    expect(ctx.revealToken).not.toHaveBeenCalled()
    expect(ctx.spawnToken).not.toHaveBeenCalled()
    expect(ctx.applyEffect).not.toHaveBeenCalled()
  })
})

describe('shouldTriggerFire', () => {
  it('always fires when not oneShot, regardless of firedAt', () => {
    expect(shouldTriggerFire({ oneShot: false, firedAt: null })).toBe(true)
    expect(shouldTriggerFire({ oneShot: false, firedAt: 12345 })).toBe(true)
  })

  it('fires exactly once when oneShot: true until firedAt', () => {
    expect(shouldTriggerFire({ oneShot: true, firedAt: null })).toBe(true)
    expect(shouldTriggerFire({ oneShot: true, firedAt: 12345 })).toBe(false)
  })
})
