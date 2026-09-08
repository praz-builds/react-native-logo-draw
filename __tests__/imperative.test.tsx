import React, { createRef } from 'react';
import { Animated } from 'react-native';
import TestRenderer, { act } from 'react-test-renderer';
import { Path } from 'react-native-svg';
import { LogoDraw, type LogoDrawHandle } from '../src/LogoDraw';
import { SQUARE, mockAccessibility, settleReduceMotion } from './helpers';

function captureAnimation() {
  const stop = jest.fn();
  const spy = jest.spyOn(Animated, 'parallel').mockReturnValue({
    start: jest.fn(),
    stop,
    reset: jest.fn(),
  } as unknown as Animated.CompositeAnimation);
  return { spy, stop };
}

let platform: ReturnType<typeof mockAccessibility>;
beforeEach(() => {
  platform = mockAccessibility();
});
afterEach(() => {
  jest.restoreAllMocks();
});

const pathProps = (tree: TestRenderer.ReactTestRenderer) =>
  tree.root.findByType(Path).props as Record<string, unknown>;

async function mount(element: React.ReactElement) {
  let tree!: TestRenderer.ReactTestRenderer;
  await act(async () => {
    tree = TestRenderer.create(element);
  });
  await settleReduceMotion();
  return tree;
}

describe('the imperative handle', () => {
  it('does nothing on mount when autoPlay is off', async () => {
    const { spy } = captureAnimation();
    const tree = await mount(<LogoDraw {...SQUARE} autoPlay={false} />);

    expect(spy).not.toHaveBeenCalled();
    expect(pathProps(tree).strokeDashoffset).toBe(SQUARE.length);
    expect(pathProps(tree).fillOpacity).toBe(0);

    await act(async () => tree.unmount());
  });

  it('play() starts a trace, and starting again cancels the one in flight', async () => {
    const { spy, stop } = captureAnimation();
    const ref = createRef<LogoDrawHandle>();
    const tree = await mount(<LogoDraw {...SQUARE} autoPlay={false} ref={ref} />);

    act(() => ref.current?.play());
    expect(spy).toHaveBeenCalledTimes(1);

    act(() => ref.current?.play());
    expect(stop).toHaveBeenCalledTimes(1);
    expect(spy).toHaveBeenCalledTimes(2);

    await act(async () => tree.unmount());
  });

  it('reset() rewinds to the un-drawn mark', async () => {
    captureAnimation();
    const ref = createRef<LogoDrawHandle>();
    const tree = await mount(<LogoDraw {...SQUARE} ref={ref} />);

    act(() => {
      // Pretend the trace ran to the end.
      ref.current?.play();
    });
    act(() => ref.current?.reset());

    expect(pathProps(tree).strokeDashoffset).toBe(SQUARE.length);
    expect(pathProps(tree).fillOpacity).toBe(0);

    await act(async () => tree.unmount());
  });

  it('play() under reduced motion settles instantly and reports completion', async () => {
    platform.isReduceMotionEnabled.mockResolvedValue(true);
    const { spy } = captureAnimation();
    const onComplete = jest.fn();
    const ref = createRef<LogoDrawHandle>();
    const tree = await mount(
      <LogoDraw {...SQUARE} autoPlay={false} onComplete={onComplete} ref={ref} />,
    );

    act(() => ref.current?.play());

    expect(spy).not.toHaveBeenCalled();
    expect(onComplete).toHaveBeenCalledTimes(1);
    expect(pathProps(tree).strokeDashoffset).toBe(0);

    await act(async () => tree.unmount());
  });

  it('reset() under reduced motion keeps the mark visible', async () => {
    platform.isReduceMotionEnabled.mockResolvedValue(true);
    captureAnimation();
    const ref = createRef<LogoDrawHandle>();
    const tree = await mount(<LogoDraw {...SQUARE} ref={ref} />);

    act(() => ref.current?.reset());

    expect(pathProps(tree).fillOpacity).toBe(1);

    await act(async () => tree.unmount());
  });
});
