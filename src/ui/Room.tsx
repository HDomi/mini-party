import { useRoom } from '../net/useRoom'
import { GameView } from './GameView'
import { Lobby } from './Lobby'

export function Room({ code, name, onLeave }: { code: string; name: string; onLeave: () => void }) {
  const api = useRoom(code, name)

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
          <h2 className="title small">방이 없어</h2>
          <p className="subtitle">코드 {code}로 된 방을 찾지 못했어.</p>
          <button className="btn primary big" onClick={onLeave}>
            처음으로
          </button>
        </div>
      </main>
    )
  }

  return api.game ? <GameView code={code} api={api} game={api.game} onLeave={onLeave} /> : <Lobby code={code} api={api} onLeave={onLeave} />
}
