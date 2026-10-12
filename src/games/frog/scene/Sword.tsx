import { useFrame } from '@react-three/fiber'
import { useMemo, useRef } from 'react'
import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { HOLE_LIST, IMPACT, WINDUP } from './layout'
import { since, type TimelineRef } from './timeline'

// 칼의 로컬 좌표: +z 가 통 바깥쪽이다. z = 0 이 통 겉면이고, 칼날은 -z 로 통 안에 들어간다.

// 칼 한 자루를 재질별로 세 덩어리(칼날, 금장식, 손잡이)로 합쳐 둔다. 24자루가 꽂혀도 그리는 횟수가 적다.
const bladeGeometry = mergeGeometries([
  new THREE.BoxGeometry(0.12, 0.028, 1.15).translate(0, 0, -0.575),
  new THREE.ConeGeometry(0.085, 0.22, 4).rotateX(-Math.PI / 2).rotateZ(Math.PI / 4).scale(1, 0.33, 1).translate(0, 0, -1.25),
])
const goldGeometry = mergeGeometries([
  new THREE.BoxGeometry(0.56, 0.1, 0.09).translate(0, 0, 0.05),
  ...[0.2, 0.33, 0.46].map((z) => new THREE.TorusGeometry(0.062, 0.014, 6, 16).translate(0, 0, z)),
  new THREE.SphereGeometry(0.095, 16, 12).translate(0, 0, 0.6),
])
const handleGeometry = new THREE.CylinderGeometry(0.055, 0.06, 0.46, 14).rotateX(Math.PI / 2).translate(0, 0, 0.33)

const bladeMaterial = new THREE.MeshStandardMaterial({ color: '#e4ebf2', metalness: 0.9, roughness: 0.18 })
const goldMaterial = new THREE.MeshStandardMaterial({ color: '#e6b43c', metalness: 0.8, roughness: 0.3 })

/** 색마다 재질 하나를 모든 칼이 같이 쓴다. */
const handles = new Map<string, THREE.MeshStandardMaterial>()
function handleMaterial(color: string) {
  let m = handles.get(color)
  if (!m) handles.set(color, (m = new THREE.MeshStandardMaterial({ color, roughness: 0.55 })))
  return m
}

/** 뒤로 뺄 때까지의 거리와 찌르기 전 자리. */
const READY_Z = 2.0
const BACK_Z = 2.55
/** 고르는 중인 칼이 떠 있는 거리. */
const GHOST_Z = 1.35

const easeOut = (t: number) => 1 - (1 - t) ** 3

function SwordBody({ color, ghost }: { color: string; ghost?: boolean }) {
  const mats = useMemo(() => {
    const handle = handleMaterial(color)
    if (!ghost) return { blade: bladeMaterial, gold: goldMaterial, handle }
    const fade = (m: THREE.MeshStandardMaterial) => {
      const c = m.clone()
      c.transparent = true
      c.opacity = 0.55
      c.depthWrite = false
      return c
    }
    return { blade: fade(bladeMaterial), gold: fade(goldMaterial), handle: fade(handle) }
  }, [color, ghost])
  // 칼은 그림자를 드리우지 않는다. 24자루 × 그림자 패스는 비싸고, 통에 비치는 칼 그림자는 거의 안 보인다.
  return (
    <>
      <mesh geometry={bladeGeometry} material={mats.blade} />
      <mesh geometry={goldGeometry} material={mats.gold} />
      <mesh geometry={handleGeometry} material={mats.handle} />
    </>
  )
}

/**
 * 꽂힌 칼. 마지막 칼이면 연출 시계를 따라 뒤로 한 번 빼서 뜸을 들였다가 순식간에 찌르고, 박힌 뒤에는 부르르 떤다.
 * 그 전에 꽂힌 칼은 그 자리에 가만히 있다.
 */
export function Sword({ hole, color, seq, tl }: { hole: number; color: string; seq: number; tl: TimelineRef }) {
  const h = HOLE_LIST[hole]
  const inner = useRef<THREE.Group>(null)

  useFrame(({ clock }) => {
    const g = inner.current
    if (!g) return
    const live = tl.current.seq === seq
    const t = live ? since(tl.current, clock.elapsedTime) : Infinity
    let z = 0
    let wobble = 0
    let scale = 1
    if (t < WINDUP) {
      const u = t / WINDUP
      z = READY_Z + (BACK_Z - READY_Z) * easeOut(u)
      scale = Math.min(1, t / 0.08)
      wobble = Math.sin(t * 40) * 0.03
    } else if (t < IMPACT) {
      const u = (t - WINDUP) / (IMPACT - WINDUP)
      z = BACK_Z * (1 - u * u)
    } else {
      const k = t - IMPACT
      wobble = k < 1.2 ? Math.sin(k * 55) * Math.exp(-k * 6) * 0.28 : 0
    }
    g.position.z = z
    g.rotation.x = wobble
    g.scale.setScalar(scale)
  })

  return (
    <group position={h.pos} quaternion={h.quat}>
      <group ref={inner}>
        <SwordBody color={color} />
      </group>
    </group>
  )
}

/** 고르고 있는 구멍 앞에 떠서 까딱거리는 반투명 칼. */
export function GhostSword({ hole, color }: { hole: number; color: string }) {
  const h = HOLE_LIST[hole]
  const inner = useRef<THREE.Group>(null)
  useFrame(({ clock }) => {
    const g = inner.current
    if (!g) return
    const t = clock.elapsedTime
    g.position.z = GHOST_Z + Math.sin(t * 5) * 0.12
    g.rotation.x = Math.sin(t * 3.3) * 0.08
    g.rotation.y = Math.sin(t * 2.7) * 0.08
  })
  return (
    <group position={h.pos} quaternion={h.quat}>
      <group ref={inner}>
        <SwordBody color={color} ghost />
      </group>
    </group>
  )
}
