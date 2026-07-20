export interface PoiRecord {
  id: string
  sceneId: string
  name: string
  /** Grid-cell units, same convention as everything else on the map. */
  x: number
  y: number
  /** Other POI ids on this same scene directly reachable from here — an
   * undirected adjacency graph (map/usePois.ts's connect/disconnect keep
   * both ends in sync), what the "pathing" in POI pathing actually is. */
  connections: string[]
  /** When set, moving the party to this POI also switches everyone to a
   * different scene (with a brief transition overlay) — e.g. a town's
   * "Tavern" POI linking to a separate "Tavern Interior" dungeon scene. */
  linkedSceneId: string | null
  createdAt: number
}
