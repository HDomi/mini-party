import { RoundedBox } from '@react-three/drei'
import { useEffect, useMemo } from 'react'
import * as THREE from 'three'
import { BLACK, type Color } from '../game/rules'
import { BOARD_SIZE, BOARD_TOP } from './layout'
import { stoneGeometry, stoneMaterials } from './Stones'
import { boardTexture, sideTexture, tableTexture } from './textures'

export function Board() {
  const top = useMemo(() => boardTexture(), [])
  const side = useMemo(() => sideTexture(), [])
  const table = useMemo(() => tableTexture(), [])
  useEffect(
    () => () => {
      top.dispose()
      side.dispose()
      table.dispose()
    },
    [top, side, table],
  )

  return (
    <group>
      <mesh rotation-x={-Math.PI / 2} receiveShadow>
        <circleGeometry args={[40, 64]} />
        <meshStandardMaterial map={table} roughness={0.98} />
      </mesh>

      <RoundedBox
        args={[BOARD_SIZE, BOARD_TOP, BOARD_SIZE]}
        radius={0.12}
        smoothness={4}
        position={[0, BOARD_TOP / 2, 0]}
        castShadow
        receiveShadow
      >
        <meshStandardMaterial map={side} roughness={0.6} />
      </RoundedBox>

      <mesh rotation-x={-Math.PI / 2} position={[0, BOARD_TOP + 0.002, 0]} receiveShadow>
        <planeGeometry args={[BOARD_SIZE - 0.16, BOARD_SIZE - 0.16]} />
        <meshStandardMaterial map={top} roughness={0.7} />
      </mesh>
    </group>
  )
}

const bowlGeometry = (() => {
  const pts = [
    [0, 0],
    [0.9, 0],
    [1.3, 0.12],
    [1.55, 0.45],
    [1.6, 0.8],
    [1.52, 1.0],
    [1.42, 0.98],
    [1.45, 0.8],
    [1.38, 0.5],
    [1.1, 0.3],
    [0, 0.26],
  ].map(([x, y]) => new THREE.Vector2(x, y))
  return new THREE.LatheGeometry(pts, 48)
})()
const bowlMaterial = new THREE.MeshStandardMaterial({ color: '#8a5a2e', roughness: 0.45 })

/** 판 옆 돌통. 가로 화면에서만 놓는다. */
export function Bowl({ color, position }: { color: Color; position: [number, number, number] }) {
  // 통 안에 쌓인 돌. 매번 같은 모양이 되도록 색으로 시드를 정한다.
  const stones = useMemo(() => {
    const out: { p: [number, number, number]; r: [number, number, number] }[] = []
    let seed = color === BLACK ? 11 : 29
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647)
    for (let i = 0; i < 16; i++) {
      const a = rnd() * Math.PI * 2
      const d = Math.sqrt(rnd()) * 0.95
      out.push({
        p: [Math.cos(a) * d, 0.3 + rnd() * 0.25 + (1 - d) * 0.2, Math.sin(a) * d],
        r: [(rnd() - 0.5) * 0.8, rnd() * 3, (rnd() - 0.5) * 0.8],
      })
    }
    return out
  }, [color])
  return (
    <group position={position}>
      <mesh geometry={bowlGeometry} material={bowlMaterial} castShadow receiveShadow />
      {stones.map((s, i) => (
        <mesh
          key={i}
          geometry={stoneGeometry}
          material={stoneMaterials[color]}
          position={s.p}
          rotation={s.r}
          castShadow
        />
      ))}
    </group>
  )
}
