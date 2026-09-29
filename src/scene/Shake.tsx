import { useFrame } from '@react-three/fiber'
import { useRef, type ReactNode } from 'react'
import type * as THREE from 'three'

// Trauma-style screen shake: impacts add trauma, it decays, offset ~ trauma².
// The world group moves instead of the camera so OrbitControls stays untouched.
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
