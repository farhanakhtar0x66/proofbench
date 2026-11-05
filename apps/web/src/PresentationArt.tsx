import { useEffect, useRef, useState, type CSSProperties } from 'react';

export function useViewportEntry<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [entered, setEntered] = useState(false);

  useEffect(() => {
    if (!ref.current || !('IntersectionObserver' in window)) {
      setEntered(true);
      return;
    }
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) {
        setEntered(true);
        observer.disconnect();
      }
    }, { threshold: .14 });
    observer.observe(ref.current);
    return () => observer.disconnect();
  }, []);

  return { ref, entered };
}

const portalCenter = { x: 345, y: 218 };
const portalRadius = { x: 28, y: 173 };
const rimDepth = 19;
const portalThreads = Array.from({ length: 21 }, (_, index) => {
  const angle = (index / 20 - .5) * Math.PI * .93;
  const x = portalCenter.x - portalRadius.x * Math.cos(angle);
  const y = portalCenter.y + portalRadius.y * Math.sin(angle);
  const spread = Math.abs(y - portalCenter.y);
  return `M10 ${portalCenter.y} C${96 + spread * .19} ${portalCenter.y} ${120 + spread * .13} ${y} ${x - 37} ${y} H${x}`;
});
const portalRibs = Array.from({ length: 41 }, (_, index) => {
  const angle = (index / 40 - .5) * Math.PI;
  const x = portalCenter.x + portalRadius.x * Math.cos(angle);
  const y = portalCenter.y + portalRadius.y * Math.sin(angle);
  return `M${x} ${y}h${rimDepth}`;
});
const pulseTracks = [1, 4, 7, 9, 11, 14, 17, 20];
const telemetry = [
  { x: 51, y: 61, rows: ['01001011 0110', '11010100 0011', '00101101 0101', '10111001 1010', '01001100 0010'] },
  { x: 249, y: 403, rows: ['[0214] [1082]', '[1403] [0110]', '[0745] [2311]'] },
];

export function PortalArt() {
  const ref = useRef<HTMLDivElement>(null);
  const [inView, setInView] = useState(false);
  useEffect(() => {
    if (!ref.current || !('IntersectionObserver' in window)) return;
    const observer = new IntersectionObserver(([entry]) => setInView(entry.isIntersecting));
    observer.observe(ref.current);
    return () => observer.disconnect();
  }, []);

  return <div className="hero-portals" ref={ref} data-playing={inView} aria-hidden="true">
    {(['inbound', 'outbound'] as const).map(side => {
      const outbound = side === 'outbound';
      return <svg key={side} className={`portal-panel ${side}`} viewBox="0 0 405 436" fill="none">
        <g className="portal-telemetry">
          {telemetry.map(({ x, y, rows }) => <text key={x} x={outbound ? 405 - x : x} y={y} textAnchor={outbound ? 'end' : 'start'}>
            {rows.map((row, index) => <tspan key={row} x={outbound ? 405 - x : x} dy={index === 0 ? 0 : 7}>{row}</tspan>)}
          </text>)}
        </g>
        <g transform={outbound ? 'translate(405 0) scale(-1 1)' : undefined}>
          <g className="portal-threads">
            {portalThreads.map(path => <path key={path} d={path}/>)}
          </g>
          <g className="portal-signals">
            {pulseTracks.map((track, index) => <path key={track} d={portalThreads[track]} pathLength={1}
              style={{ '--pulse-delay': `${-(index * .53 + (outbound ? 1.43 : .11))}s` } as CSSProperties}/>)}
          </g>
          <g className="portal-rim">
            <path className="portal-rim-wall" d="M345 45h19a28 173 0 0 1 0 346h-19a28 173 0 0 0 0-346Z"/>
            {portalRibs.map(path => <path className="portal-rib" key={path} d={path}/>)}
            <ellipse cx={portalCenter.x} cy={portalCenter.y} rx={portalRadius.x} ry={portalRadius.y}/>
            <ellipse cx="345" cy="218" rx="24" ry="163"/>
            <path className="portal-etching" d="m325 99 6 13-4 21m-6 11 6 13-3 20m-4 16v43m3 16 5 17-3 17m3 18 5 13-2 12m26-244 8 10m-1 241-7 12"/>
            <path className="portal-rim-scan" d="M364 45a28 173 0 0 1 0 346" pathLength={1}/>
          </g>
        </g>
      </svg>;
    })}
  </div>;
}

