import { useFrame } from '@react-three/fiber'
import { useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { seededRng, type GameEvent } from '../game/rules'
import { play } from '../ui/sound'
import { Impacts, type ImpactsHandle } from './Impacts'
import { BOARD_TOP } from './layout'
import { addShake } from './Shake'
import { stickTextures } from './textures'

const LEN = 2.1
const R = 0.2
const FLIGHT = 1.05
const HOLD_UNTIL = 2.9
const GONE_AT = 3.25

/** 던지기 이벤트부터 윷가락이 멈출 때까지의 초. 그때 HUD 가 결과를 공개한다. */
export const THROW_REVEAL_MS = 1350

const roundGeometry = (() => {
  const g = new THREE.CylinderGeometry(R, R, LEN, 28, 1, false, Math.PI, Math.PI)
  g.rotateZ(-Math.PI / 2)
  return g
})()
const flatGeometry = (() => {
  const g = new THREE.PlaneGeometry(LEN, R * 2)
  g.rotateX(Math.PI / 2)
  return g
})()

interface StickPlan {
  start: THREE.Vector3
  land: THREE.Vector3
  peak: number
  yaw: number
  roll: number
  rollSpins: number
  pitchSpins: number
  yawSpin: number
  delay: number
}

type ThrowEvent = Extract<GameEvent, { type: 'throw' }>

export function YutSticks({ event, mountSeq }: { event: GameEvent; mountSeq: number }) {
  const tex = useMemo(() => {
    const t = stickTextures()
    t.round.center.set(0.5, 0.5)
    t.round.rotation = Math.PI / 2
    return t
  }, [])
  const mats = useMemo(
    () => ({
      round: new THREE.MeshStandardMaterial({ map: tex.round, roughness: 0.55 }),
      flat: new THREE.MeshStandardMaterial({ map: tex.flat, roughness: 0.7, side: THREE.DoubleSide }),
      marked: new THREE.MeshStandardMaterial({ map: tex.marked, roughness: 0.7, side: THREE.DoubleSide }),
    }),
    [tex],
  )
  useEffect(
    () => () => {
      for (const m of Object.values(mats)) m.dispose()
      for (const t of Object.values(tex)) t.dispose()
    },
    [mats, tex],
  )

  const refs = useRef<(THREE.Group | null)[]>([])
  const root = useRef<THREE.Group>(null)
  const impacts = useRef<ImpactsHandle>(null)
  const clock = useRef<{ t: number; plans: StickPlan[]; sticks: boolean[]; hits: number[] } | null>(null)

  useEffect(() => {
    if (event.type !== 'throw' || event.seq <= mountSeq) return
    clock.current = { t: 0, plans: planThrow(event), sticks: event.sticks, hits: [0, 0, 0, 0] }
    play('throw')
  }, [event, mountSeq])

  useFrame((_, dt) => {
    const c = clock.current
    if (!root.current) return
    root.current.visible = !!c
    if (!c) return
    c.t += Math.min(dt, 0.05)
    const fade = c.t < HOLD_UNTIL ? 1 : Math.max(0, 1 - (c.t - HOLD_UNTIL) / (GONE_AT - HOLD_UNTIL))

    c.plans.forEach((p, i) => {
      const g = refs.current[i]
      if (!g) return
      const flatUp = c.sticks[i]
      const restY = BOARD_TOP + (flatUp ? R : 0)
      const t = Math.max(0, c.t - p.delay)
      const k = Math.min(t / FLIGHT, 1)
      const left = 1 - easeOut(k)

      g.position.lerpVectors(p.start, p.land, k)
      g.position.y = THREE.MathUtils.lerp(p.start.y, restY, k) + 4 * p.peak * k * (1 - k)

      let wobble = 0
      if (k >= 1) {
        const b = t - FLIGHT
        // 첫 착지는 세게 부딪히고, 튕긴 뒤의 착지는 부드럽다
        if (c.hits[i] === 0) {
          c.hits[i] = 1
          impacts.current?.hit(p.land.x, p.land.z, 1)
          addShake(0.26)
          play('land')
        } else if (c.hits[i] === 1 && b >= 0.22) {
          c.hits[i] = 2
          impacts.current?.hit(p.land.x, p.land.z, 0.45)
          addShake(0.06)
          play('land', 0.35)
        }
        // 자리를 잡는 작은 튕김 두 번
        const hop = b < 0.22 ? Math.sin((b / 0.22) * Math.PI) * 0.35 : b < 0.36 ? Math.sin(((b - 0.22) / 0.14) * Math.PI) * 0.1 : 0
        g.position.y = restY + hop
        wobble = Math.exp(-b * 9) * Math.sin(b * 38) * 0.25
      }

      g.rotation.set(
        p.roll + left * p.rollSpins * Math.PI * 2 + wobble,
        p.yaw + left * p.yawSpin,
        left * p.pitchSpins * Math.PI * 2,
        'YZX',
      )
      g.scale.setScalar(fade < 1 ? easeOut(fade) : 1)
    })

    if (c.t > GONE_AT) clock.current = null
  })

  return (
    <>
      <Impacts ref={impacts} />
      <group ref={root} visible={false}>
        {[0, 1, 2, 3].map((i) => (
          <group key={i} ref={(g) => void (refs.current[i] = g)}>
            <mesh geometry={roundGeometry} material={mats.round} castShadow />
            <mesh geometry={flatGeometry} material={i === 0 ? mats.marked : mats.flat} castShadow />
          </group>
        ))}
      </group>
    </>
  )
}

function easeOut(t: number) {
  return 1 - (1 - t) ** 3
}

function planThrow(e: ThrowEvent): StickPlan[] {
  const rng = seededRng(e.seed)
  const j = (s: number) => (rng() - 0.5) * 2 * s
  return e.sticks.map((flatUp, i) => ({
    start: new THREE.Vector3(-0.9 + i * 0.6 + j(0.2), 2.4, 8.5 + j(0.3)),
    land: new THREE.Vector3(-2.1 + i * 1.4 + j(0.35), 0, 0.6 + j(1.1)),
    peak: 5.2 + rng() * 1.6,
    yaw: Math.PI / 2 + j(0.45),
    roll: flatUp ? Math.PI : 0,
    rollSpins: 2 + Math.floor(rng() * 3),
    pitchSpins: Math.floor(rng() * 2),
    yawSpin: j(2.5),
    delay: i * 0.05 + rng() * 0.05,
  }))
}
