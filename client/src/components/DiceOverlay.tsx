import { useEffect, useState } from 'react'
import { subscribeDiceAnimation, type DiceAnimationEvent } from '../dice/diceAnimationBus'

const VISIBLE_MS = 1400

/**
 * A true 6-face CSS cube (below) already gives d6 a genuinely 3D look, but
 * building accurate multi-face geometry for every other polyhedron in pure
 * CSS isn't practical (a real d20 needs 20 correctly-angled triangles).
 * Instead, every other die type gets a distinct flat clip-path silhouette
 * — not geometrically exact, but immediately recognizable as "a different
 * die than last time" at a glance, which is what this is actually for.
 * Falls back to the cube shape (empty string, unused) for 6 and anything
 * unrecognized.
 */
function diceClipPath(sides: number): string | null {
  switch (sides) {
    case 4:
      return 'polygon(50% 0%, 100% 100%, 0% 100%)' // tetrahedron
    case 8:
      return 'polygon(50% 0%, 100% 50%, 50% 100%, 0% 50%)' // octahedron
    case 10:
    case 100:
      return 'polygon(50% 0%, 100% 38%, 82% 100%, 18% 100%, 0% 38%)' // pentagonal trapezohedron
    case 12:
      return 'polygon(25% 0%, 75% 0%, 100% 50%, 75% 100%, 25% 100%, 0% 50%)' // dodecahedron
    case 20:
      return 'polygon(30% 0%, 70% 0%, 100% 30%, 100% 70%, 70% 100%, 30% 100%, 0% 70%, 0% 30%)' // icosahedron
    default:
      return null
  }
}

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

  const clipPath = diceClipPath(active.sides)

  return (
    <div className="dice-overlay" aria-hidden="true">
      <div className="dice3d" key={active.key}>
        {clipPath ? (
          <div className="dice3d__poly" style={{ clipPath }} />
        ) : (
          <div className="dice3d__cube">
            <div className="dice3d__face dice3d__face--front" />
            <div className="dice3d__face dice3d__face--back" />
            <div className="dice3d__face dice3d__face--right" />
            <div className="dice3d__face dice3d__face--left" />
            <div className="dice3d__face dice3d__face--top" />
            <div className="dice3d__face dice3d__face--bottom" />
          </div>
        )}
        <div className="dice3d__result">
          <span className="dice3d__value">{active.value}</span>
          <span className="dice3d__sides">d{active.sides}</span>
        </div>
      </div>
    </div>
  )
}
