// 요트 다이스 봇. 주사위 눈의 조합(순서 없는 다섯 개, 252가지)만 보고 정한다.
//
// - hard: 남은 굴림을 모두 내다보고, 남길 주사위마다 마지막에 적을 칸 가치의 기댓값을 정확히 계산해 가장 큰 쪽을 남긴다.
// - normal: 같은 방식이지만 다음 한 번만 내다본다.
// - easy: 가장 많은 눈을 남기고, 지금 점수가 가장 높은 칸에 적는다.
//
// 칸 가치는 점수에서 그 칸을 나중에 썼을 때 기대하는 점수를 뺀 값이다. 윗칸은 보너스(63점)를 향해 가는지도 더한다.

import { BONUS_AT, CATS, DICE, MAX_ROLLS, UPPER, bestOpenCat, countsOf, currentPlayer, scoreCounts, totalsOf, type Cat, type GameState, type Rng } from './rules'

export type BotLevel = 'easy' | 'normal' | 'hard'

export type BotStep = { type: 'roll'; held: boolean[] } | { type: 'score'; cat: Cat }

/** 그 칸을 아껴 뒀다가 나중에 쓰면 대략 받는 점수. */
const BASE: Record<Cat, number> = {
  ones: 2.5,
  twos: 5,
  threes: 7.5,
  fours: 10,
  fives: 12.5,
  sixes: 15,
  choice: 23,
  fourKind: 13,
  fullHouse: 14,
  smallStraight: 10,
  largeStraight: 12,
  yacht: 8,
}
/** 윗칸에서 눈 세 개(보너스 기준)보다 많거나 적게 적은 점수 1점의 무게. */
const PAR_WEIGHT = 0.55
/** 이 칸으로 보너스가 확정될 때 더하는 값. */
const BONUS_REACHED = 25

// ── 눈 조합 ──
// 눈 v 의 개수를 6진법 v-1 번째 자리에 둔 수를 key 로 쓴다(0 ~ 6^6).

const KEYS = 6 ** 6

/** 개수 배열(0번은 비움, `countsOf` 와 같은 모양). */
type Counts = number[]

const keyOf = (c: Counts) => c[1] + c[2] * 6 + c[3] * 36 + c[4] * 216 + c[5] * 1296 + c[6] * 7776

/** 크기 n 인 모든 조합. */
const BY_SIZE: Counts[][] = Array.from({ length: DICE + 1 }, () => [])
;(function gen(v: number, left: number, c: Counts) {
  if (v === 7) {
    BY_SIZE[DICE - left].push([...c])
    return
  }
  for (let k = 0; k <= left; k++) {
    c[v] = k
    gen(v + 1, left - k, c)
  }
  c[v] = 0
})(1, DICE, [0, 0, 0, 0, 0, 0, 0])

const FACT = [1, 1, 2, 6, 24, 120]

/** n 개를 굴려 나오는 조합과 그 확률. */
const OUTCOMES: { c: Counts; p: number }[][] = BY_SIZE.map((list, n) =>
  list.map((c) => {
    let ways = FACT[n]
    for (let v = 1; v <= 6; v++) ways /= FACT[c[v]]
    return { c, p: ways / 6 ** n }
  }),
)

/** `c` 에서 남길 수 있는 모든 부분 조합. */
function subsets(c: Counts): Counts[] {
  const out: Counts[] = []
  const k = [0, 0, 0, 0, 0, 0, 0]
  ;(function go(v: number) {
    if (v === 7) return void out.push([...k])
    for (let n = 0; n <= c[v]; n++) {
      k[v] = n
      go(v + 1)
    }
    k[v] = 0
  })(1)
  return out
}

const size = (c: Counts) => c[1] + c[2] + c[3] + c[4] + c[5] + c[6]
const add = (a: Counts, b: Counts) => a.map((v, i) => v + b[i])

// ── 칸 가치 ──

/** 지금 점수표에서 다섯 눈 조합 `c` 로 적을 수 있는 가장 좋은 칸과 그 가치. */
function bestCat(sheet: (number | null)[], c: Counts): { cat: Cat; value: number } {
  const upper = totalsOf(sheet).upper
  let best: Cat = CATS[0]
  let value = -Infinity
  CATS.forEach((cat, i) => {
    if (sheet[i] !== null) return
    const score = scoreCounts(cat, c)
    let v = score - BASE[cat]
    if (i < UPPER && upper < BONUS_AT) {
      v += (score - 3 * (i + 1)) * PAR_WEIGHT
      if (upper + score >= BONUS_AT) v += BONUS_REACHED
    }
    if (v > value) {
      best = cat
      value = v
    }
  })
  return { cat: best, value }
}

