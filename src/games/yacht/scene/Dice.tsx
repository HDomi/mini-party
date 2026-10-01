import { useFrame, type ThreeEvent } from '@react-three/fiber'
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import * as THREE from 'three'
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js'
import { play } from '@/audio/sound'
import { DICE, seededRng } from '../game/rules'
import { DIE, FACE_VALUES, heldSpot, restQuat, scatter, type Spot } from './layout'
import { faceTexture } from './textures'

/** 한 주사위가 떨어져 멈추기까지(초). */
const ROLL_DUR = 0.95
/** 주사위마다 이만큼씩 늦게 떨어진다(초). */
const ROLL_STAGGER = 0.06
/** 잡거나 놓을 때 미끄러지는 시간(초). */
const SLIDE_DUR = 0.28
/** 굴림이 도착한 뒤 마지막 주사위가 멈출 때까지(ms). 화면이 이때 점수를 보여 준다. */
export const ROLL_MS = Math.round((ROLL_DUR + ROLL_STAGGER * (DICE - 1)) * 1000) + 60

const geometry = new RoundedBoxGeometry(DIE, DIE, DIE, 4, DIE * 0.16)
let materials: THREE.Material[] | null = null
/** 면 텍스처는 처음 그릴 때 한 번 만들어 모든 주사위가 같이 쓴다. */
function dieMaterials() {
  materials ??= FACE_VALUES.map((v) => new THREE.MeshPhysicalMaterial({ map: faceTexture(v), roughness: 0.35, clearcoat: 0.6, clearcoatRoughness: 0.3 }))
  return materials
}

export interface DiceProps {
  dice: number[]
  held: boolean[]
  roll: { seq: number; rolled: number[]; seed: number } | null
  /** 화면을 처음 그릴 때의 `seq`. 그 뒤에 온 굴림만 굴러가는 애니메이션을 한다. */
  mountSeq: number
  interactive: boolean
  onToggle?: (i: number) => void
  /** 메뉴 배경처럼 소리를 내지 않는다. */
  quiet?: boolean
}

export function Dice({ dice, held, roll, mountSeq, interactive, onToggle, quiet }: DiceProps) {
  const spots = useMemo(() => scatter(roll?.seed ?? 0), [roll?.seed])
  return (
    <group>
      {dice.map((v, i) => {
        const order = roll ? roll.rolled.indexOf(i) : -1
        return (
          <Die
            key={i}
            index={i}
            value={v}
            spot={held[i] ? heldSpot(i) : spots[i]}
            rollSeq={roll && order !== -1 ? roll.seq : 0}
            order={order}
            seed={roll?.seed ?? 0}
            mountSeq={mountSeq}
            interactive={interactive}
            onToggle={onToggle}
            quiet={quiet}
          />
        )
      })}
      {held.map((h, i) => h && <HeldMark key={i} i={i} />)}
    </group>
  )
}

type Anim =
  | { kind: 'roll'; t: number; delay: number; from: THREE.Vector3; axis: THREE.Vector3; spin: number; landed: boolean }
  | { kind: 'slide'; t: number; from: THREE.Vector3; fromQ: THREE.Quaternion }

const easeOut = (t: number) => 1 - (1 - t) ** 3
const tmpQ = new THREE.Quaternion()

/** 떨어졌다가 두 번 튀고 멈춘다. 0~1 에서 바닥 위 높이. */
function bounce(t: number, h: number): number {
  if (t < 0.42) return h * (1 - (t / 0.42) ** 2)
  const arc = (from: number, len: number, height: number) => {
    const u = (t - from) / len
    return 4 * height * u * (1 - u)
  }
  if (t < 0.72) return arc(0.42, 0.3, h * 0.2)
  if (t < 0.9) return arc(0.72, 0.18, h * 0.05)
  return 0
}

