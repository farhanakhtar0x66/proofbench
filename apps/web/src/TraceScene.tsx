import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { Line } from '@react-three/drei';
import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { Group, MathUtils } from 'three';
import { useTheme } from './theme';

// Scene colours per theme. Dark keeps the same greens but drops the floor grid and
// the idle blocks into the page's neutral black, so the selected station carries the light.
const palettes = {
  light: { key: '#f1fffa', fill: '#b9ddd0', keyLight: 3.3, ambient: 1.2, gridMajor: '#a2c4b8', gridMinor: '#c9ded5', route: '#74aa98',
    done: '#67a993', current: '#159778', ahead: '#8aaca1', trimOn: '#38b797', trimOff: '#a1bdb3', baseOn: '#1c7962', baseOff: '#607f75',
    deckOn: '#2c977c', deckOff: '#a0b8af', bodyOn: '#32967f', bodyOff: '#9cb7ad', toolOn: '#b8f6df', toolHover: '#edf8f3', toolOff: '#d7e6df', ledOn: '#d3ffef', ledOff: '#658d80' },
  dark: { key: '#e6fff5', fill: '#3d7a66', keyLight: 2.4, ambient: .55, gridMajor: '#28463b', gridMinor: '#1a2924', route: '#3a7563',
    done: '#4f9c82', current: '#3ccfae', ahead: '#33554a', trimOn: '#3ccfae', trimOff: '#3b5a50', baseOn: '#145c4b', baseOff: '#1d2b26',
    deckOn: '#1f7d66', deckOff: '#2a3a34', bodyOn: '#2a8f76', bodyOff: '#33443e', toolOn: '#b8f6df', toolHover: '#cfe9df', toolOff: '#6f8a80', ledOn: '#d3ffef', ledOff: '#3f6b5d' },
};
type Palette = typeof palettes.light;

const motionQuery = '(prefers-reduced-motion: reduce)';
function watchMotionPreference(notify: () => void) {
  const media = window.matchMedia(motionQuery);
  media.addEventListener('change', notify);
  return () => media.removeEventListener('change', notify);
}
const prefersReducedMotion = () => window.matchMedia(motionQuery).matches;

type Point = [number, number, number];
const stations: Point[] = [[-5.2, 0, .7], [-2.6, 0, -.5], [0, 0, .35], [2.6, 0, -.7], [5.2, 0, .2]];
const heights = [.56, .96, 1.3, .84, 1.06];
const boardRoutes: Point[][] = [
  [[-6.6, -.21, 1.8], [-3.8, -.21, 1.8], [-3, -.21, 2.6], [2.3, -.21, 2.6], [3.35, -.21, 1.55], [6.6, -.21, 1.55]],
  [[-6.6, -.21, 2.02], [-4, -.21, 2.02], [-3.2, -.21, 2.82], [2.4, -.21, 2.82], [3.45, -.21, 1.77], [6.6, -.21, 1.77]],
  [[-6.6, -.21, -1.25], [-3.7, -.21, -1.25], [-2.85, -.21, -2.1], [2.65, -.21, -2.1], [3.65, -.21, -1.1], [6.6, -.21, -1.1]],
  [[-6.6, -.21, -1.5], [-3.8, -.21, -1.5], [-2.95, -.21, -2.35], [2.75, -.21, -2.35], [3.75, -.21, -1.35], [6.6, -.21, -1.35]],
];

function View() {
  const { camera, size, invalidate } = useThree();
  useEffect(() => {
    camera.zoom = Math.min(size.width / 14, size.height / 5.4);
    camera.lookAt(0, .24, 0);
    camera.updateProjectionMatrix();
    invalidate();
  }, [camera, size.width, size.height, invalidate]);
  return null;
}

function Instrument({ index, color }: { index: number; color: string }) {
  const material = <meshStandardMaterial color={color} roughness={.43} metalness={.25}/>;
  switch (index) {
    case 0:
      return <group>
        {[0, .16, .32].map((layer) => <mesh key={layer} position={[0, layer, 0]}>
          <boxGeometry args={[.9, .09, .68]}/>{material}
        </mesh>)}
      </group>;
    case 1:
      return <group rotation={[Math.PI / 2, 0, Math.PI / 4]}>
        <mesh><torusGeometry args={[.44, .075, 8, 4]}/>{material}</mesh>
        <mesh><torusGeometry args={[.23, .035, 8, 4]}/>{material}</mesh>
      </group>;
    case 2:
      return <mesh rotation={[0, Math.PI / 4, 0]}><octahedronGeometry args={[.61]}/>{material}</mesh>;
    case 3:
      return <group>
        {[.24, .48, .68].map((height, index) => <mesh key={height} position={[(index - 1) * .29, height / 2, 0]}>
          <boxGeometry args={[.16, height, .48]}/>{material}
        </mesh>)}
      </group>;
    default:
      return <mesh rotation={[Math.PI / 2, 0, 0]}><torusGeometry args={[.36, .11, 12, 32]}/>{material}</mesh>;
  }
}

