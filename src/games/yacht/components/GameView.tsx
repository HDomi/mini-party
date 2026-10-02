import { useEffect, useState } from 'react'
import { play } from '@/audio/sound'
import { playerId } from '@/net'
import {
  BONUS_AT,
  CAT_LABEL,
  CATS,
  countsOf,
  currentPlayer,
  MAX_ROLLS,
  ranking,
  scoreOf,
  totalsOf,
  UPPER,
  type Action,
  type Cat,
  type GameState,
} from '../game/rules'
import { celebrateWin } from '../effects'
import { DiceScene } from '../scene/DiceScene'
import { ROLL_MS } from '../scene/Dice'
import { PLAYER_COLORS } from './colors'
import styles from './GameView.module.scss'
import { ScoreSheet } from './ScoreSheet'

/** 게임을 돌리는 쪽(공유 방 useRoom 또는 봇과의 로컬 게임)에게 화면이 필요로 하는 것. */
export interface GameApi {
  room: { players?: Record<string, { online: boolean }> } | null | undefined
  inGame: boolean
  hostId: string | null
  error: string | null
  act: (action: Action) => Promise<void>
  flash: (msg: string) => void
  /** 방에서만 있다. 혼자하기는 나가기가 곧 로비다. */
  toLobby?: () => Promise<unknown>
  /** 혼자하기에서는 아무도 자리를 비우지 않는다. */
  solo?: boolean
  /** 봇이 고르는 중. */
  thinking?: boolean
}

/** 차례인 사람이 이만큼 오프라인이면 남은 사람이 대신 굴려 적는다. 새로고침도 감안한다. */
const OFFLINE_MS = 8_000

const canHover = typeof window !== 'undefined' && window.matchMedia('(hover: hover)').matches

const isYacht = (dice: number[]) => countsOf(dice).includes(dice.length)

type Banner = 'yacht' | 'bonus'
const BANNER_TEXT: Record<Banner, string> = { yacht: '요트!', bonus: '보너스!' }

