/** Small shared helpers for the DM file ecosystem's JSON-based exports
 * (homebrew entries, scene bundles) — campaignFile.ts's binary campaign
 * export/import is separate since it moves raw Yjs bytes, not JSON. */

export function downloadJson(filename: string, data: unknown): void {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

export async function readJsonFile(file: File): Promise<unknown> {
  const text = await file.text()
  return JSON.parse(text)
}
