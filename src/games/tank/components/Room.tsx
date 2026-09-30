import { useMemo } from 'react'
import { playerId } from '@/net'
import { useRoom } from '@/net/useRoom'
import { MAPS } from '../game/world'
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
  // 맵이 생기기 전 형식(지형이 숫자 배열)으로 시작한 판은 지금 코드로 그릴 수 없다.
  if (typeof api.game.terrain !== 'string' || !MAPS[api.game.map]) {
    const isHost = api.hostId === playerId
    return (
      <main className={styles.screen}>
        <div className={styles.card}>
          <h2 className={`${styles.title} ${styles.small}`}>이어서 할 수 없는 판이에요</h2>
          <p className={styles.subtitle}>포격전이 업데이트되기 전에 시작한 판이에요. 로비로 돌아가 새로 시작해 주세요.</p>
          <div className={styles.stack}>
            {isHost ? (
              <button className="btn primary big" onClick={() => void api.toLobby()}>
                로비로
              </button>
            ) : (
              <p className="waiting">방장이 로비로 돌아가기를 기다리고 있어요…</p>
            )}
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
