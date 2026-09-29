import { useFrame } from '@react-three/fiber'
import { useEffect, useLayoutEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { GOAL, type GameState, type Piece } from '../game/rules'
import { SafeHtml } from './SafeHtml'
import { BOARD_TOP, nodePos, PIECE_H, restingPositions, type Vec3 } from './layout'

interface Hop {
  to: Vec3
  dur: number
  arc: number
}
interface Plan {
  seq: number
  delay: number
  hops: Hop[]
}

const HOP = 0.26
const scratch = new THREE.Vector3()

const bodyGeometry = (() => {
  const pts = [
    [0, 0],
    [0.4, 0],
    [0.45, 0.03],
    [0.46, 0.12],
    [0.44, 0.2],
    [0.36, 0.26],
    [0.2, 0.295],
    [0, 0.3],
  ].map(([x, y]) => new THREE.Vector2(x, y))
  return new THREE.LatheGeometry(pts, 40)
})()
const eyeGeometry = new THREE.SphereGeometry(0.045, 12, 8)
const eyeMaterial = new THREE.MeshStandardMaterial({ color: '#1d1512', roughness: 0.3 })
// Invisible, wider than the body: pieces are small on phones and taps kept missing.
const hitGeometry = new THREE.CylinderGeometry(0.78, 0.78, 0.9, 16)
const haloMaterial = new THREE.MeshStandardMaterial({
  color: '#ffd35a',
  emissive: '#ffb300',
  emissiveIntensity: 0.8,
  metalness: 0.3,
  roughness: 0.3,
})

export type Ring = 'none' | 'movable' | 'selected'

export interface PiecesProps {
  game: GameState
  portrait: boolean
  mountSeq: number
  movableIds: Set<string>
  selectedId: string | null
  onPick: (id: string) => void
  onHover: (id: string | null) => void
}

export function Pieces({ game, portrait, mountSeq, movableIds, selectedId, onPick, onHover }: PiecesProps) {
  const rest = useMemo(() => restingPositions(game, portrait), [game, portrait])

  const plans = useMemo(() => {
    const out: Record<string, Plan> = {}
    const e = game.event
    if (e.type !== 'move' || e.seq <= mountSeq) return out
    const moved = [...e.pieceIds].sort()
    moved.forEach((id, k) => {
      const hops: Hop[] = e.path.map((n) => ({
        to: n === GOAL ? rest[id] : nodePos(n, BOARD_TOP + k * PIECE_H),
        dur: n === GOAL ? 0.6 : HOP,
        arc: n === GOAL ? 2.4 : 0.9,
      }))
      hops[hops.length - 1] = { ...hops[hops.length - 1], to: rest[id] }
      out[id] = { seq: e.seq, delay: k * 0.04, hops }
    })
    const landAt = e.path.length * HOP + 0.05
    for (const id of e.captured) {
      out[id] = { seq: e.seq, delay: landAt, hops: [{ to: rest[id], dur: 0.75, arc: 3.4 }] }
    }
    return out
    // plans only depend on the event; `rest` is read for its value at that moment
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [game.event.seq, portrait, mountSeq])

  const stacks = useMemo(() => {
    const byPos = new Map<string, Piece[]>()
    for (const p of game.pieces) {
      if (p.pos === 'HOME' || p.pos === GOAL) continue
      byPos.set(p.pos, [...(byPos.get(p.pos) ?? []), p])
    }
    const top: Record<string, number> = {}
    const bottom = new Set<string>()
    for (const list of byPos.values()) {
      const sorted = [...list].sort((a, b) => a.id.localeCompare(b.id))
      top[sorted[sorted.length - 1].id] = sorted.length
      bottom.add(sorted[0].id)
    }
    return { top, bottom }
  }, [game.pieces])

  const selectedGroup = useMemo(() => {
    const sel = game.pieces.find((p) => p.id === selectedId)
    if (!sel) return new Set<string>()
    if (sel.pos === 'HOME') return new Set([sel.id])
    return new Set(game.pieces.filter((p) => p.team === sel.team && p.pos === sel.pos).map((p) => p.id))
  }, [game.pieces, selectedId])

  return (
    <group>
      {game.pieces.map((p) => {
        const onBoard = p.pos !== 'HOME' && p.pos !== GOAL
        const ringHere = !onBoard || stacks.bottom.has(p.id)
        const ring: Ring = !ringHere
          ? 'none'
          : selectedGroup.has(p.id)
            ? 'selected'
            : movableIds.has(p.id)
              ? 'movable'
              : 'none'
        return (
          <PieceView
            key={p.id}
            id={p.id}
            color={game.teams[p.team].color}
            rest={rest[p.id]}
            plan={plans[p.id]}
            ring={ring}
            finished={p.pos === GOAL}
            stackCount={stacks.top[p.id] ?? 0}
            clickable={movableIds.has(p.id)}
            onPick={onPick}
            onHover={onHover}
          />
        )
      })}
    </group>
  )
}

function ease(t: number) {
  return t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2
}

function PieceView(props: {
  id: string
  color: string
  rest: Vec3
  plan?: Plan
  ring: Ring
  finished: boolean
  stackCount: number
  clickable: boolean
  onPick: (id: string) => void
  onHover: (id: string | null) => void
}) {
  const { id, color, rest, plan, ring, finished, stackCount, clickable, onPick, onHover } = props
  const group = useRef<THREE.Group>(null)
  const body = useRef<THREE.Group>(null)
  const ringRef = useRef<THREE.Mesh>(null)
  const cur = useRef(new THREE.Vector3(...rest))
  const seenSeq = useRef(0)
  const squash = useRef(0)
  const anim = useRef<{ from: THREE.Vector3; hops: Hop[]; i: number; t: number; wait: number } | null>(null)

  useLayoutEffect(() => {
    if (plan && plan.seq > seenSeq.current) {
      seenSeq.current = plan.seq
      anim.current = { from: cur.current.clone(), hops: plan.hops.map((h) => ({ ...h })), i: 0, t: 0, wait: plan.delay }
      return
    }
    if (anim.current) {
      anim.current.hops[anim.current.hops.length - 1].to = rest
      return
    }
    if (cur.current.distanceTo(new THREE.Vector3(...rest)) > 0.001) {
      anim.current = { from: cur.current.clone(), hops: [{ to: rest, dur: 0.35, arc: 0.3 }], i: 0, t: 0, wait: 0 }
    }
  }, [plan, rest])

  const material = useMemo(
    () =>
      new THREE.MeshPhysicalMaterial({
        color,
        roughness: 0.32,
        clearcoat: 1,
        clearcoatRoughness: 0.15,
        sheen: 0.4,
      }),
    [color],
  )
  useEffect(() => () => material.dispose(), [material])

  useFrame((state, dt) => {
    const g = group.current
    if (!g) return
    const a = anim.current
    if (a) {
      if (a.wait > 0) a.wait -= dt
      else {
        const hop = a.hops[a.i]
        a.t += dt / hop.dur
        const k = Math.min(a.t, 1)
        const to = scratch.set(...hop.to)
        cur.current.lerpVectors(a.from, to, ease(k))
        cur.current.y += Math.sin(Math.PI * k) * hop.arc
        if (k >= 1) {
          cur.current.copy(to)
          a.from.copy(to)
          a.i += 1
          a.t = 0
          squash.current = 1
          if (a.i >= a.hops.length) anim.current = null
        }
      }
    }
    g.position.copy(cur.current)

    squash.current = Math.max(0, squash.current - dt * 5)
    const s = Math.sin(squash.current * Math.PI) * 0.22
    body.current?.scale.set(1 + s * 0.5, 1 - s, 1 + s * 0.5)

    if (ringRef.current) {
      const t = state.clock.elapsedTime
      const pulse = ring === 'selected' ? 1.08 + Math.sin(t * 8) * 0.06 : 1 + Math.sin(t * 4) * 0.08
      ringRef.current.scale.setScalar(pulse)
      ;(ringRef.current.material as THREE.MeshBasicMaterial).opacity = ring === 'selected' ? 0.95 : 0.55 + Math.sin(t * 4) * 0.25
    }
  })

  return (
    <group ref={group}>
      <group
        ref={body}
        scale={finished ? 0.8 : 1}
        onClick={(e) => {
          if (!clickable) return
          e.stopPropagation()
          onPick(id)
        }}
        onPointerOver={(e) => {
          if (!clickable) return
          e.stopPropagation()
          document.body.style.cursor = 'pointer'
          onHover(id)
        }}
        onPointerOut={() => {
          document.body.style.cursor = ''
          onHover(null)
        }}
      >
        {clickable && <mesh geometry={hitGeometry} position={[0, 0.35, 0]} visible={false} />}
        <mesh geometry={bodyGeometry} material={material} castShadow receiveShadow />
        <mesh geometry={eyeGeometry} material={eyeMaterial} position={[-0.12, 0.19, 0.42]} />
        <mesh geometry={eyeGeometry} material={eyeMaterial} position={[0.12, 0.19, 0.42]} />
        {finished && (
          <mesh material={haloMaterial} position={[0, 0.5, 0]} rotation-x={Math.PI / 2}>
            <torusGeometry args={[0.2, 0.035, 10, 32]} />
          </mesh>
        )}
      </group>

      {ring !== 'none' && (
        <mesh ref={ringRef} rotation-x={-Math.PI / 2} position={[0, 0.02, 0]}>
          <ringGeometry args={[0.52, 0.64, 48]} />
          <meshBasicMaterial color={ring === 'selected' ? '#ffd35a' : '#ffffff'} transparent depthWrite={false} />
        </mesh>
      )}

      {stackCount > 1 && (
        <SafeHtml center position={[0, 0.62, 0]} style={{ pointerEvents: 'none' }}>
          <span className="stack-badge" style={{ background: color }}>
            ×{stackCount}
          </span>
        </SafeHtml>
      )}
    </group>
  )
}
