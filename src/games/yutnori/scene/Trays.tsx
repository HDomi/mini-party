import { RoundedBox } from '@react-three/drei'
import { useFrame } from '@react-three/fiber'
import { useMemo, useRef, type CSSProperties } from 'react'
import * as THREE from 'three'
import { GOAL, type GameState } from '../game/rules'
import { trayCenter } from './layout'
import { SafeHtml } from './SafeHtml'

export function Trays({ game, portrait, online }: { game: GameState; portrait: boolean; online: Record<string, boolean> }) {
  return (
    <group>
      {game.teams.map((team, t) => {
        const [x, z] = trayCenter(t, game.teams.length, portrait)
        const done = game.pieces.filter((p) => p.team === t && p.pos === GOAL).length
        const total = game.pieces.filter((p) => p.team === t).length
        const active = game.phase !== 'over' && game.turn === t
        const playing = team.members[team.cursor % team.members.length]
        return (
          <group key={t} position={[x, 0, z]}>
            <Tray color={team.color} active={active} winner={game.winner === t} />
            <SafeHtml
              center
              position={portrait ? [0, 0.3, t % 2 ? 1.55 : -1.55] : [0, 0.3, -1.45]}
              style={{ pointerEvents: 'none' }}
            >
              <div className={`tray-label${active ? ' active' : ''}`} style={{ '--team': team.color } as CSSProperties}>
                <b>{team.name}</b>
                <span className="tray-score">
                  {done}/{total}
                </span>
                {game.teams.some((tm) => tm.members.length > 1) && (
                  <span className="tray-members">
                    {team.members.map((m) => (
                      <em key={m} className={`${m === playing ? 'now' : ''}${online[m] === false ? ' off' : ''}`}>
                        {game.names[m]}
                      </em>
                    ))}
                  </span>
                )}
              </div>
            </SafeHtml>
          </group>
        )
      })}
    </group>
  )
}

function Tray({ color, active, winner }: { color: string; active: boolean; winner: boolean }) {
  const mat = useRef<THREE.MeshStandardMaterial>(null)
  const tint = useMemo(() => new THREE.Color(color).lerp(new THREE.Color('#fff4e0'), 0.62), [color])
  const glow = useMemo(() => new THREE.Color(color), [color])
  useFrame(({ clock }) => {
    if (!mat.current) return
    mat.current.emissiveIntensity = active || winner ? 0.28 + Math.sin(clock.elapsedTime * 3) * 0.14 : 0
  })
  return (
    <RoundedBox args={[3.05, 0.22, 2.15]} radius={0.1} smoothness={3} position={[0, 0.11, 0]} castShadow receiveShadow>
      <meshStandardMaterial ref={mat} color={tint} emissive={glow} emissiveIntensity={0} roughness={0.6} />
    </RoundedBox>
  )
}
