import { Canvas, useFrame } from '@react-three/fiber'
import { useRef, type ReactNode } from 'react'
import type * as THREE from 'three'
import { SIZE } from '../game/rules'
import { Board } from '../scene/Board'
import { Lights } from '../scene/OmokScene'
import { Stones } from '../scene/Stones'

// 한가운데에서 벌어진 초반 몇 수. 흑백이 번갈아 놓인다.
const MOVES = [
  [7, 7],
  [8, 6],
  [6, 8],
  [8, 8],
  [8, 7],
  [6, 7],
  [9, 6],
  [7, 5],
  [5, 9],
  [9, 8],
  [6, 6],
].map(([x, y]) => y * SIZE + x)

/** 메뉴 카드 뒤에서 천천히 도는 흐릿한 판. */
export function Backdrop({ className }: { className?: string }) {
  return (
    <Canvas className={className} shadows="percentage" dpr={[1, 1.5]} camera={{ fov: 34, position: [0, 19, 17] }}>
      <Lights />
      <Spin>
        <Board />
        <Stones moves={MOVES} settled={MOVES.length} line={[]} />
      </Spin>
    </Canvas>
  )
}

function Spin({ children }: { children: ReactNode }) {
  const ref = useRef<THREE.Group>(null)
  useFrame((_, dt) => {
    if (ref.current) ref.current.rotation.y += dt * 0.06
  })
  return <group ref={ref}>{children}</group>
}
