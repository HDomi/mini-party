import { useFrame } from '@react-three/fiber'
import { useRef, type ReactNode } from 'react'
import type * as THREE from 'three'

// Trauma 방식 화면 흔들림: 충격이 trauma 를 더하고, trauma 는 감쇠하며, 오프셋 ~ trauma².
// 카메라 대신 월드 그룹을 움직여서 OrbitControls 는 건드리지 않는다.
let trauma = 0

export function addShake(amount: number) {
  trauma = Math.min(1, trauma + amount)
}

export function ShakeGroup({ children }: { children: ReactNode }) {
  const ref = useRef<THREE.Group>(null)
  useFrame((state, dt) => {
    const g = ref.current
    if (!g) return
    trauma = Math.max(0, trauma - dt * 2.4)
    const k = trauma * trauma
    const t = state.clock.elapsedTime * 38
    g.position.set(Math.sin(t * 1.1) * 0.22 * k, Math.sin(t * 1.7 + 1) * 0.12 * k, Math.sin(t * 0.9 + 2) * 0.22 * k)
    g.rotation.set(Math.sin(t * 1.3 + 3) * 0.012 * k, 0, Math.sin(t * 1.5 + 4) * 0.012 * k)
  })
  return <group ref={ref}>{children}</group>
}
