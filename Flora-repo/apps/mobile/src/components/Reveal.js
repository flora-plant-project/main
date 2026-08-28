import { useEffect, useRef } from 'react';
import { AccessibilityInfo, Animated, Easing } from 'react-native';

const DURATION_MS = 320;
/** How far the content rises as it fades in. Small on purpose — a nudge, not a slide. */
const RISE = 12;

/**
 * Fade-and-rise a block into view after a delay.
 *
 * Used to stagger the care plan so it reads as arriving rather than appearing
 * fully formed the instant the screen loads.
 *
 * Two deliberate choices:
 *
 * - Children are always mounted; only opacity and transform animate. Delaying
 *   the mount instead would make the plan pop in late, hide it from
 *   screen readers until the timer fired, and break any test that looks for
 *   content on render.
 * - Reduced motion is honoured by jumping straight to the final state. Motion
 *   is decoration here, so removing it costs nothing.
 *
 * @param {{delay?: number, style?: object, children: React.ReactNode}} props
 */
export function Reveal({ delay = 0, style, children }) {
  const progress = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    let cancelled = false;

    const settle = () => {
      if (!cancelled) progress.setValue(1);
    };

    AccessibilityInfo.isReduceMotionEnabled()
      .then((reduced) => {
        if (cancelled) return;
        if (reduced) {
          settle();
          return;
        }
        Animated.timing(progress, {
          toValue: 1,
          duration: DURATION_MS,
          delay,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }).start();
      })
      // If the platform cannot answer, show the content rather than leave it
      // invisible behind a promise that never resolved.
      .catch(settle);

    return () => {
      cancelled = true;
    };
  }, [delay, progress]);

  return (
    <Animated.View
      style={[
        style,
        {
          opacity: progress,
          transform: [
            { translateY: progress.interpolate({ inputRange: [0, 1], outputRange: [RISE, 0] }) },
          ],
        },
      ]}
    >
      {children}
    </Animated.View>
  );
}
