export interface DiceAnimationEvent {
  /** The number of sides on the die being shown — just a label under the
   * animated die (e.g. "d20"), not used to pick a face shape. */
  sides: number
  /** The real, already-rolled value to reveal once the die settles — never
   * a separate fake/random number, always what actually got logged. */
  value: number
}

type Listener = (event: DiceAnimationEvent) => void

const listeners = new Set<Listener>()

/** Local-only pub/sub for the 3D dice-roll flourish (components/DiceOverlay.tsx)
 * — deliberately not synced through the Yjs doc. It fires once, synchronously,
 * for whoever's own action just rolled (see dice/useRollLog.ts pushRoll),
 * so only the roller's own browser tab ever sees their die tumble; other
 * connected clients still see the result land in the shared roll log as
 * before, just without the animation. Keeping it local-only sidesteps
 * P2P sync-timing questions (who "owns" playing the animation, what happens
 * if it arrives out of order) for a purely cosmetic feature. */
export function subscribeDiceAnimation(listener: Listener): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function triggerDiceAnimation(event: DiceAnimationEvent): void {
  for (const listener of listeners) listener(event)
}
