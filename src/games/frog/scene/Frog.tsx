import { useFrame } from '@react-three/fiber'
import { useMemo, useRef } from 'react'
import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { FLIGHT, HALF_H, HOLE_LIST, IMPACT, LAND, POP, WINDUP } from './layout'
import { since, type TimelineRef } from './timeline'

// 통 위에 매달려 벌벌 떠는 개구리. 원점이 통 입구 가운데이고 +z 가 앞(카메라 쪽)이다.
// 몸통 아래쪽은 통 안에 숨어 있고 두 손으로 테두리를 꼭 잡고 있다.

const skin = new THREE.MeshPhysicalMaterial({ color: '#6fc34a', roughness: 0.45, clearcoat: 0.6, clearcoatRoughness: 0.35 })
const belly = new THREE.MeshPhysicalMaterial({ color: '#e1f7b0', roughness: 0.55, clearcoat: 0.3 })
const white = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.25 })
const black = new THREE.MeshStandardMaterial({ color: '#141414', roughness: 0.2 })
const dark = new THREE.MeshStandardMaterial({ color: '#2f5a1e', roughness: 0.6 })
const blush = new THREE.MeshBasicMaterial({ color: '#ff8fa6', transparent: true, opacity: 0.75, depthWrite: false })
const tongue = new THREE.MeshStandardMaterial({ color: '#ff6f86', roughness: 0.5 })
// transmission 을 쓰면 땀방울이 보일 때마다 장면을 한 번 더 그린다. 반투명 + 광택으로 충분하다.
const sweat = new THREE.MeshStandardMaterial({ color: '#8fd6ff', roughness: 0.05, metalness: 0.1, transparent: true, opacity: 0.85 })
const starMat = new THREE.MeshBasicMaterial({ color: '#ffd35a' })

const sphere = new THREE.SphereGeometry(1, 24, 18)
const mouthGeometry = new THREE.TorusGeometry(0.22, 0.035, 8, 24, Math.PI)
const browGeometry = new THREE.CapsuleGeometry(0.035, 0.22, 4, 8).rotateZ(Math.PI / 2)
const starGeometry = (() => {
  const s = new THREE.Shape()
  for (let i = 0; i < 10; i++) {
    const r = i % 2 ? 0.06 : 0.14
    const a = (i / 10) * Math.PI * 2 + Math.PI / 2
    if (i === 0) s.moveTo(Math.cos(a) * r, Math.sin(a) * r)
    else s.lineTo(Math.cos(a) * r, Math.sin(a) * r)
  }
  return new THREE.ExtrudeGeometry(s, { depth: 0.04, bevelEnabled: false }).center()
})()

/** 몸통 위 앞쪽에 붙은 팔. 어깨에서 테두리 위 손까지. */
function armGeometry(from: THREE.Vector3, to: THREE.Vector3) {
  const dir = to.clone().sub(from)
  const g = new THREE.CapsuleGeometry(0.1, dir.length(), 6, 12)
  g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.clone().normalize()))
  g.translate((from.x + to.x) / 2, (from.y + to.y) / 2, (from.z + to.z) / 2)
  return g
}

const HAND_Y = 0.2
const HANDS = [-1, 1].map((sx) => ({
  sx,
  shoulder: new THREE.Vector3(sx * 0.6, 0.15, 0.55),
  hand: new THREE.Vector3(sx * 0.92, HAND_Y, 1.38),
}))
/** 팔, 손, 손가락은 움직이지 않으므로 양쪽을 한 덩어리로 합친다. */
const HANDS_GEOMETRY = mergeGeometries(
  HANDS.flatMap(({ shoulder, hand }) => [
    armGeometry(shoulder, hand),
    new THREE.SphereGeometry(1, 20, 14).scale(0.19, 0.1, 0.17).translate(hand.x, hand.y, hand.z),
    ...[-0.11, 0, 0.11].map((dx) => new THREE.SphereGeometry(0.065, 12, 8).translate(hand.x + dx, HAND_Y - 0.04, hand.z + 0.15)),
  ]),
)

/** 날아오르는 처음 속도. 같은 시간 안에 내려오도록 중력을 맞춘다. */
const V = 13
const G = (2 * V) / FLIGHT

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v))

