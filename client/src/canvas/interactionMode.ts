/** The DM's canvas has several mutually-exclusive drag/click gestures —
 * moving tokens, drawing walls, placing lights, and placing a new token —
 * so needs an explicit mode switch. Players never drag anything today, so
 * their canvas needs no mode gating at all. 'place-tokens' is a one-shot
 * mode: SessionScreen switches into it automatically when a token
 * placement is staged, overriding whatever mode the DM had selected, and
 * switches back out once the placement click lands (or is cancelled). */
export type ToolMode = 'move' | 'draw-walls' | 'place-lights' | 'place-tokens'
