import type { ReactNode } from 'react';
import { EncryptedText } from './EncryptedText';
import { GuideBeam } from './GuideBeam';
import { BackgroundRippleEffect } from './BackgroundRippleEffect';
import './workspace-opening.css';

const plates = {
  execution: ['02', 'Execution flow'],
  ledger: ['03', 'Run archive'],
  graph: ['04', 'Graph acceptance'],
  routing: ['05', 'Routing paths'],
  verifier: ['06', 'Source inspection'],
} as const;

export type OpeningScene = keyof typeof plates | 'guide';

function ExecutionFlow() {
  const stages = [
    { x: 26, label: 'TASK', glyph: 'M16 22h14m-14 7h22m-22 7h17' },
    { x: 163, label: 'ROUTE', glyph: 'M16 29h12m0 0 9-8m-9 8 9 8' },
    { x: 300, label: 'CHECK', glyph: 'm16 28 7 7 13-14' },
  ];

  return <>
    <path className="opening-line" d="M18 86H402M69 46v80m137-80v80m137-80v80"/>
    <path className="opening-line opening-dashed" d="M69 118v23h274v-23"/>
    <path className="opening-signal" pathLength="1" d="M18 86H402"/>
    {stages.map(({ x, label, glyph }, index) => <g key={label} transform={`translate(${x} 59)`}>
      <rect className="opening-paper" width="86" height="54"/>
      <path className="opening-ink" d={glyph}/>
      <text x="66" y="20" textAnchor="middle">0{index + 1}</text>
      <text x="43" y="72" textAnchor="middle">{label}</text>
    </g>)}
    <text x="207" y="157" textAnchor="middle">TRACE RECORDED</text>
  </>;
}

function RunArchive() {
  return <>
    <path className="opening-line opening-dashed" d="M34 137h348m-33-91h36m-36 60h36M96 32H45v105"/>
    <g className="opening-archive-sheet">
      <rect className="opening-paper" x="107" y="37" width="202" height="84"/>
      <path className="opening-line" d="M121 50h86m-86 8h53m56-8h64"/>
    </g>
    <g className="opening-archive-sheet">
      <rect className="opening-paper" x="98" y="46" width="202" height="84"/>
      <path className="opening-line" d="M112 59h86m-86 8h53m56-8h64"/>
    </g>
    <g className="opening-archive-sheet">
      <rect className="opening-paper" x="89" y="55" width="202" height="84"/>
      <path className="opening-line" d="M89 75h202m-202 20h202m-202 21h202m-154-41v64m97-64v64"/>
      <rect className="opening-wash opening-archive-highlight" x="90" y="96" width="200" height="19"/>
      <text x="101" y="69">RUN RECORD</text>
      <path className="opening-ink" d="M150 85h42m-42 20h58m-58 21h34m65-41 3 3 5-6m-8 23 3 3 5-6m-8 23 3 3 5-6"/>
      <text x="102" y="88">001</text><text x="102" y="109">002</text><text x="102" y="130">003</text>
    </g>
    <text x="319" y="69">INDEX</text><text x="319" y="87">HISTORY</text>
  </>;
}

function GraphAcceptance() {
  const nodes = [[53, 84], [117, 40], [117, 126], [181, 84], [242, 50], [242, 116]];
  return <>
    <path className="opening-line" d="m53 84 64-44 64 44-64 42-64-42m64-44v86m64-42 61-34m-61 34 61 32m0-66v66"/>
    <path className="opening-ink" d="m53 84 64-44 64 44 61-34"/>
    <path className="opening-signal" pathLength="1" d="m53 84 64-44 64 44 61-34h28"/>
    {nodes.map(([x, y], index) => <circle className={index === 2 || index === 5 ? 'opening-paper' : 'opening-node'} key={`${x}:${y}`} cx={x} cy={y} r="5"/>)}
    <path className="opening-line opening-dashed" d="M252 116h19"/>
    <rect className="opening-paper" x="271" y="37" width="112" height="96"/>
    <path className="opening-line" d="M271 63h112m-112 28h112"/>
    <text x="283" y="54">SAME CHECKS</text><text x="283" y="81">AGENT A</text><text x="283" y="110">AGENT B</text>
    <path className="opening-ink opening-check" pathLength="1" d="m354 78 4 4 8-9"/>
    <path className="opening-line" d="M354 107h12"/>
    <text x="51" y="155">SHARED INPUT</text><text x="383" y="155" textAnchor="end">VERDICTS</text>
  </>;
}

