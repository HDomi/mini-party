import { Canvas, useFrame } from '@react-three/fiber'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import type * as THREE from 'three'
import { DICE } from '../game/rules'
import { Dice } from '../scene/Dice'
import { Lights } from '../scene/DiceScene'
import { Tray } from '../scene/Tray'

/** 이만큼마다 다시 굴린다(ms). */
const EVERY_MS = 3600
const NONE = Array<boolean>(DICE).fill(false)
const ALL = Array.from({ length: DICE }, (_, i) => i)

/** 메뉴 카드 뒤에서 천천히 돌며 가끔 주사위를 굴리는 흐릿한 쟁반. */
export function Backdrop({ className }: { className?: string }) {
  const [roll, setRoll] = useState({ seq: 1, seed: 7, dice: [6, 6, 6, 6, 6] })
  useEffect(() => {
    const id = window.setInterval(
      () =>
        setRoll((r) => ({
          seq: r.seq + 1,
          seed: Math.floor(Math.random() * 2 ** 31),
          dice: r.dice.map(() => 1 + Math.floor(Math.random() * 6)),
        })),
      EVERY_MS,
    )
    return () => window.clearInterval(id)
  }, [])

  return (
    <Canvas className={className} shadows="percentage" dpr={[1, 1.5]} camera={{ fov: 34, position: [0, 15, 12] }}>
      <Lights />
      <Spin>
        <Tray />
        <Dice dice={roll.dice} held={NONE} roll={{ seq: roll.seq, rolled: ALL, seed: roll.seed }} mountSeq={1} interactive={false} quiet />
      </Spin>
    </Canvas>
  )
}

function Spin({ children }: { children: ReactNode }) {
  const ref = useRef<THREE.Group>(null)
  useFrame((_, dt) => {
    if (ref.current) ref.current.rotation.y += dt * 0.06
  })
  return <group ref={ref}>{children}</group>
}
