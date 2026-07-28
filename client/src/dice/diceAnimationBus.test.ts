import { describe, expect, it, vi } from 'vitest'
import { subscribeDiceAnimation, triggerDiceAnimation } from './diceAnimationBus'

describe('diceAnimationBus', () => {
  it('notifies a subscribed listener with the triggered event', () => {
    const listener = vi.fn()
    const unsubscribe = subscribeDiceAnimation(listener)
    triggerDiceAnimation({ sides: 20, value: 17 })
    expect(listener).toHaveBeenCalledWith({ sides: 20, value: 17 })
    unsubscribe()
  })

  it('stops notifying after unsubscribe', () => {
    const listener = vi.fn()
    const unsubscribe = subscribeDiceAnimation(listener)
    unsubscribe()
    triggerDiceAnimation({ sides: 6, value: 3 })
    expect(listener).not.toHaveBeenCalled()
  })

  it('notifies multiple independent listeners', () => {
    const a = vi.fn()
    const b = vi.fn()
    const unsubA = subscribeDiceAnimation(a)
    const unsubB = subscribeDiceAnimation(b)
    triggerDiceAnimation({ sides: 8, value: 5 })
    expect(a).toHaveBeenCalledTimes(1)
    expect(b).toHaveBeenCalledTimes(1)
    unsubA()
    unsubB()
  })
})