function RoutingPaths() {
  const governed = 'M41 85h61c27 0 23-37 51-37h101c28 0 26 37 52 37h70';
  const frontier = 'M41 85h61c27 0 23 37 51 37h101c28 0 26-37 52-37h70';
  return <>
    <path className="opening-line opening-dashed" d="M24 85h371"/>
    <path className="opening-ink" d={governed}/><path className="opening-line" d={frontier}/>
    <path className="opening-signal" pathLength="1" d={governed}/>
    <path className="opening-signal opening-signal-secondary" pathLength="1" d={frontier}/>
    <circle className="opening-node" cx="41" cy="85" r="6"/><circle className="opening-node" cx="376" cy="85" r="6"/>
    <rect className="opening-paper" x="157" y="37" width="95" height="22"/>
    <rect className="opening-paper" x="157" y="111" width="95" height="22"/>
    <text x="204" y="51" textAnchor="middle">GOVERNED</text><text x="204" y="125" textAnchor="middle">DIRECT</text>
    <text x="41" y="109" textAnchor="middle">TASK</text><text x="376" y="109" textAnchor="middle">GRADE</text>
  </>;
}

function SourceInspection() {
  return <>
    <rect className="opening-paper" x="52" y="30" width="151" height="110"/>
    <rect className="opening-wash" x="65" y="76" width="124" height="19"/>
    <path className="opening-line" d="M52 56h151m-138 11h94m-94 18h106m-106 20h112m-112 12h68"/>
    <text x="66" y="46">CLAIM</text>
    <path className="opening-line opening-dashed" d="M203 86h34m20 0h24"/>
    <g className="opening-scan"><path className="opening-ink" d="M57 69h141"/><circle className="opening-node" cx="198" cy="69" r="2"/></g>
    <circle className="opening-paper" cx="246" cy="86" r="13"/>
    <path className="opening-ink" d="m255 95 10 10"/>
    <rect className="opening-paper" x="281" y="43" width="84" height="29"/>
    <rect className="opening-paper" x="281" y="99" width="84" height="29"/>
    <path className="opening-ink" d="M271 86h-5m5 0V58h10m-10 28v27h10"/>
    <text x="293" y="61">SOURCE A</text><text x="293" y="117">SOURCE B</text>
  </>;
}

const illustrations = {
  execution: ExecutionFlow, ledger: RunArchive, graph: GraphAcceptance,
  routing: RoutingPaths, verifier: SourceInspection,
};

export function WorkspaceOpening({ scene, label, title, description, titleId = 'page-title', children }: {
  scene: OpeningScene; label: string; title: string; description: string; titleId?: string; children?: ReactNode;
}) {
  return <header className="workspace-opening" data-scene={scene}>
    {scene === 'guide' && <GuideBeam/>}
    {scene === 'graph' && <BackgroundRippleEffect/>}
    <div className="opening-copy">
      <p className="eyebrow">[ <EncryptedText text={label}/> ]</p>
      <h1 id={titleId} tabIndex={-1}>{title}</h1>
      <p className="opening-description">{description}</p>
      {children && <div className="opening-actions">{children}</div>}
    </div>
    {scene !== 'guide' && scene !== 'graph' && <OpeningFigure scene={scene}/>}
  </header>;
}

function OpeningFigure({ scene }: { scene: keyof typeof plates }) {
  const [number, caption] = plates[scene];
  const Illustration = illustrations[scene];
  return <figure className="opening-figure" aria-hidden="true">
    <svg className="opening-art" viewBox="0 0 420 172" fill="none" focusable="false"><Illustration/></svg>
    <figcaption><span>FIG. {number}</span><span>{caption}</span></figcaption>
  </figure>;
}
