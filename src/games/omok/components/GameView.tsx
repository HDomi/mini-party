import { useEffect, useMemo, useState } from 'react'
import { play } from '@/audio/sound'
import { playerId } from '@/net'
import {
  BLACK,
  boardOf,
  COLOR_NAME,
  colorOf,
  currentPlayer,
  EMPTY,
  FORBIDDEN_LABEL,
  forbiddenAt,
  RULE_LABEL,
  turnOf,
  type Action,
  WHITE,
  type GameState,
} from '../game/rules'
import { celebrateWin } from '../effects'
import { OmokScene } from '../scene/OmokScene'
import { DROP, WIN_DELAY } from '../scene/Stones'
import styles from './GameView.module.scss'

/** 게임을 돌리는 쪽(공유 방 useRoom 또는 봇과의 로컬 게임)에게 보드가 필요로 하는 것. */
export interface GameApi {
  room: { players?: Record<string, { online: boolean }> } | null | undefined
  inGame: boolean
  hostId: string | null
  error: string | null
  act: (action: Action) => Promise<void>
  flash: (msg: string) => void
  /** 방에서만 있다. 혼자하기는 나가기가 곧 로비다. */
  toLobby?: () => Promise<unknown>
  /** 혼자하기에서만 무를 수 있다. */
  canUndo?: boolean
  /** 봇이 둘 수를 고르는 중. */
  thinking?: boolean
}

/** 상대가 이만큼 오프라인이면 기권으로 처리한다. 새로고침도 감안한다. */
const ABANDON_MS = 15_000
const STONE_SWATCH = ['#1b1b1b', '#f4f1ea']

function usePortrait() {
  const get = () => window.innerWidth < window.innerHeight * 0.9
  const [portrait, setPortrait] = useState(get)
  useEffect(() => {
    const on = () => setPortrait(get())
    window.addEventListener('resize', on)
    return () => window.removeEventListener('resize', on)
  }, [])
  return portrait
}

const canHover = typeof window !== 'undefined' && window.matchMedia('(hover: hover)').matches

