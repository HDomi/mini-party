import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { playerId } from '@/net'
import { botStep, type BotLevel } from '../game/bot'
import { applyAction, createGame, currentPlayer, RuleError, type Action, type GameState } from '../game/rules'
import { ROLL_MS } from '../scene/Dice'
import { Backdrop } from './Backdrop'
import { GameView, type GameApi } from './GameView'
import styles from './Menu.module.scss'

// 봇과 대전, 또는 혼자 점수 내기. 전부 이 탭 안에서 돈다: 방도, 백엔드도 없고 어디에도 아무것도 보내지 않는다.

const STORE = 'yacht:solo'
const LEVELS: BotLevel[] = ['easy', 'normal', 'hard']
const LEVEL_LABEL: Record<BotLevel, string> = { easy: '쉬움', normal: '보통', hard: '어려움' }
const BOT_NAME: Record<BotLevel, string> = { easy: '아기 봇', normal: '주사위봇', hard: '타짜 봇' }
type Count = '0' | '1' | '2' | '3'
const COUNTS: Count[] = ['0', '1', '2', '3']
const COUNT_LABEL: Record<Count, string> = { '0': '혼자', '1': '1명', '2': '2명', '3': '3명' }

/** 봇이 굴린 주사위가 멈춘 뒤 다음 행동까지. 너무 빠르면 무슨 일이 있었는지 보기 어렵다. */
const AFTER_ROLL_MS = ROLL_MS + 700
/** 주사위를 잡은 뒤 굴리기까지. */
const AFTER_HOLD_MS = 500
/** 차례가 넘어온 뒤 처음 굴리기까지. */
const TURN_START_MS = 900

interface Setup {
  level: BotLevel
  count: Count
}

interface Saved extends Setup {
  game: GameState | null
}

const botId = (i: number) => `bot${i}`
const isBot = (id: string) => /^bot\d$/.test(id)

/** 이 탭을 새로고침해도 게임이 유지된다. */
function load(): Saved {
  const fallback: Saved = { level: 'normal', count: '1', game: null }
  try {
    const raw = sessionStorage.getItem(STORE)
    if (!raw) return fallback
    const v = JSON.parse(raw) as Partial<Saved>
    const game = v.game && Array.isArray(v.game.players) && v.game.players.includes(playerId) && v.game.scores ? v.game : null
    return {
      level: v.level && LEVELS.includes(v.level) ? v.level : fallback.level,
      count: v.count && COUNTS.includes(v.count) ? v.count : fallback.count,
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

function useSoloGame(name: string) {
  const [initial] = useState(load)
  const [setup, setSetup] = useState<Setup>({ level: initial.level, count: initial.count })
  const [game, setGame] = useState<GameState | null>(initial.game)
  const [error, setError] = useState<string | null>(null)
  // 리렌더 전에 액션이 두 개 들어와도 최신 상태에 적용된다.
  const latest = useRef(game)

  const commit = useCallback((next: GameState | null) => {
    latest.current = next
    setGame(next)
  }, [])

  useEffect(() => save({ ...setup, game }), [setup, game])

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
    const n = Number(setup.count)
    const bots = Array.from({ length: n }, (_, i) => ({
      id: botId(i + 1),
      name: n === 1 ? BOT_NAME[setup.level] : `${BOT_NAME[setup.level]} ${i + 1}`,
    }))
    commit(createGame({ players: [{ id: playerId, name }, ...bots] }))
  }, [commit, name, setup])

  // 봇의 손: 상태가 바뀔 때마다 잠깐 기다렸다가 한 가지씩 한다(잡기 → 굴리기 → 적기).
  const level = setup.level
  const botTurn = !!game && game.phase === 'play' && isBot(currentPlayer(game))
  useEffect(() => {
    if (!botTurn || !game) return
    const delay = game.roll?.seq === game.seq ? AFTER_ROLL_MS : game.rolls > 0 ? AFTER_HOLD_MS : TURN_START_MS
    const t = window.setTimeout(() => {
      const cur = latest.current
      if (!cur || cur.phase !== 'play') return
      const id = currentPlayer(cur)
      if (!isBot(id)) return
      const step = botStep(cur, level)
      if (step.type === 'score') return void act({ type: 'score', by: id, cat: step.cat })
      // 다시 굴리기 전에 무엇을 남기는지 먼저 보여 준다.
      if (cur.rolls > 0 && step.held.some((h, i) => h !== cur.held[i])) return void act({ type: 'hold', by: id, held: step.held })
      void act({ type: 'roll', by: id, held: step.held })
    }, delay)
    return () => window.clearTimeout(t)
  }, [botTurn, game, level, act])

  const room = useMemo(() => (game ? { players: Object.fromEntries(game.players.map((id) => [id, { online: true }])) } : null), [game])
  const api: GameApi = useMemo(
    () => ({ room, inGame: true, hostId: playerId, error, act, flash, solo: true, thinking: botTurn }),
    [room, error, act, flash, botTurn],
  )

  return { api, game, setup, setSetup, start }
}

export function Solo({ name, onLeave }: { name: string; onLeave: () => void }) {
  const { api, game, setup, setSetup, start } = useSoloGame(name)

  const leave = () => {
    // 나가면 진행 중인 게임은 버린다. 설정은 다음을 위해 남겨 둔다.
    save({ ...setup, game: null })
    onLeave()
  }

  if (game) return <GameView key={game.round} code="BOT" api={api} game={game} onLeave={leave} />

  const alone = setup.count === '0'
  return (
    <main className={styles.screen}>
      <Backdrop className={styles.backdrop} />
      <div className={styles.card}>
        <button className={`btn ghost small ${styles.back}`} onClick={leave}>
          ← 나가기
        </button>
        <h2 className={`${styles.title} ${styles.small}`}>{alone ? '혼자 하기' : '봇이랑 하기'}</h2>
        <p className={styles.subtitle}>
          {alone ? `${name}의 최고 점수에 도전!` : `${name} vs ${BOT_NAME[setup.level]}${setup.count !== '1' ? ` ${setup.count}명` : ''}`}
        </p>

        <section className={`${styles.settings} ${styles.soloSettings}`}>
          <Seg label="봇 수" value={setup.count} options={COUNTS} names={COUNT_LABEL} set={(count) => setSetup((s) => ({ ...s, count }))} />
          {!alone && <Seg label="난이도" value={setup.level} options={LEVELS} names={LEVEL_LABEL} set={(level) => setSetup((s) => ({ ...s, level }))} />}
        </section>

        <button className="btn primary big" onClick={start}>
          시작하기
        </button>
      </div>
    </main>
  )
}

function Seg<T extends string>({
  label,
  value,
  options,
  names,
  set,
}: {
  label: string
  value: T
  options: T[]
  names: Record<T, string>
  set: (v: T) => void
}) {
  return (
    <div className={styles.inline}>
      {label}
      <div className={styles.seg}>
        {options.map((o) => (
          <button key={o} className={value === o ? styles.on : ''} onClick={() => set(o)}>
            {names[o]}
          </button>
        ))}
      </div>
    </div>
  )
}
