/** Parses 5etools' inline `{@tag content|options}` markup into renderable
 * segments. Not a full-fidelity clone of 5etools' own renderer (that syntax
 * has many special cases across content versions) — covers the common tags
 * likely to appear in SRD-derived and homebrew text (dice/damage rolls,
 * conditions, skills, cross-references, bold/italic), and falls back to
 * "first pipe-segment as display text" for anything else so unrecognized
 * tags still degrade to readable text instead of raw markup leaking through. */

export type TagSegmentType =
  | 'text'
  | 'dice'
  | 'damage'
  | 'save'
  | 'dc'
  | 'hit'
  | 'condition'
  | 'skill'
  | 'spell'
  | 'item'
  | 'creature'
  | 'bold'
  | 'italic'
  | 'other'

export interface TagSegment {
  type: TagSegmentType
  text: string
}

const TAG_TYPE_MAP: Record<string, TagSegmentType> = {
  dice: 'dice',
  damage: 'dice',
  d20: 'dice',
  hit: 'hit',
  atk: 'hit',
  save: 'save',
  savingThrow: 'save',
  actSave: 'save',
  dc: 'dc',
  condition: 'condition',
  status: 'condition',
  skill: 'skill',
  spell: 'spell',
  item: 'item',
  creature: 'creature',
  b: 'bold',
  bold: 'bold',
  i: 'italic',
  italic: 'italic',
}

const TAG_RE = /\{@(\w+)\s+([^}]*)\}/g

/** Splits `text` into alternating plain-text and tag segments, in order. */
export function parseTags(text: string): TagSegment[] {
  const segments: TagSegment[] = []
  let lastIndex = 0
  TAG_RE.lastIndex = 0
  let match: RegExpExecArray | null
  while ((match = TAG_RE.exec(text))) {
    if (match.index > lastIndex) {
      segments.push({ type: 'text', text: text.slice(lastIndex, match.index) })
    }
    const [, tagName, content] = match
    const displayText = content.split('|')[0].trim()
    const type = TAG_TYPE_MAP[tagName] ?? 'other'
    segments.push({ type, text: formatSegmentText(type, tagName, displayText) })
    lastIndex = match.index + match[0].length
  }
  if (lastIndex < text.length) {
    segments.push({ type: 'text', text: text.slice(lastIndex) })
  }
  return segments
}

function formatSegmentText(type: TagSegmentType, tagName: string, displayText: string): string {
  switch (type) {
    case 'dice':
      return displayText
    case 'hit':
      return (displayText.startsWith('+') || displayText.startsWith('-') ? '' : '+') + displayText
    case 'dc':
      return `DC ${displayText}`
    case 'save':
      return `${displayText} save`
    default:
      return displayText || tagName
  }
}

/** Convenience for contexts that just want plain readable text (e.g. search
 * indexing, list previews) — strips all tag markup down to display text. */
export function stripTags(text: string): string {
  return parseTags(text)
    .map((s) => s.text)
    .join('')
}
