import { ContactShadows, Environment, Lightformer, OrbitControls, PerformanceMonitor } from '@react-three/drei'
import { Canvas, useThree, type ThreeEvent } from '@react-three/fiber'
import { useEffect, useState } from 'react'
import * as THREE from 'three'
import { BLACK, WHITE, type Color } from '../game/rules'
import { Board, Bowl } from './Board'
import { BOARD_SIZE, BOARD_TOP, HALF, nearestCell } from './layout'
import { ForbiddenMarks, Ghost, Stones, type StonesProps } from './Stones'

interface Props extends StonesProps {
  portrait: boolean
  /** 둘 수 있을 때만 판이 입력을 받는다. */
  interactive: boolean
  /** 비치는 돌. 없으면 null. */
  ghost: { p: number; color: Color; pulse: boolean } | null
  forbidden: number[]
  onHover: (p: number | null) => void
  onPick: (p: number) => void
  className?: string
}

// 레티나 2x 에 MSAA 를 쓰면 프레임버퍼가 네 배가 된다. 이 씬에서는 1.5x 도 똑같아 보인다.
const MAX_DPR = typeof window === 'undefined' ? 1 : Math.min(window.devicePixelRatio || 1, 1.5)
/** 이보다 많이 끌면 판을 돌린 것으로 보고 돌을 두지 않는다(px). */
const DRAG_PX = 8

export function OmokScene({ portrait, interactive, ghost, forbidden, onHover, onPick, className, ...stones }: Props) {
  // 기기가 버티지 못하면 1x 로 영구히 낮춘다.
  const [dpr, setDpr] = useState(MAX_DPR)

  const cellOf = (e: ThreeEvent<PointerEvent | MouseEvent>) => nearestCell(e.point.x, e.point.z)

  return (
    <Canvas
      className={className}
      shadows="percentage"
      dpr={dpr}
      camera={{ fov: 34, position: [0, 22, 12], near: 0.5, far: 200 }}
      gl={{ antialias: true, alpha: true }}
    >
      <PerformanceMonitor onDecline={() => setDpr(1)} />
      <Lights layoutKey={String(portrait)} />
      <CameraRig portrait={portrait} />
      <Board />
      {!portrait && (
        <>
          <Bowl color={BLACK} position={[-HALF - 4.2, 0, 2.5]} />
          <Bowl color={WHITE} position={[HALF + 4.2, 0, -2.5]} />
        </>
      )}
      <Stones {...stones} />
      <ForbiddenMarks cells={forbidden} />
      {ghost && <Ghost {...ghost} />}

      {interactive && (
        <mesh
          rotation-x={-Math.PI / 2}
          position-y={BOARD_TOP + 0.02}
          visible={false}
          onPointerMove={(e) => onHover(cellOf(e))}
          onPointerOut={() => onHover(null)}
          onClick={(e) => {
            if (e.delta > DRAG_PX) return
            const p = cellOf(e)
            if (p !== null) onPick(p)
          }}
        >
          <planeGeometry args={[BOARD_SIZE, BOARD_SIZE]} />
        </mesh>
      )}
    </Canvas>
  )
}

/** Contact shadow 는 정적인 판만 덮으므로 레이아웃마다 한 번 굽는다. 돌에는 directional shadow 가 적용된다. */
export function Lights({ layoutKey = '' }: { layoutKey?: string }) {
  return (
    <>
      <hemisphereLight args={['#fff6e6', '#6b5a44', 0.85]} />
      <directionalLight
        position={[-6, 18, 8]}
        intensity={2.2}
        color="#fff1dc"
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-camera-left={-14}
        shadow-camera-right={14}
        shadow-camera-top={14}
        shadow-camera-bottom={-14}
        shadow-bias={-0.0004}
        shadow-radius={3}
      />
      <Environment resolution={128}>
        <Lightformer form="rect" intensity={2.6} position={[0, 8, 4]} scale={[12, 6, 1]} rotation-x={-Math.PI / 3} />
        <Lightformer form="circle" intensity={1.3} color="#ffd6a8" position={[-8, 4, -2]} scale={5} />
        <Lightformer form="circle" intensity={1.1} color="#b8d8ff" position={[8, 3, -4]} scale={4} />
      </Environment>
      <ContactShadows key={layoutKey} frames={1} position={[0, 0.01, 0]} scale={40} blur={2.4} opacity={0.4} far={6} resolution={512} />
    </>
  )
}

function CameraRig({ portrait }: { portrait: boolean }) {
  const { camera, size, controls } = useThree()
  useEffect(() => {
    const cam = camera as THREE.PerspectiveCamera
    const aspect = size.width / size.height
    // 판 반쪽 크기에 위 HUD, 아래 독이 가리는 만큼을 더한다. 가로 화면은 양옆 돌통까지 넣는다.
    const halfW = portrait ? BOARD_SIZE / 2 + 0.3 : BOARD_SIZE / 2 + 6
    const halfD = BOARD_SIZE / 2 + (portrait ? 2.6 : 1.8)
    const elev = portrait ? 1.3 : 1.12
    const vt = Math.tan((cam.fov * Math.PI) / 360)
    const d = Math.max(halfW / (vt * aspect), (halfD * Math.sin(elev) + 1) / vt) * 1.02
    const target = new THREE.Vector3(0, 0, portrait ? 0.9 : 0.6)
    cam.position.set(0, target.y + d * Math.sin(elev), target.z + d * Math.cos(elev))
    cam.lookAt(target)
    cam.updateProjectionMatrix()
    const c = controls as unknown as { target: THREE.Vector3; update: () => void; minDistance: number; maxDistance: number } | null
    if (c) {
      c.target.copy(target)
      c.minDistance = d * 0.5
      c.maxDistance = d * 1.3
      c.update()
    }
  }, [camera, size, portrait, controls])

  return <OrbitControls makeDefault enablePan={false} enableDamping minPolarAngle={0} maxPolarAngle={1.0} rotateSpeed={0.5} />
}
