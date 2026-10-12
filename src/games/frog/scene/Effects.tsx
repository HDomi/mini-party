import { useFrame } from '@react-three/fiber'
import { useMemo, useRef, type ReactNode } from 'react'
import * as THREE from 'three'
import { play } from '@/audio/sound'
import { HALF_H, HOLE_LIST, IMPACT, POP, WINDUP } from './layout'
import { since, type TimelineRef } from './timeline'

// 칼이 박힐 때 튀는 불꽃·나무 부스러기·충격 링, 개구리가 튀어나갈 때 뿜는 연기, 화면 흔들림.
// 연출 시계를 보고 정해진 순간에 한 번씩 터뜨린다.

const SPARKS = 26
const CHIPS = 12
const PUFFS = 16
const SPARK_LIFE = 0.45
const CHIP_LIFE = 0.9
const PUFF_LIFE = 1.1

interface Particle {
  p: THREE.Vector3
  v: THREE.Vector3
  t: number
  size: number
  spin: number
}

const particles = (n: number, life: number): Particle[] =>
  Array.from({ length: n }, () => ({ p: new THREE.Vector3(), v: new THREE.Vector3(), t: life, size: 0, spin: 0 }))

/** 반구 방향 하나. `n` 쪽으로 퍼진다. */
function spray(n: THREE.Vector3, spread: number) {
  const v = new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).normalize().multiplyScalar(spread)
  return v.add(n).normalize()
}

// Trauma 방식 화면 흔들림. 카메라 대신 월드 그룹을 움직여 OrbitControls 는 건드리지 않는다.
let trauma = 0
export const addShake = (amount: number) => void (trauma = Math.min(1, trauma + amount))

export function ShakeGroup({ children }: { children: ReactNode }) {
  const ref = useRef<THREE.Group>(null)
  useFrame((state, dt) => {
    const g = ref.current
    if (!g) return
    trauma = Math.max(0, trauma - dt * 2.2)
    const k = trauma * trauma
    const t = state.clock.elapsedTime * 40
    g.position.set(Math.sin(t * 1.1) * 0.3 * k, Math.sin(t * 1.7 + 1) * 0.2 * k, Math.sin(t * 0.9 + 2) * 0.15 * k)
    g.rotation.set(0, 0, Math.sin(t * 1.5 + 4) * 0.03 * k)
  })
  return <group ref={ref}>{children}</group>
}

