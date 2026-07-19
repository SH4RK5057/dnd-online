import { JOIN_CODE_LENGTH, PROTOCOL_VERSION } from './constants'

// Excludes visually ambiguous characters: 0/O, 1/I/L.
const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'

export function generateJoinCode(): string {
  const bytes = new Uint8Array(JOIN_CODE_LENGTH)
  crypto.getRandomValues(bytes)
  let code = ''
  for (const byte of bytes) {
    code += ALPHABET[byte % ALPHABET.length]
  }
  return formatJoinCode(code)
}

/** Inserts a readability dash in the middle, e.g. "ABC123" -> "ABC-123". */
export function formatJoinCode(rawCode: string): string {
  const mid = Math.ceil(rawCode.length / 2)
  return `${rawCode.slice(0, mid)}-${rawCode.slice(mid)}`
}

/** Strips whitespace/dashes and uppercases, so typed or pasted codes match regardless of formatting. */
export function normalizeJoinCode(input: string): string {
  return input.replace(/[\s-]/g, '').toUpperCase()
}

export function isValidJoinCode(input: string): boolean {
  const normalized = normalizeJoinCode(input)
  return normalized.length === JOIN_CODE_LENGTH && [...normalized].every((char) => ALPHABET.includes(char))
}

export function joinCodeToRoomName(code: string): string {
  return `dndonline:v${PROTOCOL_VERSION}:${normalizeJoinCode(code)}`
}