export function Frog({ tl, tension, aim }: { tl: TimelineRef; tension: number; aim: number | null }) {
  const root = useRef<THREE.Group>(null)
  const body = useRef<THREE.Group>(null)
  const eyes = useRef<(THREE.Group | null)[]>([])
  const pupils = useRef<(THREE.Group | null)[]>([])
  const brows = useRef<(THREE.Mesh | null)[]>([])
  const frown = useRef<THREE.Mesh>(null)
  const gasp = useRef<THREE.Group>(null)
  const drop = useRef<THREE.Mesh>(null)
  const stars = useRef<THREE.Group>(null)
  // 눈동자가 이리저리 굴러다닌다. 가끔 새 곳을 본다.
  const look = useMemo(() => ({ x: 0, y: 0, tx: 0, ty: 0, next: 0 }), [])

  useFrame(({ clock }, rawDt) => {
    const dt = Math.min(rawDt, 0.05)
    const now = clock.elapsedTime
    const g = root.current
    const b = body.current
    if (!g || !b) return
    const t = since(tl.current, now)
    const popped = tl.current.popped
    const flying = popped && t >= POP && t < LAND
    const dizzy = popped && t >= LAND
    // 칼을 빼는 순간부터 박히고 조금 뒤까지 질끈 눈을 감고 움츠린다.
    const flinch = t >= WINDUP * 0.35 && t < (popped ? POP : IMPACT + 0.28)
    const relief = !popped && t >= IMPACT + 0.28 && t < IMPACT + 1.6

    // ── 위치: 떨림, 움츠림, 비행 ──
    const amp = dizzy ? 0 : 0.012 + tension * 0.0035 + (aim !== null ? 0.02 : 0) + (flinch ? 0.025 : 0)
    g.position.set(Math.sin(now * 71) * amp, HALF_H - 0.18, Math.sin(now * 57 + 1) * amp * 0.5)
    g.rotation.set(0, 0, Math.sin(now * 53 + 2) * amp * 1.4)
    let crouch = 0
    if (flinch) crouch = -0.32 * clamp((t - WINDUP * 0.35) / 0.12, 0, 1)
    if (relief) crouch = Math.sin(clamp((t - IMPACT - 0.28) / 0.5, 0, 1) * Math.PI) * 0.12
    b.position.y = crouch

    if (flying) {
      const k = t - POP
      g.position.y += V * k - (G * k * k) / 2
      g.rotation.set(Math.sin(k * 6) * 0.5, k * 2, k * 11)
    } else if (dizzy) {
      const k = t - LAND
      // 떨어져 꿀렁, 그 뒤로는 비틀비틀.
      const squash = k < 0.6 ? Math.sin(k * 26) * Math.exp(-k * 7) * 0.35 : 0
      b.scale.set(1 + squash * 0.5, 1 - squash, 1 + squash * 0.5)
      g.rotation.set(0, Math.sin(now * 2.2) * 0.25, Math.sin(now * 3.1) * 0.12)
    } else b.scale.setScalar(1)

    // ── 눈 ──
    const shut = flinch ? 0.12 : 1
    const wide = flying ? 1.35 : 1
    eyes.current.forEach((e) => e?.scale.set(wide, shut * wide, wide))
    if (now > look.next) {
      look.next = now + 0.25 + Math.random() * 0.7
      look.tx = (Math.random() - 0.5) * 0.12
      look.ty = (Math.random() - 0.5) * 0.08
    }
    if (aim !== null && !flinch) {
      // 칼이 노리는 구멍 쪽을 곁눈질한다.
      const h = HOLE_LIST[aim].pos
      look.tx = clamp(h.x * 0.05, -0.09, 0.09)
      look.ty = -0.07
    }
    if (dizzy) {
      look.tx = Math.cos(now * 9) * 0.08
      look.ty = Math.sin(now * 9) * 0.08
    }
    look.x += (look.tx - look.x) * Math.min(1, dt * 18)
    look.y += (look.ty - look.y) * Math.min(1, dt * 18)
    pupils.current.forEach((p, i) => {
      if (!p) return
      // 어지러울 때는 두 눈이 반대로 돈다.
      const flip = dizzy && i === 1 ? -1 : 1
      p.position.set(look.x * flip, look.y, 0)
      p.scale.setScalar(flying ? 0.6 : 1)
    })
    brows.current.forEach((m, i) => {
      if (!m) return
      const sx = i === 0 ? -1 : 1
      m.rotation.z = -sx * (flinch ? 0.75 : flying ? 0.2 : 0.45)
      m.position.y = 1.33 + (flying ? 0.12 : 0) + (flinch ? -0.05 : 0)
    })

    // ── 입: 평소엔 걱정스러운 ∩ 가 덜덜, 날 때와 어지러울 때는 벌린 입 ──
    const open = flying || dizzy
    if (frown.current) {
      frown.current.visible = !open
      frown.current.scale.y = 1 + Math.sin(now * 40) * (0.15 + tension * 0.01)
    }
    if (gasp.current) gasp.current.visible = open

    // ── 땀 한 방울: 안도할 때, 그리고 칼이 많이 꽂히면 주기적으로 ──
    const d = drop.current
    if (d) {
      const cycle = tension >= 6 ? (now % 1.7) / 1.7 : relief ? (t - IMPACT - 0.28) / 1.2 : -1
      d.visible = !open && cycle >= 0 && cycle < 1
      if (d.visible) {
        d.position.set(0.84, 1.12 - cycle * 0.7, 0.35)
        d.scale.set(0.07, 0.1, 0.07).multiplyScalar(1 - cycle * 0.4)
      }
    }

    // ── 머리 위를 도는 별 ──
    const s = stars.current
    if (s) {
      s.visible = dizzy
      s.rotation.y = now * 3
    }
  })

  return (
    <group ref={root}>
      {/* 손은 움츠려도 테두리를 놓지 않는다. */}
      <mesh geometry={HANDS_GEOMETRY} material={skin} />

      <group ref={body}>
        <mesh geometry={sphere} material={skin} position={[0, 0.2, 0]} scale={[0.95, 0.85, 0.9]} castShadow />
        <mesh geometry={sphere} material={belly} position={[0, 0.12, 0.62]} scale={[0.6, 0.55, 0.32]} />
        {[-1, 1].map((sx, i) => (
          <group key={sx}>
            <mesh geometry={sphere} material={skin} position={[sx * 0.42, 0.95, 0.22]} scale={0.34} />
            <group ref={(g) => void (eyes.current[i] = g)} position={[sx * 0.42, 1.0, 0.4]}>
              <mesh geometry={sphere} material={white} scale={0.27} />
              <group ref={(g) => void (pupils.current[i] = g)}>
                <mesh geometry={sphere} material={black} position-z={0.21} scale={[0.12, 0.13, 0.08]} />
                <mesh geometry={sphere} material={white} position={[0.04, 0.05, 0.28]} scale={0.035} />
              </group>
            </group>
            <mesh ref={(m) => void (brows.current[i] = m)} geometry={browGeometry} material={dark} position={[sx * 0.42, 1.33, 0.44]} />
            <mesh geometry={sphere} material={blush} position={[sx * 0.58, 0.55, 0.7]} rotation-y={sx * 0.6} scale={[0.14, 0.08, 0.04]} />
          </group>
        ))}
        <mesh ref={frown} geometry={mouthGeometry} material={dark} position={[0, 0.42, 0.84]} rotation-x={-0.35} />
        <group ref={gasp} position={[0, 0.42, 0.84]} rotation-x={-0.3} visible={false}>
          <mesh geometry={sphere} material={black} scale={[0.2, 0.17, 0.06]} />
          <mesh geometry={sphere} material={tongue} position={[0.05, -0.08, 0.03]} scale={[0.1, 0.07, 0.05]} />
        </group>
        <mesh ref={drop} geometry={sphere} material={sweat} visible={false} />
        <group ref={stars} position={[0, 1.75, 0]} visible={false}>
          {[0, 1, 2].map((i) => {
            const a = (i / 3) * Math.PI * 2
            return <mesh key={i} geometry={starGeometry} material={starMat} position={[Math.cos(a) * 0.62, Math.sin(i * 2) * 0.06, Math.sin(a) * 0.62]} />
          })}
        </group>
      </group>
    </group>
  )
}
