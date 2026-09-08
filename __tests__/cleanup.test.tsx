import React from 'react';
import { Animated } from 'react-native';
import TestRenderer, { act } from 'react-test-renderer';
import { LogoDraw } from '../src/LogoDraw';
import { SQUARE, mockAccessibility, settleReduceMotion } from './helpers';

/**
 * Replace the composite animation with one whose callback we hold, so the
 * teardown race — a completion landing after unmount — can be reproduced on
 * purpose instead of hoped against.
 */
function captureAnimation() {
  const stop = jest.fn();
  let finish: ((result: { finished: boolean }) => void) | undefined;
  const spy = jest.spyOn(Animated, 'parallel').mockReturnValue({
    start: (cb?: (result: { finished: boolean }) => void) => {
      finish = cb;
    },
    stop,
    reset: jest.fn(),
    _startNativeLoop: jest.fn(),
    _isUsingNativeDriver: () => false,
  } as unknown as Animated.CompositeAnimation);
  return { spy, stop, complete: () => finish?.({ finished: true }) };
}

beforeEach(() => {
  mockAccessibility();
  jest.useFakeTimers();
});
afterEach(() => {
  jest.useRealTimers();
  jest.restoreAllMocks();
});

describe('cleanup', () => {
  it('stops the animation on unmount', async () => {
    const { stop } = captureAnimation();

    let tree!: TestRenderer.ReactTestRenderer;
    await act(async () => {
      tree = TestRenderer.create(<LogoDraw {...SQUARE} />);
    });
    await settleReduceMotion();
    expect(stop).not.toHaveBeenCalled();

    await act(async () => tree.unmount());
    expect(stop).toHaveBeenCalled();
  });

  it('never calls onComplete after unmount', async () => {
    const { complete } = captureAnimation();
    const onComplete = jest.fn();

    let tree!: TestRenderer.ReactTestRenderer;
    await act(async () => {
      tree = TestRenderer.create(<LogoDraw {...SQUARE} onComplete={onComplete} />);
    });
    await settleReduceMotion();
    await act(async () => tree.unmount());

    // The completion callback can outrun teardown by a frame.
    act(() => complete());
    expect(onComplete).not.toHaveBeenCalled();
  });

  it('stops a loop rather than leaving a timer behind', async () => {
    const { spy, complete } = captureAnimation();
    const onComplete = jest.fn();

    let tree!: TestRenderer.ReactTestRenderer;
    await act(async () => {
      tree = TestRenderer.create(
        <LogoDraw {...SQUARE} loop loopDelay={500} onComplete={onComplete} />,
      );
    });
    await settleReduceMotion();

    // One cycle finishes and queues the next.
    act(() => complete());
    expect(onComplete).toHaveBeenCalledTimes(1);
    act(() => {
      jest.advanceTimersByTime(500);
    });
    expect(spy).toHaveBeenCalledTimes(2);

    // Unmount mid-loop: the pending restart must never fire.
    await act(async () => tree.unmount());
    act(() => {
      jest.runOnlyPendingTimers();
    });
    expect(spy).toHaveBeenCalledTimes(2);
    expect(onComplete).toHaveBeenCalledTimes(1);
  });

  it('drops the reduced-motion subscription on unmount', async () => {
    const { remove } = mockAccessibility();

    let tree!: TestRenderer.ReactTestRenderer;
    await act(async () => {
      tree = TestRenderer.create(<LogoDraw {...SQUARE} />);
    });
    await settleReduceMotion();
    await act(async () => tree.unmount());

    expect(remove).toHaveBeenCalled();
  });

  it('does not start until delay has elapsed, and cancels it on unmount', async () => {
    const { spy } = captureAnimation();

    let tree!: TestRenderer.ReactTestRenderer;
    await act(async () => {
      tree = TestRenderer.create(<LogoDraw {...SQUARE} delay={1000} />);
    });
    await settleReduceMotion();
    expect(spy).not.toHaveBeenCalled();

    await act(async () => tree.unmount());
    act(() => {
      jest.runOnlyPendingTimers();
    });
    expect(spy).not.toHaveBeenCalled();
  });
});
