/** Small hand-drawn inline SVG icons for the map tool rail (MapToolRail.tsx)
 * and the fullscreen toggle — kept as plain inline SVG rather than an icon
 * library dependency, since this app has no other npm dependency for
 * something this small. All use `currentColor` so they pick up the button's
 * text color (and therefore the light/dark theme) automatically. */
import type { SVGProps } from 'react'

function Svg(props: SVGProps<SVGSVGElement>) {
  return <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" focusable="false" {...props} />
}

export function MoveIcon() {
  return (
    <Svg fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 2v20M2 12h20M12 2l-2.5 2.5M12 2l2.5 2.5M12 22l-2.5-2.5M12 22l2.5-2.5M2 12l2.5-2.5M2 12l2.5 2.5M22 12l-2.5-2.5M22 12l-2.5 2.5" />
    </Svg>
  )
}

export function WallIcon() {
  return (
    <Svg fill="currentColor">
      <path d="M3 21V10h3V7h3v3h3V7h3v3h3V7h3v3h3v11H3z" />
    </Svg>
  )
}

export function TorchIcon() {
  return (
    <Svg fill="currentColor">
      <path d="M12 2c-3 3.6-5 6.6-5 9.5a5 5 0 0 0 10 0c0-1.3-.4-2.3-1.2-3.2.1.9-.3 1.7-1 2.1.4-1.8-.4-3.3-1.9-4.1.3 1-.1 1.6-.5 1.9C13 6.5 12.6 4.4 12 2z" />
      <rect x="10.6" y="19" width="2.8" height="3" rx="0.5" />
    </Svg>
  )
}

export function TokenPawnIcon() {
  return (
    <Svg fill="currentColor">
      <circle cx="12" cy="6" r="2.6" />
      <path d="M9.2 11.5a4 4 0 0 1 5.6 0c.9.9 1.2 2 1 3.1-.2 1-.9 1.8-1.8 2.2 1.8.9 3 2.7 3 4.7v.5H8v-.5c0-2 1.2-3.8 3-4.7-.9-.4-1.6-1.2-1.8-2.2-.2-1.1.1-2.2 1-3.1z" />
    </Svg>
  )
}

export function QuillIcon() {
  return (
    <Svg fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round">
      <path d="M20 4c-6 .5-12.5 3.5-14.5 11.5-.4 1.6-1.2 2.8-2.5 3.5 2.8.8 5.3-.2 6.7-2 1.3-1.7 1.8-3 1.8-3s2.3.6 4.3-1C19.3 10.2 20.6 6.7 20 4Z" />
      <path d="M9.5 14.5 4.5 19.5" />
    </Svg>
  )
}

export function FullscreenEnterIcon() {
  return (
    <Svg fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" />
    </Svg>
  )
}

export function FullscreenExitIcon() {
  return (
    <Svg fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 4v5H4M15 4v5h5M9 20v-5H4M15 20v-5h5" />
    </Svg>
  )
}
