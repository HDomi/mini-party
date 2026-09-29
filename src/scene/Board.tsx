import { RoundedBox } from '@react-three/drei'
import { useEffect, useMemo, useState } from 'react'
import type * as THREE from 'three'
import { BOARD_SIZE, BOARD_TOP } from './layout'
import { boardTexture, matTexture } from './textures'

export function Board() {
  const [top, setTop] = useState<THREE.CanvasTexture | null>(null)
  const mat = useMemo(() => matTexture(), [])

  useEffect(() => () => mat.dispose(), [mat])
  useEffect(() => () => top?.dispose(), [top])

  useEffect(() => {
    let alive = true
    // The start label uses Jua; wait so the canvas doesn't fall back to a system font.
    document.fonts
      .load('64px Jua')
      .catch(() => undefined)
      .then(() => alive && setTop(boardTexture()))
    return () => {
      alive = false
    }
  }, [])

  return (
    <group>
      <mesh rotation-x={-Math.PI / 2} receiveShadow>
        <circleGeometry args={[34, 64]} />
        <meshStandardMaterial map={mat} roughness={0.95} />
      </mesh>

      <RoundedBox
        args={[BOARD_SIZE + 0.5, BOARD_TOP, BOARD_SIZE + 0.5]}
        radius={0.2}
        smoothness={4}
        position={[0, BOARD_TOP / 2, 0]}
        castShadow
        receiveShadow
      >
        <meshStandardMaterial color="#9c5e34" roughness={0.55} />
      </RoundedBox>

      <mesh rotation-x={-Math.PI / 2} position={[0, BOARD_TOP + 0.002, 0]} receiveShadow>
        <planeGeometry args={[BOARD_SIZE, BOARD_SIZE]} />
        <meshStandardMaterial key={top ? 'tex' : 'plain'} map={top} color={top ? '#ffffff' : '#f6ead2'} roughness={0.85} />
      </mesh>
    </group>
  )
}