export function Effects({ tl, quiet }: { tl: TimelineRef; quiet?: boolean }) {
  const sparks = useMemo(() => particles(SPARKS, SPARK_LIFE), [])
  const chips = useMemo(() => particles(CHIPS, CHIP_LIFE), [])
  const puffs = useMemo(() => particles(PUFFS, PUFF_LIFE), [])
  const sparkMesh = useRef<THREE.InstancedMesh>(null)
  const chipMesh = useRef<THREE.InstancedMesh>(null)
  const puffMesh = useRef<THREE.InstancedMesh>(null)
  const ring = useRef<THREE.Mesh>(null)
  const ringT = useRef(1)
  const fired = useRef({ whoosh: 0, impact: 0, pop: 0 })
  const tmp = useMemo(() => new THREE.Object3D(), [])

  useFrame(({ clock }, rawDt) => {
    const dt = Math.min(rawDt, 0.05)
    const cur = tl.current
    const t = since(cur, clock.elapsedTime)

    // 뜸 들이던 칼이 휙 찌른다.
    if (cur.seq !== fired.current.whoosh && t >= WINDUP && t < WINDUP + 0.3) {
      fired.current.whoosh = cur.seq
      if (!quiet) play('throw', 0.8)
    }

    // ── 박히는 순간 ──
    if (cur.seq !== fired.current.impact && t >= IMPACT && t < IMPACT + 0.3) {
      fired.current.impact = cur.seq
      const h = HOLE_LIST[cur.hole]
      const origin = h.pos.clone().addScaledVector(h.normal, 0.15)
      for (const s of sparks) {
        s.p.copy(origin)
        s.v.copy(spray(h.normal, 1.6)).multiplyScalar(4 + Math.random() * 5)
        s.t = Math.random() * 0.08
        s.size = 0.03 + Math.random() * 0.04
      }
      for (const c of chips) {
        c.p.copy(origin)
        c.v.copy(spray(h.normal, 1.1)).multiplyScalar(2 + Math.random() * 3)
        c.v.y += 1.5
        c.t = 0
        c.size = 0.05 + Math.random() * 0.06
        c.spin = (Math.random() - 0.5) * 30
      }
      if (ring.current) {
        ring.current.position.copy(h.pos).addScaledVector(h.normal, 0.05)
        ring.current.quaternion.copy(h.quat)
      }
      ringT.current = 0
      addShake(0.38)
      if (!quiet) {
        play('capture', 0.9)
        play('land', 0.7)
      }
    }

    // ── 펑! ──
    if (cur.popped && cur.seq !== fired.current.pop && t >= POP && t < POP + 0.3) {
      fired.current.pop = cur.seq
      for (const p of puffs) {
        const a = Math.random() * Math.PI * 2
        const r = 0.6 + Math.random() * 0.9
        // 통 입구 가장자리에서 옆으로 뿜어져 나간다. 가운데로 날아가는 개구리를 가리지 않는다.
        p.p.set(Math.cos(a) * r, HALF_H + 0.1, Math.sin(a) * r)
        p.v.set(Math.cos(a) * (2.5 + Math.random() * 3), 0.8 + Math.random() * 2, Math.sin(a) * (2.5 + Math.random() * 3))
        p.t = Math.random() * 0.1
        p.size = 0.18 + Math.random() * 0.2
      }
      addShake(1)
      if (!quiet) {
        play('capture', 1.4)
        play('mo', 1)
      }
    }

    // ── 입자 움직이기 ──
    const step = (list: Particle[], life: number, gravity: number, drag: number) =>
      list.forEach((s) => {
        if (s.t >= life) return
        s.t += dt
        s.v.multiplyScalar(1 - dt * drag)
        s.v.y -= dt * gravity
        s.p.addScaledVector(s.v, dt)
      })
    step(sparks, SPARK_LIFE, 9, 2)
    step(chips, CHIP_LIFE, 12, 1)
    step(puffs, PUFF_LIFE, -0.6, 2.4)

    const write = (mesh: THREE.InstancedMesh | null, list: Particle[], life: number, size: (s: Particle, k: number) => number) => {
      if (!mesh) return
      list.forEach((s, i) => {
        const k = s.t / life
        tmp.position.copy(s.p)
        tmp.rotation.set(s.spin * s.t, s.spin * s.t * 0.7, 0)
        tmp.scale.setScalar(k < 1 ? size(s, k) : 0)
        tmp.updateMatrix()
        mesh.setMatrixAt(i, tmp.matrix)
      })
      mesh.instanceMatrix.needsUpdate = true
    }
    write(sparkMesh.current, sparks, SPARK_LIFE, (s, k) => s.size * (1 - k))
    write(chipMesh.current, chips, CHIP_LIFE, (s, k) => s.size * (1 - k * 0.5))
    write(puffMesh.current, puffs, PUFF_LIFE, (s, k) => s.size * (0.6 + k * 1.4) * (1 - k * k))

    const r = ring.current
    if (r) {
      ringT.current = Math.min(1, ringT.current + dt / 0.35)
      const k = ringT.current
      r.visible = k < 1
      r.scale.setScalar(0.4 + (1 - (1 - k) ** 3) * 1.8)
      ;(r.material as THREE.MeshBasicMaterial).opacity = (1 - k) * 0.9
    }
  })

  return (
    <group>
      <instancedMesh ref={sparkMesh} args={[undefined, undefined, SPARKS]} frustumCulled={false}>
        <boxGeometry args={[1, 1, 3]} />
        <meshBasicMaterial color="#ffe27a" toneMapped={false} />
      </instancedMesh>
      <instancedMesh ref={chipMesh} args={[undefined, undefined, CHIPS]} frustumCulled={false}>
        <boxGeometry args={[1, 0.4, 0.6]} />
        <meshStandardMaterial color="#b07a46" roughness={0.9} />
      </instancedMesh>
      <instancedMesh ref={puffMesh} args={[undefined, undefined, PUFFS]} frustumCulled={false}>
        <sphereGeometry args={[1, 14, 10]} />
        <meshStandardMaterial color="#ffffff" roughness={1} transparent opacity={0.9} depthWrite={false} />
      </instancedMesh>
      <mesh ref={ring} visible={false}>
        <ringGeometry args={[0.28, 0.4, 32]} />
        <meshBasicMaterial color="#fff3c4" transparent opacity={0} depthWrite={false} toneMapped={false} />
      </mesh>
    </group>
  )
}
