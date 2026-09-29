import { useCallback, useEffect, useMemo, useState, type CSSProperties } from 'react'
import { currentPlayer, groupOf, HOME, legalMoves, RESULT_LABEL, type GameState, type Team } from '../game/rules'
import { playerId } from '../net'
import type { RoomApi } from '../net/useRoom'
import { GameScene, type Preview } from '../scene/GameScene'
import { THROW_REVEAL_MS } from '../scene/YutSticks'
import { celebrateThrow, celebrateWin } from './effects'

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

/** How long everyone else must stay offline before the last player wins. Covers reloads. */
const LAST_STANDING_GRACE_MS = 15_000

export function GameView({
  code,
  api,
  game,
  onLeave,
  onLastStanding,
}: {
  code: string
  api: RoomApi
  game: GameState
  onLeave: () => void
  onLastStanding: (team: Team) => void
}) {
  const portrait = usePortrait()
  const [mountSeq] = useState(game.seq)
  const [revealed, setRevealed] = useState(game.seq)
  const [banner, setBanner] = useState<{ seq: number; text: string; sub: string | null; color: string } | null>(null)
  const [selIdx, setSelIdx] = useState(0)
  const [selPiece, setSelPiece] = useState<string | null>(null)
  const [hover, setHover] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const online = useMemo(() => {
    const o: Record<string, boolean> = {}
    for (const id of Object.keys(game.names)) o[id] = api.room?.players?.[id]?.online ?? false
    return o
  }, [api.room?.players, game.names])

  // Everyone but me left a running game: after a grace period I win and the room goes away.
  const alone =
    api.inGame &&
    game.phase !== 'over' &&
    Object.keys(game.names).every((id) => id === playerId || !online[id])
  const myTeam = game.teams.find((t) => t.members.includes(playerId))
  useEffect(() => {
    if (!alone || !myTeam) return
    const t = window.setTimeout(() => onLastStanding(myTeam), LAST_STANDING_GRACE_MS)
    return () => window.clearTimeout(t)
    // myTeam/onLastStanding are stable for the life of this game
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [alone])

  const cur = currentPlayer(game)
  const team = game.teams[game.turn]
  const myTurn = cur === playerId
  const canAct = api.inGame && game.phase !== 'over' && (myTurn || !online[cur])
  const event = game.event
  const throwing = event.type === 'throw' && event.seq > revealed

  // Reveal the throw once the sticks land.
  useEffect(() => {
    if (event.type !== 'throw' || event.seq <= revealed) return
    const t = window.setTimeout(() => {
      setRevealed(event.seq)
      const skipped = currentPlayer(game) !== event.by
      const thrower = game.teams.find((tm) => tm.members.includes(event.by))
      setBanner({
        seq: event.seq,
        text: `${RESULT_LABEL[event.result]}!`,
        sub: skipped ? '움직일 말이 없어요' : event.result === 'yut' || event.result === 'mo' ? '한 번 더!' : null,
        color: thrower?.color ?? '#333',
      })
      celebrateThrow(event.result, thrower?.color ?? '#ff5d6c')
    }, THROW_REVEAL_MS)
    return () => window.clearTimeout(t)
  }, [event, revealed, game])

  useEffect(() => {
    if (!banner) return
    const t = window.setTimeout(() => setBanner((b) => (b?.seq === banner.seq ? null : b)), 1300)
    return () => window.clearTimeout(t)
  }, [banner])

  // Celebrate once the winning piece has landed (matches the overlay's delay).
  const winnerColor = game.winner !== null ? game.teams[game.winner].color : null
  useEffect(() => {
    if (!winnerColor) return
    let cancel = () => {}
    const t = window.setTimeout(() => (cancel = celebrateWin(winnerColor)), 1500)
    return () => {
      window.clearTimeout(t)
      cancel()
    }
  }, [winnerColor])

  // Any new state invalidates the local selection.
  useEffect(() => {
    setSelPiece(null)
    setHover(null)
  }, [game.seq])

  const pending = throwing ? game.pending.slice(0, -1) : game.pending
  const movePhase = canAct && game.phase === 'move' && !throwing

  // Default to the first result that can actually move something.
  const idx = useMemo(() => {
    if (selIdx < game.pending.length && legalMoves(game, game.pending[selIdx]).length) return selIdx
    const i = game.pending.findIndex((r) => legalMoves(game, r).length > 0)
    return i < 0 ? 0 : i
  }, [game, selIdx])

  const legal = useMemo(() => (movePhase && game.pending[idx] ? legalMoves(game, game.pending[idx]) : []), [movePhase, game, idx])

  const movableIds = useMemo(() => {
    const ids = new Set<string>()
    for (const { piece } of legal) {
      if (piece.pos === HOME) game.pieces.filter((p) => p.team === piece.team && p.pos === HOME).forEach((p) => ids.add(p.id))
      else groupOf(game, piece).forEach((p) => ids.add(p.id))
    }
    return ids
  }, [legal, game])

  const moveFor = useCallback(
    (id: string | null) => {
      if (!id) return null
      const p = game.pieces.find((x) => x.id === id)
      if (!p) return null
      return legal.find((m) => m.piece.pos === p.pos && m.piece.team === p.team) ?? null
    },
    [legal, game.pieces],
  )

  const focus = selPiece ?? hover
  const focusMove = moveFor(focus)
  const preview: Preview | null = focusMove
    ? {
        to: focusMove.dest.to,
        color: team.color,
        label: (() => {
          const there = game.pieces.filter((p) => p.pos === focusMove.dest.to)
          if (there.some((p) => p.team !== game.turn)) return '잡기!'
          if (there.some((p) => p.team === game.turn && !groupOf(game, focusMove.piece).includes(p))) return '업기'
          return RESULT_LABEL[game.pending[idx]]
        })(),
      }
    : null

  const run = async (fn: () => Promise<void>) => {
    if (busy) return
    setBusy(true)
    try {
      await fn()
    } finally {
      setBusy(false)
    }
  }

  const doThrow = () => run(() => api.act({ type: 'throw', by: playerId }, !myTurn))
  const doMove = (pieceId: string) =>
    run(() => api.act({ type: 'move', by: playerId, pendingIndex: idx, pieceId }, !myTurn))

  const onPick = (id: string) => {
    const m = moveFor(id)
    if (!m) return
    const sameGroup = selPiece && moveFor(selPiece) === m
    if (canHover || sameGroup) void doMove(id)
    else setSelPiece(id)
  }

  if (import.meta.env.DEV) {
    // test hook for driving the board from automation; stripped from production builds
    ;(window as unknown as Record<string, unknown>).__yut = { game, legal, move: doMove }
  }

  const homeMove = legal.find((m) => m.piece.pos === HOME)
  const canThrow = canAct && game.phase === 'throw' && !throwing

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code === 'Space' && canThrow) {
        e.preventDefault()
        void doThrow()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  const winner = game.winner !== null ? game.teams[game.winner] : null
  const isHost = api.hostId === playerId
  const shownPlayer = throwing && event.type === 'throw' ? event.by : cur
  const shownTeam = game.teams.find((t) => t.members.includes(shownPlayer)) ?? team

  return (
    <main className="game" style={{ '--turn': shownTeam.color } as CSSProperties}>
      <GameScene
        game={game}
        portrait={portrait}
        mountSeq={mountSeq}
        movableIds={movableIds}
        selectedId={selPiece}
        onPick={onPick}
        onHover={(id) => canHover && setHover(id)}
        preview={preview}
        online={online}
        onConfirm={() => focusMove && void doMove(focusMove.piece.id)}
      />

      <header className="hud-top">
        <button className="btn ghost small" onClick={onLeave}>
          ←
        </button>
        <span className="code-chip">{code}</span>
        <div className="turn-pill">
          <i style={{ background: shownTeam.color }} />
          {winner ? (
            <span>게임 끝</span>
          ) : (
            <span>
              {game.teams.some((t) => t.members.length > 1) ? `${shownTeam.name} · ` : ''}
              <b>{game.names[shownPlayer]}</b> {shownPlayer === playerId ? '(나)' : ''} 차례
            </span>
          )}
        </div>
        {!api.inGame && <span className="spectator">관전 중</span>}
      </header>

      <aside className="log">
        {game.log.slice(-4).map((l, i, arr) => (
          <p key={game.log.length - arr.length + i}>{l}</p>
        ))}
      </aside>

      {!winner && (
        <footer className="dock">
          {alone && <p className="notice">다른 플레이어가 모두 나갔어요. 15초 안에 돌아오지 않으면 승리로 처리돼요</p>}
          {!alone && !online[cur] && api.inGame && !myTurn && (
            <p className="notice">{game.names[cur]} 님의 연결이 끊겼어요. 대신 진행하셔도 돼요</p>
          )}
          {pending.length > 0 && (
            <div className="chips">
              {pending.map((r, i) => (
                <button
                  key={`${i}-${r}`}
                  className={`chip ${r}${movePhase && i === idx ? ' on' : ''}`}
                  disabled={!movePhase}
                  onClick={() => {
                    setSelIdx(i)
                    setSelPiece(null)
                  }}
                >
                  {RESULT_LABEL[r]}
                </button>
              ))}
            </div>
          )}

          {canThrow ? (
            <button className="throw-btn" onClick={doThrow} disabled={busy}>
              <span>윷 던지기</span>
              {game.throwsLeft > 1 && <small>×{game.throwsLeft}</small>}
            </button>
          ) : movePhase ? (
            <div className="move-help">
              <p>{canHover ? '움직일 말을 눌러 주세요' : '말을 고른 뒤 한 번 더 눌러 주세요'}</p>
              {homeMove && (
                <button className="btn primary" onClick={() => doMove(homeMove.piece.id)} disabled={busy}>
                  새 말 내기
                </button>
              )}
            </div>
          ) : (
            <p className="waiting">{throwing ? '두근두근…' : `${game.names[cur]} 님을 기다리고 있어요…`}</p>
          )}
        </footer>
      )}

      {banner && (
        <div key={banner.seq} className="banner" style={{ '--c': banner.color } as CSSProperties}>
          <strong>{banner.text}</strong>
          {banner.sub && <span>{banner.sub}</span>}
        </div>
      )}

      {winner && !throwing && (
        <div className="overlay">
          <div className="win-card" style={{ '--c': winner.color } as CSSProperties}>
            <h2>{winner.name} 승리!</h2>
            <p>{winner.members.length > 1 ? winner.members.map((m) => game.names[m]).join(', ') : '축하해요!'}</p>
            {isHost ? (
              <div className="row">
                <button className="btn primary big" onClick={api.start}>
                  한 판 더
                </button>
                <button className="btn big" onClick={() => void api.toLobby()}>
                  로비로
                </button>
              </div>
            ) : (
              <p className="waiting">방장을 기다리고 있어요…</p>
            )}
          </div>
        </div>
      )}

      {api.error && <div className="toast">{api.error}</div>}
    </main>
  )
}
