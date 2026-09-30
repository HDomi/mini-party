import { useFrame } from '@react-three/fiber'
import { useRef, useState } from 'react'
import * as THREE from 'three'
import { play } from '@/audio/sound'
import { BLACK, type Color } from '../game/rules'
import { BOARD_TOP, cellPos, STONE_H, STONE_R } from './layout'

/** 바닥이 원점인 납작한 타원체. */
export const stoneGeometry = (() => {
  const g = new THREE.SphereGeometry(STONE_R, 40, 20)
  g.scale(1, STONE_H / 2 / STONE_R, 1)
  g.translate(0, STONE_H / 2, 0)
  return g
})()

export const stoneMaterials: Record<Color, THREE.Material> = {
  0: new THREE.MeshPhysicalMaterial({ color: '#161616', roughness: 0.32, clearcoat: 0.7, clearcoatRoughness: 0.25 }),
  1: new THREE.MeshPhysicalMaterial({ color: '#f4f1ea', roughness: 0.42, clearcoat: 0.35, clearcoatRoughness: 0.3 }),
}
const ghostMaterials: Record<Color, THREE.Material> = {
  0: new THREE.MeshStandardMaterial({ color: '#161616', transparent: true, opacity: 0.45, depthWrite: false }),
  1: new THREE.MeshStandardMaterial({ color: '#ffffff', transparent: true, opacity: 0.6, depthWrite: false }),
}
const lastMaterial = new THREE.MeshBasicMaterial({ color: '#e8574a' })
const winMaterial = new THREE.MeshStandardMaterial({
  color: '#ffd35a',
  emissive: '#ffb300',
  emissiveIntensity: 0.9,
  transparent: true,
  depthWrite: false,
})
const forbiddenMaterial = new THREE.MeshBasicMaterial({ color: '#d94436', transparent: true, opacity: 0.8 })
const markGeometry = new THREE.CircleGeometry(0.11, 24)
const winGeometry = new THREE.RingGeometry(STONE_R * 0.98, STONE_R * 1.28, 40)
const barGeometry = new THREE.BoxGeometry(0.62, 0.015, 0.1)

/** 떨어지는 데 걸리는 시간(초). 착지할 때 소리가 난다. */
export const DROP = 0.24
/** 오목이 완성된 뒤 다섯 알이 빛나기 시작할 때까지(초). */
export const WIN_DELAY = DROP + 0.15

export interface StonesProps {
  moves: number[]
  /** 이 판을 처음 그릴 때 이미 있던 수의 개수. 그 뒤에 둔 돌만 떨어지는 애니메이션을 한다. */
  settled: number
  line: number[]
}

export function Stones({ moves, settled, line }: StonesProps) {
  const last = moves.length - 1
  return (
    <group>
      {moves.map((p, i) => (
        <Stone key={`${i}:${p}`} p={p} color={(i % 2) as Color} drop={i >= settled} last={i === last} />
      ))}
      {line.map((p) => (
        <WinRing key={p} p={p} />
      ))}
    </group>
  )
}

function Stone({ p, color, drop, last }: { p: number; color: Color; drop: boolean; last: boolean }) {
  const ref = useRef<THREE.Group>(null)
  const start = useRef<number | null>(null)
  const [done, setDone] = useState(!drop)
  // 돌마다 조금씩 돌려 놓아 빛 반사가 똑같지 않게 한다.
  const [spin] = useState(() => Math.random() * Math.PI * 2)
  const pos = cellPos(p)

  useFrame(({ clock }) => {
    const g = ref.current
    if (!g || done) return
    start.current ??= clock.elapsedTime
    const t = (clock.elapsedTime - start.current) / DROP
    if (t >= 1) {
      g.position.y = BOARD_TOP
      g.scale.setScalar(1)
      setDone(true)
      play('stack', 0.8)
      return
    }
    g.position.y = BOARD_TOP + (1 - t * t) * 1.8
    g.scale.setScalar(0.92 + 0.08 * t)
  })

  return (
    <group ref={ref} position={[pos[0], drop ? BOARD_TOP + 1.8 : BOARD_TOP, pos[2]]} rotation-y={spin}>
      <mesh geometry={stoneGeometry} material={stoneMaterials[color]} castShadow receiveShadow />
      {last && done && (
        <mesh geometry={markGeometry} material={lastMaterial} rotation-x={-Math.PI / 2} position-y={STONE_H + 0.004} />
      )}
    </group>
  )
}

function WinRing({ p }: { p: number }) {
  const ref = useRef<THREE.Mesh>(null)
  const start = useRef<number | null>(null)
  const pos = cellPos(p, BOARD_TOP + 0.01)
  useFrame(({ clock }) => {
    const m = ref.current
    if (!m) return
    start.current ??= clock.elapsedTime
    const t = clock.elapsedTime - start.current - WIN_DELAY
    m.visible = t > 0
    const s = 1 + Math.sin(t * 5) * 0.08
    m.scale.set(s, s, 1)
  })
  return <mesh ref={ref} geometry={winGeometry} material={winMaterial} position={pos} rotation-x={-Math.PI / 2} visible={false} />
}

/** 마우스를 올린 자리(또는 휴대폰에서 고른 자리)에 비치는 돌. */
export function Ghost({ p, color, pulse }: { p: number; color: Color; pulse: boolean }) {
  const ref = useRef<THREE.Group>(null)
  useFrame(({ clock }) => {
    if (!ref.current) return
    ref.current.position.y = pulse ? 0.08 + Math.sin(clock.elapsedTime * 6) * 0.06 : 0
  })
  return (
    <group position={cellPos(p)}>
      <group ref={ref}>
        <mesh geometry={stoneGeometry} material={ghostMaterials[color]} />
      </group>
      {pulse && (
        <mesh geometry={winGeometry} material={color === BLACK ? lastMaterial : winMaterial} rotation-x={-Math.PI / 2} position-y={0.01} />
      )}
    </group>
  )
}

/** 흑이 둘 수 없는 자리의 ×. */
export function ForbiddenMarks({ cells }: { cells: number[] }) {
  return (
    <group>
      {cells.map((p) => (
        <group key={p} position={cellPos(p, BOARD_TOP + 0.01)}>
          <mesh geometry={barGeometry} material={forbiddenMaterial} rotation-y={Math.PI / 4} />
          <mesh geometry={barGeometry} material={forbiddenMaterial} rotation-y={-Math.PI / 4} />
        </group>
      ))}
    </group>
  )
}
