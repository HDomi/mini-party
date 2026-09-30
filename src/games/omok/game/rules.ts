// 오목 규칙. 순수 함수만 있다: 방(transaction)과 봇이 같은 reducer 를 쓴다.
//
// 판은 `moves`(둔 순서대로의 칸 번호)만 저장하고 나머지는 거기서 계산한다. 짝수 번째가 흑이다.
// 칸 번호는 `y * size + x`.

export const SIZE = 15
export const BLACK = 0
export const WHITE = 1
export type Color = typeof BLACK | typeof WHITE
export const EMPTY = -1
const WALL = -2

/**
 * - `free`: 흑백 모두 다섯 알 이상이면 이긴다.
 * - `renju`: 흑은 정확히 다섯 알이어야 이기고 삼삼·사사·장목(여섯 알 이상)을 둘 수 없다. 백은 제한이 없다.
 */
export type Rule = 'free' | 'renju'
export const RULE_LABEL: Record<Rule, string> = { free: '자유룰', renju: '렌주룰' }

export type Forbidden = 'double-three' | 'double-four' | 'overline'
export const FORBIDDEN_LABEL: Record<Forbidden, string> = {
  'double-three': '삼삼',
  'double-four': '사사',
  overline: '장목',
}

export const COLOR_NAME = ['흑', '백'] as const

export interface GameState {
  size: number
  rule: Rule
  /** [흑, 백] 플레이어 id. */
  players: [string, string]
  names: Record<string, string>
  moves: number[]
  phase: 'play' | 'over'
  winner: Color | null
  end: 'five' | 'resign' | 'draw' | null
  /** 이긴 다섯 알(오목으로 끝났을 때만). */
  line: number[]
  seq: number
  /** 한 판 더 할 때마다 올라간다. 보드가 이 값으로 다시 마운트된다. */
  round: number
}

export type Action =
  | { type: 'place'; by: string; at: number }
  | { type: 'resign'; by: string }
  /** 내 차례가 되도록 되돌린다. 혼자하기에서만 쓴다. */
  | { type: 'undo'; by: string }
  /** 흑백을 바꿔 새 판을 시작한다. */
  | { type: 'rematch'; by: string }

export class RuleError extends Error {}

export function createGame(opts: { black: { id: string; name: string }; white: { id: string; name: string }; rule: Rule }): GameState {
  return {
    size: SIZE,
    rule: opts.rule,
    players: [opts.black.id, opts.white.id],
    names: { [opts.black.id]: opts.black.name, [opts.white.id]: opts.white.name },
    moves: [],
    phase: 'play',
    winner: null,
    end: null,
    line: [],
    seq: 1,
    round: 0,
  }
}

export const turnOf = (s: GameState): Color => (s.moves.length % 2) as Color
export const currentPlayer = (s: GameState): string => s.players[turnOf(s)]
export const colorOf = (s: GameState, id: string): Color | null => {
  const i = s.players.indexOf(id)
  return i === -1 ? null : (i as Color)
}

/** 칸마다 `EMPTY`, `BLACK`, `WHITE`. */
export type Board = Int8Array

export function boardOf(s: Pick<GameState, 'size' | 'moves'>): Board {
  const b = new Int8Array(s.size * s.size).fill(EMPTY)
  s.moves.forEach((p, i) => (b[p] = i % 2))
  return b
}

export const DIRS = [
  [1, 0],
  [0, 1],
  [1, 1],
  [1, -1],
] as const

function cell(b: Board, size: number, x: number, y: number): number {
  return x < 0 || y < 0 || x >= size || y >= size ? WALL : b[y * size + x]
}

/** `p` 를 지나는 `d` 방향의 같은 색 연속 구간. `lo`, `hi` 는 `p` 기준 오프셋이다. */
function run(b: Board, size: number, p: number, d: number, color: number): { lo: number; hi: number } {
  const [dx, dy] = DIRS[d]
  const x = p % size
  const y = (p - x) / size
  let lo = 0
  let hi = 0
  while (cell(b, size, x + (lo - 1) * dx, y + (lo - 1) * dy) === color) lo--
  while (cell(b, size, x + (hi + 1) * dx, y + (hi + 1) * dy) === color) hi++
  return { lo, hi }
}

const fiveLen = (len: number, exact: boolean) => (exact ? len === 5 : len >= 5)

/** 흑이 렌주룰로 둘 때만 정확히 다섯 알이어야 한다. */
export const exactFive = (rule: Rule, color: Color) => rule === 'renju' && color === BLACK

/**
 * `p` 에 이미 `color` 돌이 있다고 보고, `d` 방향에서 한 알만 더 두면 `p` 를 포함한 오목이 되는 빈칸들의 오프셋.
 */
function fiveMakers(b: Board, size: number, p: number, d: number, color: Color, exact: boolean): number[] {
  const [dx, dy] = DIRS[d]
  const x = p % size
  const y = (p - x) / size
  const out: number[] = []
  for (let k = -4; k <= 4; k++) {
    if (k === 0 || cell(b, size, x + k * dx, y + k * dy) !== EMPTY) continue
    const q = (y + k * dy) * size + (x + k * dx)
    b[q] = color
    const r = run(b, size, p, d, color)
    b[q] = EMPTY
    if (r.lo <= Math.min(0, k) && r.hi >= Math.max(0, k) && fiveLen(r.hi - r.lo + 1, exact)) out.push(k)
  }
  return out
}

/** 한 방향의 4. 양끝이 모두 오목 자리인 `_XXXX_` 는 열린 4(하나)로, `X_XXX_X` 처럼 떨어진 두 자리는 4 두 개로 센다. */
function fourCount(makers: number[]): { fours: number; open: boolean } {
  if (makers.length === 0) return { fours: 0, open: false }
  if (makers.length === 2 && makers[1] - makers[0] === 5) return { fours: 1, open: true }
  return { fours: Math.min(makers.length, 2), open: false }
}

