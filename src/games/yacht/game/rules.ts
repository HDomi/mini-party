// 요트 다이스 규칙. 방(transaction)과 봇이 같은 reducer 를 쓴다.
//
// 차례마다 주사위 5개를 세 번까지 굴린다. 굴리는 사이에 남길 주사위를 잡고, 마지막에 빈 족보 하나에 점수를 적는다.
// 모두 12칸을 채우면 끝난다. 주사위 눈은 `applyAction` 에 넘긴 rng 로 정한다(방은 Math.random).

export const DICE = 5
export const MAX_ROLLS = 3
export const MAX_PLAYERS = 6
/** 윗칸(1~6) 합이 이 이상이면 보너스. */
export const BONUS_AT = 63
export const BONUS = 35

export const CATS = [
  'ones',
  'twos',
  'threes',
  'fours',
  'fives',
  'sixes',
  'choice',
  'fourKind',
  'fullHouse',
  'smallStraight',
  'largeStraight',
  'yacht',
] as const
export type Cat = (typeof CATS)[number]
/** 윗칸은 `CATS` 의 앞 여섯 개다. 칸 번호 + 1 이 그 칸의 눈이다. */
export const UPPER = 6

export const CAT_LABEL: Record<Cat, string> = {
  ones: '에이스',
  twos: '듀스',
  threes: '트레이',
  fours: '포',
  fives: '파이브',
  sixes: '식스',
  choice: '초이스',
  fourKind: '포 카드',
  fullHouse: '풀 하우스',
  smallStraight: 'S. 스트레이트',
  largeStraight: 'L. 스트레이트',
  yacht: '요트',
}

export const CAT_HINT: Record<Cat, string> = {
  ones: '1의 눈 합',
  twos: '2의 눈 합',
  threes: '3의 눈 합',
  fours: '4의 눈 합',
  fives: '5의 눈 합',
  sixes: '6의 눈 합',
  choice: '다섯 눈의 합',
  fourKind: '같은 눈 4개 이상이면 다섯 눈의 합',
  fullHouse: '같은 눈 3개 + 2개면 다섯 눈의 합',
  smallStraight: '이어진 눈 4개면 15점',
  largeStraight: '이어진 눈 5개면 30점',
  yacht: '다섯 눈이 모두 같으면 50점',
}

export interface GameState {
  /** 차례 순서. */
  players: string[]
  names: Record<string, string>
  /** 플레이어마다 `CATS` 순서의 점수. 아직 안 적은 칸은 null. */
  scores: Record<string, (number | null)[]>
  /** 기권한 플레이어. 차례에서 빠진다. */
  out: string[]
  current: number
  dice: number[]
  held: boolean[]
  /** 이번 차례에 굴린 횟수. 0이면 아직 안 굴렸다(주사위는 앞사람 것이 그대로 보인다). */
  rolls: number
  /** 마지막 굴림. 화면이 `seq` 로 새 굴림인지 알아보고 `seed` 로 주사위가 멈출 자리를 정한다. */
  roll: { seq: number; by: string; rolled: number[]; seed: number } | null
  /** 마지막으로 적은 점수. `auto` 면 자리를 비운 사람 대신 적었다. */
  last: { seq: number; by: string; cat: Cat; score: number; auto: boolean } | null
  /** 차례가 넘어갈 때마다 올라간다. 대신 두기(`auto`)가 늦게 도착해도 한 번만 처리된다. */
  turn: number
  phase: 'play' | 'over'
  /** 가장 높은 점수의 플레이어들(동점이면 여럿). */
  winners: string[]
  end: 'done' | 'resign' | null
  seq: number
  /** 한 판 더 할 때마다 올라간다. 화면이 이 값으로 다시 마운트된다. */
  round: number
}

export type Action =
  /** `held` 인 주사위는 남기고 나머지를 굴린다. */
  | { type: 'roll'; by: string; held: boolean[] }
  /** 굴리기 전에 잡은 주사위를 다른 사람에게 보여 준다. */
  | { type: 'hold'; by: string; held: boolean[] }
  | { type: 'score'; by: string; cat: Cat }
  /** 차례인 사람이 나가 있으면 누구나 대신 굴리고 가장 높은 칸에 적는다. `turn` 이 맞을 때만 처리된다. */
  | { type: 'auto'; by: string; turn: number }
  | { type: 'resign'; by: string }
  /** 같은 사람들로 새 판. 먼저 굴리는 사람이 한 칸씩 밀린다. */
  | { type: 'rematch'; by: string }

export class RuleError extends Error {}

/** 이미 처리된 요청(예: 늦게 도착한 대신 두기). 메시지가 비어 있어 사용자에게 보이지 않는다. */
export class StaleError extends RuleError {
  constructor() {
    super('')
  }
}

export type Rng = () => number

