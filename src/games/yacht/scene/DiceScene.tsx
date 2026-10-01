import { ContactShadows, Environment, Lightformer, PerformanceMonitor } from '@react-three/drei'
import { Canvas, useThree } from '@react-three/fiber'
import { useEffect, useState } from 'react'
import type * as THREE from 'three'
import { Dice, type DiceProps } from './Dice'
import { RIM, TRAY_D, TRAY_W } from './layout'
import { Tray } from './Tray'

// 레티나 2x 에 MSAA 를 쓰면 프레임버퍼가 네 배가 된다. 이 씬에서는 1.5x 도 똑같아 보인다.
const MAX_DPR = typeof window === 'undefined' ? 1 : Math.min(window.devicePixelRatio || 1, 1.5)

/** 쟁반과 주사위. 카메라는 고정이고 쟁반 전체가 화면에 들어오게 맞춘다. */
export function DiceScene({ className, ...dice }: DiceProps & { className?: string }) {
  // 기기가 버티지 못하면 1x 로 영구히 낮춘다.
  const [dpr, setDpr] = useState(MAX_DPR)
  return (
    <Canvas
      className={className}
      shadows="percentage"
      dpr={dpr}
      camera={{ fov: 32, position: [0, 16, 12], near: 0.5, far: 200 }}
      gl={{ antialias: true, alpha: true }}
    >
      <PerformanceMonitor onDecline={() => setDpr(1)} />
      <Lights />
      <CameraRig />
      <Tray />
      <Dice {...dice} />
    </Canvas>
  )
}

export function Lights() {
  return (
    <>
      <hemisphereLight args={['#fff6e6', '#4a5a44', 0.8]} />
      <directionalLight
        position={[-5, 16, 7]}
        intensity={2.2}
        color="#fff1dc"
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-camera-left={-10}
        shadow-camera-right={10}
        shadow-camera-top={10}
        shadow-camera-bottom={-10}
        shadow-bias={-0.0004}
        shadow-radius={3}
      />
      <Environment resolution={128}>
        <Lightformer form="rect" intensity={2.4} position={[0, 8, 4]} scale={[12, 6, 1]} rotation-x={-Math.PI / 3} />
        <Lightformer form="circle" intensity={1.2} color="#ffd6a8" position={[-8, 4, -2]} scale={5} />
        <Lightformer form="circle" intensity={1} color="#b8d8ff" position={[8, 3, -4]} scale={4} />
      </Environment>
      <ContactShadows frames={1} position={[0, -0.31, 0]} scale={30} blur={2.4} opacity={0.45} far={4} resolution={512} />
    </>
  )
}

/** 쟁반 전체가 들어오는 거리. 세로로 긴 화면이면 더 물러난다. */
function CameraRig() {
  const { camera, size } = useThree()
  useEffect(() => {
    const cam = camera as THREE.PerspectiveCamera
    const aspect = size.width / size.height
    const halfW = TRAY_W / 2 + RIM + 0.3
    const halfD = TRAY_D / 2 + RIM + 0.3
    const elev = 1.08
    const vt = Math.tan((cam.fov * Math.PI) / 360)
    const d = Math.max(halfW / (vt * aspect), (halfD * Math.sin(elev) + 0.8) / vt) * 1.04
    cam.position.set(0, d * Math.sin(elev), 0.4 + d * Math.cos(elev))
    cam.lookAt(0, 0, 0.4)
    cam.updateProjectionMatrix()
  }, [camera, size])
  return null
}