function Die({
  index,
  value,
  spot,
  rollSeq,
  order,
  seed,
  mountSeq,
  interactive,
  onToggle,
  quiet,
}: {
  index: number
  value: number
  spot: Spot
  rollSeq: number
  order: number
  seed: number
  mountSeq: number
  interactive: boolean
  onToggle?: (i: number) => void
  quiet?: boolean
}) {
  const ref = useRef<THREE.Group>(null)
  const anim = useRef<Anim | null>(null)
  const placed = useRef(false)
  const lastRoll = useRef(rollSeq)
  const [hover, setHover] = useState(false)
  const mats = useMemo(dieMaterials, [])

  const target = useMemo(
    () => ({ pos: new THREE.Vector3(spot.x, DIE / 2, spot.z), quat: restQuat(value, spot.yaw) }),
    [spot.x, spot.z, spot.yaw, value],
  )

  // 목표 자세가 바뀌면 새 굴림이면 굴리고, 아니면(잡기, 놓기, 차례 넘김) 미끄러뜨린다.
  useLayoutEffect(() => {
    const g = ref.current
    if (!g) return
    if (!placed.current) {
      placed.current = true
      g.position.copy(target.pos)
      g.quaternion.copy(target.quat)
      return
    }
    if (rollSeq !== lastRoll.current) {
      lastRoll.current = rollSeq
      if (rollSeq > mountSeq) {
        const rng = seededRng(seed * 7 + index * 131 + 1)
        const axis = new THREE.Vector3(rng() - 0.5, rng() - 0.5, rng() - 0.5).normalize()
        const from = new THREE.Vector3(target.pos.x + (rng() - 0.5) * 3, 4.6 + rng() * 1.2, target.pos.z + 2.2 + rng() * 1.4)
        anim.current = { kind: 'roll', t: 0, delay: order * ROLL_STAGGER, from, axis, spin: (3 + rng() * 2.5) * Math.PI, landed: false }
        return
      }
    }
    anim.current = { kind: 'slide', t: 0, from: g.position.clone(), fromQ: g.quaternion.clone() }
  }, [target, rollSeq, mountSeq, seed, index, order])

  useEffect(() => {
    if (!hover) return
    document.body.style.cursor = 'pointer'
    return () => void (document.body.style.cursor = '')
  }, [hover])
  if (hover && !interactive) setHover(false)

  useFrame((_, dt) => {
    const g = ref.current
    const a = anim.current
    if (!g) return
    const scale = hover ? 1.07 : 1
    g.scale.setScalar(THREE.MathUtils.damp(g.scale.x, scale, 14, dt))
    if (!a) return

    if (a.kind === 'slide') {
      a.t = Math.min(1, a.t + dt / SLIDE_DUR)
      const e = easeOut(a.t)
      g.position.lerpVectors(a.from, target.pos, e)
      g.position.y += Math.sin(Math.PI * a.t) * 0.55
      g.quaternion.slerpQuaternions(a.fromQ, target.quat, e)
      if (a.t >= 1) anim.current = null
      return
    }

    a.t += dt / ROLL_DUR
    const t = a.t - a.delay / ROLL_DUR
    g.visible = t >= 0
    if (t < 0) return
    const u = Math.min(1, t)
    const h = bounce(u, a.from.y - DIE / 2)
    const angle = a.spin * (1 - easeOut(u))
    g.position.set(
      THREE.MathUtils.lerp(a.from.x, target.pos.x, easeOut(Math.min(1, u * 1.25))),
      DIE / 2 + h + 0.3 * DIE * Math.min(1, angle / 1.2),
      THREE.MathUtils.lerp(a.from.z, target.pos.z, easeOut(Math.min(1, u * 1.25))),
    )
    g.quaternion.copy(target.quat).multiply(tmpQ.setFromAxisAngle(a.axis, angle))
    if (!a.landed && u >= 0.42) {
      a.landed = true
      // 다섯 개가 한꺼번에 울리면 시끄럽다. 첫 주사위와 넷째 주사위만 소리를 낸다.
      if (!quiet && (order === 0 || order === 3)) play('land', 0.7)
    }
    if (u >= 1) {
      g.position.copy(target.pos)
      g.quaternion.copy(target.quat)
      anim.current = null
    }
  })

  const click = (e: ThreeEvent<MouseEvent>) => {
    if (!interactive || !onToggle) return
    e.stopPropagation()
    onToggle(index)
  }

  return (
    <group ref={ref}>
      <mesh
        geometry={geometry}
        material={mats}
        castShadow
        receiveShadow
        onClick={click}
        onPointerOver={(e) => {
          if (!interactive) return
          e.stopPropagation()
          setHover(true)
        }}
        onPointerOut={() => setHover(false)}
      />
    </group>
  )
}

const glowGeometry = new THREE.RingGeometry(DIE * 0.8, DIE * 0.96, 4, 1, Math.PI / 4)
const glowMaterial = new THREE.MeshBasicMaterial({ color: '#ffd35a', transparent: true, opacity: 0.9, depthWrite: false })

/** 잡은 주사위 자리의 노란 테두리. 바닥에 붙어 있다. */
function HeldMark({ i }: { i: number }) {
  const { x, z } = heldSpot(i)
  return <mesh geometry={glowGeometry} material={glowMaterial} rotation-x={-Math.PI / 2} position={[x, 0.012, z]} renderOrder={1} />
}
