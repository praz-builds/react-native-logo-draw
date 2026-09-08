import { resolveTimeline, DEFAULT_FILL_TAIL_MS } from '../src/timeline';

describe('the timing contract', () => {
  it('starts the fill partway through the trace, not after it', () => {
    const { drawDuration, fillDelay, fillDuration } = resolveTimeline({
      duration: 1000,
      fillStart: 70,
    });
    expect(drawDuration).toBe(1000);
    expect(fillDelay).toBe(700);
    // The fill is still going when the pen lands — that overlap is the effect.
    expect(fillDelay).toBeLessThan(drawDuration);
    expect(fillDelay + fillDuration).toBeGreaterThan(drawDuration);
    expect(fillDuration).toBe(300 + DEFAULT_FILL_TAIL_MS);
  });

  it('lets the fill wait for the pen at fillStart 100', () => {
    const { fillDelay, fillDuration, total } = resolveTimeline({
      duration: 1000,
      fillStart: 100,
      fillTail: 200,
    });
    expect(fillDelay).toBe(1000);
    expect(fillDuration).toBe(200);
    expect(total).toBe(1200);
  });

  it('has the ink already flowing at fillStart 0', () => {
    const { fillDelay, fillDuration } = resolveTimeline({ duration: 800, fillStart: 0 });
    expect(fillDelay).toBe(0);
    expect(fillDuration).toBe(800 + DEFAULT_FILL_TAIL_MS);
  });

  it('clamps fillStart rather than rejecting it', () => {
    expect(resolveTimeline({ duration: 1000, fillStart: -50 }).fillDelay).toBe(0);
    expect(resolveTimeline({ duration: 1000, fillStart: 400 }).fillDelay).toBe(1000);
    expect(resolveTimeline({ duration: 1000, fillStart: NaN }).fillDelay).toBe(0);
  });

  it('collapses to nothing at duration 0', () => {
    const t = resolveTimeline({ duration: 0, fillStart: 70, fillTail: 0 });
    expect(t).toEqual({ drawDuration: 0, fillDelay: 0, fillDuration: 0, total: 0 });
  });

  it('treats nonsense durations as zero rather than throwing', () => {
    expect(resolveTimeline({ duration: -500, fillStart: 70 }).drawDuration).toBe(0);
    expect(resolveTimeline({ duration: NaN, fillStart: 70 }).drawDuration).toBe(0);
  });
});
