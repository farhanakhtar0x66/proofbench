import { useEffect, useId, useRef, type CSSProperties } from 'react';

const lanes = [20, 45, 75, 105, 130];

// ProofBench's take on Aceternity UI's scroll-driven Gemini path reveal.
export function GuideBeam() {
  const ref = useRef<SVGSVGElement>(null);
  const gradientId = useId();

  useEffect(() => {
    const art = ref.current;
    if (!art) return;
    const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
    let frame = 0;

    function update() {
      frame = 0;
      if (!art || motion.matches) return;
      const travel = Math.min(240, window.innerHeight * .3);
      const progress = .34 + Math.max(0, window.scrollY) / travel;
      art.style.setProperty('--guide-progress', String(Math.min(1, progress)));
    }

    function schedule() {
      if (!frame && !motion.matches) frame = window.requestAnimationFrame(update);
    }

    schedule();
    window.addEventListener('scroll', schedule, { passive: true });
    window.addEventListener('resize', schedule);
    motion.addEventListener('change', schedule);
    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener('scroll', schedule);
      window.removeEventListener('resize', schedule);
      motion.removeEventListener('change', schedule);
    };
  }, []);

  return <svg ref={ref} className="guide-beam" viewBox="0 0 660 150" preserveAspectRatio="none" fill="none" aria-hidden="true" focusable="false">
    <defs><linearGradient id={gradientId} x1="0" x2="260" gradientUnits="userSpaceOnUse">
      <stop stopColor="#8aadc0"/><stop offset=".65" stopColor="#329b82"/><stop offset="1" stopColor="#81b9a8"/>
    </linearGradient></defs>
    {['left', 'right'].map(side => <g key={side} transform={side === 'right' ? 'translate(660 0) scale(-1 1)' : undefined}>
      {lanes.map((y, index) => {
        const path = `M0 ${y}H46C134 ${y} 145 75 226 75H265`;
        return <g key={y}>
          <path className="guide-beam-track" d={path}/>
          <path className="guide-beam-glow" d={path} pathLength="1" stroke={`url(#${gradientId})`}
            style={{ '--guide-delay': index * .055 } as CSSProperties}/>
        </g>;
      })}
    </g>)}
  </svg>;
}
