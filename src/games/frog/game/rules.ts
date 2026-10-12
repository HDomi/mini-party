// 깜짝 개구리 규칙. 방(transaction)과 봇이 같은 reducer 를 쓴다.
//
// 통에 구멍이 HOLES 개 있고, 그중 하나에 칼을 꽂으면 개구리가 튀어나온다. 그 칼을 꽂은 사람이 당첨이다.
// 당첨 구멍은 상태에 저장하지 않는다(누구나 DB 를 읽을 수 있으므로 저장하면 미리 알 수 있다).
// 대신 꽂을 때마다 남은 구멍 수 n 에 대해 1/n 확률로 튀어나온다. 처음에 한 구멍을 몰래 정해 두는 것과 확률이 같다.

export const HOLES = 24
export const MAX_PLAYERS = 4

export interface Stab {
  hole: number
  by: string
  /** 이 칼을 꽂아 만든 상태의 `seq`. 화면이 이 값으로 새 칼인지 알아본다. */
  seq: number
  /** 자리를 비운 사람 대신 꽂았다. */
  auto: boolean
}

export interface GameState {
  /** 차례 순서. */
  players: string[]
  names: Record<string, string>
  /** 플레이어마다 로비 자리(0~3). 칼 색을 정한다. */
  slots: Record<string, number>
  current: number
  stabs: Stab[]
  /** 차례인 사람이 고르고 있는 구멍. 다른 사람 화면에 보인다. */
  aim: number | null
  phase: 'play' | 'over'
  /** 개구리를 튀어나오게 한 사람. */
  loser: string | null
  /** 차례가 넘어갈 때마다 올라간다. 대신 꽂기(`auto`)가 늦게 도착해도 한 번만 처리된다. */
  turn: number
  seq: number
  /** 한 판 더 할 때마다 올라간다. 화면이 이 값으로 다시 마운트된다. */
  round: number
}

export type Action =
  | { type: 'aim'; by: string; hole: number | null }
  | { type: 'stab'; by: string; hole: number }
  /** 차례인 사람이 나가 있으면 누구나 대신 아무 구멍에 꽂는다. `turn` 이 맞을 때만 처리된다. */
  | { type: 'auto'; by: string; turn: number }
  /** 같은 사람들로 새 판. 당첨된 사람이 먼저 꽂는다. */
  | { type: 'rematch'; by: string }

export class RuleError extends Error {}

/** 이미 처리된 요청(예: 늦게 도착한 대신 꽂기). 메시지가 비어 있어 사용자에게 보이지 않는다. */
export class StaleError extends RuleError {
  constructor() {
    super('')
  }
}

export type Rng = () => number

export interface Entrant {
  id: string
  name: string
  slot: number
}

export function createGame(opts: { players: Entrant[] }, rng: Rng = Math.random): GameState {
  const sorted = [...opts.players].sort((a, b) => a.slot - b.slot)
  const k = Math.floor(rng() * sorted.length)
  const order = [...sorted.slice(k), ...sorted.slice(0, k)].map((p) => p.id)
  return newRound(
    order,
    Object.fromEntries(sorted.map((p) => [p.id, p.name])),
    Object.fromEntries(sorted.map((p) => [p.id, p.slot])),
    0,
  )
}

function newRound(players: string[], names: Record<string, string>, slots: Record<string, number>, round: number): GameState {
  return { players, names, slots, current: 0, stabs: [], aim: null, phase: 'play', loser: null, turn: 1, seq: 1, round }
}

export const currentPlayer = (s: GameState): string => s.players[s.current]
export const openHoles = (s: GameState): number[] => {
  const used = new Set(s.stabs.map((x) => x.hole))
  return Array.from({ length: HOLES }, (_, i) => i).filter((i) => !used.has(i))
}

function stab(s: GameState, hole: number, auto: boolean, rng: Rng): GameState {
  if (!Number.isInteger(hole) || hole < 0 || hole >= HOLES) throw new RuleError('없는 구멍이에요')
  if (s.stabs.some((x) => x.hole === hole)) throw new RuleError('이미 칼이 꽂힌 구멍이에요')
  const by = currentPlayer(s)
  const left = HOLES - s.stabs.length
  const popped = rng() * left < 1
  const seq = s.seq + 1
  const next: GameState = { ...s, stabs: [...s.stabs, { hole, by, seq, auto }], aim: null, seq, turn: s.turn + 1 }
  if (popped) return { ...next, phase: 'over', loser: by }
  return { ...next, current: (s.current + 1) % s.players.length }
}

/** 순수 reducer(튀어나올지는 `rng`). 새 state 를 반환하거나 RuleError 를 던진다. */
export function applyAction(s: GameState, a: Action, rng: Rng = Math.random): GameState {
  if (a.type === 'rematch') {
    if (s.phase !== 'over') throw new RuleError('아직 게임 중이에요')
    const k = s.loser ? s.players.indexOf(s.loser) : 0
    const order = [...s.players.slice(k), ...s.players.slice(0, k)]
    return newRound(order, s.names, s.slots, s.round + 1)
  }
  if (s.phase !== 'play') throw new RuleError('게임이 끝났어요')
  if (a.type === 'auto') {
    if (a.turn !== s.turn) throw new StaleError()
    const open = openHoles(s)
    return stab(s, open[Math.floor(rng() * open.length)], true, rng)
  }
  if (!s.players.includes(a.by)) throw new RuleError('이 판의 플레이어가 아니에요')
  if (currentPlayer(s) !== a.by) throw new RuleError('내 차례가 아니에요')
  if (a.type === 'aim') {
    if (a.hole !== null && (!Number.isInteger(a.hole) || a.hole < 0 || a.hole >= HOLES)) throw new RuleError('없는 구멍이에요')
    return { ...s, aim: a.hole, seq: s.seq + 1 }
  }
  return stab(s, a.hole, false, rng)
}

export function seededRng(seed: number): Rng {
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
