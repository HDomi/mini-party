import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { botAction, type BotLevel } from '../game/bot'
import { applyAction, createGame, currentPlayer, GOAL, RuleError, type Action, type GameState } from '../game/rules'
import { playerId } from '../net'
import { HOP } from '../scene/Pieces'
import { THROW_REVEAL_MS } from '../scene/YutSticks'
import { GameView, type GameApi } from './GameView'

// 봇과 1:1. 전부 이 탭 안에서 돈다: 방도, 백엔드도 없고 어디에도 아무것도 보내지 않는다.

const BOT_ID = 'bot'
const STORE = 'yutnori:solo'
const LEVELS: BotLevel[] = ['easy', 'normal', 'hard']
const LEVEL_LABEL: Record<BotLevel, string> = { easy: '쉬움', normal: '보통', hard: '어려움' }
const BOT_NAME: Record<BotLevel, string> = { easy: '아기 봇', normal: '윷봇', hard: '고수 봇' }
/** 두 자리 모두 항상 "online"이므로 보드는 봇 대신 두기를 제안하거나 기권승을 선언하지 않는다. */
const SEATS = { players: { [playerId]: { online: true }, [BOT_ID]: { online: true } } }

interface Setup {
  level: BotLevel
  piecesPerTeam: number
}

interface Saved extends Setup {
  game: GameState | null
}

/** 이 탭을 새로고침해도 게임이 유지된다. */
function load(): Saved {
  const fallback: Saved = { level: 'normal', piecesPerTeam: 4, game: null }
  try {
    const raw = sessionStorage.getItem(STORE)
    if (!raw) return fallback
    const v = JSON.parse(raw) as Partial<Saved>
    const game = v.game && playerId in v.game.names && BOT_ID in v.game.names ? v.game : null
    return {
      level: v.level && LEVELS.includes(v.level) ? v.level : fallback.level,
      piecesPerTeam: v.piecesPerTeam && v.piecesPerTeam >= 2 && v.piecesPerTeam <= 5 ? v.piecesPerTeam : fallback.piecesPerTeam,
      game,
    }
  } catch {
    return fallback
  }
}

function save(v: Saved) {
  try {
    sessionStorage.setItem(STORE, JSON.stringify(v))
  } catch {
    /* 무시 */
  }
}

/** 보드가 마지막 이벤트를 재생하는 데 걸리는 시간. 봇이 애니메이션 도중에 움직이지 않게 한다. */
function settleMs(g: GameState): number {
  const e = g.event
  if (e.type === 'throw') return THROW_REVEAL_MS + 900
  if (e.type === 'move') {
    const goal = e.path[e.path.length - 1] === GOAL ? 400 : 0
    const capture = e.captured.length ? 800 : 0
    return e.path.length * HOP * 1000 + goal + capture + 700
  }
  return 1200
}

function useSoloGame(name: string) {
  const [initial] = useState(load)
  const [setup, setSetup] = useState<Setup>({ level: initial.level, piecesPerTeam: initial.piecesPerTeam })
  const [game, setGame] = useState<GameState | null>(initial.game)
  // 새 게임마다 올려서 보드가 새 애니메이션 상태로 다시 마운트되게 한다.
  const [round, setRound] = useState(0)
  const [error, setError] = useState<string | null>(null)
  // 리렌더 전에 액션이 두 개 들어와도 최신 상태에 적용된다.
  const latest = useRef(game)

  const commit = useCallback((next: GameState | null) => {
    latest.current = next
    setGame(next)
  }, [])

  useEffect(() => save({ ...setup, game }), [setup, game])

  const flash = useCallback((msg: string) => {
    setError(msg)
    window.setTimeout(() => setError((cur) => (cur === msg ? null : cur)), 2200)
  }, [])

  // `proxy` 는 무시한다: 여기서는 누구도 남 대신 두지 않는다.
  const act = useCallback(
    async (action: Action) => {
      const cur = latest.current
      if (!cur) return
      try {
        commit(applyAction(cur, action))
      } catch (e) {
        if (e instanceof RuleError) flash(e.message)
        else throw e
      }
    },
    [commit, flash],
  )

  const start = useCallback(async () => {
    commit(
      createGame({
        players: [
          { id: playerId, name, team: 0 },
          { id: BOT_ID, name: BOT_NAME[setup.level], team: 1 },
        ],
        teamMode: false,
        piecesPerTeam: setup.piecesPerTeam,
      }),
    )
    setRound((r) => r + 1)
  }, [commit, name, setup])

  const toLobby = useCallback(async () => commit(null), [commit])

  // 봇의 손: 봇 차례가 되면 보드가 따라잡을 때까지 기다렸다가 움직인다.
  const level = setup.level
  useEffect(() => {
    if (!game || game.phase === 'over' || currentPlayer(game) !== BOT_ID) return
    const t = window.setTimeout(() => {
      const cur = latest.current
      const action = cur && botAction(cur, BOT_ID, level)
      if (action) void act(action)
    }, settleMs(game))
    return () => window.clearTimeout(t)
  }, [game, level, act])

  const api: GameApi = useMemo(
    () => ({ room: SEATS, inGame: true, hostId: playerId, error, act, start, toLobby }),
    [error, act, start, toLobby],
  )

  return { api, game, round, setup, setSetup }
}

export function Solo({ name, onLeave }: { name: string; onLeave: () => void }) {
  const { api, game, round, setup, setSetup } = useSoloGame(name)

  const leave = () => {
    // 나가면 진행 중인 게임은 버린다. 설정은 다음을 위해 남겨 둔다.
    save({ ...setup, game: null })
    onLeave()
  }

  if (game) {
    return <GameView key={round} code="BOT" api={api} game={game} onLeave={leave} onLastStanding={() => {}} />
  }

  return (
    <main className="home">
      <div className="home-card">
        <button className="btn ghost small solo-back" onClick={leave}>
          ← 나가기
        </button>
        <h2 className="title small">봇이랑 1:1</h2>
        <p className="subtitle">
          {name} vs {BOT_NAME[setup.level]}
        </p>

        <section className="settings solo-settings">
          <div className="inline">
            난이도
            <div className="seg small">
              {LEVELS.map((l) => (
                <button key={l} className={setup.level === l ? 'on' : ''} onClick={() => setSetup((s) => ({ ...s, level: l }))}>
                  {LEVEL_LABEL[l]}
                </button>
              ))}
            </div>
          </div>
          <div className="inline">
            말 개수
            <div className="seg small">
              {[2, 3, 4, 5].map((n) => (
                <button
                  key={n}
                  className={setup.piecesPerTeam === n ? 'on' : ''}
                  onClick={() => setSetup((s) => ({ ...s, piecesPerTeam: n }))}
                >
                  {n}
                </button>
              ))}
            </div>
          </div>
        </section>

        <button className="btn primary big" onClick={() => void api.start()}>
          시작하기
        </button>
      </div>
    </main>
  )
}