export function GameView({ code, api, game, onLeave }: { code: string; api: GameApi; game: GameState; onLeave: () => void }) {
  const [mountSeq] = useState(game.seq)
  const [busy, setBusy] = useState(false)
  const [picked, setPicked] = useState<Cat | null>(null)
  const [confirmResign, setConfirmResign] = useState(false)
  const [banner, setBanner] = useState<Banner | null>(null)
  const [overlay, setOverlay] = useState(game.phase === 'over')
  // 결과 카드를 닫고 점수표를 보는 중. 이때만 다시 여는 버튼이 보인다.
  const [peeking, setPeeking] = useState(false)

  const over = game.phase === 'over'
  const cur = currentPlayer(game)
  const playing = api.inGame && !game.out.includes(playerId)
  const myTurn = !over && playing && cur === playerId
  const online = (id: string) => api.room?.players?.[id]?.online ?? false
  const curOnline = online(cur)

  // ── 굴림 재생 ──
  // 새 굴림이 오면 주사위가 멈출 때까지 점수를 보여 주지 않는다.
  const rollSeq = game.roll?.seq ?? 0
  const [rolling, setRolling] = useState(false)
  useEffect(() => {
    if (rollSeq <= mountSeq) return
    setRolling(true)
    play('throw')
    const t = window.setTimeout(() => setRolling(false), ROLL_MS)
    return () => window.clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rollSeq])

  // 다섯 눈이 모두 같고 요트 칸이 비어 있으면 도장을 찍는다. 이미 적은 칸이면 그냥 같은 눈일 뿐이다.
  useEffect(() => {
    if (rolling || rollSeq <= mountSeq || game.rolls === 0 || !isYacht(game.dice)) return
    if (!game.roll || game.scores[game.roll.by][CATS.indexOf('yacht')] !== null) return
    setBanner('yacht')
    play('mo')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rolling])

  useEffect(() => {
    if (!banner) return
    const t = window.setTimeout(() => setBanner(null), 1500)
    return () => window.clearTimeout(t)
  }, [banner])

  // 점수를 적으면 소리를 낸다. 이 점수로 윗칸 보너스를 넘겼으면 도장을 찍는다.
  const lastSeq = game.last?.seq ?? 0
  useEffect(() => {
    const last = game.last
    if (lastSeq <= mountSeq || !last) return
    const upper = totalsOf(game.scores[last.by]).upper
    if (CATS.indexOf(last.cat) < UPPER && upper >= BONUS_AT && upper - last.score < BONUS_AT) {
      setBanner('bonus')
      play('mo')
    } else play(last.score > 0 ? 'goal' : 'step', last.score > 0 ? 1 : 0.7)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lastSeq])

  // 내 차례가 오면 알림음.
  useEffect(() => {
    if (myTurn && game.seq > mountSeq) play('turn')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [myTurn, game.turn])

  // 새 상태가 오면 로컬 선택은 무효가 된다.
  useEffect(() => {
    setPicked(null)
    setConfirmResign(false)
  }, [game.seq])

  // 차례인 사람이 나가 있으면 대신 굴려 적는다. 누가 보내든 `turn` 이 맞는 한 번만 처리된다.
  useEffect(() => {
    if (over || !api.inGame || api.solo || curOnline) return
    const t = window.setTimeout(() => void api.act({ type: 'auto', by: playerId, turn: game.turn }), OFFLINE_MS)
    return () => window.clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [over, api.inGame, api.solo, curOnline, game.turn])

  // 끝났다: 마지막 점수가 반짝인 뒤 결과 카드를 띄운다.
  useEffect(() => {
    if (!over) {
      setOverlay(false)
      setPeeking(false)
      return
    }
    if (game.seq <= mountSeq) return
    let cancel = () => {}
    const t1 = window.setTimeout(() => {
      if (game.winners.length) {
        const j = game.players.indexOf(game.winners[0])
        cancel = celebrateWin([PLAYER_COLORS[j], '#7a4fd8'])
        play('win')
      }
    }, 500)
    const t2 = window.setTimeout(() => setOverlay(true), 1300)
    return () => {
      window.clearTimeout(t1)
      window.clearTimeout(t2)
      cancel()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [over, game.seq])

  const run = async (fn: () => Promise<unknown>) => {
    if (busy) return
    setBusy(true)
    try {
      await fn()
    } finally {
      setBusy(false)
    }
  }

  const canRoll = myTurn && !rolling && game.rolls < MAX_ROLLS && (game.rolls === 0 || game.held.some((h) => !h))
  const canHold = myTurn && !rolling && game.rolls > 0 && game.rolls < MAX_ROLLS
  const canScore = myTurn && !rolling && game.rolls > 0
  // 세 번 다 굴렸으면 주사위가 멈춘 뒤 모두 앞쪽 띠로 모은다. 화면에서만 그렇고 상태의 held 는 그대로다.
  const shownHeld = !over && game.rolls >= MAX_ROLLS && !rolling ? game.held.map(() => true) : game.held

  const roll = () => {
    if (!canRoll) return
    void run(() => api.act({ type: 'roll', by: playerId, held: game.held }))
  }

  // 잡기는 기다리지 않는다. 여러 개를 빠르게 눌러도 차례대로 처리된다.
  const toggle = (i: number) => {
    if (!canHold) return
    play('stack', 0.5)
    void api.act({ type: 'hold', by: playerId, held: game.held.map((h, j) => (j === i ? !h : h)) })
  }

  const write = (cat: Cat) => run(() => api.act({ type: 'score', by: playerId, cat }))

  const pick = (cat: Cat) => {
    if (!canScore || game.scores[playerId][CATS.indexOf(cat)] !== null) return
    // 휴대폰에서는 잘못 누르기 쉬우므로 한 번 고르고 한 번 더 눌러야 적는다.
    if (canHover || picked === cat) void write(cat)
    else setPicked(cat)
  }

  // 키보드: 스페이스로 굴리고, 1~5 로 주사위를 잡는다.
  useEffect(() => {
    if (!myTurn) return
    const down = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.repeat) return
      if (e.code === 'Space') {
        e.preventDefault()
        roll()
      } else if (/^[1-5]$/.test(e.key)) toggle(Number(e.key) - 1)
    }
    window.addEventListener('keydown', down)
    return () => window.removeEventListener('keydown', down)
  })

  if (import.meta.env.DEV) {
    // 자동화로 판을 조작하기 위한 테스트 훅. 프로덕션 빌드에서는 제거된다
    ;(window as unknown as Record<string, unknown>).__yacht = { game, roll, toggle, write }
  }

  const isHost = api.hostId === playerId
  const canRematch = api.inGame || isHost
  const filled = (id: string) => game.scores[id].filter((v) => v !== null).length
  const roundNo = over ? CATS.length : Math.min(CATS.length, filled(cur) + 1)
  const curName = game.names[cur]

  const ranks = ranking(game)
  const endText = (() => {
    if (game.players.length === 1) return { title: `${ranks[0].total}점!`, sub: game.end === 'resign' ? '기권했어요' : '혼자 하기 끝' }
    if (game.winners.length === 0) return { title: '게임 끝', sub: '모두 기권했어요' }
    const names = game.winners.map((id) => game.names[id]).join(', ')
    const sub = game.end === 'resign' ? '다른 사람이 모두 기권했어요' : `${ranks[0].total}점`
    if (!api.inGame) return { title: `${names} 승리!`, sub }
    if (game.winners.includes(playerId)) return { title: game.winners.length > 1 ? '공동 1등!' : '이겼어요!', sub }
    const mine = ranks.find((r) => r.id === playerId)
    return { title: mine ? `${mine.place}등` : '게임 끝', sub: `${names} 승리 · ${sub}` }
  })()

  return (
    <main className={styles.game}>
      <header className={styles.top}>
        <button className="btn ghost small" onClick={onLeave} aria-label="나가기">
          ←
        </button>
        <span className={styles.code}>{code}</span>
        <span className={styles.chip}>
          {roundNo} / {CATS.length} 라운드
        </span>
        {!api.inGame && <span className={styles.spectator}>관전 중</span>}
      </header>

      <section className={styles.table}>
        <DiceScene
          className={styles.scene}
          dice={game.dice}
          held={shownHeld}
          roll={game.roll}
          mountSeq={mountSeq}
          interactive={canHold}
          onToggle={toggle}
        />
        {!over && (
          <p className={styles.rolls} aria-label={`${game.rolls}번 굴림`}>
            {Array.from({ length: MAX_ROLLS }, (_, i) => (
              <i key={i} className={i < game.rolls ? styles.used : ''} />
            ))}
          </p>
        )}
        {banner && (
          <div className={`${styles.banner} ${styles[banner]}`}>
            <strong>{BANNER_TEXT[banner]}</strong>
          </div>
        )}
      </section>

      <footer className={styles.dock}>
        {!over && !curOnline && !api.solo && (
          <p className={styles.notice}>{curName} 님 연결이 끊겼어요. 잠시 뒤 대신 굴려서 적어요</p>
        )}
        {myTurn ? (
          picked !== null ? (
            <div className={styles.help}>
              <p>
                <b>{CAT_LABEL[picked]}</b>에 {scoreOf(picked, game.dice)}점 적을까요?
              </p>
              <button className="btn" onClick={() => setPicked(null)}>
                취소
              </button>
              <button className="btn primary" onClick={() => void write(picked)} disabled={busy}>
                적기
              </button>
            </div>
          ) : (
            <>
              <button className={`btn primary big ${styles.rollBtn}`} onClick={roll} disabled={!canRoll || busy}>
                {game.rolls === 0 ? '주사위 굴리기' : game.rolls < MAX_ROLLS ? `다시 굴리기 · ${MAX_ROLLS - game.rolls}번 남음` : '다 굴렸어요'}
              </button>
              <p className={styles.hint}>
                {rolling
                  ? '굴러가는 중…'
                  : game.rolls === 0
                    ? '내 차례예요!'
                    : game.rolls < MAX_ROLLS
                      ? '남길 주사위를 눌러 잡고, 점수표에서 적을 칸을 골라요'
                      : '점수표에서 적을 칸을 골라 주세요'}
              </p>
            </>
          )
        ) : (
          !over && <p className="waiting">{api.thinking ? `${curName} 생각 중…` : `${curName} 님 차례예요`}</p>
        )}
        {playing && !over && (
          <div className={styles.actions}>
            <button
              className={`btn small ${confirmResign ? 'primary' : ''}`}
              disabled={busy}
              onClick={() => (confirmResign ? void run(() => api.act({ type: 'resign', by: playerId })) : setConfirmResign(true))}
              onBlur={() => setConfirmResign(false)}
            >
              {confirmResign ? '정말 기권할래요' : '기권'}
            </button>
          </div>
        )}
        {over && peeking && !overlay && (
          <button className="btn primary" onClick={() => setOverlay(true)}>
            결과 보기
          </button>
        )}
      </footer>

      <ScoreSheet
        className={styles.sheet}
        game={game}
        preview={!over && game.rolls > 0 && !rolling}
        canPick={canScore}
        picked={picked}
        freshSeq={mountSeq}
        onPick={pick}
        onHint={api.flash}
      />

      {overlay && (
        <div className={styles.overlay}>
          <div className={styles.card}>
            <h2>{endText.title}</h2>
            <p>{endText.sub}</p>
            <ol className={styles.ranks}>
              {ranks.map((r) => (
                <li key={r.id} className={`${game.winners.includes(r.id) ? styles.winner : ''} ${r.out ? styles.out : ''}`}>
                  <span className={styles.place}>{r.out ? '-' : r.place}</span>
                  <i style={{ background: PLAYER_COLORS[game.players.indexOf(r.id)] }} />
                  <span className={styles.rname}>
                    {game.names[r.id]}
                    {r.id === playerId && <em>나</em>}
                  </span>
                  <b>{r.out ? '기권' : `${r.total}점`}</b>
                </li>
              ))}
            </ol>
            <div className={styles.row}>
              {canRematch && (
                <button className="btn primary big" disabled={busy} onClick={() => void run(() => api.act({ type: 'rematch', by: playerId }))}>
                  한 판 더
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
                점수표 보기
              </button>
            </div>
            {!canRematch && <p className="waiting">방장을 기다리고 있어요…</p>}
          </div>
        </div>
      )}

      {api.error && <div className={styles.toast}>{api.error}</div>}
    </main>
  )
}
