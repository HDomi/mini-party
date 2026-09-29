import { defaultPrev, nextNode, type NodeId } from './board'

export type Result = 'backdo' | 'do' | 'gae' | 'geol' | 'yut' | 'mo'

export const RESULT_STEPS: Record<Result, number> = {
  backdo: -1,
  do: 1,
  gae: 2,
  geol: 3,
  yut: 4,
  mo: 5,
}

export const RESULT_LABEL: Record<Result, string> = {
  backdo: '빽도',
  do: '도',
  gae: '개',
  geol: '걸',
  yut: '윷',
  mo: '모',
}

export const HOME = 'HOME'
export const GOAL = 'GOAL'
export type PiecePos = NodeId | typeof HOME | typeof GOAL

export interface Piece {
  id: string
  team: number
  pos: PiecePos
  /** Stations visited on the board, last = current. Used for 빽도. */
  trail: NodeId[]
}

export interface Team {
  name: string
  color: string
  members: string[]
  /** Advances every time this team finishes a turn, picks which member plays. */
  cursor: number
}

export type GameEvent =
  | { seq: number; type: 'start' }
  | { seq: number; type: 'throw'; by: string; sticks: boolean[]; result: Result; seed: number }
  | {
      seq: number
      type: 'move'
      by: string
      result: Result
      pieceIds: string[]
      path: PiecePos[]
      captured: string[]
    }

export interface GameState {
  teams: Team[]
  pieces: Piece[]
  names: Record<string, string>
  turn: number
  phase: 'throw' | 'move' | 'over'
  pending: Result[]
  throwsLeft: number
  winner: number | null
  seq: number
  event: GameEvent
  log: string[]
}

export type Action =
  | { type: 'throw'; by: string }
  | { type: 'move'; by: string; pendingIndex: number; pieceId: string }

export const TEAM_COLORS = ['#ff5d6c', '#3d8bff', '#ffb627', '#2fc27a', '#a667ff', '#1ec8c8']
export const TEAM_NAMES = ['홍팀', '청팀', '황팀', '녹팀', '자팀', '옥팀']

export interface SetupPlayer {
  id: string
  name: string
  team: number
}

export function createGame(opts: {
  players: SetupPlayer[]
  teamMode: boolean
  piecesPerTeam: number
  rng?: () => number
}): GameState {
  const rng = opts.rng ?? Math.random
  const names: Record<string, string> = {}
  for (const p of opts.players) names[p.id] = p.name

  let teams: Team[]
  if (opts.teamMode) {
    const used = [...new Set(opts.players.map((p) => p.team))].sort((a, b) => a - b)
    teams = used.map((t) => ({
      name: TEAM_NAMES[t],
      color: TEAM_COLORS[t],
      members: shuffle(
        opts.players.filter((p) => p.team === t).map((p) => p.id),
        rng,
      ),
      cursor: 0,
    }))
  } else {
    teams = shuffle([...opts.players], rng).map((p, i) => ({
      name: p.name,
      color: TEAM_COLORS[i],
      members: [p.id],
      cursor: 0,
    }))
  }
  teams = shuffle(teams, rng)

  const pieces: Piece[] = []
  teams.forEach((_, t) => {
    for (let i = 0; i < opts.piecesPerTeam; i++) {
      pieces.push({ id: `${t}-${i}`, team: t, pos: HOME, trail: [] })
    }
  })

  return {
    teams,
    pieces,
    names,
    turn: 0,
    phase: 'throw',
    pending: [],
    throwsLeft: 1,
    winner: null,
    seq: 1,
    event: { seq: 1, type: 'start' },
    log: [`게임을 시작해요! 첫 차례: ${teams[0].name}`],
  }
}

export function currentPlayer(s: GameState): string {
  const team = s.teams[s.turn]
  return team.members[team.cursor % team.members.length]
}

