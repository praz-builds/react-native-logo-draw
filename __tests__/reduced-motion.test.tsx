import React from 'react';
import { Animated } from 'react-native';
import TestRenderer, { act } from 'react-test-renderer';
import { Path } from 'react-native-svg';
import { LogoDraw } from '../src/LogoDraw';
import { SQUARE, mockAccessibility, settleReduceMotion } from './helpers';

let platform: ReturnType<typeof mockAccessibility>;

beforeEach(() => {
  platform = mockAccessibility();
});
afterEach(() => {
  jest.restoreAllMocks();
});

const pathProps = (tree: TestRenderer.ReactTestRenderer) =>
  tree.root.findByType(Path).props as Record<string, unknown>;

describe('reduced motion', () => {
  it('renders the finished mark and schedules nothing', async () => {
    platform.isReduceMotionEnabled.mockResolvedValue(true);
    const timing = jest.spyOn(Animated, 'timing');
    const onComplete = jest.fn();

    let tree!: TestRenderer.ReactTestRenderer;
    await act(async () => {
      tree = TestRenderer.create(<LogoDraw {...SQUARE} onComplete={onComplete} />);
    });
    await settleReduceMotion();

    expect(pathProps(tree).strokeDashoffset).toBe(0);
    expect(pathProps(tree).fillOpacity).toBe(1);
    expect(onComplete).toHaveBeenCalledTimes(1);
    expect(timing).not.toHaveBeenCalled();

    timing.mockRestore();
    await act(async () => tree.unmount());
  });

  it('holds at the start until the platform has answered', async () => {
    // A promise that never resolves: the "not yet known" state.
    platform.isReduceMotionEnabled.mockReturnValue(new Promise(() => {}));
    const timing = jest.spyOn(Animated, 'timing');

    let tree!: TestRenderer.ReactTestRenderer;
    await act(async () => {
      tree = TestRenderer.create(<LogoDraw {...SQUARE} />);
    });
    await settleReduceMotion();

    // Starting on a guess and cancelling a frame later is the flash of motion
    // the setting exists to prevent.
    expect(timing).not.toHaveBeenCalled();
    expect(pathProps(tree).strokeDashoffset).toBe(SQUARE.length);

    timing.mockRestore();
    await act(async () => tree.unmount());
  });

  it('settles the mark even when autoPlay is off, but stays silent', async () => {
    platform.isReduceMotionEnabled.mockResolvedValue(true);
    const onComplete = jest.fn();

    let tree!: TestRenderer.ReactTestRenderer;
    await act(async () => {
      tree = TestRenderer.create(
        <LogoDraw {...SQUARE} autoPlay={false} onComplete={onComplete} />,
      );
    });
    await settleReduceMotion();

    // An invisible logo is not a neutral fallback.
    expect(pathProps(tree).fillOpacity).toBe(1);
    expect(onComplete).not.toHaveBeenCalled();

    await act(async () => tree.unmount());
  });
});