const binaryColumns = Array.from({ length: 69 }, (_, index) => {
  const height = 2 + Math.floor(3 + 2.4 * Math.sin(index * .32) + 1.8 * Math.cos(index * .75));
  const bits = Array.from({ length: height }, (_, row) => (index * 5 + row * 7 + index * row) % 4 > 0 ? '1' : '0');
  return { index, bits };
});

export function BinaryField() {
  const { ref, entered } = useViewportEntry<HTMLDivElement>();
  return <div className="binary-field" ref={ref} data-entered={entered} aria-hidden="true">
    <div className="binary-columns">
      {binaryColumns.map(({ index, bits }) => <span key={index} style={{ '--column-delay': `${(index * 17) % 420}ms` } as CSSProperties}>
        {bits.map((bit, row) => <i key={row}>{bit}</i>)}
      </span>)}
    </div>
  </div>;
}

export type Diagram = 'route' | 'trace' | 'archive' | 'claim' | 'sources' | 'review';

function Sheet({ x, y, kind }: { x: number; y: number; kind: 'text' | 'chart' | 'check' }) {
  return <g transform={`translate(${x} ${y})`}>
    <path className="diagram-paper" d="M0 0 74 16v86L0 86Z"/>
    <path d="m0 0 8-5 74 16v86l-8 5m0-86 8-5M7 16l61 13"/>
    {kind === 'text' && <path d="m11 32 47 10m-47 1 41 9m-41 2 47 10m-47 1 26 6m-26 5 21 5"/>}
    {kind === 'chart' && <path d="M13 72V42m0 30 48 10m-39-13V57m11 15V53m11 22V57m11 21V47"/>}
    {kind === 'check' && <><ellipse cx="37" cy="60" rx="15" ry="17"/><path d="m29 60 6 7 11-13"/></>}
  </g>;
}

export function FeatureArt({ kind }: { kind: Diagram }) {
  return <svg viewBox="0 0 280 155" className="feature-art" aria-hidden="true" fill="none">
    {kind === 'route' && <>
      <path className="diagram-route" d="M66 71h32l20 13m45 3h29l23-35m-29 35 26 35"/>
      <path className="diagram-paper" d="m22 59 22-12 30 8v25l-22 12-30-8Zm86 21 24-13 34 8v28l-24 13-34-8Zm91-41 21-11 30 7v24l-21 12-30-8Zm-4 68 21-11 31 7v23l-21 12-31-8Z"/>
      <path d="m22 59 30 8 22-12m-22 12v25m56-12 34 8 24-13m-24 13v28m57-77 30 8 21-12m-21 12v24m-34 36 31 8 21-12m-21 12v23"/>
    </>}
    {kind === 'trace' && <>
      <path className="diagram-route" d="M55 114C44 45 109 18 155 31s70 27 69 83M67 121c41 22 117 23 154 0"/>
      <Sheet x={95} y={25} kind="chart"/>
      <path className="diagram-paper" d="m23 62 42 9v27l-42-9Zm186 8 45 9v27l-45-9Z"/>
      <path d="m31 76 25 5m161 3 28 6"/>
    </>}
    {kind === 'archive' && <>
      <path className="diagram-route" d="m21 105 31 12 164 26 41-20"/>
      <Sheet x={141} y={24} kind="text"/><Sheet x={109} y={35} kind="text"/><Sheet x={77} y={47} kind="chart"/>
    </>}
    {kind === 'claim' && <>
      <path className="diagram-route" d="M42 116h28l25-19m89-41 24-16h37"/>
      <Sheet x={102} y={23} kind="text"/>
      <path className="diagram-paper" d="m38 69 54 11v27l-54-12Z"/>
      <path d="m48 83 31 7m-31 1 25 6"/>
      <circle cx="216" cy="89" r="16"/><path d="m228 101 15 15"/>
    </>}
    {kind === 'sources' && <>
      <path className="diagram-route" d="M58 108 136 65l82 40"/>
      <Sheet x={36} y={45} kind="text"/><Sheet x={161} y={29} kind="check"/>
      <circle className="diagram-paper" cx="136" cy="68" r="8"/>
    </>}
    {kind === 'review' && <>
      <path className="diagram-route" d="M38 82h43m108 21h51m-102 8v32"/>
      <Sheet x={84} y={33} kind="text"/><Sheet x={117} y={20} kind="check"/>
      <path d="m32 76 7 6-7 6m201 10 7 5-7 6m-101 28 6 6 6-6"/>
    </>}
  </svg>;
}
