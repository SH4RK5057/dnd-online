import { useEffect, useState } from 'react'
import { subscribeDiceAnimation, type DiceAnimationEvent } from '../dice/diceAnimationBus'

const VISIBLE_MS = 1400

/**
 * Purely cosmetic — a stylized CSS 3D die tumbles for ~900ms then reveals
 * the real rolled value (never a separate fake number). Mounted once
 * (screens/SessionScreen.tsx); see dice/diceAnimationBus.ts for why this
 * only ever plays for the roller's own client, not broadcast to everyone.
 * `key={active.key}` forces a fresh DOM node per roll so the CSS animation
 * restarts instead of no-oping on an already-settled element.
 */
export function DiceOverlay() {
  const [active, setActive] = useState<(DiceAnimationEvent & { key: number }) | null>(null)

  useEffect(() => {
    let counter = 0
    return subscribeDiceAnimation((event) => {
      counter += 1
      setActive({ ...event, key: counter })
    })
  }, [])

  useEffect(() => {
    if (!active) return
    const timer = setTimeout(() => setActive(null), VISIBLE_MS)
    return () => clearTimeout(timer)
  }, [active])

  if (!active) return null

  return (
    <div className="dice-overlay" aria-hidden="true">
      <div className="dice3d" key={active.key}>
        <div className="dice3d__cube">
          <div className="dice3d__face dice3d__face--front" />
          <div className="dice3d__face dice3d__face--back" />
          <div className="dice3d__face dice3d__face--right" />
          <div className="dice3d__face dice3d__face--left" />
          <div className="dice3d__face dice3d__face--top" />
          <div className="dice3d__face dice3d__face--bottom" />
        </div>
        <div className="dice3d__result">
          <span className="dice3d__value">{active.value}</span>
          <span className="dice3d__sides">d{active.sides}</span>
        </div>
      </div>
    </div>
  )
}
