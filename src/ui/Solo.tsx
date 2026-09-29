import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { botAction, type BotLevel } from '../game/bot'
import { applyAction, createGame, currentPlayer, GOAL, RuleError, type Action, type GameState } from '../game/rules'
import { playerId } from '../net'
import { HOP } from '../scene/Pieces'
import { THROW_REVEAL_MS } from '../scene/YutSticks'
import { GameView, type GameApi } from './GameView'

// 1:1 against the bot. Runs entirely in this tab: no room, no backend, nothing sent anywhere.

const BOT_ID = 'bot'
const STORE = 'yutnori:solo'
const LEVELS: BotLevel[] = ['easy', 'normal', 'hard']
const LEVEL_LABEL: Record<BotLevel, string> = { easy: '쉬움', normal: '보통', hard: '어려움' }
const BOT_NAME: Record<BotLevel, string> = { easy: '아기 봇', normal: '윷봇', hard: '고수 봇' }
/** Both seats are always "online", so the board never offers to play for the bot or declares a forfeit. */
const SEATS = { players: { [playerId]: { online: true }, [BOT_ID]: { online: true } } }

interface Setup {
  level: BotLevel
  piecesPerTeam: number
}

interface Saved extends Setup {
  game: GameState | null
}

/** The game survives a reload of this tab. */
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
    /* ignore */
  }
}

/** How long the board takes to play out the last event, so the bot doesn't act mid-animation. */
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
  // Bumped per new game so the board remounts with fresh animation state.
  const [round, setRound] = useState(0)
  const [error, setError] = useState<string | null>(null)
  // Actions apply to the latest state even if two land before a re-render.
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

  // `proxy` is ignored: nobody plays for anyone here.
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

  // The bot's hand: whenever it's the bot's turn, wait for the board to catch up, then act.
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
    // Leaving drops the game in progress; the settings stay for next time.
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
