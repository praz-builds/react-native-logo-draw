import React from 'react';
import { View } from 'react-native';
import TestRenderer, { act } from 'react-test-renderer';
import Svg, { Path } from 'react-native-svg';
import { LogoDraw } from '../src/LogoDraw';
import { SQUARE, mockAccessibility, settleReduceMotion } from './helpers';

beforeEach(() => {
  mockAccessibility();
});
afterEach(() => {
  jest.restoreAllMocks();
});

async function mount(element: React.ReactElement) {
  let tree!: TestRenderer.ReactTestRenderer;
  await act(async () => {
    tree = TestRenderer.create(element);
  });
  await settleReduceMotion();
  return tree;
}

describe('rendering', () => {
  it('dashes the stroke by the full length so nothing shows on the first frame', async () => {
    const tree = await mount(<LogoDraw {...SQUARE} autoPlay={false} />);
    const path = tree.root.findByType(Path).props as Record<string, unknown>;
    expect(path.strokeDasharray).toBe(SQUARE.length);
    expect(path.strokeDashoffset).toBe(SQUARE.length);
    await act(async () => tree.unmount());
  });

  it('sizes the svg from `size`, and lets width/height override it', async () => {
    const tree = await mount(<LogoDraw {...SQUARE} size={40} autoPlay={false} />);
    expect(tree.root.findByType(Svg).props).toMatchObject({ width: 40, height: 40 });

    const wide = await mount(
      <LogoDraw {...SQUARE} size={40} width={120} autoPlay={false} />,
    );
    expect(wide.root.findByType(Svg).props).toMatchObject({ width: 120, height: 40 });

    await act(async () => tree.unmount());
    await act(async () => wide.unmount());
  });

  it('is hidden from assistive tech unless it is given a label', async () => {
    const silent = await mount(<LogoDraw {...SQUARE} autoPlay={false} />);
    expect(silent.root.findByType(View).props).toMatchObject({
      accessible: false,
      accessibilityElementsHidden: true,
      importantForAccessibility: 'no-hide-descendants',
    });

    const labelled = await mount(
      <LogoDraw {...SQUARE} accessibilityLabel="Acme" autoPlay={false} />,
    );
    expect(labelled.root.findByType(View).props).toMatchObject({
      accessible: true,
      accessibilityRole: 'image',
      accessibilityLabel: 'Acme',
    });

    await act(async () => silent.unmount());
    await act(async () => labelled.unmount());
  });

  it('falls back to a plain filled shape when length is unusable', async () => {
    const tree = await mount(<LogoDraw {...SQUARE} length={NaN} autoPlay={false} />);
    // A zero dash array is a solid stroke: the mark is still visible, it just
    // cannot be traced.
    expect((tree.root.findByType(Path).props as Record<string, unknown>).strokeDasharray).toBe(0);
    await act(async () => tree.unmount());
  });

  it('uses `color` for the fill unless `fillColor` splits them', async () => {
    const one = await mount(<LogoDraw {...SQUARE} color="#123456" autoPlay={false} />);
    expect((one.root.findByType(Path).props as Record<string, unknown>).fill).toBe('#123456');

    const two = await mount(
      <LogoDraw {...SQUARE} color="#123456" fillColor="#abcdef" autoPlay={false} />,
    );
    const props = two.root.findByType(Path).props as Record<string, unknown>;
    expect(props.fill).toBe('#abcdef');
    expect(props.stroke).toBe('#123456');

    await act(async () => one.unmount());
    await act(async () => two.unmount());
  });
});
