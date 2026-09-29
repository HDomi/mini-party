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

/** 고른 말을 옮기는 한 가지 방법: 어떤 대기 결과를 쓰고 어디에 착지하는지. */
interface Option {
  idx: number
  result: Result
  piece: Piece
  dest: Destination
}

/** 게임을 돌리는 쪽(공유 방 useRoom 또는 봇과의 로컬 게임 useSoloGame)에게 보드가 필요로 하는 것. */
export interface GameApi {
  room: { players?: Record<string, { online: boolean }> } | null | undefined
  inGame: boolean
  hostId: string | null
  error: string | null
  act: (action: Action, proxy?: boolean) => Promise<void>
  start: () => Promise<void>
  toLobby: () => Promise<unknown>
}

/** 마지막 플레이어가 이기기 전까지 나머지 모두가 오프라인으로 있어야 하는 시간. 새로고침도 감안한다. */
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

  // 진행 중인 게임에서 나만 남았다: 유예 시간이 지나면 내가 이기고 방은 사라진다.
  const alone =
    api.inGame &&
    game.phase !== 'over' &&
    Object.keys(game.names).every((id) => id === playerId || !online[id])
  const myTeam = game.teams.find((t) => t.members.includes(playerId))
  useEffect(() => {
    if (!alone || !myTeam) return
    const t = window.setTimeout(() => onLastStanding(myTeam), LAST_STANDING_GRACE_MS)
    return () => window.clearTimeout(t)
    // myTeam/onLastStanding 은 이 게임이 끝날 때까지 바뀌지 않는다
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [alone])

  const cur = currentPlayer(game)
  const team = game.teams[game.turn]
  const myTurn = cur === playerId
  const canAct = api.inGame && game.phase !== 'over' && (myTurn || !online[cur])
  const event = game.event
  const throwing = event.type === 'throw' && event.seq > revealed

  // 윷가락이 떨어지면 던지기 결과를 공개한다.
  useEffect(() => {
    if (event.type !== 'throw' || event.seq <= revealed) return
    const t = window.setTimeout(() => {
      setRevealed(event.seq)
      // 직전 잡기의 스플래시보다 다음 던지기 결과가 더 중요하다.
      setCaught(null)
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

  // 잡기가 착지하면 잡힌 쪽에는 스플래시를, 잡은 쪽과 나머지에게는 배너를 보여준다.
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
    // 이벤트를 키로 삼는다. 이름과 팀은 그 시점의 값을 읽는다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [event.seq])

  useEffect(() => {
    if (!caught) return
    const t = window.setTimeout(() => setCaught((c) => (c?.seq === caught.seq ? null : c)), 2200)
    return () => window.clearTimeout(t)
  }, [caught])

  // 승리를 결정한 말이 착지한 뒤에 축하한다 (오버레이 지연과 맞춘다).
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

  // 차례가 나에게 넘어오면, 그 차례를 넘긴 이동이나 던지기가 다 재생된 뒤에 알림음을 울린다.
  useEffect(() => {
    if (cur !== playerId || game.phase === 'over' || game.seq <= mountSeq) return
    const wait = event.type === 'move' ? event.path.length * HOP * 1000 + 250 : THROW_REVEAL_MS + 200
    const t = window.setTimeout(() => play('turn'), wait)
    return () => window.clearTimeout(t)
    // 차례가 넘어오는 것만 중요하다. 나머지는 그 시점의 값을 읽는다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cur])

  // 새 상태가 오면 로컬 선택은 무효가 된다.
  useEffect(() => {
    setSelPiece(null)
    setHover(null)
  }, [game.seq])

  const pending = throwing ? game.pending.slice(0, -1) : game.pending
  const movePhase = canAct && game.phase === 'move' && !throwing

  // 무언가를 옮길 수 있는 서로 다른 대기 결과 전부. 중복된 결과는 도착지를 공유한다.
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

  // 착지 지점마다 마커 하나. 여러 결과로 골인할 수 있으면 마커는 가장 작은 결과를 쓴다.
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
    // 표시된 도착지(업기 대상)에 있는 말은 "이 말을 고른다"가 아니라 "거기로 간다"는 뜻이다.
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
    // 자동화로 보드를 조작하기 위한 테스트 훅. 프로덕션 빌드에서는 제거된다
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