export function GameView({
  code,
  api,
  game,
  onLeave,
}: {
  code: string
  api: GameApi
  game: GameState
  onLeave: () => void
}) {
  const portrait = usePortrait()
  const [mountSeq] = useState(game.seq)
  // 처음 그릴 때 있던 돌은 떨어지지 않는다. 무르면 그만큼 줄어든다.
  const [settled, setSettled] = useState(game.moves.length)
  if (game.moves.length < settled) setSettled(game.moves.length)
  const [hover, setHover] = useState<number | null>(null)
  const [picked, setPicked] = useState<number | null>(null)
  const [confirmResign, setConfirmResign] = useState(false)
  const [busy, setBusy] = useState(false)
  const [banner, setBanner] = useState(false)
  const [overlay, setOverlay] = useState(game.phase === 'over')
  // 결과 카드를 닫고 판을 보는 중. 이때만 다시 여는 버튼이 보인다.
  const [peeking, setPeeking] = useState(false)

  const me = colorOf(game, playerId)
  const turn = turnOf(game)
  const cur = currentPlayer(game)
  const over = game.phase === 'over'
  const myTurn = !over && me === turn && api.inGame
  const online = (id: string) => api.room?.players?.[id]?.online ?? false
  const opponent = me === null ? null : game.players[1 - me]
  const opponentGone = !over && api.inGame && opponent !== null && !online(opponent)

  const board = useMemo(() => boardOf(game), [game])
  const forbidden = useMemo(() => {
    if (!myTurn || me !== BLACK || game.rule !== 'renju') return []
    const out: number[] = []
    for (let p = 0; p < board.length; p++) if (board[p] === EMPTY && forbiddenAt(board, game.size, p, game.rule)) out.push(p)
    return out
  }, [myTurn, me, game.rule, game.size, board])

  // 새 수가 오면 로컬 선택은 무효가 된다.
  useEffect(() => {
    setPicked(null)
    setHover(null)
    setConfirmResign(false)
  }, [game.seq])

  // 차례가 나에게 넘어오면 상대 돌이 떨어진 뒤에 알림음을 울린다.
  useEffect(() => {
    if (!myTurn || game.seq <= mountSeq) return
    const t = window.setTimeout(() => play('turn'), DROP * 1000 + 200)
    return () => window.clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [myTurn, game.seq])

  // 끝났다: 다섯 알이 빛난 뒤 도장을 찍고, 조금 뒤 결과 카드를 띄운다.
  const winner = game.winner
  useEffect(() => {
    if (!over) {
      setOverlay(false)
      setPeeking(false)
      return
    }
    if (game.seq <= mountSeq) return
    let cancel = () => {}
    const five = game.end === 'five'
    const t1 = window.setTimeout(
      () => {
        if (five) setBanner(true)
        if (winner !== null) {
          cancel = celebrateWin([STONE_SWATCH[winner], '#2f8fd8'])
          play('win')
        }
      },
      five ? WIN_DELAY * 1000 + 200 : 0,
    )
    const t2 = window.setTimeout(() => setOverlay(true), five ? 2200 : 400)
    return () => {
      window.clearTimeout(t1)
      window.clearTimeout(t2)
      cancel()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [over, game.seq])

  useEffect(() => {
    if (!banner) return
    const t = window.setTimeout(() => setBanner(false), 1500)
    return () => window.clearTimeout(t)
  }, [banner])

  // 상대가 나가서 돌아오지 않으면 상대 기권으로 끝낸다.
  useEffect(() => {
    if (!opponentGone || !opponent) return
    const t = window.setTimeout(() => void api.act({ type: 'resign', by: opponent }), ABANDON_MS)
    return () => window.clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [opponentGone])

  const run = async (fn: () => Promise<unknown>) => {
    if (busy) return
    setBusy(true)
    try {
      await fn()
    } finally {
      setBusy(false)
    }
  }

  const place = (p: number) => run(() => api.act({ type: 'place', by: playerId, at: p }))

  const onPick = (p: number) => {
    if (!myTurn || busy || board[p] !== EMPTY) return
    const bad = forbidden.includes(p) ? forbiddenAt(board, game.size, p, game.rule) : null
    if (bad) {
      setPicked(null)
      return api.flash(`${FORBIDDEN_LABEL[bad]} 금수 자리예요`)
    }
    // 휴대폰에서는 잘못 누르기 쉬우므로 한 번 고르고 한 번 더 눌러야 둔다.
    if (canHover || picked === p) void place(p)
    else setPicked(p)
  }

  if (import.meta.env.DEV) {
    // 자동화로 판을 조작하기 위한 테스트 훅. 프로덕션 빌드에서는 제거된다
    ;(window as unknown as Record<string, unknown>).__omok = { game, place }
  }

  const ghostCell = picked ?? (canHover && myTurn && hover !== null && board[hover] === EMPTY && !forbidden.includes(hover) ? hover : null)
  const isHost = api.hostId === playerId
  const canRematch = api.inGame || isHost

  const endText = (() => {
    if (game.end === 'draw') return { title: '무승부!', sub: '판이 가득 찼어요' }
    if (winner === null) return { title: '', sub: '' }
    const name = game.names[game.players[winner]]
    const mine = winner === me
    const sub = game.end === 'resign' ? `${COLOR_NAME[1 - winner]} 기권` : `${COLOR_NAME[winner]} · 오목 완성`
    if (me === null) return { title: `${name} 승리!`, sub }
    return { title: mine ? '이겼어요!' : '졌어요', sub: mine ? sub : `${name} 승리 · ${sub}` }
  })()

  return (
    <main className={styles.game}>
      <OmokScene
        className={styles.scene}
        portrait={portrait}
        moves={game.moves}
        settled={settled}
        line={game.line}
        interactive={myTurn}
        ghost={ghostCell === null || me === null ? null : { p: ghostCell, color: me, pulse: picked !== null }}
        forbidden={forbidden}
        onHover={(p) => canHover && setHover(p)}
        onPick={onPick}
      />

      <header className={styles.top}>
        <button className="btn ghost small" onClick={onLeave} aria-label="나가기">
          ←
        </button>
        <span className={styles.code}>{code}</span>
        <span className={styles.rule}>{RULE_LABEL[game.rule]}</span>
        {!api.inGame && <span className={styles.spectator}>관전 중</span>}
      </header>

      <div className={styles.players}>
        {game.players.map((id, c) => (
          <div
            key={id}
            className={`${styles.player} ${!over && turn === c ? styles.active : ''} ${online(id) ? '' : styles.off}`}
          >
            <i className={styles.swatch} style={{ background: STONE_SWATCH[c] }} />
            <span className={styles.pname}>
              {game.names[id]}
              {id === playerId && <em>나</em>}
            </span>
          </div>
        ))}
        <span className={styles.count}>{game.moves.length}수</span>
      </div>

      {!overlay && (
        <footer className={styles.dock}>
          {opponentGone && <p className={styles.notice}>상대 연결이 끊겼어요. 15초 안에 돌아오지 않으면 기권승이에요</p>}
          {myTurn ? (
            picked !== null ? (
              <div className={styles.help}>
                <p>여기에 둘까요?</p>
                <button className="btn" onClick={() => setPicked(null)}>
                  취소
                </button>
                <button className="btn primary" onClick={() => void place(picked)} disabled={busy}>
                  두기
                </button>
              </div>
            ) : (
              <p className={styles.prompt}>
                <b>{COLOR_NAME[me!]}</b> 둘 자리를 {canHover ? '눌러' : '골라'} 주세요
                {forbidden.length > 0 && <small>× 자리는 금수예요</small>}
              </p>
            )
          ) : (
            !over && (
              <p className="waiting">
                {api.thinking ? `${game.names[cur]} 생각 중…` : `${game.names[cur]} 님(${COLOR_NAME[turn]}) 차례예요`}
              </p>
            )
          )}
          {api.inGame && !over && (
            <div className={styles.actions}>
              {api.canUndo && (
                <button
                  className="btn small"
                  disabled={busy || game.moves.length < (me === BLACK ? 1 : 2)}
                  onClick={() => void run(() => api.act({ type: 'undo', by: playerId }))}
                >
                  무르기
                </button>
              )}
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
        </footer>
      )}

      {banner && (
        <div className={styles.banner} style={{ color: winner === WHITE ? STONE_SWATCH[WHITE] : '#2f8fd8' }}>
          <strong>오목!</strong>
        </div>
      )}

      {overlay && (
        <div className={styles.overlay}>
          <div className={styles.card}>
            {winner !== null && <i className={styles.bigSwatch} style={{ background: STONE_SWATCH[winner] }} />}
            <h2>{endText.title}</h2>
            <p>{endText.sub}</p>
            <div className={styles.row}>
              {canRematch && (
                <button className="btn primary big" disabled={busy} onClick={() => void run(() => api.act({ type: 'rematch', by: playerId }))}>
                  한 판 더 <small>흑백 바꿔서</small>
                </button>
              )}
              {api.canUndo && winner !== null && winner !== me && (
                <button className="btn big" disabled={busy} onClick={() => void run(() => api.act({ type: 'undo', by: playerId }))}>
                  한 수 무르기
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
                판 보기
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
