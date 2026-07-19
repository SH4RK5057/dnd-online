/** The DM's canvas has three mutually-exclusive drag/click gestures — moving
 * tokens, drawing walls, and placing lights — so needs an explicit mode
 * switch. Players never drag anything today, so their canvas needs no mode
 * gating at all. */
export type ToolMode = 'move' | 'draw-walls' | 'place-lights'
