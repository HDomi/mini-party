import { useState } from 'react'
import { useRoom } from '@/net/useRoom'
import { yutnori } from '../room'
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
  const api = useRoom(code, name, yutnori)
  const [forfeit, setForfeit] = useState<{ teamName: string; color: string } | null>(null)

  // 한 판 더는 이 화면을 떠나지 않고 새 게임으로 바꿔 끼운다 (seq 는 1부터 다시 시작). 보드는
  // 공개/애니메이션 관리를 seq 기준으로 하므로 seq 가 뒤로 갈 때마다 다시 마운트한다.
  const seq = api.game?.seq ?? 0
  const [board, setBoard] = useState({ round: 0, seq })
  if (seq !== board.seq) setBoard({ round: seq < board.seq ? board.round + 1 : board.round, seq })

  // 먼저 확인한다: 이 값이 설정된 직후 방이 삭제된다.
  if (forfeit) return <ForfeitWin {...forfeit} onLeave={onLeave} />

  if (api.connError) {
    return (
      <main className="center-screen">
        <div className="home-card">
          <h2 className="title small">연결 오류</h2>
          <p className="subtitle">{api.connError}</p>
          <button className="btn primary big" onClick={onLeave}>
            처음으로
          </button>
        </div>
      </main>
    )
  }
  if (api.room === undefined) {
    return (
      <main className="center-screen">
        <div className="spinner" />
      </main>
    )
  }
  if (api.room === null || api.room.gameType !== yutnori.id) {
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
      key={board.round}
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
