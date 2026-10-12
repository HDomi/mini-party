import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { playerId } from '@/net'
import { applyAction, createGame, currentPlayer, openHoles, RuleError, type Action, type GameState } from '../game/rules'
import { STAB_MS } from '../scene/layout'
import { Backdrop } from './Backdrop'
import { GameView, type GameApi } from './GameView'
import styles from './Menu.module.scss'

// 봇과 대전. 전부 이 탭 안에서 돈다: 방도, 백엔드도 없고 어디에도 아무것도 보내지 않는다.

const STORE = 'frog:solo'
type Count = '1' | '2' | '3'
const COUNTS: Count[] = ['1', '2', '3']
const COUNT_LABEL: Record<Count, string> = { '1': '1명', '2': '2명', '3': '3명' }
const BOT_NAMES = ['겁쟁이 봇', '덜덜 봇', '배짱 봇']

/** 앞 칼 연출이 끝난 뒤 봇이 구멍을 고르기까지. */
const AFTER_STAB_MS = STAB_MS + 600
/** 고른 구멍을 바꾸거나 꽂기까지. 봇도 망설인다. */
const HESITATE_MS = 850
/** 한 차례에 구멍을 바꾸는 최대 횟수. */
const MAX_DOUBTS = 2

interface Saved {
  count: Count
  game: GameState | null
}

const botId = (i: number) => `bot${i}`
const isBot = (id: string) => /^bot\d$/.test(id)

/** 이 탭을 새로고침해도 게임이 유지된다. */
function load(): Saved {
  const fallback: Saved = { count: '1', game: null }
  try {
    const raw = sessionStorage.getItem(STORE)
    if (!raw) return fallback
    const v = JSON.parse(raw) as Partial<Saved>
    const game = v.game && Array.isArray(v.game.players) && v.game.players.includes(playerId) && Array.isArray(v.game.stabs) ? v.game : null
    return { count: v.count && COUNTS.includes(v.count) ? v.count : fallback.count, game }
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

function useSoloGame(name: string) {
  const [initial] = useState(load)
  const [count, setCount] = useState<Count>(initial.count)
  const [game, setGame] = useState<GameState | null>(initial.game)
  const [error, setError] = useState<string | null>(null)
  // 리렌더 전에 액션이 두 개 들어와도 최신 상태에 적용된다.
  const latest = useRef(game)
  const doubts = useRef({ turn: 0, n: 0 })

  const commit = useCallback((next: GameState | null) => {
    latest.current = next
    setGame(next)
  }, [])

  useEffect(() => save({ count, game }), [count, game])

  const flash = useCallback((msg: string) => {
    if (!msg) return
    setError(msg)
    window.setTimeout(() => setError((cur) => (cur === msg ? null : cur)), 2200)
  }, [])

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

  const start = useCallback(() => {
    const n = Number(count)
    const bots = Array.from({ length: n }, (_, i) => ({ id: botId(i + 1), name: BOT_NAMES[i], slot: i + 1 }))
    commit(createGame({ players: [{ id: playerId, name, slot: 0 }, ...bots] }))
  }, [commit, name, count])

  // 봇의 손: 구멍을 하나 노려 보고, 가끔 마음을 바꿨다가, 꽂는다.
  const botTurn = !!game && game.phase === 'play' && isBot(currentPlayer(game))
  useEffect(() => {
    if (!botTurn || !game) return
    const justStabbed = game.stabs.at(-1)?.seq === game.seq
    const delay = game.aim === null ? (justStabbed ? AFTER_STAB_MS : HESITATE_MS) : HESITATE_MS
    const t = window.setTimeout(() => {
      const cur = latest.current
      if (!cur || cur.phase !== 'play') return
      const id = currentPlayer(cur)
      if (!isBot(id)) return
      if (doubts.current.turn !== cur.turn) doubts.current = { turn: cur.turn, n: 0 }
      const open = openHoles(cur)
      const any = () => open[Math.floor(Math.random() * open.length)]
      if (cur.aim === null) return void act({ type: 'aim', by: id, hole: any() })
      if (doubts.current.n < MAX_DOUBTS && open.length > 1 && Math.random() < 0.4) {
        doubts.current.n++
        return void act({ type: 'aim', by: id, hole: open.filter((h) => h !== cur.aim)[Math.floor(Math.random() * (open.length - 1))] })
      }
      void act({ type: 'stab', by: id, hole: cur.aim })
    }, delay)
    return () => window.clearTimeout(t)
  }, [botTurn, game, act])

  const room = useMemo(() => (game ? { players: Object.fromEntries(game.players.map((id) => [id, { online: true }])) } : null), [game])
  const api: GameApi = useMemo(() => ({ room, inGame: true, hostId: playerId, error, act, flash, solo: true }), [room, error, act, flash])

  return { api, game, count, setCount, start }
}

export function Solo({ name, onLeave }: { name: string; onLeave: () => void }) {
  const { api, game, count, setCount, start } = useSoloGame(name)

  const leave = () => {
    // 나가면 진행 중인 게임은 버린다. 설정은 다음을 위해 남겨 둔다.
    save({ count, game: null })
    onLeave()
  }

  if (game) return <GameView key={game.round} code="BOT" api={api} game={game} onLeave={leave} />

  return (
    <main className={styles.screen}>
      <Backdrop className={styles.backdrop} />
      <div className={styles.card}>
        <button className={`btn ghost small ${styles.back}`} onClick={leave}>
          ← 나가기
        </button>
        <h2 className={`${styles.title} ${styles.small}`}>봇이랑 하기</h2>
        <p className={styles.subtitle}>
          {name} vs {BOT_NAMES.slice(0, Number(count)).join(', ')}
        </p>

        <section className={`${styles.settings} ${styles.soloSettings}`}>
          <div className={styles.inline}>
            봇 수
            <div className={styles.seg}>
              {COUNTS.map((c) => (
                <button key={c} className={count === c ? styles.on : ''} onClick={() => setCount(c)}>
                  {COUNT_LABEL[c]}
                </button>
              ))}
            </div>
          </div>
        </section>

        <button className="btn primary big" onClick={start}>
          시작하기
        </button>
      </div>
    </main>
  )
}
