import { Canvas, useFrame } from '@react-three/fiber'
import { useRef, type ReactNode } from 'react'
import type * as THREE from 'three'
import { Board } from '../scene/Board'
import { Lights } from '../scene/GameScene'

/** 메뉴 카드 뒤에서 천천히 도는 흐릿한 보드. */
export function Backdrop() {
  return (
    <Canvas className="scene backdrop" shadows="percentage" dpr={[1, 1.5]} camera={{ fov: 34, position: [0, 17, 17] }}>
      <Lights />
      <Spin>
        <Board />
      </Spin>
    </Canvas>
  )
}

function Spin({ children }: { children: ReactNode }) {
  const ref = useRef<THREE.Group>(null)
  useFrame((_, dt) => {
    if (ref.current) ref.current.rotation.y += dt * 0.08
  })
  return <group ref={ref}>{children}</group>
}
