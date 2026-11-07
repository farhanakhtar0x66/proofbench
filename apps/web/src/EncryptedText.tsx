import { useEffect, useState } from 'react';
import { useViewportEntry } from './PresentationArt';

const glyphs = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789#*+<>?';
const flipIntervalMs = 34;

// Adapted from Aceternity UI's Encrypted Text reveal for ProofBench's mono labels.
export function EncryptedText({ text }: { text: string }) {
  const { ref, entered } = useViewportEntry<HTMLSpanElement>();
  const [frame, setFrame] = useState<{ revealed: string; scrambled: string } | null>(null);

  useEffect(() => {
    if (!entered || !text) return;
    const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
    if (motion.matches) return;

    const characterDelay = Math.min(30, 690 / text.length);
    const start = performance.now();
    let nextFlip = start;
    let requestId = 0;

    function reveal(now: number) {
      const count = Math.floor((now - start) / characterDelay);
      if (count >= text.length) {
        setFrame(null);
        return;
      }
      if (now >= nextFlip) {
        const scrambled = text.slice(count).replace(/[a-z0-9]/gi, () => glyphs.charAt(Math.floor(Math.random() * glyphs.length)));
        setFrame({ revealed: text.slice(0, count), scrambled });
        nextFlip = now + flipIntervalMs;
      }
      requestId = window.requestAnimationFrame(reveal);
    }

    function stopForReducedMotion() {
      if (!motion.matches) return;
      window.cancelAnimationFrame(requestId);
      setFrame(null);
    }

    reveal(start);
    motion.addEventListener('change', stopForReducedMotion);
    return () => {
      window.cancelAnimationFrame(requestId);
      motion.removeEventListener('change', stopForReducedMotion);
    };
  }, [entered, text]);

  return <span className="encrypted-text" ref={ref} data-revealing={frame ? '' : undefined}>
    <span className="encrypted-text-source">{text}</span>
    {frame && <span className="encrypted-text-visual" aria-hidden="true">
      {frame.revealed}<span className="encrypted-text-noise">{frame.scrambled}</span>
    </span>}
  </span>;
}
