import { useMemo } from 'react'
import { useRoom } from '@/net/useRoom'
import { tank } from '../room'
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
  const api = useRoom(code, name, tank)
  const { room, inGame, hostId, error, act, flash, toLobby } = api
  const gameApi: GameApi = useMemo(
    () => ({ room, inGame, hostId, error, act: (a) => act(a), flash, toLobby }),
    [room, inGame, hostId, error, act, flash, toLobby],
  )

  if (api.connError || api.room === null || (api.room && api.room.gameType !== tank.id)) {
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
  // 한 판 더는 round 를 올린다. 보드는 애니메이션 상태를 처음부터 다시 잡도록 다시 마운트한다.
  return <GameView key={api.game.round} code={code} api={gameApi} game={api.game} onLeave={onLeave} />
}
