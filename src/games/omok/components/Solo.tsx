import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { playerId } from '@/net'
import { botMove, type BotLevel } from '../game/bot'
import { applyAction, createGame, currentPlayer, RULE_LABEL, RuleError, type Action, type GameState, type Rule } from '../game/rules'
import { DROP } from '../scene/Stones'
import { Backdrop } from './Backdrop'
import { GameView, type GameApi } from './GameView'
import styles from './Menu.module.scss'

// 봇과 1:1. 전부 이 탭 안에서 돈다: 방도, 백엔드도 없고 어디에도 아무것도 보내지 않는다.

const BOT_ID = 'bot'
const STORE = 'omok:solo'
const LEVELS: BotLevel[] = ['easy', 'normal', 'hard']
const LEVEL_LABEL: Record<BotLevel, string> = { easy: '쉬움', normal: '보통', hard: '어려움' }
const BOT_NAME: Record<BotLevel, string> = { easy: '아기 봇', normal: '오목봇', hard: '고수 봇' }
const RULES: Rule[] = ['renju', 'free']
type Side = 'black' | 'white' | 'random'
const SIDES: Side[] = ['black', 'white', 'random']
const SIDE_LABEL: Record<Side, string> = { black: '흑(먼저)', white: '백', random: '랜덤' }
/** 두 자리 모두 항상 "online"이므로 보드는 기권승을 선언하지 않는다. */
const SEATS = { players: { [playerId]: { online: true }, [BOT_ID]: { online: true } } }
/** 돌이 떨어진 뒤 봇이 두기까지 기다리는 시간. 너무 빠르면 무슨 수를 뒀는지 보기 어렵다. */
const BOT_DELAY_MS = DROP * 1000 + 450

interface Setup {
  level: BotLevel
  rule: Rule
  side: Side
}

interface Saved extends Setup {
  game: GameState | null
}

/** 이 탭을 새로고침해도 게임이 유지된다. */
function load(): Saved {
  const fallback: Saved = { level: 'normal', rule: 'renju', side: 'black', game: null }
  try {
    const raw = sessionStorage.getItem(STORE)
    if (!raw) return fallback
    const v = JSON.parse(raw) as Partial<Saved>
    const game = v.game && v.game.players?.includes(playerId) && v.game.players.includes(BOT_ID) ? v.game : null
    return {
      level: v.level && LEVELS.includes(v.level) ? v.level : fallback.level,
      rule: v.rule && RULES.includes(v.rule) ? v.rule : fallback.rule,
      side: v.side && SIDES.includes(v.side) ? v.side : fallback.side,
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
  const [setup, setSetup] = useState<Setup>({ level: initial.level, rule: initial.rule, side: initial.side })
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
    const meFirst = setup.side === 'random' ? Math.random() < 0.5 : setup.side === 'black'
    const human = { id: playerId, name }
    const bot = { id: BOT_ID, name: BOT_NAME[setup.level] }
    commit(createGame({ black: meFirst ? human : bot, white: meFirst ? bot : human, rule: setup.rule }))
  }, [commit, name, setup])

  // 봇의 손: 봇 차례가 되면 내 돌이 떨어질 때까지 기다렸다가 둔다.
  const level = setup.level
  const botTurn = !!game && game.phase === 'play' && currentPlayer(game) === BOT_ID
  useEffect(() => {
    if (!botTurn) return
    const t = window.setTimeout(() => {
      const cur = latest.current
      const p = cur && botMove(cur, BOT_ID, level)
      if (p !== null && p !== undefined) void act({ type: 'place', by: BOT_ID, at: p })
    }, BOT_DELAY_MS)
    return () => window.clearTimeout(t)
  }, [botTurn, game?.seq, level, act])

  const api: GameApi = useMemo(
    () => ({ room: SEATS, inGame: true, hostId: playerId, error, act, flash, canUndo: true, thinking: botTurn }),
    [error, act, flash, botTurn],
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

  return (
    <main className={styles.screen}>
      <Backdrop className={styles.backdrop} />
      <div className={styles.card}>
        <button className={`btn ghost small ${styles.back}`} onClick={leave}>
          ← 나가기
        </button>
        <h2 className={`${styles.title} ${styles.small}`}>봇이랑 1:1</h2>
        <p className={styles.subtitle}>
          {name} vs {BOT_NAME[setup.level]}
        </p>

        <section className={`${styles.settings} ${styles.soloSettings}`}>
          <Seg label="난이도" value={setup.level} options={LEVELS} names={LEVEL_LABEL} set={(level) => setSetup((s) => ({ ...s, level }))} />
          <Seg label="규칙" value={setup.rule} options={RULES} names={RULE_LABEL} set={(rule) => setSetup((s) => ({ ...s, rule }))} />
          <Seg label="내 돌" value={setup.side} options={SIDES} names={SIDE_LABEL} set={(side) => setSetup((s) => ({ ...s, side }))} />
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