const NO_HOLD = (): boolean[] => Array(DICE).fill(false)

export function createGame(opts: { players: { id: string; name: string }[] }, rng: Rng = Math.random): GameState {
  const order = opts.players.map((p) => p.id)
  for (let i = order.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1))
    ;[order[i], order[j]] = [order[j], order[i]]
  }
  const names = Object.fromEntries(opts.players.map((p) => [p.id, p.name]))
  return newRound(order, names, 0)
}

function newRound(players: string[], names: Record<string, string>, round: number): GameState {
  return {
    players,
    names,
    scores: Object.fromEntries(players.map((id) => [id, CATS.map(() => null)])),
    out: [],
    current: 0,
    dice: [1, 2, 3, 4, 5],
    held: NO_HOLD(),
    rolls: 0,
    roll: null,
    last: null,
    turn: 1,
    phase: 'play',
    winners: [],
    end: null,
    seq: 1,
    round,
  }
}

export const currentPlayer = (s: GameState): string => s.players[s.current]
export const active = (s: GameState): string[] => s.players.filter((id) => !s.out.includes(id))

/** 눈마다 개수. `counts[v]` 가 눈 v 의 개수다(0번은 비운다). */
export function countsOf(dice: number[]): number[] {
  const c = [0, 0, 0, 0, 0, 0, 0]
  for (const v of dice) c[v]++
  return c
}

/** 눈 개수(`countsOf`)로 계산한 칸 점수. 봇이 같은 눈 조합을 여러 번 계산하므로 개수를 받는다. */
export function scoreCounts(cat: Cat, c: number[]): number {
  const i = CATS.indexOf(cat)
  if (i < UPPER) return c[i + 1] * (i + 1)
  let sum = 0
  for (let v = 1; v <= 6; v++) sum += c[v] * v
  const most = Math.max(...c)
  const run = (from: number, len: number) => {
    for (let v = from; v < from + len; v++) if (!c[v]) return false
    return true
  }
  switch (cat) {
    case 'choice':
      return sum
    case 'fourKind':
      return most >= 4 ? sum : 0
    case 'fullHouse':
      return c.includes(3) && c.includes(2) ? sum : 0
    case 'smallStraight':
      return run(1, 4) || run(2, 4) || run(3, 4) ? 15 : 0
    case 'largeStraight':
      return run(1, 5) || run(2, 5) ? 30 : 0
    case 'yacht':
      return most === 5 ? 50 : 0
  }
  return 0
}

export const scoreOf = (cat: Cat, dice: number[]) => scoreCounts(cat, countsOf(dice))

export interface Totals {
  upper: number
  bonus: number
  lower: number
  total: number
}

export function totalsOf(sheet: (number | null)[]): Totals {
  let upper = 0
  let lower = 0
  sheet.forEach((v, i) => {
    if (i < UPPER) upper += v ?? 0
    else lower += v ?? 0
  })
  const bonus = upper >= BONUS_AT ? BONUS : 0
  return { upper, bonus, lower, total: upper + bonus + lower }
}

/** 보너스를 받을 수 없게 됐는지. 남은 윗칸을 모두 다섯 개로 채워도 모자라면 그렇다. */
export function bonusLost(sheet: (number | null)[]): boolean {
  let best = 0
  for (let i = 0; i < UPPER; i++) best += sheet[i] ?? (i + 1) * DICE
  return best < BONUS_AT
}

/** 순위. 높은 점수부터, 기권한 사람은 맨 뒤. 같은 점수면 같은 등수다. */
export function ranking(s: GameState): { id: string; total: number; place: number; out: boolean }[] {
  const rows = s.players.map((id) => ({ id, total: totalsOf(s.scores[id]).total, out: s.out.includes(id), place: 0 }))
  rows.sort((a, b) => Number(a.out) - Number(b.out) || b.total - a.total)
  rows.forEach((r, i) => {
    const prev = rows[i - 1]
    r.place = prev && prev.out === r.out && prev.total === r.total ? prev.place : i + 1
  })
  return rows
}

/** 빈칸 중 지금 주사위로 점수가 가장 높은 칸. 같으면 앞 칸이다. */
export function bestOpenCat(sheet: (number | null)[], dice: number[]): Cat {
  const c = countsOf(dice)
  let best: Cat | null = null
  let bestScore = -1
  CATS.forEach((cat, i) => {
    if (sheet[i] !== null) return
    const v = scoreCounts(cat, c)
    if (v > bestScore) {
      best = cat
      bestScore = v
    }
  })
  return best!
}

function validHeld(held: unknown): held is boolean[] {
  return Array.isArray(held) && held.length === DICE && held.every((h) => typeof h === 'boolean')
}

function requireTurn(s: GameState, by: string) {
  if (s.players[s.current] !== by) throw new RuleError('내 차례가 아니에요')
}

