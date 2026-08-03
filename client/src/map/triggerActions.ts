import type { AreaEffect } from './areaEffects'
import type { TriggerAction, TriggerRecord } from './types'

export interface TriggerActionContext {
  toggleDoor: (wallId: string, open: boolean) => void
  revealToken: (tokenId: string) => void
  spawnToken: (monsterKey: string, x: number, y: number) => void
  applyEffect: (effect: AreaEffect) => void
}

/**
 * Executes a trigger's actions in sequence against injected callbacks —
 * kept as a plain function over a context object (not a hook) so it's
 * unit-testable without a live Yjs doc. The caller (canvas/MapCanvas.tsx)
 * composes each callback from whichever hook actually owns that mutation
 * (useWalls' toggleDoor, useTokens' setTokenHidden/createToken, map/
 * areaEffects.ts's resolveAreaEffect) — this function only dispatches.
 */
export function applyTriggerActions(actions: TriggerAction[], ctx: TriggerActionContext): void {
  for (const action of actions) {
    switch (action.type) {
      case 'toggleDoor':
        ctx.toggleDoor(action.wallId, action.open)
        break
      case 'revealToken':
        ctx.revealToken(action.tokenId)
        break
      case 'spawnToken':
        ctx.spawnToken(action.monsterKey, action.x, action.y)
        break
      case 'applyEffect':
        ctx.applyEffect(action.effect)
        break
    }
  }
}

/** Whether a trigger should fire on a fresh overlap right now: a `oneShot`
 * trigger only ever fires once (gated by `firedAt`); a non-`oneShot`
 * trigger fires again on every fresh entry. */
export function shouldTriggerFire(trigger: Pick<TriggerRecord, 'oneShot' | 'firedAt'>): boolean {
  return !trigger.oneShot || trigger.firedAt === null
}
