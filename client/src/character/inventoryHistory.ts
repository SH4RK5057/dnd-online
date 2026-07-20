export type InventoryHistoryAction = 'add' | 'remove' | 'transfer'

export interface InventoryHistoryRecord {
  id: string
  action: InventoryHistoryAction
  itemName: string
  quantity: number
  characterName: string
  /** Only meaningful for `transfer` — who it went to. */
  toCharacterName: string | null
  createdAt: number
}