/** Four sticks; true = flat side (배) up. Stick 0 carries the 빽도 mark. */
export function throwSticks(rng: () => number): { sticks: boolean[]; result: Result } {
  const sticks = [0, 1, 2, 3].map(() => rng() < 0.5)
  const flat = sticks.filter(Boolean).length
  const result: Result =
    flat === 0 ? 'mo' : flat === 1 ? (sticks[0] ? 'backdo' : 'do') : flat === 2 ? 'gae' : flat === 3 ? 'geol' : 'yut'
  return { sticks, result }
}

export interface Destination {
  to: PiecePos
  /** Stations passed through, ending at `to`. */
  path: PiecePos[]
  trail: NodeId[]
}

export function destination(piece: Piece, result: Result): Destination | null {
  if (piece.pos === GOAL) return null
  const steps = RESULT_STEPS[result]

  if (steps < 0) {
    if (piece.pos === HOME) return null
    const t = piece.trail
    if (t.length >= 2) {
      const to = t[t.length - 2]
      return { to, path: [to], trail: t.slice(0, -1) }
    }
    const to = defaultPrev(piece.pos)
    return { to, path: [to], trail: [to] }
  }

  const path: PiecePos[] = []
  let trail: NodeId[]
  let cur: NodeId
  let entering = false
  if (piece.pos === HOME) {
    cur = 'O0'
    trail = ['O0']
    entering = true
  } else {
    cur = piece.pos
    trail = [...piece.trail]
    if (trail[trail.length - 1] !== cur) trail.push(cur)
  }

  for (let i = 0; i < steps; i++) {
    if (cur === 'O0' && !entering) {
      path.push(GOAL)
      return { to: GOAL, path, trail: [] }
    }
    entering = false
    const nxt = nextNode(cur, trail[trail.length - 2], i === 0)
    trail.push(nxt)
    path.push(nxt)
    cur = nxt
  }
  return { to: cur, path, trail: capTrail(trail) }
}

function capTrail(t: NodeId[]): NodeId[] {
  return t.length > 32 ? t.slice(-32) : t
}

/** Pieces that move together with `piece` (업기). Home pieces move alone. */
export function groupOf(s: GameState, piece: Piece): Piece[] {
  if (piece.pos === HOME || piece.pos === GOAL) return [piece]
  return s.pieces.filter((p) => p.team === piece.team && p.pos === piece.pos)
}

/** One representative per movable group of the current team. */
export function movableGroups(s: GameState, team: number): Piece[] {
  const seen = new Set<string>()
  const out: Piece[] = []
  for (const p of s.pieces) {
    if (p.team !== team || p.pos === GOAL) continue
    const key = p.pos
    if (seen.has(key)) continue
    seen.add(key)
    out.push(p)
  }
  return out
}

export function legalMoves(s: GameState, result: Result): { piece: Piece; dest: Destination }[] {
  const out: { piece: Piece; dest: Destination }[] = []
  for (const piece of movableGroups(s, s.turn)) {
    const dest = destination(piece, result)
    if (dest) out.push({ piece, dest })
  }
  return out
}

function hasAnyMove(s: GameState): boolean {
  return s.pending.some((r) => legalMoves(s, r).length > 0)
}

export class RuleError extends Error {}

function pushLog(s: GameState, msg: string) {
  s.log = [...s.log, msg].slice(-30)
}

function endTurn(s: GameState) {
  s.teams[s.turn].cursor += 1
  s.turn = (s.turn + 1) % s.teams.length
  s.phase = 'throw'
  s.pending = []
  s.throwsLeft = 1
}

/** After a throw or move, decide what the current team does next. */
function settle(s: GameState, by: string) {
  if (s.throwsLeft > 0) {
    s.phase = 'throw'
    return
  }
  if (s.pending.length === 0) {
    endTurn(s)
    return
  }
  if (!hasAnyMove(s)) {
    pushLog(s, `${s.names[by] ?? '?'}: 움직일 말이 없어서 차례를 넘겨요`)
    endTurn(s)
    return
  }
  s.phase = 'move'
}

/**
 * Pure reducer. Returns a new state or throws RuleError.
 * `proxy` lets someone act for a disconnected current player.
 */
