import { ContactShadows, Environment, Lightformer, OrbitControls, PerformanceMonitor } from '@react-three/drei'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { useEffect, useMemo, useRef, useState } from 'react'
import type * as THREE from 'three'
import { budgetDpr } from '@/utils/dpr'
import { Barrel } from './Barrel'
import { Effects, ShakeGroup } from './Effects'
import { Frog } from './Frog'
import { HALF_H } from './layout'
import { GhostSword, Sword } from './Sword'
import { LONG_AGO, type Timeline, type TimelineRef } from './timeline'

/** 버티지 못하면 이만큼까지 조금씩 내린다. */
const MIN_DPR = 0.7

export interface SceneSword {
  hole: number
  seq: number
  color: string
}

export interface FrogSceneProps {
  swords: SceneSword[]
  /** 마지막 칼과 그 칼에 개구리가 튀어나왔는지. */
  last: { seq: number; hole: number; popped: boolean } | null
  /** 화면을 처음 그릴 때의 `seq`. 그 뒤에 꽂힌 칼만 연출한다. */
  mountSeq: number
  aim: { hole: number; color: string } | null
  interactive: boolean
  onPick: (hole: number) => void
  /** 메뉴 배경처럼 소리를 내지 않는다. */
  quiet?: boolean
  /** 메뉴 배경은 사람이 돌리지 않고 저절로 돈다. */
  spin?: boolean
  /** 메뉴 배경처럼 흐리게 깔리는 화면. 그림자 없이 1x 로 그린다. */
  lite?: boolean
  className?: string
}

export function FrogScene({ className, lite, ...props }: FrogSceneProps) {
  // 기기가 버티지 못하면 배율을 조금씩 영구히 낮춘다.
  const [dpr, setDpr] = useState(() => budgetDpr())
  return (
    <Canvas
      className={className}
      shadows={lite ? false : 'percentage'}
      dpr={lite ? 1 : dpr}
      camera={{ fov: 38, position: [0, 3.4, 10], near: 0.5, far: 200 }}
      gl={{ antialias: true, alpha: true, powerPreference: 'high-performance' }}
    >
      {!lite && <PerformanceMonitor onDecline={() => setDpr((d) => Math.max(MIN_DPR, d * 0.8))} />}
      {import.meta.env.DEV && <Stats />}
      <Lights />
      <Contents {...props} />
    </Canvas>
  )
}

function Contents({ swords, last, mountSeq, aim, interactive, onPick, quiet, spin }: FrogSceneProps) {
  const clock = useThree((st) => st.clock)
  const tl = useRef<Timeline>({ seq: 0, start: LONG_AGO, hole: 0, popped: false })
  // 새 칼이 오면 연출 시계를 지금으로 맞춘다. 칼·불꽃·개구리가 같은 프레임부터 이 시계를 본다.
  // 처음 그릴 때 이미 있던 칼은 끝난 모습으로 둔다(끝난 판이면 개구리가 이미 날아갔다 떨어져 있다).
  if (last && last.seq !== tl.current.seq) {
    tl.current = { seq: last.seq, start: last.seq > mountSeq ? clock.elapsedTime : LONG_AGO, hole: last.hole, popped: last.popped }
  }

  const taken = useMemo(() => new Set(swords.map((s) => s.hole)), [swords])
  const ghost = aim && !taken.has(aim.hole) ? aim : null

  return (
    <>
      <CameraRig spin={spin} />
      <ShakeGroup>
        <Barrel tl={tl as TimelineRef} taken={taken} aim={ghost} interactive={interactive} onPick={onPick}>
          {swords.map((s) => (
            <Sword key={s.seq} hole={s.hole} color={s.color} seq={s.seq} tl={tl as TimelineRef} />
          ))}
          {ghost && <GhostSword hole={ghost.hole} color={ghost.color} />}
        </Barrel>
        <Frog tl={tl as TimelineRef} tension={swords.length} aim={ghost?.hole ?? null} />
        <Effects tl={tl as TimelineRef} quiet={quiet} />
      </ShakeGroup>
    </>
  )
}

function Lights() {
  return (
    <>
      <hemisphereLight args={['#fff6e6', '#55603f', 0.85]} />
      <directionalLight
        position={[-5, 12, 8]}
        intensity={2.3}
        color="#fff1dc"
        castShadow
        shadow-mapSize={[1024, 1024]}
        shadow-camera-left={-4}
        shadow-camera-right={4}
        shadow-camera-top={5}
        shadow-camera-bottom={-4}
        shadow-bias={-0.0004}
        shadow-radius={3}
      />
      <Environment resolution={128}>
        <Lightformer form="rect" intensity={2.4} position={[0, 6, 6]} scale={[10, 5, 1]} />
        <Lightformer form="circle" intensity={1.2} color="#ffd6a8" position={[-7, 3, 2]} scale={5} />
        <Lightformer form="circle" intensity={1} color="#b8d8ff" position={[7, 2, -3]} scale={4} />
      </Environment>
      <ContactShadows frames={1} position={[0, -HALF_H - 0.01, 0]} scale={14} blur={2.2} opacity={0.5} far={4} resolution={512} />
    </>
  )
}

/** 카메라가 보는 높이. 통 가운데보다 조금 위라 개구리가 잘리지 않는다. */
const TARGET_Y = 1.0

/** 통 전체(위에 앉은 개구리까지)가 화면에 들어오게 거리를 맞추고, 좌우로만 돌릴 수 있게 한다. */
function CameraRig({ spin }: { spin?: boolean }) {
  const { camera, size, controls } = useThree()
  useEffect(() => {
    const cam = camera as THREE.PerspectiveCamera
    const aspect = size.width / size.height
    // 통 옆으로 튀어나온 칼 손잡이까지, 아래로는 바닥 그림자, 위로는 개구리 눈과 HUD 가 가리는 만큼.
    const halfW = 3.0
    const halfH = 3.9
    const vt = Math.tan((cam.fov * Math.PI) / 360)
    const d = Math.max(halfW / (vt * aspect), halfH / vt) * 1.04
    const elev = 0.2
    cam.position.set(0, TARGET_Y + d * Math.sin(elev), d * Math.cos(elev))
    cam.lookAt(0, TARGET_Y, 0)
    cam.updateProjectionMatrix()
    const c = controls as unknown as { target: THREE.Vector3; update: () => void } | null
    if (c) {
      c.target.set(0, TARGET_Y, 0)
      c.update()
    }
  }, [camera, size, controls])

  return (
    <OrbitControls
      makeDefault
      enablePan={false}
      enableZoom={false}
      enableRotate={!spin}
      autoRotate={spin}
      autoRotateSpeed={0.6}
      enableDamping
      minPolarAngle={1.1}
      maxPolarAngle={1.62}
      rotateSpeed={0.6}
    />
  )
}

/** 개발용: 프레임마다 그린 횟수를 남긴다. 프로덕션 빌드에서는 제거된다. */
function Stats() {
  useFrame(({ gl }) => {
    const i = gl.info
    ;(window as unknown as Record<string, unknown>).__frogGL = { calls: i.render.calls, triangles: i.render.triangles, programs: i.programs?.length, geometries: i.memory.geometries, textures: i.memory.textures, pixels: gl.domElement.width * gl.domElement.height }
  })
  return null
}
