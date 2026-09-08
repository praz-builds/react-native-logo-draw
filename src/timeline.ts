/**
 * The timing contract, as pure arithmetic.
 *
 * Kept out of the component so the relationship between the trace and the fill
 * can be asserted directly, without rendering or driving a clock.
 */

/** Milliseconds the fill keeps going after the pen has landed. */
export const DEFAULT_FILL_TAIL_MS = 150;

export type TimelineInput = {
  /** Milliseconds for the stroke trace. Negative values are treated as 0. */
  duration: number;
  /**
   * Percentage of `duration` at which the fill starts.
   *
   * At 0 the ink is already flowing before the pen moves; at 100 the fill waits
   * for the pen to land, which is the one setting that breaks the
   * single-gesture reading. Clamped to [0, 100].
   */
  fillStart: number;
  /** Milliseconds the fill continues past the end of the trace. */
  fillTail?: number;
};

export type Timeline = {
  /** How long the dash offset takes to walk to zero. */
  drawDuration: number;
  /** How long the fill waits before it starts. */
  fillDelay: number;
  /** How long the fill itself takes. */
  fillDuration: number;
  /** Wall-clock length of one cycle: `max(drawDuration, fillDelay + fillDuration)`. */
  total: number;
};

export function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(Math.max(value, min), max);
}

/**
 * Resolve the two overlapping animations that make up one draw-on.
 *
 * The fill always outlasts the trace by `fillTail`, so the ink is still
 * settling as the pen lifts. That overlap is what makes the two halves read as
 * one gesture rather than two steps.
 */
export function resolveTimeline({
  duration,
  fillStart,
  fillTail = DEFAULT_FILL_TAIL_MS,
}: TimelineInput): Timeline {
  const drawDuration = Math.max(0, Number.isFinite(duration) ? duration : 0);
  const tail = Math.max(0, Number.isFinite(fillTail) ? fillTail : 0);
  const fillDelay = (drawDuration * clamp(fillStart, 0, 100)) / 100;
  const fillDuration = drawDuration - fillDelay + tail;
  return {
    drawDuration,
    fillDelay,
    fillDuration,
    total: Math.max(drawDuration, fillDelay + fillDuration),
  };
}