export function applyAction(
  prev: GameState,
  action: Action,
  opts: { rng?: () => number; proxy?: boolean } = {},
): GameState {
  const rng = opts.rng ?? Math.random
  const s: GameState = structuredClone(prev)
  if (s.phase === 'over') throw new RuleError('게임이 끝났어요')
  if (!opts.proxy && action.by !== currentPlayer(s)) throw new RuleError('내 차례가 아니에요')
  const actor = currentPlayer(s)
  const name = s.names[actor] ?? '?'

  if (action.type === 'throw') {
    if (s.phase !== 'throw' || s.throwsLeft <= 0) throw new RuleError('지금은 던질 수 없어요')
    const { sticks, result } = throwSticks(rng)
    s.throwsLeft -= 1
    if (result === 'yut' || result === 'mo') s.throwsLeft += 1
    s.pending = [...s.pending, result]
    s.seq += 1
    s.event = { seq: s.seq, type: 'throw', by: actor, sticks, result, seed: Math.floor(rng() * 1e9) }
    const bonus = result === 'yut' || result === 'mo' ? ' 한 번 더!' : ''
    pushLog(s, `${name}: ${RESULT_LABEL[result]}${bonus}`)
    settle(s, actor)
    return s
  }

  if (s.phase !== 'move') throw new RuleError('먼저 윷을 던져 주세요')
  const result = s.pending[action.pendingIndex]
  if (!result) throw new RuleError('없는 결과예요')
  const piece = s.pieces.find((p) => p.id === action.pieceId)
  if (!piece || piece.team !== s.turn) throw new RuleError('내 말이 아니에요')
  const dest = destination(piece, result)
  if (!dest) throw new RuleError('그 말은 움직일 수 없어요')

  const group = groupOf(s, piece)
  const captured: string[] = []
  const joined: string[] = []
  if (dest.to !== GOAL) {
    for (const p of s.pieces) {
      if (p.pos !== dest.to || group.includes(p)) continue
      if (p.team === s.turn) {
        joined.push(p.id)
        p.trail = dest.trail
      } else {
        captured.push(p.id)
        p.pos = HOME
        p.trail = []
      }
    }
  }
  for (const p of group) {
    p.pos = dest.to
    p.trail = dest.trail
  }

  s.pending = s.pending.filter((_, i) => i !== action.pendingIndex)
  s.seq += 1
  s.event = {
    seq: s.seq,
    type: 'move',
    by: actor,
    result,
    pieceIds: group.map((p) => p.id),
    path: dest.path,
    captured,
  }

  const count = group.length > 1 ? ` (${group.length}동)` : ''
  if (dest.to === GOAL) pushLog(s, `${name}: 말이 났어요${count}`)
  else if (captured.length) {
    const victims = [...new Set(captured.map((id) => s.pieces.find((p) => p.id === id)!.team))]
    pushLog(s, `${name}: ${victims.map((t) => s.teams[t].name).join(', ')} 말을 잡았어요! 한 번 더`)
    s.throwsLeft += 1
  } else if (joined.length) pushLog(s, `${name}: 업었어요! (${group.length + joined.length}동)`)
  else pushLog(s, `${name}: ${RESULT_LABEL[result]}${result === 'yut' ? '으로' : '로'} 이동했어요${count}`)

  if (s.pieces.filter((p) => p.team === s.turn).every((p) => p.pos === GOAL)) {
    s.winner = s.turn
    s.phase = 'over'
    s.pending = []
    s.throwsLeft = 0
    pushLog(s, `${s.teams[s.turn].name} 승리!`)
    return s
  }

  settle(s, actor)
  return s
}

function shuffle<T>(arr: T[], rng: () => number): T[] {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

export function seededRng(seed: number): () => number {
  let x = seed >>> 0 || 1
  return () => {
    x ^= x << 13
    x >>>= 0
    x ^= x >>> 17
    x ^= x << 5
    x >>>= 0
    return x / 4294967296
  }
}