/**
 * 남은 굴림 수(`left`)마다 다섯 눈 조합의 가치 `V` 와, 남긴 조합의 기댓값 `E` 를 필요할 때 계산해 기억한다.
 * V[0](m) = 칸 가치, V[r](m) = max_{k ⊆ m} E[r-1](k), E[r](k) = Σ p(o) V[r](k + o).
 */
class Planner {
  private v: Float64Array[]
  private e: Float64Array[]

  constructor(
    private sheet: (number | null)[],
    depth: number,
  ) {
    this.v = Array.from({ length: depth + 1 }, () => new Float64Array(KEYS).fill(NaN))
    this.e = Array.from({ length: depth + 1 }, () => new Float64Array(KEYS).fill(NaN))
  }

  value(m: Counts, left: number): number {
    const key = keyOf(m)
    const memo = this.v[left]
    if (!Number.isNaN(memo[key])) return memo[key]
    let out: number
    if (left === 0) out = bestCat(this.sheet, m).value
    else {
      out = -Infinity
      for (const k of subsets(m)) out = Math.max(out, this.expect(k, left - 1))
    }
    memo[key] = out
    return out
  }

  /** 조합 `k` 를 남기고 나머지를 굴린 뒤, 굴림이 `left` 번 남은 상태의 기댓값. */
  expect(k: Counts, left: number): number {
    const key = keyOf(k)
    const memo = this.e[left]
    if (!Number.isNaN(memo[key])) return memo[key]
    let out = 0
    for (const o of OUTCOMES[DICE - size(k)]) out += o.p * this.value(add(k, o.c), left)
    memo[key] = out
    return out
  }
}

/** 남길 조합 `keep` 을 실제 주사위 자리로 바꾼다. 이미 잡혀 있던 주사위를 먼저 남긴다. */
function heldFor(dice: number[], held: boolean[], keep: Counts): boolean[] {
  const left = [...keep]
  const out = dice.map(() => false)
  const order = dice.map((_, i) => i).sort((a, b) => Number(held[b]) - Number(held[a]))
  for (const i of order) {
    if (left[dice[i]] > 0) {
      left[dice[i]]--
      out[i] = true
    }
  }
  return out
}

/** 가장 많은 눈(같으면 큰 눈)을 남긴다. 이어진 눈이 넷 이상이면 그걸 남긴다. */
function greedyKeep(c: Counts): Counts {
  const runs = [
    [1, 5],
    [2, 5],
    [1, 4],
    [2, 4],
    [3, 4],
  ]
  for (const [from, len] of runs) {
    const k = [0, 0, 0, 0, 0, 0, 0]
    for (let v = from; v < from + len; v++) k[v] = 1
    if (k.every((n, v) => c[v] >= n)) return k
  }
  let face = 6
  for (let v = 6; v >= 1; v--) if (c[v] > c[face]) face = v
  const k = [0, 0, 0, 0, 0, 0, 0]
  k[face] = c[face]
  return k
}

/** 차례인 봇이 할 일. 아직 안 굴렸으면 굴린다. */
export function botStep(s: GameState, level: BotLevel, rng: Rng = Math.random): BotStep {
  const id = currentPlayer(s)
  const sheet = s.scores[id]
  if (s.rolls === 0) return { type: 'roll', held: s.dice.map(() => false) }
  const c = countsOf(s.dice)
  const left = MAX_ROLLS - s.rolls

  if (level === 'easy') {
    // 가끔은 더 굴릴 수 있어도 그냥 적는다.
    if (left > 0 && rng() < 0.85) {
      const keep = greedyKeep(c)
      if (size(keep) < DICE) return { type: 'roll', held: heldFor(s.dice, s.held, keep) }
    }
    return { type: 'score', cat: bestOpenCat(sheet, s.dice) }
  }

  if (left > 0) {
    const depth = level === 'hard' ? left : 1
    const plan = new Planner(sheet, depth)
    let best = c
    let bestValue = plan.value(c, 0)
    for (const k of subsets(c)) {
      if (size(k) === DICE) continue
      const v = plan.expect(k, depth - 1)
      if (v > bestValue + 1e-9) {
        best = k
        bestValue = v
      }
    }
    if (size(best) < DICE) return { type: 'roll', held: heldFor(s.dice, s.held, best) }
  }
  return { type: 'score', cat: bestCat(sheet, c).cat }
}
