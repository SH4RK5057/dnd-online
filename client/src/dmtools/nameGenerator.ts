/** Procedural NPC name generator — builds names by combining short original
 * phonetic fragments, not by picking from a fixed list of pre-written names
 * (and definitely not from any published sourcebook's name tables). The
 * "style" categories are generic phonetic flavors, not tied to any specific
 * setting's lore. */

export type NameStyle = 'common' | 'flowing' | 'rugged' | 'guttural'

interface SyllableSet {
  starts: string[]
  middles: string[]
  ends: string[]
}

const SYLLABLE_SETS: Record<NameStyle, SyllableSet> = {
  common: {
    starts: ['Bran', 'Wil', 'Ed', 'Al', 'Mar', 'Ros', 'Tom', 'Han', 'Jos', 'Cor'],
    middles: ['an', 'el', 'in', 'or', 'wy', 'am'],
    ends: ['son', 'ley', 'ard', 'wyn', 'ric', 'da', 'ton', 'in'],
  },
  flowing: {
    starts: ['Ael', 'Sil', 'Lyr', 'Fae', 'Thal', 'Isel', 'Or', 'Vaen', 'Cael', 'Ithil'],
    middles: ['ae', 'ie', 'ea', 'io', 'ily'],
    ends: ['iel', 'wen', 'ion', 'ith', 'ael', 'yra', 'iel', 'ora'],
  },
  rugged: {
    starts: ['Bor', 'Thrag', 'Dur', 'Grim', 'Ulf', 'Bal', 'Thor', 'Korn', 'Brak', 'Vald'],
    middles: ['un', 'ok', 'ag', 'or', 'ul'],
    ends: ['grim', 'dun', 'bak', 'thor', 'rik', 'gar', 'ulf', 'stone'],
  },
  guttural: {
    starts: ['Uzg', 'Mog', 'Grak', 'Zug', 'Thok', 'Skar', 'Nurg', 'Vrag', 'Gnash', 'Rok'],
    middles: ['ur', 'ak', 'og', 'uz', 'ra'],
    ends: ['nak', 'gash', 'ruk', 'zog', 'mash', 'dur', 'kul', 'thar'],
  },
}

export const NAME_STYLES: NameStyle[] = ['common', 'flowing', 'rugged', 'guttural']

export function generateName(style: NameStyle, randomSource: () => number = Math.random): string {
  const set = SYLLABLE_SETS[style]
  const pick = (arr: string[]) => arr[Math.floor(randomSource() * arr.length)]
  const includeMiddle = randomSource() < 0.5
  return pick(set.starts) + (includeMiddle ? pick(set.middles) : '') + pick(set.ends)
}
