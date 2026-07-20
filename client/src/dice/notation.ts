import type { RollMode, RollTerm } from './types'

interface ParsedDiceTerm {
  sign: 1 | -1
  count: number
  sides: number
}

export interface ParsedNotation {
  diceTerms: ParsedDiceTerm[]
  modifier: number
}

const TOKEN_RE = /([+-])?\s*(\d*d\d+|\d+)/gi

/** Parses standard dice notation with multiple terms, e.g. "2d6+1d4+3" or
 * "1d20-1". Whitespace around signs is tolerant; a leading term with no
 * explicit sign is treated as positive. Throws on empty/unparseable input. */
export function parseNotation(notation: string): ParsedNotation {
  const trimmed = notation.trim()
  if (!trimmed) throw new Error('Empty roll notation.')

  const diceTerms: ParsedDiceTerm[] = []
  let modifier = 0
  let matchedAnything = false

  for (const match of trimmed.matchAll(TOKEN_RE)) {
    matchedAnything = true
    const sign: 1 | -1 = match[1] === '-' ? -1 : 1
    const body = match[2]
    if (body.toLowerCase().includes('d')) {
      const [countPart, sidesPart] = body.toLowerCase().split('d')
      const count = countPart ? parseInt(countPart, 10) : 1
      const sides = parseInt(sidesPart, 10)
      if (!Number.isFinite(count) || count <= 0 || !Number.isFinite(sides) || sides <= 0) {
        throw new Error(`Invalid dice term "${match[0]}".`)
      }
      diceTerms.push({ sign, count, sides })
    } else {
      const value = parseInt(body, 10)
      if (!Number.isFinite(value)) throw new Error(`Invalid modifier "${match[0]}".`)
      modifier += sign * value
    }
  }

  // Reject input that isn't fully made of recognized terms (stray characters) —
  // compare the notation with whitespace stripped against the concatenation
  // of everything the regex actually matched; any leftover means garbage
  // slipped through unmatched.
  if (!matchedAnything) throw new Error(`Could not parse notation "${notation}".`)
  const strippedInput = trimmed.replace(/\s+/g, '')
  const strippedMatches = Array.from(trimmed.matchAll(TOKEN_RE))
    .map((m) => m[0].replace(/\s+/g, ''))
    .join('')
  if (strippedMatches !== strippedInput) {
    throw new Error(`Could not fully parse notation "${notation}".`)
  }

  return { diceTerms, modifier }
}

function rollDie(sides: number, randomSource: () => number): number {
  return Math.floor(randomSource() * sides) + 1
}

export interface RollResult {
  terms: RollTerm[]
  modifier: number
  total: number
}

/**
 * Rolls a parsed notation. Advantage/disadvantage only ever affects a LONE
 * d20 term (count === 1, sides === 20) — this is the actual 5e rule: it's
 * the check/attack's own d20 that gets rolled twice, not every die in the
 * expression. The first such term found is treated as "the" d20; everything
 * else (other dice terms, the flat modifier) is unaffected by mode.
 */
export function rollNotation(parsed: ParsedNotation, mode: RollMode, randomSource: () => number = Math.random): RollResult {
  let usedAdvantageSlot = false
  const terms: RollTerm[] = parsed.diceTerms.map((dt) => {
    const isTheD20 = !usedAdvantageSlot && dt.sides === 20 && dt.count === 1
    if (isTheD20 && mode !== 'normal') {
      usedAdvantageSlot = true
      const r1 = rollDie(20, randomSource)
      const r2 = rollDie(20, randomSource)
      const kept = mode === 'advantage' ? Math.max(r1, r2) : Math.min(r1, r2)
      return { sign: dt.sign, sides: dt.sides, count: dt.count, results: [r1, r2], kept: [kept] }
    }
    if (isTheD20) usedAdvantageSlot = true
    const results = Array.from({ length: dt.count }, () => rollDie(dt.sides, randomSource))
    return { sign: dt.sign, sides: dt.sides, count: dt.count, results, kept: results }
  })

  const diceTotal = terms.reduce((sum, t) => sum + t.sign * t.kept.reduce((a, b) => a + b, 0), 0)
  const total = diceTotal + parsed.modifier

  return { terms, modifier: parsed.modifier, total }
}
