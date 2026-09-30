import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { playerId } from '@/net'
import { botPlan, type BotLevel } from '../game/bot'
import { applyAction, createGame, currentTank, RuleError, type Action, type GameState } from '../game/rules'
import { MAP_KINDS, type MapKind } from '../game/world'
import { Backdrop } from './Backdrop'
import { GameView, type GameApi } from './GameView'
import { MapPicker } from './MapPicker'
import styles from './Menu.module.scss'

// 봇과 대전. 전부 이 탭 안에서 돈다: 방도, 백엔드도 없고 어디에도 아무것도 보내지 않는다.

const STORE = 'tank:solo'
const LEVELS: BotLevel[] = ['easy', 'normal', 'hard']
const LEVEL_LABEL: Record<BotLevel, string> = { easy: '쉬움', normal: '보통', hard: '어려움' }
const BOT_NAME: Record<BotLevel, string> = { easy: '아기 포탑', normal: '포탄봇', hard: '저격 포탑' }
type Count = '1' | '2' | '3'
const COUNTS: Count[] = ['1', '2', '3']
const COUNT_LABEL: Record<Count, string> = { '1': '1명', '2': '2명', '3': '3명' }
type Mode = 'ffa' | 'team'
const MODES: Mode[] = ['ffa', 'team']
const MODE_LABEL: Record<Mode, string> = { ffa: '개인전', team: '팀전 2:2' }
/** 재생이 끝난 뒤 봇이 쏘기까지 기다리는 시간. 너무 빠르면 무슨 일이 있었는지 보기 어렵다. */
const BOT_DELAY_MS = 900

interface Setup {
  level: BotLevel
  count: Count
  mode: Mode
  map: MapKind
}

interface Saved extends Setup {
  game: GameState | null
}

const botId = (i: number) => `bot${i}`
const isBot = (id: string) => /^bot\d$/.test(id)

/** 이 탭을 새로고침해도 게임이 유지된다. */
function load(): Saved {
  const fallback: Saved = { level: 'normal', count: '1', mode: 'ffa', map: 'hills', game: null }
  try {
    const raw = sessionStorage.getItem(STORE)
    if (!raw) return fallback
    const v = JSON.parse(raw) as Partial<Saved>
    // 지형이 문자열이 아니면 맵이 생기기 전에 저장한 판이다. 버린다.
    const game =
      v.game && typeof v.game.terrain === 'string' && Array.isArray(v.game.tanks) && v.game.tanks.some((t) => t.id === playerId) ? v.game : null
    return {
      level: v.level && LEVELS.includes(v.level) ? v.level : fallback.level,
      count: v.count && COUNTS.includes(v.count) ? v.count : fallback.count,
      mode: v.mode && MODES.includes(v.mode) ? v.mode : fallback.mode,
      map: v.map && MAP_KINDS.includes(v.map) ? v.map : fallback.map,
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
  const [setup, setSetup] = useState<Setup>({ level: initial.level, count: initial.count, mode: initial.mode, map: initial.map })
  const [game, setGame] = useState<GameState | null>(initial.game)
  const [error, setError] = useState<string | null>(null)
  const [idleSeq, setIdleSeq] = useState<number | null>(null)
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
    const team = setup.mode === 'team' && n === 3
    const bots = Array.from({ length: n }, (_, i) => ({
      id: botId(i + 1),
      name: n === 1 ? BOT_NAME[setup.level] : `${BOT_NAME[setup.level]} ${i + 1}`,
      slot: i + 1,
    }))
    // 팀전이면 자리 0, 2 가 빨강팀이라 봇 2 가 내 편이 된다.
    commit(createGame({ players: [{ id: playerId, name, slot: 0 }, ...bots], teamMode: team, map: setup.map, seed: Math.floor(Math.random() * 2 ** 32) }))
  }, [commit, name, setup])

  // 봇의 손: 재생이 끝나고 봇 차례면 잠깐 뒤에 쏜다.
  const level = setup.level
  const botTurn = !!game && game.phase === 'play' && isBot(currentTank(game).id)
  useEffect(() => {
    if (!botTurn || !game || idleSeq !== game.seq) return
    const t = window.setTimeout(() => {
      const cur = latest.current
      if (!cur || cur.phase !== 'play') return
      const id = currentTank(cur).id
      if (!isBot(id)) return
      void act({ type: 'fire', by: id, ...botPlan(cur, id, level) })
    }, BOT_DELAY_MS)
    return () => window.clearTimeout(t)
  }, [botTurn, game, idleSeq, level, act])

  const room = useMemo(
    () => (game ? { players: Object.fromEntries(game.tanks.map((t) => [t.id, { online: true }])) } : null),
    [game],
  )
  const api: GameApi = useMemo(
    () => ({ room, inGame: true, hostId: playerId, error, act, flash, solo: true, thinking: botTurn, onIdle: setIdleSeq }),
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

  const modes = setup.count === '3' ? MODES : (['ffa'] as Mode[])
  return (
    <main className={styles.screen}>
      <Backdrop className={styles.backdrop} />
      <div className={styles.card}>
        <button className={`btn ghost small ${styles.back}`} onClick={leave}>
          ← 나가기
        </button>
        <h2 className={`${styles.title} ${styles.small}`}>봇이랑 하기</h2>
        <p className={styles.subtitle}>
          {name} vs {BOT_NAME[setup.level]}
          {setup.count !== '1' && ` ${setup.count}대`}
        </p>

        <section className={`${styles.settings} ${styles.soloSettings}`}>
          <Seg label="난이도" value={setup.level} options={LEVELS} names={LEVEL_LABEL} set={(level) => setSetup((s) => ({ ...s, level }))} />
          <Seg
            label="봇 수"
            value={setup.count}
            options={COUNTS}
            names={COUNT_LABEL}
            set={(count) => setSetup((s) => ({ ...s, count, mode: count === '3' ? s.mode : 'ffa' }))}
          />
          <Seg label="방식" value={setup.mode} options={modes} names={MODE_LABEL} set={(mode) => setSetup((s) => ({ ...s, mode }))} />
        </section>
        <section className={styles.settings}>
          <MapPicker value={setup.map} onChange={(map) => setSetup((s) => ({ ...s, map }))} />
        </section>
        {setup.count === '3' && setup.mode === 'team' && <p className="hint">봇 한 대가 내 편이 돼요</p>}

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
