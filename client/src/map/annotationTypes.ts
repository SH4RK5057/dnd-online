export interface Point {
  x: number
  y: number
}

export interface AnnotationRecord {
  id: string
  sceneId: string
  playerId: string
  /** Grid-cell units, same convention as everything else on the map. At
   * least 2 points — a freehand stroke traced while shift-dragging. */
  points: Point[]
  /** 0xRRGGBB, derived from the drawing player's id so everyone's scribbles
   * stay visually distinguishable (map/annotationColor.ts). */
  color: number
  createdAt: number
}
