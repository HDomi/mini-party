import { ContactShadows, Environment, Lightformer, OrbitControls } from '@react-three/drei'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { useEffect, useRef } from 'react'
import * as THREE from 'three'
import { GOAL, type GameState } from '../game/rules'
import { Board } from './Board'
import { SafeHtml } from './SafeHtml'
import { BOARD_TOP, nodePos, type Vec3 } from './layout'
import { Pieces, type PiecesProps } from './Pieces'
import { Trays } from './Trays'
import { YutSticks } from './YutSticks'

export interface Preview {
  to: string
  label: string | null
  color: string
}

interface Props extends Omit<PiecesProps, 'game' | 'portrait'> {
  game: GameState
  portrait: boolean
  preview: Preview | null
  online: Record<string, boolean>
  onConfirm: () => void
}

export function GameScene(props: Props) {
  const { game, portrait, preview, online, onConfirm, ...pieceProps } = props
  return (
    <Canvas
      className="scene"
      shadows="percentage"
      dpr={[1, 2]}
      camera={{ fov: 36, position: [0, 20, 14], near: 0.5, far: 200 }}
      gl={{ antialias: true, alpha: true }}
      onPointerMissed={() => pieceProps.onHover(null)}
    >
      <Lights />
      <CameraRig portrait={portrait} />
      <Board />
      <Trays game={game} portrait={portrait} online={online} />
      <Pieces game={game} portrait={portrait} {...pieceProps} />
      {preview && <DestMarker preview={preview} onConfirm={onConfirm} />}
      <YutSticks event={game.event} mountSeq={pieceProps.mountSeq} />
    </Canvas>
  )
}

export function Lights() {
  return (
    <>
      <hemisphereLight args={['#fff6e6', '#b98a5a', 0.9]} />
      <directionalLight
        position={[7, 16, 9]}
        intensity={2.1}
        color="#fff1dc"
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-camera-left={-14}
        shadow-camera-right={14}
        shadow-camera-top={14}
        shadow-camera-bottom={-14}
        shadow-bias={-0.0004}
        shadow-radius={4}
      />
      <Environment resolution={128}>
        <Lightformer form="rect" intensity={2.4} position={[0, 8, 4]} scale={[12, 6, 1]} rotation-x={-Math.PI / 3} />
        <Lightformer form="circle" intensity={1.4} color="#ffd6a8" position={[-8, 4, -2]} scale={5} />
        <Lightformer form="circle" intensity={1.1} color="#b8d8ff" position={[8, 3, -4]} scale={4} />
      </Environment>
      <ContactShadows position={[0, 0.01, 0]} scale={34} blur={2.6} opacity={0.35} far={6} resolution={512} />
    </>
  )
}

function CameraRig({ portrait }: { portrait: boolean }) {
  const { camera, size, controls } = useThree()
  useEffect(() => {
    const cam = camera as THREE.PerspectiveCamera
    const aspect = size.width / size.height
    const halfW = portrait ? 7.4 : 10.9
    const halfD = portrait ? 10.9 : 7.3
    const elev = portrait ? 1.2 : 0.98
    const vt = Math.tan((cam.fov * Math.PI) / 360)
    const d = Math.max(halfW / (vt * aspect), (halfD * Math.sin(elev) + 1.6) / vt) * 1.04
    const target = new THREE.Vector3(0, 0, portrait ? 1.1 : 0.9)
    cam.position.set(0, target.y + d * Math.sin(elev), target.z + d * Math.cos(elev))
    cam.lookAt(target)
    cam.updateProjectionMatrix()
    const c = controls as unknown as { target: THREE.Vector3; update: () => void; minDistance: number; maxDistance: number } | null
    if (c) {
      c.target.copy(target)
      c.minDistance = d * 0.55
      c.maxDistance = d * 1.35
      c.update()
    }
  }, [camera, size, portrait, controls])

  return (
    <OrbitControls
      makeDefault
      enablePan={false}
      enableDamping
      minPolarAngle={0.12}
      maxPolarAngle={1.15}
      rotateSpeed={0.6}
    />
  )
}

function DestMarker({ preview, onConfirm }: { preview: Preview; onConfirm: () => void }) {
  const ref = useRef<THREE.Group>(null)
  const node = preview.to === GOAL ? 'O0' : preview.to
  const pos: Vec3 = nodePos(node, BOARD_TOP + 0.03)
  useFrame(({ clock }) => {
    if (!ref.current) return
    const s = 1 + Math.sin(clock.elapsedTime * 6) * 0.08
    ref.current.scale.set(s, 1, s)
  })
  return (
    <group position={pos}>
      <group ref={ref}>
        <mesh
          rotation-x={-Math.PI / 2}
          onClick={(e) => {
            e.stopPropagation()
            onConfirm()
          }}
          onPointerOver={() => (document.body.style.cursor = 'pointer')}
          onPointerOut={() => (document.body.style.cursor = '')}
        >
          <circleGeometry args={[0.72, 40]} />
          <meshBasicMaterial color={preview.color} transparent opacity={0.35} depthWrite={false} />
        </mesh>
        <mesh rotation-x={-Math.PI / 2} position={[0, 0.01, 0]}>
          <ringGeometry args={[0.62, 0.74, 48]} />
          <meshBasicMaterial color={preview.color} transparent opacity={0.95} depthWrite={false} />
        </mesh>
      </group>
      <SafeHtml center position={[0, 1.1, 0]} style={{ pointerEvents: 'none' }}>
        <span className="dest-label" style={{ background: preview.color }}>
          {preview.to === GOAL ? '골인!' : (preview.label ?? '여기로')}
        </span>
      </SafeHtml>
    </group>
  )
}
