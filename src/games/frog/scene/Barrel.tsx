import { useFrame, type ThreeEvent } from '@react-three/fiber'
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { HALF_H, HOLE_LIST, HOOPS, IMPACT, POP, R_END, radiusAt, WALL } from './layout'
import { staveTexture } from './textures'
import { since, type TimelineRef } from './timeline'

/** 이보다 많이 끌면 통을 돌린 것으로 보고 구멍을 고르지 않는다(px). */
const DRAG_PX = 8

const profile = (inset: number) =>
  Array.from({ length: 25 }, (_, i) => {
    const y = -HALF_H + (i / 24) * HALF_H * 2
    return new THREE.Vector2(radiusAt(y) - inset, y)
  })

const outerGeometry = new THREE.LatheGeometry(profile(0), 96)
const innerGeometry = new THREE.LatheGeometry(profile(WALL), 96)
const rimGeometry = new THREE.RingGeometry(R_END - WALL, R_END + 0.01, 96)

/** 구멍 24개를 한 덩어리로 합친다. 구멍마다 따로 그리면 그리는 횟수만 늘어난다. */
function allHoles(g: THREE.BufferGeometry, lift: number) {
  const m = new THREE.Matrix4()
  return mergeGeometries(
    HOLE_LIST.map((h) => g.clone().applyMatrix4(m.compose(h.pos.clone().addScaledVector(h.normal, lift), h.quat, new THREE.Vector3(1, 1, 1)))),
  )
}
const holesGeometry = allHoles(new THREE.CircleGeometry(0.17, 28), 0.014)
const holeRimsGeometry = allHoles(new THREE.RingGeometry(0.16, 0.23, 28), 0.01)
const glowGeometry = new THREE.RingGeometry(0.25, 0.34, 32)
const hitGeometry = new THREE.CircleGeometry(0.34, 16)

const holeMaterial = new THREE.MeshBasicMaterial({ color: '#140a04' })
const holeRimMaterial = new THREE.MeshStandardMaterial({ color: '#5a3216', roughness: 0.9 })
const hoopMaterial = new THREE.MeshStandardMaterial({ color: '#4a4d52', metalness: 0.85, roughness: 0.35 })
const innerMaterial = new THREE.MeshStandardMaterial({ color: '#3b2210', roughness: 1, side: THREE.BackSide })
const rimMaterial = new THREE.MeshStandardMaterial({ color: '#8a5530', roughness: 0.8 })
const hitMaterial = new THREE.MeshBasicMaterial({ visible: false })

export interface BarrelProps {
  tl: TimelineRef
  /** 칼이 꽂힌 구멍. */
  taken: Set<number>
  /** 누군가 고르고 있는 구멍과 그 사람 색. */
  aim: { hole: number; color: string } | null
  interactive: boolean
  onPick: (hole: number) => void
  /** 통과 같이 흔들리는 것들(칼). */
  children?: ReactNode
}

/** 나무통, 쇠테, 구멍. 칼이 박힐 때 찌그러졌다 돌아오고, 개구리가 튀어나갈 때 들썩인다. */
export function Barrel({ tl, taken, aim, interactive, onPick, children }: BarrelProps) {
  const tex = useMemo(() => staveTexture(), [])
  useEffect(() => () => tex.dispose(), [tex])
  const ref = useRef<THREE.Group>(null)
  const [hover, setHover] = useState<number | null>(null)
  if (hover !== null && (!interactive || taken.has(hover))) setHover(null)

  useEffect(() => {
    if (hover === null) return
    document.body.style.cursor = 'pointer'
    return () => void (document.body.style.cursor = '')
  }, [hover])

  useFrame(({ clock }) => {
    const g = ref.current
    if (!g) return
    const t = since(tl.current, clock.elapsedTime)
    // 박힌 순간 꿀렁: 감쇠 진동으로 눌렸다 늘어난다.
    const k = t - IMPACT
    let squash = k > 0 && k < 0.8 ? Math.sin(k * 30) * Math.exp(-k * 6) * 0.05 : 0
    let hop = 0
    const p = t - POP
    if (tl.current.popped && p > 0 && p < 0.9) {
      squash += Math.sin(p * 22) * Math.exp(-p * 4) * 0.12
      hop = Math.max(0, Math.sin(p * 9) * Math.exp(-p * 5)) * 0.5
    }
    g.scale.set(1 + squash * 0.6, 1 - squash, 1 + squash * 0.6)
    g.position.y = hop
  })

  const pick = (i: number) => (e: ThreeEvent<MouseEvent>) => {
    if (!interactive || taken.has(i) || e.delta > DRAG_PX) return
    e.stopPropagation()
    onPick(i)
  }

  return (
    <group ref={ref}>
      <mesh geometry={outerGeometry} receiveShadow>
        <meshStandardMaterial map={tex} roughness={0.75} />
      </mesh>
      <mesh geometry={innerGeometry} material={innerMaterial} />
      <mesh geometry={rimGeometry} material={rimMaterial} rotation-x={-Math.PI / 2} position-y={HALF_H} />
      <mesh rotation-x={-Math.PI / 2} position-y={-HALF_H + 0.02}>
        <circleGeometry args={[R_END, 48]} />
        <meshStandardMaterial color="#2a170a" />
      </mesh>
      {HOOPS.map((y) => (
        <mesh key={y} material={hoopMaterial} rotation-x={Math.PI / 2} position-y={y}>
          <torusGeometry args={[radiusAt(y) + 0.015, 0.075, 10, 96]} />
        </mesh>
      ))}
      <mesh geometry={holeRimsGeometry} material={holeRimMaterial} />
      <mesh geometry={holesGeometry} material={holeMaterial} />
      {HOLE_LIST.map((h, i) => {
        const glow = aim?.hole === i ? aim.color : hover === i ? '#ffd35a' : null
        return (
          <group key={i} position={h.pos} quaternion={h.quat}>
            {glow && <Glow color={glow} />}
            {interactive && !taken.has(i) && (
              <mesh
                geometry={hitGeometry}
                material={hitMaterial}
                position-z={0.03}
                onClick={pick(i)}
                onPointerOver={(e) => {
                  e.stopPropagation()
                  setHover(i)
                }}
                onPointerOut={() => setHover((cur) => (cur === i ? null : cur))}
              />
            )}
          </group>
        )
      })}
      {children}
    </group>
  )
}

/** 고르는 구멍 둘레에서 숨 쉬듯 커졌다 작아지는 테두리. */
function Glow({ color }: { color: string }) {
  const ref = useRef<THREE.Mesh>(null)
  useFrame(({ clock }) => {
    const m = ref.current
    if (!m) return
    m.scale.setScalar(1 + Math.sin(clock.elapsedTime * 8) * 0.12)
  })
  return (
    <mesh ref={ref} geometry={glowGeometry} position-z={0.02}>
      <meshBasicMaterial color={color} transparent opacity={0.95} depthWrite={false} />
    </mesh>
  )
}
