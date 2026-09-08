import { AccessibilityInfo } from 'react-native';
import { act } from 'react-test-renderer';

/**
 * The reduced-motion query is a platform call. Every test states what the
 * platform answers, including the case where it has not answered yet.
 */
export function mockAccessibility(): {
  isReduceMotionEnabled: jest.SpyInstance;
  addEventListener: jest.SpyInstance;
  remove: jest.Mock;
} {
  const remove = jest.fn();
  const isReduceMotionEnabled = jest
    .spyOn(AccessibilityInfo, 'isReduceMotionEnabled')
    .mockResolvedValue(false);
  const addEventListener = jest
    .spyOn(AccessibilityInfo, 'addEventListener')
    .mockReturnValue({ remove } as never);
  return { isReduceMotionEnabled, addEventListener, remove };
}

/** Let the reduced-motion promise resolve and the resulting effect run. */
export async function settleReduceMotion(): Promise<void> {
  await act(async () => {
    await Promise.resolve();
  });
}

/** A square with a known perimeter, so assertions can be exact. */
export const SQUARE = {
  path: 'M10,10L90,10L90,90L10,90Z',
  length: 320,
  viewBox: '0 0 100 100',
};
