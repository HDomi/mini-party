import { useFrame } from '@react-three/fiber'
import { forwardRef, useImperativeHandle, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { BOARD_TOP } from './layout'

// Landing impact: an expanding shockwave ring plus a puff of dust per hit.

const RINGS = 6
const DUST_PER_HIT = 22
const DUST = RINGS * DUST_PER_HIT
const RING_LIFE = 0.5
const DUST_LIFE = 0.75

export interface ImpactsHandle {
  hit: (x: number, z: number, strength: number) => void
}

export const Impacts = forwardRef<ImpactsHandle>(function Impacts(_, ref) {
  const rings = useRef<(THREE.Mesh | null)[]>([])
  const ringState = useRef(Array.from({ length: RINGS }, () => ({ t: RING_LIFE, s: 1 })))
  const nextRing = useRef(0)

  const dustMesh = useRef<THREE.InstancedMesh>(null)
  const dust = useMemo(
    () =>
      Array.from({ length: DUST }, () => ({
        p: new THREE.Vector3(),
        v: new THREE.Vector3(),
        t: DUST_LIFE,
        size: 1,
      })),
    [],
  )
  const nextDust = useRef(0)
  // Seconds since the last hit; once every effect has faded the per-frame work stops.
  // Starts at 0 so the first frames zero out the default identity instance matrices.
  const idle = useRef(0)
  const tmp = useMemo(() => new THREE.Object3D(), [])

  useImperativeHandle(ref, () => ({
    hit(x, z, strength) {
      idle.current = 0
      const i = nextRing.current++ % RINGS
      ringState.current[i] = { t: 0, s: strength }
      rings.current[i]?.position.set(x, BOARD_TOP + 0.015, z)
      for (let k = 0; k < DUST_PER_HIT; k++) {
        const d = dust[nextDust.current++ % DUST]
        const a = Math.random() * Math.PI * 2
        const sp = (1.2 + Math.random() * 2.2) * strength
        d.p.set(x + Math.cos(a) * 0.3, BOARD_TOP + 0.05, z + Math.sin(a) * 0.3)
        d.v.set(Math.cos(a) * sp, (0.8 + Math.random() * 1.6) * strength, Math.sin(a) * sp)
        d.t = 0
        d.size = 0.05 + Math.random() * 0.07
      }
    },
  }))

  useFrame((_, rawDt) => {
    const dt = Math.min(rawDt, 0.05)
    // one extra frame past the lifetime so the last instances get zeroed
    if (idle.current > Math.max(RING_LIFE, DUST_LIFE) + 0.1) return
    idle.current += dt
    ringState.current.forEach((st, i) => {
      const m = rings.current[i]
      if (!m) return
      st.t += dt
      const k = Math.min(st.t / RING_LIFE, 1)
      m.visible = k < 1
      const e = 1 - (1 - k) ** 3
      m.scale.setScalar(0.3 + e * 2.1 * st.s)
      ;(m.material as THREE.MeshBasicMaterial).opacity = (1 - k) ** 1.5 * 0.6
    })

    const mesh = dustMesh.current
    if (!mesh) return
    dust.forEach((d, i) => {
      d.t += dt
      const alive = d.t < DUST_LIFE
      if (alive) {
        d.v.multiplyScalar(1 - dt * 3.2)
        d.v.y -= dt * 4
        d.p.addScaledVector(d.v, dt)
        if (d.p.y < BOARD_TOP + 0.02) {
          d.p.y = BOARD_TOP + 0.02
          d.v.y = 0
        }
      }
      tmp.position.copy(d.p)
      tmp.scale.setScalar(alive ? d.size * (1 - d.t / DUST_LIFE) * 1.6 : 0)
      tmp.updateMatrix()
      mesh.setMatrixAt(i, tmp.matrix)
    })
    mesh.instanceMatrix.needsUpdate = true
  })

  return (
    <group>
      {Array.from({ length: RINGS }, (_, i) => (
        <mesh key={i} ref={(m) => void (rings.current[i] = m)} rotation-x={-Math.PI / 2} visible={false}>
          <ringGeometry args={[0.46, 0.62, 48]} />
          <meshBasicMaterial color="#9a6435" transparent opacity={0} depthWrite={false} />
        </mesh>
      ))}
      <instancedMesh ref={dustMesh} args={[undefined, undefined, DUST]} frustumCulled={false}>
        <sphereGeometry args={[1, 8, 6]} />
        <meshStandardMaterial color="#cfae7c" roughness={1} />
      </instancedMesh>
    </group>
  )
})
