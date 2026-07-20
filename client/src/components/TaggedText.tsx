import { parseTags } from '../content/tagParser'

const CLASS_BY_TYPE: Record<string, string> = {
  dice: 'tagged-text__dice',
  hit: 'tagged-text__dice',
  save: 'tagged-text__ref',
  dc: 'tagged-text__ref',
  condition: 'tagged-text__ref',
  skill: 'tagged-text__ref',
  spell: 'tagged-text__ref',
  item: 'tagged-text__ref',
  creature: 'tagged-text__ref',
  other: 'tagged-text__ref',
}

/** Renders one line of 5etools-tagged text (see content/tagParser.ts) as
 * inline spans with light styling — dice/attack numbers in a code-ish
 * style, cross-references (conditions, skills, spells, items, creatures)
 * subtly highlighted, bold/italic as their HTML equivalents. */
export function TaggedText({ text }: { text: string }) {
  const segments = parseTags(text)
  return (
    <>
      {segments.map((segment, i) => {
        if (segment.type === 'text') return <span key={i}>{segment.text}</span>
        if (segment.type === 'bold') return <strong key={i}>{segment.text}</strong>
        if (segment.type === 'italic') return <em key={i}>{segment.text}</em>
        return (
          <span key={i} className={CLASS_BY_TYPE[segment.type] ?? 'tagged-text__ref'}>
            {segment.text}
          </span>
        )
      })}
    </>
  )
}
