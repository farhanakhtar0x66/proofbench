import { useEffect, useState } from 'react';

const reducedMotion = () => typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

/** Counts from 0 to `target` once `start` turns true; jumps straight there under reduced motion. */
export function useCountUp(target: number, start: boolean, durationMs = 1100): number {
  const [value, setValue] = useState(0);
  useEffect(() => {
    if (!start) return;
    if (reducedMotion()) { setValue(target); return; }
    let frame = 0;
    const began = performance.now();
    const tick = (now: number) => {
      const progress = Math.min(1, (now - began) / durationMs);
      setValue(target * (1 - (1 - progress) ** 3));
      if (progress < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [target, start, durationMs]);
  return value;
}
