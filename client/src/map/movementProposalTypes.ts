export interface MovementProposalRecord {
  /** Also the map key — one active proposal per scene at a time; a new
   * proposal simply overwrites whatever was pending. */
  sceneId: string
  targetPoiId: string
  proposedBy: string
  /** playerId -> yes/no. Only meaningful in 'vote' consensus mode — a
   * 'leader' mode move executes immediately on proposal, never sits here
   * waiting on votes. */
  votes: Record<string, boolean>
  createdAt: number
}
