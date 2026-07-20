/** A handful of distinct, readable-on-dark-background colors, picked by a
 * stable hash of the player's id — same person always draws in the same
 * color, different people are visually distinguishable, no coordination
 * needed between clients. */
const PALETTE = [0xff6b6b, 0x4dabf7, 0x69db7c, 0xffd43b, 0xda77f2, 0xff922b, 0x66d9e8]

export function colorForPlayerId(playerId: string): number {
  let hash = 0
  for (let i = 0; i < playerId.length; i++) {
    hash = (hash * 31 + playerId.charCodeAt(i)) | 0
  }
  return PALETTE[Math.abs(hash) % PALETTE.length]
}
