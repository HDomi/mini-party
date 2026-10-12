import { useEffect, useMemo, useState } from 'react'
import { play } from '@/audio/sound'
import { playerId } from '@/net'
import { currentPlayer, HOLES, type Action, type GameState } from '../game/rules'
import { celebrateWin } from '../effects'
import { FrogScene } from '../scene/FrogScene'
import { IMPACT, POP, RESULT_MS, STAB_MS } from '../scene/layout'
import { SLOT_COLORS } from './colors'
import styles from './GameView.module.scss'

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
}

/** 차례인 사람이 이만큼 오프라인이면 남은 사람이 대신 꽂는다. 새로고침도 감안한다. */
const OFFLINE_MS = 8_000

/** 화면 가운데 찍히는 만화 글씨. */
type Stamp = { kind: 'stab' | 'pop' | 'phew'; key: number }

const STAB_WORDS = ['푹!', '쿡!', '콱!', '푸욱!']

export function GameView({ code, api, game, onLeave }: { code: string; api: GameApi; game: GameState; onLeave: () => void }) {
  const [mountSeq] = useState(game.seq)
  const [busy, setBusy] = useState(false)
  const [picked, setPicked] = useState<number | null>(null)
  const [animating, setAnimating] = useState(false)
  const [stamp, setStamp] = useState<Stamp | null>(null)
  const [overlay, setOverlay] = useState(game.phase === 'over')
  // 결과 카드를 닫고 통을 보는 중. 이때만 다시 여는 버튼이 보인다.
  const [peeking, setPeeking] = useState(false)

  const over = game.phase === 'over'
  const cur = currentPlayer(game)
  const myTurn = !over && api.inGame && cur === playerId
  const online = (id: string) => api.room?.players?.[id]?.online ?? false
  const curOnline = online(cur)
  const colorOf = (id: string) => SLOT_COLORS[game.slots[id] ?? 0]
  const last = game.stabs.at(-1) ?? null
  const lastSeq = last?.seq ?? 0

  const swords = useMemo(() => game.stabs.map((s) => ({ hole: s.hole, seq: s.seq, color: SLOT_COLORS[game.slots[s.by] ?? 0] })), [game.stabs, game.slots])
  const sceneLast = useMemo(() => (last ? { seq: last.seq, hole: last.hole, popped: over } : null), [last, over])
  // 내가 고르는 중이면 내 화면에서는 바로 보인다. 다른 사람은 상태의 aim 으로 본다.
  const aimHole = myTurn && picked !== null ? picked : game.aim
  const aim = !over && aimHole !== null ? { hole: aimHole, color: colorOf(cur) } : null

  // ── 칼 한 번의 연출: 푹! → (당첨이면) 펑! / (아니면) 휴… → 결과 ──
  useEffect(() => {
    if (lastSeq <= mountSeq) return
    setAnimating(true)
    setPicked(null)
    const timers: number[] = []
    const at = (ms: number, fn: () => void) => timers.push(window.setTimeout(fn, ms))
    let cancel = () => {}
    if (over) {
      at(POP * 1000, () => {
        setStamp({ kind: 'pop', key: lastSeq })
        cancel = celebrateWin([colorOf(game.loser ?? cur), '#6fc34a'])
      })
      at(POP * 1000 + 1700, () => setStamp(null))
      at(RESULT_MS, () => setOverlay(true))
    } else {
      at(IMPACT * 1000, () => setStamp({ kind: 'stab', key: lastSeq }))
      at(IMPACT * 1000 + 650, () => setStamp({ kind: 'phew', key: lastSeq }))
      at(IMPACT * 1000 + 1700, () => setStamp(null))
      at(STAB_MS, () => setAnimating(false))
    }
    return () => {
      timers.forEach((t) => window.clearTimeout(t))
      cancel()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lastSeq])

  // 한 판 더 하면 결과 카드를 닫는다.
  useEffect(() => {
    if (over) return
    setOverlay(false)
    setPeeking(false)
  }, [over])

  // 차례가 넘어가면 고르던 구멍은 버린다.
  useEffect(() => setPicked(null), [game.turn])

  // 내 차례가 오면 알림음. 앞사람 칼 연출이 끝난 뒤에 울린다.
  useEffect(() => {
    if (myTurn && !animating && game.seq > mountSeq) play('turn')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [myTurn, animating])

  // 차례인 사람이 나가 있으면 대신 꽂는다. 누가 보내든 `turn` 이 맞는 한 번만 처리된다.
  useEffect(() => {
    if (over || !api.inGame || api.solo || curOnline) return
    const t = window.setTimeout(() => void api.act({ type: 'auto', by: playerId, turn: game.turn }), OFFLINE_MS)
    return () => window.clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [over, api.inGame, api.solo, curOnline, game.turn])

  const run = async (fn: () => Promise<unknown>) => {
    if (busy) return
    setBusy(true)
    try {
      await fn()
    } finally {
      setBusy(false)
    }
  }

  const canPick = myTurn && !animating && !busy
  const pick = (hole: number) => {
    if (!canPick) return
    play('step', 0.6)
    setPicked(hole)
    void api.act({ type: 'aim', by: playerId, hole })
  }
  const cancel = () => {
    setPicked(null)
    void api.act({ type: 'aim', by: playerId, hole: null })
  }
  const confirm = () => {
    if (picked === null) return
    const hole = picked
    void run(() => api.act({ type: 'stab', by: playerId, hole }))
  }

  if (import.meta.env.DEV) {
    // 자동화로 판을 조작하기 위한 테스트 훅. 프로덕션 빌드에서는 제거된다
    ;(window as unknown as Record<string, unknown>).__frog = { game, pick, confirm }
  }

  const isHost = api.hostId === playerId
  const canRematch = api.inGame || isHost
  const loser = game.loser
  const meLost = loser === playerId

  return (
    <main className={styles.game}>
      <FrogScene
        className={styles.scene}
        swords={swords}
        last={sceneLast}
        mountSeq={mountSeq}
        aim={aim}
        interactive={canPick && picked === null}
        onPick={pick}
      />

      <header className={styles.top}>
        <button className="btn ghost small" onClick={onLeave} aria-label="나가기">
          ←
        </button>
        <span className={styles.code}>{code}</span>
        <span className={styles.chip}>
          칼 {game.stabs.length} / {HOLES}
        </span>
        {!api.inGame && <span className={styles.spectator}>관전 중</span>}
      </header>

      <div className={styles.players}>
        {game.players.map((id) => (
          <div
            key={id}
            className={`${styles.player} ${!over && cur === id ? styles.active : ''} ${online(id) ? '' : styles.off} ${over && loser === id ? styles.loser : ''}`}
          >
            <i style={{ background: colorOf(id) }} />
            <span className={styles.pname}>
              {game.names[id]}
              {id === playerId && <em>나</em>}
            </span>
          </div>
        ))}
      </div>

      {stamp && (
        <div key={`${stamp.kind}${stamp.key}`} className={`${styles.stamp} ${styles[stamp.kind]}`}>
          <strong>{stamp.kind === 'pop' ? '펑!' : stamp.kind === 'phew' ? '휴…' : STAB_WORDS[stamp.key % STAB_WORDS.length]}</strong>
        </div>
      )}

      {!overlay && (
        <footer className={styles.dock}>
          {!over && !curOnline && !api.solo && <p className={styles.notice}>{game.names[cur]} 님 연결이 끊겼어요. 잠시 뒤 대신 꽂아요</p>}
          {myTurn && !animating ? (
            <p className={styles.prompt}>
              <b>내 차례!</b> 칼을 꽂을 구멍을 골라 주세요
              <small>통을 옆으로 끌면 돌아가요</small>
            </p>
          ) : (
            !over &&
            !animating && <p className="waiting">{game.aim !== null ? `${game.names[cur]} 님이 고민 중…` : `${game.names[cur]} 님 차례예요`}</p>
          )}
          {over && peeking && (
            <button className="btn primary" onClick={() => setOverlay(true)}>
              결과 보기
            </button>
          )}
        </footer>
      )}

      {picked !== null && myTurn && !overlay && (
        <div className={styles.confirm}>
          <div className={styles.dialog}>
            <p>
              이곳을 선택하시겠습니까<span className={styles.dots}>..?</span>
            </p>
            <div className={styles.buttons}>
              <button className="btn" onClick={cancel} disabled={busy}>
                취소
              </button>
              <button className="btn primary" onClick={confirm} disabled={busy}>
                확인
              </button>
            </div>
          </div>
        </div>
      )}

      {overlay && loser && (
        <div className={styles.overlay}>
          <div className={styles.card}>
            <p className={styles.kicker}>{game.stabs.length}번째 칼에 개구리가 펑!</p>
            <h2>
              <i style={{ background: colorOf(loser) }} />
              {meLost ? '내가 당첨!' : `${game.names[loser]} 당첨!`}
            </h2>
            <p>{meLost ? '오늘은 운이 없네요…' : api.inGame ? '휴, 살았다!' : '축하(?)해요!'}</p>
            <div className={styles.row}>
              {canRematch && (
                <button className="btn primary big" disabled={busy} onClick={() => void run(() => api.act({ type: 'rematch', by: playerId }))}>
                  한 판 더 <small>당첨자가 먼저</small>
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
                통 보기
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
