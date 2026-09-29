import { useState } from 'react'
import { useRoom } from '../net/useRoom'
import { ForfeitWin } from './ForfeitWin'
import { GameView } from './GameView'
import { Lobby } from './Lobby'

export function Room({
  code,
  name,
  onLeave,
  onRename,
}: {
  code: string
  name: string
  onLeave: () => void
  onRename: (name: string) => void
}) {
  const api = useRoom(code, name)
  const [forfeit, setForfeit] = useState<{ teamName: string; color: string } | null>(null)

  // Checked first: the room is deleted right after this is set.
  if (forfeit) return <ForfeitWin {...forfeit} onLeave={onLeave} />

  if (api.room === undefined) {
    return (
      <main className="center-screen">
        <div className="spinner" />
      </main>
    )
  }
  if (api.room === null) {
    return (
      <main className="center-screen">
        <div className="home-card">
          <h2 className="title small">방이 없어요</h2>
          <p className="subtitle">{code} 방을 찾지 못했어요.</p>
          <button className="btn primary big" onClick={onLeave}>
            처음으로
          </button>
        </div>
      </main>
    )
  }

  if (!api.game) return <Lobby code={code} api={api} onLeave={onLeave} onRename={onRename} />
  return (
    <GameView
      code={code}
      api={api}
      game={api.game}
      onLeave={onLeave}
      onLastStanding={(team) => {
        setForfeit({ teamName: team.name, color: team.color })
        void api.deleteRoom()
      }}
    />
  )
}
