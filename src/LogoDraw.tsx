import React, {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
} from 'react';
import {
  Animated,
  Easing,
  StyleSheet,
  View,
  type EasingFunction,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { resolveTimeline, DEFAULT_FILL_TAIL_MS } from './timeline';
import { useReduceMotion } from './useReduceMotion';

const AnimatedPath = Animated.createAnimatedComponent(Path);

/** The pen accelerates away and decelerates into the final corner. */
const DEFAULT_DRAW_EASING = Easing.inOut(Easing.quad);
/** Ink spreads fast then slows; it never eases in, it is already flowing. */
const DEFAULT_FILL_EASING = Easing.out(Easing.quad);

export type LogoDrawHandle = {
  /**
   * Restart the draw-on from the beginning.
   *
   * Cancels anything in flight, including a pending loop. Under reduced motion
   * this jumps straight to the finished mark and fires `onComplete`.
   */
  play: () => void;
  /**
   * Return to the un-drawn state and stop.
   *
   * Under reduced motion this settles on the finished mark instead — a logo
   * that has been reset into invisibility is worse than one that never moved.
   */
  reset: () => void;
};

export type LogoDrawProps = {
  /**
   * The SVG path data to trace, as it would appear in a `d` attribute.
   *
   * Multiple subpaths are supported: the pen walks them in order, as one
   * continuous dash. Generate this with `npx react-native-logo-draw extract`.
   */
  path: string;
  /**
   * Total perimeter of `path`, in viewBox units.
   *
   * **This cannot be measured at runtime.** React Native's SVG surface has no
   * `SVGGeometryElement.getTotalLength()`, so the dash array the animation
   * interpolates has to be a constant supplied by you. Get it from
   * `npx react-native-logo-draw extract`, which computes it alongside the path.
   *
   * Too small and the mark is already partly drawn on the first frame; too
   * large and it sits invisible for a beat before the pen appears.
   */
  length: number;
  /** viewBox the path is authored against. @default "0 0 100 100" */
  viewBox?: string;
  /** Rendered edge length in points, used for both axes. @default 96 */
  size?: number;
  /** Rendered width in points. @default size */
  width?: number;
  /** Rendered height in points. @default size */
  height?: number;
  /**
   * Milliseconds for the trace. `0` renders the finished mark immediately.
   * @default 1200
   */
  duration?: number;
  /**
   * Percentage of `duration` at which the fill starts, `0`–`100`.
   *
   * The default overlaps the two halves so the mark never sits as a hollow
   * outline waiting for something to happen to it. At `100` the fill waits for
   * the pen to land.
   * @default 70
   */
  fillStart?: number;
  /** Milliseconds the fill keeps going after the pen lands. @default 150 */
  fillTail?: number;
  /** Stroke width in viewBox units, so it scales with `size`. @default 3 */
  strokeWidth?: number;
  /** Stroke colour. @default "#000000" */
  color?: string;
  /** Fill colour. @default `color` — split them for an outline in a second tone. */
  fillColor?: string;
  /**
   * Fill rule. Extracted paths are wound so that the default is correct; set
   * `"evenodd"` for hand-authored paths whose holes are wound the same way as
   * their outlines.
   * @default "nonzero"
   */
  fillRule?: 'nonzero' | 'evenodd';
  /** Stroke cap. @default "round" */
  strokeLinecap?: 'butt' | 'round' | 'square';
  /** Stroke join. @default "round" */
  strokeLinejoin?: 'miter' | 'round' | 'bevel';
  /** Repeat forever. @default false */
  loop?: boolean;
  /** Pause on the finished mark before tracing it again. @default 600 */
  loopDelay?: number;
  /** Milliseconds to hold the un-drawn mark before the first trace. @default 0 */
  delay?: number;
  /** Start on mount. Set `false` to drive it entirely from the ref. @default true */
  autoPlay?: boolean;
  /** Easing for the trace. @default Easing.inOut(Easing.quad) */
  easing?: EasingFunction;
  /** Easing for the fill. @default Easing.out(Easing.quad) */
  fillEasing?: EasingFunction;
  /** Fires once per completed cycle, including immediately under reduced motion. */
  onComplete?: () => void;
  /**
   * Announced label. Omit it and the mark is treated as decorative and hidden
   * from assistive technology, which is the right default for a logo sitting
   * next to its own wordmark.
   */
  accessibilityLabel?: string;
  style?: StyleProp<ViewStyle>;
  testID?: string;
};

/**
 * An SVG path drawn on like a pen tracing it, then filled.
 *
 * The trace is `strokeDashoffset` walked from `length` down to zero. The fill
 * opacity comes up partway through — see `fillStart` — so the two halves read
 * as one gesture rather than two steps.
 *
 * `strokeDashoffset` is not one of the props the native animation driver can
 * write, so this runs on the JS driver (`useNativeDriver: false`). It is a
 * single interpolated prop on a single node, which is cheap, but it does share
 * the JS thread with your work: do not kick one off in the same frame as a
 * navigation transition.
 */
export const LogoDraw = forwardRef<LogoDrawHandle, LogoDrawProps>(
  function LogoDraw(
    {
      path,
      length,
      viewBox = '0 0 100 100',
      size = 96,
      width,
      height,
      duration = 1200,
      fillStart = 70,
      fillTail = DEFAULT_FILL_TAIL_MS,
      strokeWidth = 3,
      color = '#000000',
      fillColor,
      fillRule = 'nonzero',
      strokeLinecap = 'round',
      strokeLinejoin = 'round',
      loop = false,
      loopDelay = 600,
      delay = 0,
      autoPlay = true,
      easing = DEFAULT_DRAW_EASING,
      fillEasing = DEFAULT_FILL_EASING,
      onComplete,
      accessibilityLabel,
      style,
      testID,
    },
    ref,
  ) {
    const reduceMotion = useReduceMotion();

    // A path with no measurable length can still be filled, it just cannot be
    // traced. Rendering nothing would be the worse failure.
    const traceLength =
      Number.isFinite(length) && length > 0 ? length : 0;

    const dashOffset = useRef(new Animated.Value(traceLength)).current;
    const fillOpacity = useRef(new Animated.Value(0)).current;

    const timeline = useMemo(
      () => resolveTimeline({ duration, fillStart, fillTail }),
      [duration, fillStart, fillTail],
    );

    // Held in refs so a caller passing inline arrows or flipping `loop` does
    // not tear down and restart the trace on every parent render.
    const onCompleteRef = useRef(onComplete);
    onCompleteRef.current = onComplete;
    const loopRef = useRef(loop);
    loopRef.current = loop;
    const loopDelayRef = useRef(loopDelay);
    loopDelayRef.current = loopDelay;
    const reduceMotionRef = useRef(reduceMotion);
    reduceMotionRef.current = reduceMotion;

    const mounted = useRef(true);
    const running = useRef<Animated.CompositeAnimation | null>(null);
    const timers = useRef(new Set<ReturnType<typeof setTimeout>>());

    /** Cancel everything in flight. Safe to call at any point, any number of times. */
    const stop = useCallback(() => {
      running.current?.stop();
      running.current = null;
      timers.current.forEach(clearTimeout);
      timers.current.clear();
    }, []);

    const later = useCallback((fn: () => void, ms: number) => {
      const timer = setTimeout(() => {
        timers.current.delete(timer);
        if (mounted.current) fn();
      }, ms);
      timers.current.add(timer);
    }, []);

    const settle = useCallback(() => {
      dashOffset.setValue(0);
      fillOpacity.setValue(1);
    }, [dashOffset, fillOpacity]);

    const rewind = useCallback(() => {
      dashOffset.setValue(traceLength);
      fillOpacity.setValue(0);
    }, [dashOffset, fillOpacity, traceLength]);

    const cycle = useCallback(() => {
      rewind();

      if (timeline.drawDuration <= 0) {
        settle();
        onCompleteRef.current?.();
        if (loopRef.current) later(cycle, Math.max(0, loopDelayRef.current));
        return;
      }

      const animation = Animated.parallel([
        Animated.timing(dashOffset, {
          toValue: 0,
          duration: timeline.drawDuration,
          easing,
          // strokeDashoffset is not a native-driver prop. See the class docs.
          useNativeDriver: false,
        }),
        Animated.sequence([
          Animated.delay(timeline.fillDelay),
          Animated.timing(fillOpacity, {
            toValue: 1,
            duration: timeline.fillDuration,
            easing: fillEasing,
            useNativeDriver: false,
          }),
        ]),
      ]);

      running.current = animation;
      animation.start(({ finished }) => {
        // The completion callback can outrun teardown by a frame, and a
        // restart can land before the old animation's callback does. Nothing
        // past this point may touch a caller that has gone away or moved on.
        if (!finished || !mounted.current || running.current !== animation) return;
        running.current = null;
        onCompleteRef.current?.();
        if (loopRef.current) later(cycle, Math.max(0, loopDelayRef.current));
      });
    }, [
      dashOffset,
      easing,
      fillEasing,
      fillOpacity,
      later,
      rewind,
      settle,
      timeline,
    ]);

    const play = useCallback(() => {
      stop();
      if (reduceMotionRef.current) {
        settle();
        onCompleteRef.current?.();
        return;
      }
      cycle();
    }, [cycle, settle, stop]);

    const reset = useCallback(() => {
      stop();
      if (reduceMotionRef.current) settle();
      else rewind();
    }, [rewind, settle, stop]);

    useImperativeHandle(ref, () => ({ play, reset }), [play, reset]);

    useEffect(() => {
      mounted.current = true;
      return () => {
        mounted.current = false;
      };
    }, []);

    useEffect(() => {
      // Unknown until the platform answers. Hold at the start rather than
      // guessing; see `useReduceMotion`.
      if (reduceMotion === null) return undefined;

      if (reduceMotion) {
        // Settle regardless of `autoPlay`: with motion off there is nothing to
        // wait for, and an invisible logo is not a neutral fallback.
        settle();
        if (autoPlay) onCompleteRef.current?.();
        return undefined;
      }

      if (!autoPlay) return undefined;

      if (delay > 0) later(cycle, delay);
      else cycle();

      return stop;
    }, [autoPlay, cycle, delay, later, reduceMotion, settle, stop]);

    // Unmount is the last word: stop the animations, drop the timers, and let
    // any in-flight callback see `mounted.current === false`.
    useEffect(() => stop, [stop]);

    const resolvedWidth = width ?? size;
    const resolvedHeight = height ?? size;
    const decorative = accessibilityLabel === undefined;

    return (
      <View
        style={[
          styles.root,
          { width: resolvedWidth, height: resolvedHeight },
          style,
        ]}
        testID={testID}
        // The mark is never interactive, so it must not take focus away from
        // something that is.
        focusable={false}
        accessible={!decorative}
        accessibilityRole={decorative ? undefined : 'image'}
        accessibilityLabel={accessibilityLabel}
        accessibilityElementsHidden={decorative}
        importantForAccessibility={decorative ? 'no-hide-descendants' : 'auto'}
        aria-hidden={decorative || undefined}
      >
        <Svg width={resolvedWidth} height={resolvedHeight} viewBox={viewBox}>
          <AnimatedPath
            d={path}
            fill={fillColor ?? color}
            fillRule={fillRule}
            fillOpacity={fillOpacity as unknown as number}
            stroke={color}
            strokeWidth={strokeWidth}
            strokeLinecap={strokeLinecap}
            strokeLinejoin={strokeLinejoin}
            strokeDasharray={traceLength}
            strokeDashoffset={dashOffset as unknown as number}
          />
        </Svg>
      </View>
    );
  },
);

const styles = StyleSheet.create({
  root: {
    alignItems: 'center',
    justifyContent: 'center',
  },
});

export default LogoDraw;
