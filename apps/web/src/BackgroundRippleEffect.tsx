import { useEffect, useRef } from 'react';

const rows = 8;
const columns = 27;

// Adapted from Aceternity UI's Background Ripple Effect for the workspace intro.
export function BackgroundRippleEffect() {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const background = ref.current;
    const header = background?.parentElement;
    const grid = background?.firstElementChild;
    if (!background || !header || !(grid instanceof HTMLElement)) return;

    const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
    const cells = Array.from(grid.children) as HTMLElement[];
    let hovered: HTMLElement | undefined;

    function clearHover() {
      hovered?.removeAttribute('data-hovered');
      hovered = undefined;
    }

    function cellAt(event: MouseEvent) {
      if (!background || !grid || motion.matches) return;
      if (event.target instanceof Element && event.target.closest('button, a, input, select, textarea, label')) return;
      const bounds = background.getBoundingClientRect();
      if (event.clientX < bounds.left || event.clientX >= bounds.right ||
        event.clientY < bounds.top || event.clientY >= bounds.bottom) return;
      const rect = grid.getBoundingClientRect();
      const size = rect.width / columns;
      const col = Math.floor((event.clientX - rect.left) / size);
      const row = Math.floor((event.clientY - rect.top) / size);
      if (col >= 0 && col < columns && row >= 0 && row < rows) return { row, col };
    }

    function hover(event: PointerEvent) {
      const cell = event.pointerType === 'touch' ? undefined : cellAt(event);
      const next = cell ? cells[cell.row * columns + cell.col] : undefined;
      if (next === hovered) return;
      clearHover();
      hovered = next;
      hovered?.setAttribute('data-hovered', '');
    }

    function ripple(event: MouseEvent) {
      const origin = cellAt(event);
      if (!origin) return;
      cells.forEach((cell, index) => {
        const distance = Math.hypot(origin.row - Math.floor(index / columns), origin.col - index % columns);
        cell.getAnimations().forEach(animation => animation.cancel());
        cell.animate([
          { opacity: .4, backgroundColor: '#2cbea006' },
          { opacity: .9, backgroundColor: '#2cbea03d', offset: .4 },
          { opacity: .4, backgroundColor: '#2cbea006' },
        ], { delay: distance * 55, duration: 200 + distance * 80, easing: 'ease-out' });
      });
    }

    function stopMotion() {
      if (!motion.matches) return;
      clearHover();
      cells.forEach(cell => cell.getAnimations().forEach(animation => animation.cancel()));
    }

    // Listen on the intro so the decorative layer never blocks text or controls.
    header.addEventListener('pointermove', hover, { passive: true });
    header.addEventListener('pointerleave', clearHover);
    header.addEventListener('click', ripple);
    motion.addEventListener('change', stopMotion);
    return () => {
      header.removeEventListener('pointermove', hover);
      header.removeEventListener('pointerleave', clearHover);
      header.removeEventListener('click', ripple);
      motion.removeEventListener('change', stopMotion);
      clearHover();
      cells.forEach(cell => cell.getAnimations().forEach(animation => animation.cancel()));
    };
  }, []);

  return <div className="background-ripple" ref={ref} aria-hidden="true">
    <div className="background-ripple-grid">
      {Array.from({ length: rows * columns }, (_, index) => <div className="ripple-cell" key={index}/>)}
    </div>
  </div>;
}
