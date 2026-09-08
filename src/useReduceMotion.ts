import { useEffect, useState } from 'react';
import { AccessibilityInfo } from 'react-native';

/**
 * Whether the platform is asking for reduced motion.
 *
 * `null` while the platform has not answered yet. That third state matters:
 * starting on the assumption of "no preference" and cancelling a frame later is
 * exactly the flash of motion the setting exists to prevent, so callers should
 * hold still until this resolves.
 *
 * Works on iOS, Android and react-native-web. On any platform where the query
 * rejects or the API is missing, it resolves to `false`.
 */
export function useReduceMotion(): boolean | null {
  const [reduceMotion, setReduceMotion] = useState<boolean | null>(null);

  useEffect(() => {
    let active = true;

    const query = AccessibilityInfo?.isReduceMotionEnabled;
    if (typeof query !== 'function') {
      setReduceMotion(false);
      return;
    }

    Promise.resolve(query.call(AccessibilityInfo))
      .then((enabled) => {
        if (active) setReduceMotion(Boolean(enabled));
      })
      .catch(() => {
        if (active) setReduceMotion(false);
      });

    const subscription = AccessibilityInfo.addEventListener?.(
      'reduceMotionChanged',
      (enabled: boolean) => {
        if (active) setReduceMotion(Boolean(enabled));
      },
    );

    return () => {
      active = false;
      subscription?.remove?.();
    };
  }, []);

  return reduceMotion;
}
