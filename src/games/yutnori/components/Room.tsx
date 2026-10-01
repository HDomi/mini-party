import { useState } from 'react'
import { SKEW_TEXT } from '@/net/skew'
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
  const [watching, setWatching] = useState(false)

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

  // 배포 전에 열어 둔 탭(옛 코드)과 새 코드가 한 방에 섞이지 않게 한다. 로비에서부터 막는다.
  if (api.skew) {
    const text = SKEW_TEXT[api.skew]
    return (
      <main className="center-screen">
        <div className="home-card">
          <h2 className="title small">{text.title}</h2>
          <p className="subtitle">{text.body}</p>
          <div className="started-actions">
            {api.skew === 'reload' && (
              <button className="btn primary big" onClick={() => window.location.reload()}>
                새로고침
              </button>
            )}
            <button className={`btn big ${api.skew === 'old-room' ? 'primary' : ''}`} onClick={onLeave}>
              처음으로
            </button>
          </div>
        </div>
      </main>
    )
  }
  if (!api.game) return <Lobby code={code} api={api} onLeave={onLeave} onRename={onRename} />
  // 이미 시작한 판에 새로 들어왔다. 바로 관전 화면으로 보내지 않고 먼저 알린다.
  // 이번 판이 끝나 로비로 돌아가면 useRoom 이 자리에 앉힌다. 원래 참가자는 me 가 있어 바로 판으로 돌아간다.
  if (!api.me && !watching) {
    return (
      <main className="center-screen">
        <div className="home-card">
          <h2 className="title small">이미 시작한 판이에요</h2>
          <p className="subtitle">지금은 관전만 할 수 있어요. 이번 판이 끝나고 방장이 로비로 돌아가면 자리에 앉을 수 있어요.</p>
          <div className="started-actions">
            <button className="btn primary big" onClick={() => setWatching(true)}>
              관전하기
            </button>
            <button className="btn big" onClick={onLeave}>
              처음으로
            </button>
          </div>
        </div>
      </main>
    )
  }
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