export default function TraceScene({ active, onSelect }: {
  active: number;
  onSelect: (index: number) => void;
}) {
  const reducedMotion = useSyncExternalStore(watchMotionPreference, prefersReducedMotion);
  const [hovered, setHovered] = useState<number>();
  const colors = palettes[useTheme()];
  return <Canvas orthographic flat camera={{ position: [2.35, 7.4, 14], near: .1, far: 60 }}
    dpr={[1, 1.5]} frameloop="demand" gl={{ antialias: true, alpha: true }}>
    <View/>
    <ambientLight intensity={colors.ambient}/>
    <directionalLight position={[-4, 7, 4]} intensity={colors.keyLight} color={colors.key}/>
    <directionalLight position={[3, 2, -5]} intensity={1.55} color={colors.fill}/>
    <gridHelper key={colors.gridMinor} args={[22, 44, colors.gridMajor, colors.gridMinor]} position={[0, -.24, 0]} onAfterRender={renderer => {
      if (!renderer.domElement.dataset.rendered) renderer.domElement.dataset.rendered = 'true';
    }}/>
    {boardRoutes.map((points, index) => <Line key={index} points={points} color={colors.route} transparent opacity={.56} lineWidth={.8}/>)}
    {stations.slice(1).map(([nextX, , nextZ], index) => {
      const [x, , z] = stations[index];
      const mid = (x + nextX) / 2;
      return <Line key={nextX} points={[[x, -.09, z], [mid, -.09, z], [mid, -.09, nextZ], [nextX, -.09, nextZ]]}
        color={index < active ? colors.done : index === active ? colors.current : colors.ahead} lineWidth={1.7}/>;
    })}
    {stations.map((point, index) => <Station key={index} point={point} index={index} selected={index === active}
      hovered={index === hovered} reducedMotion={reducedMotion} colors={colors} onHover={setHovered} onSelect={onSelect}/>)}
  </Canvas>;
}

function Station({ point, index, selected, hovered, reducedMotion, colors, onHover, onSelect }: {
  colors: Palette;
  point: Point;
  index: number;
  selected: boolean;
  hovered: boolean;
  reducedMotion: boolean;
  onHover: (index: number | undefined) => void;
  onSelect: (index: number) => void;
}) {
  const module = useRef<Group>(null);
  const height = heights[index];
  const trim = selected ? colors.trimOn : colors.trimOff;
  const lift = selected ? .15 : hovered ? .1 : 0;

  useFrame(({ invalidate }, delta) => {
    if (!module.current) return;
    const y = module.current.position.y;
    if (Math.abs(y - lift) < .001 || reducedMotion) {
      module.current.position.y = lift;
      return;
    }
    module.current.position.y = MathUtils.damp(y, lift, 13, delta);
    invalidate();
  });

  return <group position={point}
    onPointerOver={event => { event.stopPropagation(); onHover(index); }}
    onPointerOut={() => onHover(undefined)}
    onClick={event => { event.stopPropagation(); onSelect(index); }}>
    <mesh position={[0, -.175, 0]}>
      <boxGeometry args={[1.98, .105, 1.72]}/>
      <meshStandardMaterial color={selected ? colors.baseOn : colors.baseOff} metalness={.45} roughness={.4}/>
    </mesh>
    <mesh position={[0, -.08, 0]}>
      <boxGeometry args={[1.8, .115, 1.55]}/>
      <meshStandardMaterial color={selected ? colors.deckOn : colors.deckOff} roughness={.5}/>
    </mesh>
    <Line points={[[-.85, -.022, -.72], [.85, -.022, -.72], [.85, -.022, .72], [-.85, -.022, .72], [-.85, -.022, -.72]]}
      color={trim} transparent opacity={selected || hovered ? .95 : .45} lineWidth={1.4}/>
    <group ref={module}>
      <mesh position={[0, height / 2 - .015, 0]}>
        <boxGeometry args={[1.26, height, 1.04]}/>
        <meshStandardMaterial color={selected ? colors.bodyOn : colors.bodyOff} metalness={.28} roughness={.42}/>
      </mesh>
      <mesh position={[0, height, 0]}>
        <boxGeometry args={[1.36, .065, 1.14]}/>
        <meshStandardMaterial color={trim} metalness={.2} roughness={.46}/>
      </mesh>
      <group position={[0, height + (index === 2 ? .64 : .15), 0]}>
        <Instrument index={index} color={selected ? colors.toolOn : hovered ? colors.toolHover : colors.toolOff}/>
      </group>
      <Line points={[[-.42, .16, .532], [.37, .16, .532]]} color={trim} lineWidth={1.15}/>
      <Line points={[[-.42, .24, .532], [-.13, .24, .532]]} color={trim} lineWidth={1.15}/>
      <mesh position={[.43, .25, .53]}>
        <circleGeometry args={[.04, 12]}/>
        <meshBasicMaterial color={selected ? colors.ledOn : colors.ledOff}/>
      </mesh>
    </group>
  </group>;
}