function roll(s: GameState, by: string, held: boolean[], rng: Rng): GameState {
  if (s.rolls >= MAX_ROLLS) throw new RuleError('세 번 다 굴렸어요. 점수를 적어 주세요')
  // 처음 굴릴 때는 앞사람 주사위를 잡을 수 없다.
  const keep = s.rolls === 0 ? NO_HOLD() : held
  const rolled: number[] = []
  const dice = s.dice.map((v, i) => {
    if (keep[i]) return v
    rolled.push(i)
    return 1 + Math.floor(rng() * 6)
  })
  if (rolled.length === 0) throw new RuleError('굴릴 주사위가 없어요')
  const seq = s.seq + 1
  return { ...s, dice, held: keep, rolls: s.rolls + 1, roll: { seq, by, rolled, seed: Math.floor(rng() * 2 ** 31) }, seq }
}

function write(s: GameState, cat: Cat, auto: boolean): GameState {
  const by = currentPlayer(s)
  const i = CATS.indexOf(cat)
  if (i === -1) throw new RuleError('없는 칸이에요')
  if (s.rolls === 0) throw new RuleError('먼저 주사위를 굴려 주세요')
  if (s.scores[by][i] !== null) throw new RuleError('이미 적은 칸이에요')
  const score = scoreOf(cat, s.dice)
  const sheet = [...s.scores[by]]
  sheet[i] = score
  const seq = s.seq + 1
  return advance({ ...s, scores: { ...s.scores, [by]: sheet }, last: { seq, by, cat, score, auto }, seq })
}

/** 다음 사람에게 차례를 넘기거나, 모두 다 채웠으면 끝낸다. */
function advance(s: GameState): GameState {
  const left = active(s)
  if (left.every((id) => s.scores[id].every((v) => v !== null))) return finish(s, 'done')
  let next = s.current
  do next = (next + 1) % s.players.length
  while (s.out.includes(s.players[next]))
  return { ...s, current: next, held: NO_HOLD(), rolls: 0, turn: s.turn + 1 }
}

function finish(s: GameState, end: 'done' | 'resign'): GameState {
  const left = active(s)
  const top = Math.max(...left.map((id) => totalsOf(s.scores[id]).total))
  const winners = left.filter((id) => totalsOf(s.scores[id]).total === top)
  return { ...s, phase: 'over', end, winners, held: NO_HOLD(), turn: s.turn + 1 }
}

function resign(s: GameState, by: string): GameState {
  if (s.out.includes(by)) throw new RuleError('이미 기권했어요')
  const wasTurn = currentPlayer(s) === by
  const next: GameState = { ...s, out: [...s.out, by], seq: s.seq + 1 }
  const left = active(next)
  // 여럿이 하던 판에서 한 명만 남으면 그 사람이 이긴다. 혼자 하던 판이면 그냥 끝난다.
  if (left.length === 0) return { ...next, phase: 'over', end: 'resign', winners: [], turn: s.turn + 1 }
  if (left.length === 1 && s.players.length > 1) return { ...next, phase: 'over', end: 'resign', winners: left, held: NO_HOLD(), turn: s.turn + 1 }
  return wasTurn ? advance(next) : next
}

/** 순수 reducer(주사위 눈은 `rng`). 새 state 를 반환하거나 RuleError 를 던진다. */
export function applyAction(s: GameState, a: Action, rng: Rng = Math.random): GameState {
  if (a.type === 'rematch') {
    if (s.phase !== 'over') throw new RuleError('아직 게임 중이에요')
    return newRound([...s.players.slice(1), s.players[0]], s.names, s.round + 1)
  }
  if (s.phase !== 'play') throw new RuleError('게임이 끝났어요')
  if (a.type === 'auto') {
    if (a.turn !== s.turn) throw new StaleError()
    const rolled = s.rolls === 0 ? roll(s, currentPlayer(s), NO_HOLD(), rng) : s
    return write(rolled, bestOpenCat(rolled.scores[currentPlayer(s)], rolled.dice), true)
  }
  if (!s.players.includes(a.by)) throw new RuleError('이 판의 플레이어가 아니에요')
  if (a.type === 'resign') return resign(s, a.by)
  requireTurn(s, a.by)
  switch (a.type) {
    case 'roll':
      if (!validHeld(a.held)) throw new RuleError('잘못된 주사위예요')
      return roll(s, a.by, a.held, rng)
    case 'hold':
      if (!validHeld(a.held)) throw new RuleError('잘못된 주사위예요')
      if (s.rolls === 0) throw new RuleError('먼저 주사위를 굴려 주세요')
      if (s.rolls >= MAX_ROLLS) throw new RuleError('세 번 다 굴렸어요. 점수를 적어 주세요')
      return { ...s, held: a.held, seq: s.seq + 1 }
    case 'score':
      return write(s, a.cat, false)
  }
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
