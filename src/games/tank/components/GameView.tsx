import { useCallback, useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { play } from '@/audio/sound'
import { playerId } from '@/net'
import { celebrateWin } from '../effects'
import {
  currentTank,
  MAX_HP,
  tankOf,
  WEAPON_LIST,
  WEAPONS,
  winnerName,
  type Action,
  type GameState,
  type Weapon,
} from '../game/rules'
import { clamp, FUEL, MAX_WIND, walk } from '../game/world'
import type { LocalAim } from '../scene/BattleScene'
import { Battlefield } from '../scene/Battlefield'
import styles from './GameView.module.scss'
import { TankIcon } from './TankIcon'

/** 게임을 돌리는 쪽(공유 방 useRoom 또는 봇과의 로컬 게임)에게 전장이 필요로 하는 것. */
export interface GameApi {
  room: { players?: Record<string, { online: boolean }> } | null | undefined
  inGame: boolean
  hostId: string | null
  error: string | null
  act: (action: Action) => Promise<void>
  flash: (msg: string) => void
  /** 방에서만 있다. 혼자하기는 나가기가 곧 로비다. */
  toLobby?: () => Promise<unknown>
  /** 혼자하기에는 차례 시간 제한이 없다. */
  solo?: boolean
  /** 봇이 조준하는 중. */
  thinking?: boolean
  /** 발사 재생이 끝나 다음 차례가 시작될 수 있을 때 부른다. 혼자하기에서 봇이 이때 쏜다. */
  onIdle?: (seq: number) => void
}

const TURN_MS = 30_000
/** 차례인 사람이 시간 초과를 보내지 못하면(탭이 멈추는 등) 다른 사람이 이만큼 더 기다렸다가 넘긴다. */
const GRACE_MS = 4_000
/** 차례인 사람이 오프라인이면 이만큼 뒤에 넘긴다. 새로고침도 감안한다. */
const OFFLINE_MS = 8_000
/** 이동 미리보기 속도(월드 단위/초). */
const MOVE_SPEED = 70
/** 발사 버튼을 이만큼 누르고 있으면 파워 100. */
const CHARGE_MS = 1_800

const canHover = typeof window !== 'undefined' && window.matchMedia('(hover: hover)').matches

interface Moving {
  dir: 0 | 1 | -1
  startX: number
  startFuel: number
  held: number
  x: number
  turn: number
}

export function GameView({ code, api, game, onLeave }: { code: string; api: GameApi; game: GameState; onLeave: () => void }) {
  const me = tankOf(game, playerId)
  const cur = currentTank(game)
  const over = game.phase === 'over'
  // 발사 재생 중. 새 발사 상태가 막 도착한 렌더에서는 장면이 아직 재생을 시작하지 않았으므로 seq 로도 판단한다.
  const [playing, setPlaying] = useState(false)
  const [doneSeq, setDoneSeq] = useState(game.seq)
  const animating = playing || (!!game.lastShot && game.lastShot.seq === game.seq && game.seq > doneSeq)
  const myTurn = !over && api.inGame && !!me?.alive && cur.id === playerId
  const ready = myTurn && !animating
  const online = (id: string) => api.room?.players?.[id]?.online ?? false

  const [angle, setAngle] = useState(me?.angle ?? 45)
  const [facing, setFacing] = useState<1 | -1>(me?.facing ?? 1)
  const [weapon, setWeapon] = useState<Weapon>('shell')
  const [busy, setBusy] = useState(false)
  const [moveDir, setMoveDir] = useState<0 | 1 | -1>(0)
  const [fuel, setFuel] = useState(game.fuel)
  const [charging, setCharging] = useState(false)
  const [confirmResign, setConfirmResign] = useState(false)
  const [overlay, setOverlay] = useState(over)
  const [peeking, setPeeking] = useState(false)
  const [mountSeq] = useState(game.seq)
  // 참가자는 조작판이 처음 뜰 때 전장이 한 번 줄어들지 않도록 조작판 높이쯤에서 시작한다.
  const [inset, setInset] = useState(api.inGame ? 200 : 90)

  const moveRef = useRef<Moving | null>(null)
  const chargeRef = useRef<number | null>(null)
  const gaugeRef = useRef<HTMLDivElement>(null)
  const dockRef = useRef<HTMLElement>(null)
  // 캔버스 루프와 키보드 핸들러는 렌더 밖에서 돌므로 최신 값을 ref 로 읽는다.
  const live = useRef({ game, ready, busy, angle, facing, weapon })
  useLayoutEffect(() => {
    live.current = { game, ready, busy, angle, facing, weapon }
  })

  // 새 차례: 조준을 지난번 값으로 되돌리고 이동 미리보기를 지운다.
  useEffect(() => {
    const t = tankOf(game, playerId)
    if (t) {
      setAngle(t.angle)
      setFacing(t.facing)
      setWeapon((w) => (w !== 'shell' && t.ammo[w] > 0 ? w : 'shell'))
    }
    moveRef.current = null
    chargeRef.current = null
    setMoveDir(0)
    setCharging(false)
    setConfirmResign(false)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [game.turn, game.round])

  // 보낸 이동이 상태에 반영되면 미리보기를 걷는다.
  useEffect(() => {
    const m = moveRef.current
    if (m && m.dir === 0 && (me?.x === m.x || game.turn !== m.turn)) moveRef.current = null
    if (!moveRef.current) setFuel(game.fuel)
  }, [game.seq, game.turn, game.fuel, me?.x])

  const onBusy = useCallback((b: boolean) => {
    setPlaying(b)
    if (!b) setDoneSeq(live.current.game.seq)
  }, [])

  const getLocal = useCallback((): LocalAim | null => {
    const { game: g, ready: r, angle: a, facing: f } = live.current
    const t = tankOf(g, playerId)
    if (!r || !t) return null
    return { id: playerId, x: moveRef.current?.x ?? t.x, facing: f, angle: a, guide: true }
  }, [])

  const run = async (fn: () => Promise<unknown>) => {
    if (live.current.busy) return
    live.current.busy = true
    setBusy(true)
    try {
      await fn()
    } finally {
      live.current.busy = false
      setBusy(false)
    }
  }

  // ── 이동 ──
  const startMove = (dir: 1 | -1) => {
    const { game: g, ready: r, busy: b } = live.current
    const t = tankOf(g, playerId)
    if (!r || b || !t || moveRef.current || chargeRef.current !== null) return
    setFacing(dir)
    live.current.facing = dir
    moveRef.current = { dir, startX: t.x, startFuel: g.fuel, held: 0, x: t.x, turn: g.turn }
    setMoveDir(dir)
  }

  const endMove = () => {
    const m = moveRef.current
    if (!m || m.dir === 0) return
    m.dir = 0
    setMoveDir(0)
    if (m.x === m.startX) {
      moveRef.current = null
      return
    }
    void run(async () => {
      await api.act({ type: 'move', by: playerId, x: m.x, facing: live.current.facing })
      const t = tankOf(live.current.game, playerId)
      if (moveRef.current === m && (!t || t.x === m.x || live.current.game.turn !== m.turn)) moveRef.current = null
    })
  }

  useEffect(() => {
    if (!moveDir) return
    let raf = 0
    let last = performance.now()
    const tick = (now: number) => {
      const m = moveRef.current
      if (!m || m.dir === 0) return
      m.held += ((now - last) / 1000) * MOVE_SPEED
      last = now
      const r = walk(live.current.game.terrain, m.startX, m.startX + m.dir * m.held, m.startFuel)
      m.x = r.x
      setFuel(r.fuel)
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [moveDir])

  // ── 조준·발사 ──
  const nudge = (d: number) => {
    if (!live.current.ready) return
    setAngle((a) => {
      const next = clamp(a + d, 0, 90)
      live.current.angle = next
      return next
    })
  }

  const pickWeapon = (w: Weapon) => {
    const t = tankOf(live.current.game, playerId)
    if (!live.current.ready || !t || (w !== 'shell' && t.ammo[w] <= 0)) return
    setWeapon(w)
  }

  const startCharge = () => {
    const { ready: r, busy: b } = live.current
    if (!r || b || moveRef.current || chargeRef.current !== null) return
    chargeRef.current = performance.now()
    setCharging(true)
  }

  const chargePower = () => (chargeRef.current === null ? 0 : Math.min(100, ((performance.now() - chargeRef.current) / CHARGE_MS) * 100))

  const release = () => {
    if (chargeRef.current === null) return
    const power = Math.round(chargePower() * 10) / 10
    chargeRef.current = null
    setCharging(false)
    const { angle: a, facing: f, weapon: w } = live.current
    void run(() => api.act({ type: 'fire', by: playerId, weapon: w, angle: a, power, facing: f }))
  }

  const cancelCharge = () => {
    chargeRef.current = null
    setCharging(false)
  }

  useEffect(() => {
    const el = gaugeRef.current
    if (!charging) {
      el?.style.setProperty('--power', '0%')
      return
    }
    let raf = 0
    const tick = () => {
      gaugeRef.current?.style.setProperty('--power', `${chargePower()}%`)
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [charging])

  // 키보드: ←→ 이동, ↑↓ 각도, 스페이스 꾹 → 발사, 1~4 무기.
  const keys = useRef({ startMove, endMove, nudge, pickWeapon, startCharge, release })
  useLayoutEffect(() => {
    keys.current = { startMove, endMove, nudge, pickWeapon, startCharge, release }
  })
  useEffect(() => {
    if (!myTurn) return
    const down = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement) return
      const k = keys.current
      if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
        e.preventDefault()
        if (!e.repeat) k.startMove(e.key === 'ArrowLeft' ? -1 : 1)
      } else if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
        e.preventDefault()
        k.nudge(e.key === 'ArrowUp' ? 1 : -1)
      } else if (e.key === ' ') {
        e.preventDefault()
        if (!e.repeat) k.startCharge()
      } else if (/^[1-4]$/.test(e.key)) {
        k.pickWeapon(WEAPON_LIST[Number(e.key) - 1])
      }
    }
    const up = (e: KeyboardEvent) => {
      const k = keys.current
      if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') k.endMove()
      else if (e.key === ' ') {
        e.preventDefault()
        k.release()
      }
    }
    window.addEventListener('keydown', down)
    window.addEventListener('keyup', up)
    return () => {
      window.removeEventListener('keydown', down)
      window.removeEventListener('keyup', up)
    }
  }, [myTurn])

  // ── 차례 시간 ──
  const [turnStart, setTurnStart] = useState<number | null>(null)
  useEffect(() => {
    setTurnStart(over || animating ? null : performance.now())
  }, [game.turn, animating, over])

  const [, setTick] = useState(0)
  useEffect(() => {
    if (turnStart === null || api.solo) return
    const id = window.setInterval(() => setTick((t) => t + 1), 250)
    return () => window.clearInterval(id)
  }, [turnStart, api.solo])
  const left = turnStart === null || api.solo ? null : Math.max(0, TURN_MS - (performance.now() - turnStart))

  const curOnline = online(cur.id)
  useEffect(() => {
    if (api.solo || over || turnStart === null || !api.inGame) return
    const mine = cur.id === playerId
    const wait = mine ? TURN_MS : curOnline ? TURN_MS + GRACE_MS : OFFLINE_MS
    const t = window.setTimeout(
      () => {
        if (mine) {
          chargeRef.current = null
          setCharging(false)
        }
        void api.act({ type: 'skip', by: playerId, turn: game.turn })
      },
      Math.max(0, wait - (performance.now() - turnStart)),
    )
    return () => window.clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [turnStart, cur.id, curOnline, over, api.inGame, api.solo, game.turn])

  // 내 차례가 오면 알림음.
  useEffect(() => {
    if (ready && game.seq > mountSeq) play('turn')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready])

  // 재생이 끝났다(혼자하기에서 봇이 쏠 차례인지 본다).
  const onIdle = api.onIdle
  useEffect(() => {
    if (!animating && !over) onIdle?.(game.seq)
  }, [animating, over, game.seq, onIdle])

  // 끝났다: 마지막 폭발이 끝난 뒤 결과 카드를 띄운다.
  useEffect(() => {
    if (!over) {
      setOverlay(false)
      setPeeking(false)
      return
    }
    if (animating || game.seq <= mountSeq) return
    let cancel = () => {}
    const colors = game.tanks.filter((t) => t.team === game.winner).map((t) => t.color)
    const t1 = window.setTimeout(() => {
      if (game.winner !== null) {
        cancel = celebrateWin(colors)
        play('win')
      }
      setOverlay(true)
    }, 500)
    return () => {
      window.clearTimeout(t1)
      cancel()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [over, animating])

  // 조작판 높이만큼 땅을 올려 탱크가 가리지 않게 한다. 차례마다 전장이 커졌다 작아지지 않도록 줄이지는 않는다.
  useEffect(() => {
    const el = dockRef.current
    if (!el) return
    const ro = new ResizeObserver(() => setInset((cur) => Math.max(cur, el.getBoundingClientRect().height + 20)))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  if (import.meta.env.DEV) {
    // 자동화로 판을 조작하기 위한 테스트 훅. 프로덕션 빌드에서는 제거된다
    ;(window as unknown as Record<string, unknown>).__tank = { game, animating, ready, act: api.act }
  }

  const isHost = api.hostId === playerId
  const canRematch = api.inGame || isHost
  const winName = winnerName(game)
  const endText = (() => {
    if (game.winner === null) return { title: '무승부!', sub: '모두 쓰러졌어요' }
    if (!me) return { title: `${winName} 승리!`, sub: game.teamMode ? '팀전' : '개인전' }
    const won = me.team === game.winner
    return { title: won ? '이겼어요!' : '졌어요', sub: won && !game.teamMode ? '마지막까지 살아남았어요' : `${winName} 승리` }
  })()
  const winnerColor = game.tanks.find((t) => t.team === game.winner)?.color

  const secs = left === null ? null : Math.ceil(left / 1000)
  const mode = game.teamMode ? '팀전' : '개인전'

  return (
    <main className={styles.game}>
      <Battlefield className={styles.scene} game={game} getLocal={getLocal} inset={inset} onBusy={onBusy} />

      <header className={styles.top}>
        <button className="btn ghost small" onClick={onLeave} aria-label="나가기">
          ←
        </button>
        <span className={styles.code}>{code}</span>
        <span className={styles.chip}>{mode}</span>
        {!api.inGame && <span className={styles.spectator}>관전 중</span>}
        {api.inGame && me?.alive && !over && (
          <button
            className={`btn small ${styles.resign} ${confirmResign ? 'primary' : ''}`}
            disabled={busy}
            onClick={() => (confirmResign ? void run(() => api.act({ type: 'resign', by: playerId })) : setConfirmResign(true))}
            onBlur={() => setConfirmResign(false)}
          >
            {confirmResign ? '정말 기권' : '기권'}
          </button>
        )}
      </header>

      <div className={styles.players}>
        {game.tanks.map((t) => (
          <div
            key={t.id}
            className={`${styles.player} ${!over && cur.id === t.id ? styles.active : ''} ${t.alive ? '' : styles.dead} ${
              api.solo || online(t.id) ? '' : styles.off
            }`}
          >
            <TankIcon color={t.alive ? t.color : '#7a716a'} size={24} />
            <span className={styles.pinfo}>
              <span className={styles.pname}>
                {t.name}
                {t.id === playerId && <em>나</em>}
              </span>
              <span className={styles.hp}>
                <i style={{ width: `${(t.hp / MAX_HP) * 100}%`, background: t.hp > 50 ? '#4caf50' : t.hp > 25 ? '#f2b53a' : '#e8574a' }} />
              </span>
            </span>
          </div>
        ))}
      </div>

      <Wind wind={game.wind} />

      <footer ref={dockRef} className={styles.dock}>
        {!overlay && !over && (
          <>
            {!curOnline && !api.solo && cur.id !== playerId && !animating && (
              <p className={styles.notice}>{cur.name} 님 연결이 끊겼어요. 잠시 뒤 차례를 넘겨요</p>
            )}
            {me && !me.alive && api.inGame && <p className={styles.notice}>탈락했어요. 끝까지 구경해요</p>}
            {ready && me ? (
              <div className={styles.panel}>
                <div className={styles.weapons}>
                  {WEAPON_LIST.map((w) => {
                    const n = w === 'shell' ? null : me.ammo[w]
                    return (
                      <button
                        key={w}
                        className={`${styles.weapon} ${weapon === w ? styles.on : ''}`}
                        disabled={n === 0 || busy}
                        title={WEAPONS[w].hint}
                        onClick={() => pickWeapon(w)}
                      >
                        <b>{WEAPONS[w].name}</b>
                        <small>{n === null ? '∞' : `×${n}`}</small>
                      </button>
                    )
                  })}
                </div>

                <div ref={gaugeRef} className={styles.gauge} style={{ '--last': `${me.power}%` } as CSSProperties}>
                  <i className={styles.fill} />
                  <i className={styles.lastMark} title="지난번 파워" />
                  <span>{charging ? '떼면 발사!' : '파워'}</span>
                  {secs !== null && <b className={secs <= 5 ? styles.hurry : ''}>{secs}초</b>}
                </div>

                <div className={styles.controls}>
                  <div className={styles.move}>
                    <Hold className={styles.pad} disabled={busy} onDown={() => startMove(-1)} onUp={endMove} label="왼쪽으로">
                      ◀
                    </Hold>
                    <Hold className={styles.pad} disabled={busy} onDown={() => startMove(1)} onUp={endMove} label="오른쪽으로">
                      ▶
                    </Hold>
                    <span className={styles.fuel} title="연료">
                      <i style={{ width: `${(fuel / FUEL) * 100}%` }} />
                    </span>
                  </div>
                  <div className={styles.angle}>
                    <Repeat className={styles.pad} onStep={() => nudge(-1)} label="각도 내리기">
                      −
                    </Repeat>
                    <span>
                      {angle}°<small>각도</small>
                    </span>
                    <Repeat className={styles.pad} onStep={() => nudge(1)} label="각도 올리기">
                      +
                    </Repeat>
                  </div>
                  <Hold className={`btn primary ${styles.fire}`} disabled={busy} onDown={startCharge} onUp={release} onCancel={cancelCharge}>
                    발사
                  </Hold>
                </div>
                {canHover && <p className={styles.keys}>←→ 이동 · ↑↓ 각도 · 스페이스를 꾹 눌렀다 떼면 발사 · 1~4 무기</p>}
              </div>
            ) : (
              !animating &&
              !myTurn && (
                <p className="waiting">
                  {api.thinking ? `${cur.name} 조준 중…` : `${cur.name} 님 차례예요`}
                  {secs !== null && ` · ${secs}초`}
                </p>
              )
            )}
          </>
        )}
      </footer>

      {overlay && (
        <div className={styles.overlay}>
          <div className={styles.card}>
            {winnerColor && <TankIcon className={styles.bigTank} color={winnerColor} size={72} />}
            <h2>{endText.title}</h2>
            <p>{endText.sub}</p>
            <div className={styles.row}>
              {canRematch && (
                <button className="btn primary big" disabled={busy} onClick={() => void run(() => api.act({ type: 'rematch', by: playerId }))}>
                  한 판 더 <small>새 지형에서</small>
                </button>
              )}
              {api.toLobby && isHost && (
                <button className="btn big" onClick={() => void api.toLobby?.()}>
                  로비로
                </button>
              )}
              <button
                className="btn ghost"
                onClick={() => {
                  setOverlay(false)
                  setPeeking(true)
                }}
              >
                전장 보기
              </button>
            </div>
            {!canRematch && <p className="waiting">방장을 기다리고 있어요…</p>}
          </div>
        </div>
      )}
      {over && peeking && !overlay && (
        <button className={`btn primary ${styles.reopen}`} onClick={() => setOverlay(true)}>
          결과 보기
        </button>
      )}

      {api.error && <div className={styles.toast}>{api.error}</div>}
    </main>
  )
}

function Wind({ wind }: { wind: number }) {
  const pct = (Math.abs(wind) / MAX_WIND) * 50
  return (
    <div className={styles.wind} title="바람. 포탄이 이쪽으로 밀려요">
      <span>바람</span>
      <span className={styles.windBar}>
        <i style={wind >= 0 ? { left: '50%', width: `${pct}%` } : { right: '50%', width: `${pct}%` }} />
      </span>
      <b>
        {wind === 0 ? '없음' : wind > 0 ? `${wind} →` : `← ${-wind}`}
      </b>
    </div>
  )
}

/** 누르고 있는 동안 켜지는 버튼. 손가락이 버튼 밖으로 나가도 뗄 때까지 유지한다. */
function Hold({
  className,
  disabled,
  onDown,
  onUp,
  onCancel,
  label,
  children,
}: {
  className?: string
  disabled?: boolean
  onDown: () => void
  onUp: () => void
  onCancel?: () => void
  label?: string
  children: ReactNode
}) {
  return (
    <button
      className={className}
      disabled={disabled}
      aria-label={label}
      onContextMenu={(e) => e.preventDefault()}
      onPointerDown={(e) => {
        e.preventDefault()
        e.currentTarget.setPointerCapture(e.pointerId)
        onDown()
      }}
      onPointerUp={onUp}
      onPointerCancel={onCancel ?? onUp}
      onKeyDown={(e) => e.key === 'Enter' && !e.repeat && onDown()}
      onKeyUp={(e) => e.key === 'Enter' && onUp()}
    >
      {children}
    </button>
  )
}

/** 한 번 누르면 한 번, 누르고 있으면 계속 반복하는 버튼. */
function Repeat({ className, onStep, label, children }: { className?: string; onStep: () => void; label: string; children: ReactNode }) {
  const timer = useRef<number | undefined>(undefined)
  const step = useRef(onStep)
  useLayoutEffect(() => {
    step.current = onStep
  })
  const stop = () => {
    window.clearTimeout(timer.current)
    window.clearInterval(timer.current)
  }
  useEffect(() => stop, [])
  return (
    <button
      className={className}
      aria-label={label}
      onContextMenu={(e) => e.preventDefault()}
      onPointerDown={(e) => {
        e.preventDefault()
        e.currentTarget.setPointerCapture(e.pointerId)
        step.current()
        stop()
        timer.current = window.setTimeout(() => {
          timer.current = window.setInterval(() => step.current(), 45)
        }, 320)
      }}
      onPointerUp={stop}
      onPointerCancel={stop}
      onKeyDown={(e) => e.key === 'Enter' && step.current()}
    >
      {children}
    </button>
  )
}
