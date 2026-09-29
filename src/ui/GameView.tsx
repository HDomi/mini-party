import { useCallback, useEffect, useMemo, useState, type CSSProperties } from 'react'
import {
  currentPlayer,
  GOAL,
  groupOf,
  HOME,
  legalMoves,
  RESULT_LABEL,
  RESULT_STEPS,
  type Action,
  type Destination,
  type GameState,
  type Piece,
  type Result,
  type Team,
} from '../game/rules'
import { playerId } from '../net'
import { GameScene, type Preview } from '../scene/GameScene'
import { HOP } from '../scene/Pieces'
import { addShake } from '../scene/Shake'
import { THROW_REVEAL_MS } from '../scene/YutSticks'
import { CaughtSplash, type Caught } from './CaughtSplash'
import { celebrateThrow, celebrateWin } from './effects'
import { play } from './sound'

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

/** One way to move the picked piece: which pending result to spend and where it lands. */
interface Option {
  idx: number
  result: Result
  piece: Piece
  dest: Destination
}

/** What the board needs from whoever runs the game: a shared room (useRoom) or a local game against the bot (useSoloGame). */
export interface GameApi {
  room: { players?: Record<string, { online: boolean }> } | null | undefined
  inGame: boolean
  hostId: string | null
  error: string | null
  act: (action: Action, proxy?: boolean) => Promise<void>
  start: () => Promise<void>
  toLobby: () => Promise<unknown>
}

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
  api: GameApi
  game: GameState
  onLeave: () => void
  onLastStanding: (team: Team) => void
}) {
  const portrait = usePortrait()
  const [mountSeq] = useState(game.seq)
  const [revealed, setRevealed] = useState(game.seq)
  const [banner, setBanner] = useState<{ seq: number; text: string; sub: string | null; color: string } | null>(null)
  const [caught, setCaught] = useState<Caught | null>(null)
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
      if (event.result === 'yut' || event.result === 'mo') play(event.result)
    }, THROW_REVEAL_MS)
    return () => window.clearTimeout(t)
  }, [event, revealed, game])

  useEffect(() => {
    if (!banner) return
    const t = window.setTimeout(() => setBanner((b) => (b?.seq === banner.seq ? null : b)), 1300)
    return () => window.clearTimeout(t)
  }, [banner])

  // Once a capture lands: the victims get the splash, the capturer and everyone else a banner.
  useEffect(() => {
    if (event.type !== 'move' || !event.captured.length || event.seq <= mountSeq) return
    const actor = game.teams.find((t) => t.members.includes(event.by))
    const victims = [
      ...new Set(event.captured.map((id) => game.pieces.find((p) => p.id === id)?.team).filter((t) => t !== undefined)),
    ].map((t) => game.teams[t])
    const mine = victims.find((t) => t.members.includes(playerId))
    const t = window.setTimeout(
      () => {
        if (mine) {
          setCaught({ seq: event.seq, by: game.names[event.by] ?? '?', color: mine.color, byColor: actor?.color ?? '#333' })
          addShake(0.6)
          navigator.vibrate?.([80, 40, 160])
        } else
          setBanner({
            seq: event.seq,
            text: '잡았다!',
            sub: actor?.members.includes(playerId) ? '한 번 더!' : `${actor?.name ?? '?'} → ${victims.map((v) => v.name).join(', ')}`,
            color: actor?.color ?? '#333',
          })
      },
      (event.path.length * HOP + 0.05) * 1000,
    )
    return () => window.clearTimeout(t)
    // Keyed on the event; names and teams are read at that moment.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [event.seq])

  useEffect(() => {
    if (!caught) return
    const t = window.setTimeout(() => setCaught((c) => (c?.seq === caught.seq ? null : c)), 2200)
    return () => window.clearTimeout(t)
  }, [caught])

  // Celebrate once the winning piece has landed (matches the overlay's delay).
  const winnerColor = game.winner !== null ? game.teams[game.winner].color : null
  useEffect(() => {
    if (!winnerColor) return
    let cancel = () => {}
    const t = window.setTimeout(() => {
      cancel = celebrateWin(winnerColor)
      play('win')
    }, 1500)
    return () => {
      window.clearTimeout(t)
      cancel()
    }
  }, [winnerColor])

  // Chime when the turn passes to me, once the move or throw that passed it has played out.
  useEffect(() => {
    if (cur !== playerId || game.phase === 'over' || game.seq <= mountSeq) return
    const wait = event.type === 'move' ? event.path.length * HOP * 1000 + 250 : THROW_REVEAL_MS + 200
    const t = window.setTimeout(() => play('turn'), wait)
    return () => window.clearTimeout(t)
    // Only the hand-over matters; the rest is read at that moment.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cur])

  // Any new state invalidates the local selection.
  useEffect(() => {
    setSelPiece(null)
    setHover(null)
  }, [game.seq])

  const pending = throwing ? game.pending.slice(0, -1) : game.pending
  const movePhase = canAct && game.phase === 'move' && !throwing

  // Every distinct pending result that can move something; duplicates share a destination.
  const choices = useMemo(() => {
    if (!movePhase) return []
    const seen = new Set<Result>()
    const out: { idx: number; result: Result; moves: ReturnType<typeof legalMoves> }[] = []
    game.pending.forEach((result, idx) => {
      if (seen.has(result)) return
      seen.add(result)
      const moves = legalMoves(game, result)
      if (moves.length) out.push({ idx, result, moves })
    })
    return out
  }, [movePhase, game])

  const movableIds = useMemo(() => {
    const ids = new Set<string>()
    for (const { moves } of choices)
      for (const { piece } of moves) {
        if (piece.pos === HOME) game.pieces.filter((p) => p.team === piece.team && p.pos === HOME).forEach((p) => ids.add(p.id))
        else groupOf(game, piece).forEach((p) => ids.add(p.id))
      }
    return ids
  }, [choices, game])

  const optionsFor = useCallback(
    (id: string | null): Option[] => {
      const p = id ? game.pieces.find((x) => x.id === id) : undefined
      if (!p) return []
      const out: Option[] = []
      for (const { idx, result, moves } of choices) {
        const m = moves.find((mv) => mv.piece.pos === p.pos && mv.piece.team === p.team)
        if (m) out.push({ idx, result, piece: m.piece, dest: m.dest })
      }
      return out
    },
    [choices, game.pieces],
  )

  const selOptions = useMemo(() => optionsFor(selPiece), [optionsFor, selPiece])
  const focusOptions = useMemo(() => optionsFor(selPiece ?? hover), [optionsFor, selPiece, hover])

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
  const doMove = (pieceId: string, pendingIndex: number) =>
    run(() => api.act({ type: 'move', by: playerId, pendingIndex, pieceId }, !myTurn))

  const tagFor = (o: Option) => {
    if (o.dest.to === GOAL) return '골인!'
    const there = game.pieces.filter((p) => p.pos === o.dest.to)
    if (there.some((p) => p.team !== game.turn)) return '잡기!'
    if (there.some((p) => p.team === game.turn && !groupOf(game, o.piece).includes(p))) return '업기'
    return null
  }

  // One marker per landing spot. Several results can reach the goal; the marker spends the smallest.
  const previews: Preview[] = (() => {
    const byDest = new Map<string, Option[]>()
    for (const o of [...focusOptions].sort((a, b) => RESULT_STEPS[a.result] - RESULT_STEPS[b.result]))
      byDest.set(o.dest.to, [...(byDest.get(o.dest.to) ?? []), o])
    const many = focusOptions.length > 1
    return [...byDest.values()].map((opts) => {
      const o = opts[0]
      const tag = tagFor(o)
      const names = opts.map((x) => RESULT_LABEL[x.result]).join('/')
      return {
        key: o.dest.to,
        to: o.dest.to,
        color: team.color,
        label: many ? (tag ? `${names} · ${tag}` : names) : (tag ?? names),
        onConfirm: () => void doMove(o.piece.id, o.idx),
      }
    })
  })()

  const samePlace = (a: string | null, b: string) => {
    const pa = game.pieces.find((p) => p.id === a)
    const pb = game.pieces.find((p) => p.id === b)
    return !!pa && !!pb && pa.team === pb.team && pa.pos === pb.pos
  }

  const onPick = (id: string) => {
    const opts = optionsFor(id)
    if (!opts.length) return
    const same = samePlace(selPiece, id)
    // A piece sitting on a shown destination (업기 target) means "go there", not "pick this one".
    if (selPiece && !same) {
      const pos = game.pieces.find((p) => p.id === id)?.pos
      const target = selOptions.find((o) => o.dest.to === pos)
      if (target) return void doMove(target.piece.id, target.idx)
    }
    if (opts.length > 1) {
      setSelPiece(same ? null : id)
      return
    }
    if (canHover || same) void doMove(opts[0].piece.id, opts[0].idx)
    else setSelPiece(id)
  }

  if (import.meta.env.DEV) {
    // test hook for driving the board from automation; stripped from production builds
    ;(window as unknown as Record<string, unknown>).__yut = {
      game,
      legal: choices[0]?.moves ?? [],
      choices,
      move: (pieceId: string, pendingIndex = choices[0]?.idx ?? 0) => doMove(pieceId, pendingIndex),
    }
  }

  const homePiece = game.pieces.find((p) => p.team === game.turn && p.pos === HOME)
  const homeOptions = homePiece && movableIds.has(homePiece.id) ? optionsFor(homePiece.id) : []
  const pickHome = () => {
    if (!homePiece) return
    if (homeOptions.length === 1) void doMove(homeOptions[0].piece.id, homeOptions[0].idx)
    else setSelPiece(homePiece.id)
  }
  const picking = selOptions.length > 1
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
        onMiss={() => setSelPiece(null)}
        previews={previews}
        online={online}
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
              {pending.map((r, i) => {
                const opt = picking ? selOptions.find((o) => o.result === r) : undefined
                const tag = opt && tagFor(opt)
                return (
                  <button
                    key={`${i}-${r}`}
                    className={`chip ${r}${opt ? ' on' : ''}`}
                    disabled={!opt || busy}
                    onClick={() => opt && void doMove(opt.piece.id, i)}
                  >
                    {RESULT_LABEL[r]}
                    {tag && <small>{tag}</small>}
                  </button>
                )
              })}
            </div>
          )}

          {canThrow ? (
            <button className="throw-btn" onClick={doThrow} disabled={busy}>
              <span>윷 던지기</span>
              {game.throwsLeft > 1 && <small>×{game.throwsLeft}</small>}
            </button>
          ) : movePhase ? (
            <div className="move-help">
              <p>
                {picking
                  ? '몇 칸 갈지 골라 주세요'
                  : selPiece
                    ? '한 번 더 누르면 이동해요'
                    : '움직일 말을 눌러 주세요'}
              </p>
              {selPiece ? (
                <button className="btn" onClick={() => setSelPiece(null)}>
                  취소
                </button>
              ) : (
                homeOptions.length > 0 && (
                  <button className="btn primary" onClick={pickHome} disabled={busy}>
                    새 말 내기
                  </button>
                )
              )}
            </div>
          ) : (
            <p className="waiting">{throwing ? '두근두근…' : `${game.names[cur]} 님을 기다리고 있어요…`}</p>
          )}
        </footer>
      )}

      {caught && <CaughtSplash key={caught.seq} caught={caught} />}

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
