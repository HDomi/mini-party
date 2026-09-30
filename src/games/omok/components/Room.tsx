import { useMemo, useState } from 'react'
import { useRoom } from '@/net/useRoom'
import { omok } from '../room'
import { GameView, type GameApi } from './GameView'
import { Lobby } from './Lobby'
import styles from './Menu.module.scss'

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
  const api = useRoom(code, name, omok)
  const [watching, setWatching] = useState(false)
  const { room, inGame, hostId, error, act, flash, toLobby } = api
  const gameApi: GameApi = useMemo(
    () => ({ room, inGame, hostId, error, act: (a) => act(a), flash, toLobby }),
    [room, inGame, hostId, error, act, flash, toLobby],
  )

  if (api.connError || api.room === null || (api.room && api.room.gameType !== omok.id)) {
    return (
      <main className={styles.screen}>
        <div className={styles.card}>
          <h2 className={`${styles.title} ${styles.small}`}>{api.connError ? '연결 오류' : '방이 없어요'}</h2>
          <p className={styles.subtitle}>{api.connError ?? `${code} 방을 찾지 못했어요.`}</p>
          <button className="btn primary big" onClick={onLeave}>
            처음으로
          </button>
        </div>
      </main>
    )
  }
  if (api.room === undefined) {
    return (
      <main className={styles.screen}>
        <div className="spinner" />
      </main>
    )
  }

  if (!api.game) return <Lobby code={code} api={api} onLeave={onLeave} onRename={onRename} />
  // 이미 시작한 판에 새로 들어왔다. 바로 관전 화면으로 보내지 않고 먼저 알린다.
  // 이번 판이 끝나 로비로 돌아가면 useRoom 이 자리에 앉힌다. 원래 참가자는 me 가 있어 바로 판으로 돌아간다.
  if (!api.me && !watching) {
    return (
      <main className={styles.screen}>
        <div className={styles.card}>
          <h2 className={`${styles.title} ${styles.small}`}>이미 시작한 판이에요</h2>
          <p className={styles.subtitle}>지금은 관전만 할 수 있어요. 이번 판이 끝나고 방장이 로비로 돌아가면 자리에 앉을 수 있어요.</p>
          <div className={styles.stack}>
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
  // 한 판 더는 round 를 올린다. 보드는 애니메이션 상태를 처음부터 다시 잡도록 다시 마운트한다.
  return <GameView key={api.game.round} code={code} api={gameApi} game={api.game} onLeave={onLeave} />
}
