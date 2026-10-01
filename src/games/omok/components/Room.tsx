import { useMemo, useState } from 'react'
import { SKEW_TEXT } from '@/net/skew'
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

  // 배포 전에 열어 둔 탭(옛 코드)과 새 코드가 한 방에 섞이지 않게 한다. 로비에서부터 막는다.
  if (api.skew) {
    const text = SKEW_TEXT[api.skew]
    return (
      <main className={styles.screen}>
        <div className={styles.card}>
          <h2 className={`${styles.title} ${styles.small}`}>{text.title}</h2>
          <p className={styles.subtitle}>{text.body}</p>
          <div className={styles.stack}>
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