export interface Shape {
  five: boolean
  overline: boolean
  fours: number
  openFours: number
  /** 열린 3(한 알 더 두면 열린 4가 되는) 방향 수. 그 한 알이 금수인지는 따지지 않는다. */
  threes: number
}

/** 빈칸 `p` 에 `color` 를 뒀을 때 생기는 모양. `b` 를 잠시 바꿨다가 되돌린다. */
export function analyze(b: Board, size: number, p: number, color: Color, rule: Rule): Shape {
  const exact = exactFive(rule, color)
  const out: Shape = { five: false, overline: false, fours: 0, openFours: 0, threes: 0 }
  b[p] = color
  for (let d = 0; d < 4; d++) {
    const r = run(b, size, p, d, color)
    const len = r.hi - r.lo + 1
    if (fiveLen(len, exact)) out.five = true
    else if (exact && len > 5) out.overline = true
    const four = fourCount(fiveMakers(b, size, p, d, color, exact))
    out.fours += four.fours
    if (four.open) out.openFours++
    if (four.fours === 0 && makesOpenFour(b, size, p, d, color, exact)) out.threes++
  }
  b[p] = EMPTY
  return out
}

/** `d` 방향으로 한 알을 더 둬서 `p` 를 포함한 열린 4를 만들 수 있는지. */
function makesOpenFour(b: Board, size: number, p: number, d: number, color: Color, exact: boolean): boolean {
  const [dx, dy] = DIRS[d]
  const x = p % size
  const y = (p - x) / size
  for (let k = -4; k <= 4; k++) {
    if (k === 0 || cell(b, size, x + k * dx, y + k * dy) !== EMPTY) continue
    const q = (y + k * dy) * size + (x + k * dx)
    b[q] = color
    const open = fourCount(fiveMakers(b, size, p, d, color, exact)).open
    b[q] = EMPTY
    if (open) return true
  }
  return false
}

/** 빈칸 `p` 가 흑의 금수인지. 오목이 되는 자리는 금수가 아니다. */
export function forbiddenAt(b: Board, size: number, p: number, rule: Rule): Forbidden | null {
  if (rule !== 'renju' || b[p] !== EMPTY) return null
  const s = analyze(b, size, p, BLACK, rule)
  if (s.five) return null
  if (s.overline) return 'overline'
  if (s.fours >= 2) return 'double-four'
  if (s.threes >= 2) return 'double-three'
  return null
}

/** 방금 둔 `p` 로 오목이 됐으면 그 돌들, 아니면 빈 배열. */
function fiveLine(b: Board, size: number, p: number, color: Color, exact: boolean): number[] {
  for (let d = 0; d < 4; d++) {
    const r = run(b, size, p, d, color)
    if (!fiveLen(r.hi - r.lo + 1, exact)) continue
    const [dx, dy] = DIRS[d]
    const out: number[] = []
    for (let k = r.lo; k <= r.hi; k++) out.push(p + k * (dy * size + dx))
    return out
  }
  return []
}

/** 순수 reducer. 새 state 를 반환하거나 RuleError 를 던진다. */
export function applyAction(prev: GameState, action: Action): GameState {
  const s: GameState = structuredClone(prev)
  const me = colorOf(s, action.by)

  if (action.type === 'rematch') {
    if (s.phase !== 'over') throw new RuleError('아직 게임 중이에요')
    return {
      ...s,
      players: [s.players[1], s.players[0]],
      moves: [],
      phase: 'play',
      winner: null,
      end: null,
      line: [],
      seq: 1,
      round: s.round + 1,
    }
  }

  if (me === null) throw new RuleError('이 판의 플레이어가 아니에요')

  // 진 판도 무를 수 있다.
  if (action.type === 'undo') {
    let mine = s.moves.length - 1
    while (mine >= 0 && mine % 2 !== me) mine--
    if (mine < 0) throw new RuleError('무를 수가 없어요')
    return { ...s, moves: s.moves.slice(0, mine), phase: 'play', winner: null, end: null, line: [], seq: s.seq + 1 }
  }

  if (s.phase === 'over') throw new RuleError('게임이 끝났어요')

  if (action.type === 'resign') {
    s.phase = 'over'
    s.winner = (1 - me) as Color
    s.end = 'resign'
    s.seq += 1
    return s
  }

  if (turnOf(s) !== me) throw new RuleError('내 차례가 아니에요')
  const { at } = action
  if (!Number.isInteger(at) || at < 0 || at >= s.size * s.size) throw new RuleError('판 밖이에요')
  const b = boardOf(s)
  if (b[at] !== EMPTY) throw new RuleError('이미 돌이 있어요')
  const bad = me === BLACK ? forbiddenAt(b, s.size, at, s.rule) : null
  if (bad) throw new RuleError(`${FORBIDDEN_LABEL[bad]} 금수 자리예요`)

  b[at] = me
  s.moves = [...s.moves, at]
  s.seq += 1
  const line = fiveLine(b, s.size, at, me, exactFive(s.rule, me))
  if (line.length) {
    s.phase = 'over'
    s.winner = me
    s.end = 'five'
    s.line = line
  } else if (s.moves.length === s.size * s.size) {
    s.phase = 'over'
    s.end = 'draw'
  }
  return s
}

export function seededRng(seed: number): () => number {
  let x = seed >>> 0 || 1
  return () => {
    x ^= x << 13
    x >>>= 0
    x ^= x >>> 17
    x ^= x << 5
    x >>>= 0
    return x / 0x100000000
  }
}
