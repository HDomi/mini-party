import { RoundedBox } from '@react-three/drei'
import { useEffect, useMemo } from 'react'
import * as THREE from 'three'
import { DICE } from '../game/rules'
import { DIE, DIVIDER_Z, heldSpot, RIM, RIM_H, TRAY_D, TRAY_W } from './layout'
import { feltTexture, woodTexture } from './textures'

const slotGeometry = new THREE.RingGeometry(DIE * 0.8, DIE * 0.86, 4, 1, Math.PI / 4)
const slotMaterial = new THREE.MeshBasicMaterial({ color: '#cfeedd', transparent: true, opacity: 0.35, depthWrite: false })

/** 펠트를 깐 나무 쟁반. 앞쪽 띠에 잡은 주사위가 설 자리 다섯 개가 그려져 있다. */
export function Tray() {
  const felt = useMemo(() => feltTexture(), [])
  const wood = useMemo(() => woodTexture(), [])
  useEffect(
    () => () => {
      felt.dispose()
      wood.dispose()
    },
    [felt, wood],
  )

  const outerW = TRAY_W + RIM * 2
  const outerD = TRAY_D + RIM * 2
  const rims: { size: [number, number, number]; pos: [number, number, number] }[] = [
    { size: [outerW, RIM_H, RIM], pos: [0, RIM_H / 2, -TRAY_D / 2 - RIM / 2] },
    { size: [outerW, RIM_H, RIM], pos: [0, RIM_H / 2, TRAY_D / 2 + RIM / 2] },
    { size: [RIM, RIM_H, TRAY_D], pos: [-TRAY_W / 2 - RIM / 2, RIM_H / 2, 0] },
    { size: [RIM, RIM_H, TRAY_D], pos: [TRAY_W / 2 + RIM / 2, RIM_H / 2, 0] },
  ]

  return (
    <group>
      <RoundedBox args={[outerW, 0.3, outerD]} radius={0.12} smoothness={4} position={[0, -0.15, 0]} receiveShadow castShadow>
        <meshStandardMaterial map={wood} roughness={0.6} />
      </RoundedBox>
      {rims.map((r, i) => (
        <RoundedBox key={i} args={r.size} radius={0.12} smoothness={4} position={r.pos} castShadow receiveShadow>
          <meshStandardMaterial map={wood} roughness={0.55} />
        </RoundedBox>
      ))}
      <mesh rotation-x={-Math.PI / 2} position-y={0.002} receiveShadow>
        <planeGeometry args={[TRAY_W, TRAY_D]} />
        <meshStandardMaterial map={felt} roughness={0.95} />
      </mesh>
      <mesh rotation-x={-Math.PI / 2} position={[0, 0.006, DIVIDER_Z]}>
        <planeGeometry args={[TRAY_W - 0.6, 0.05]} />
        <meshBasicMaterial color="#cfeedd" transparent opacity={0.4} depthWrite={false} />
      </mesh>
      {Array.from({ length: DICE }, (_, i) => {
        const { x, z } = heldSpot(i)
        return <mesh key={i} geometry={slotGeometry} material={slotMaterial} rotation-x={-Math.PI / 2} position={[x, 0.008, z]} />
      })}
    </group>
  )
}
