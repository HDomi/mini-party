import {
  analyze,
  BLACK,
  boardOf,
  colorOf,
  DIRS,
  EMPTY,
  forbiddenAt,
  type Board,
  type Color,
  type GameState,
  type Rule,
  type Shape,
} from './rules'

// 오목 봇. 후보 자리마다 "내가 두면 생기는 모양"과 "상대가 두면 생기는 모양"을 점수로 매긴다.
// 오목·열린 4·4-3 같은 결정적인 모양은 단계(tier)로 먼저 가르고, 나머지는 5칸 창(window) 점수로 비교한다.
// 어려움은 여기에 상대의 가장 좋은 응수를 한 수 더 내다본다.

export type BotLevel = 'easy' | 'normal' | 'hard'

/** 5칸 창 안에 상대 돌 없이 내 돌이 n 개 있을 때의 점수. */
const WINDOW = [0, 2, 24, 240, 2600, 0]

interface Ctx {
  b: Board
  size: number
  rule: Rule
}

/** 돌 주변 두 칸 안의 빈칸. 판이 비었으면 한가운데. */
function candidates({ b, size }: Ctx): number[] {
  const out: number[] = []
  for (let p = 0; p < b.length; p++) {
    if (b[p] !== EMPTY) continue
    const x = p % size
    const y = (p - x) / size
    let near = false
    for (let dy = -2; dy <= 2 && !near; dy++)
      for (let dx = -2; dx <= 2 && !near; dx++) {
        const nx = x + dx
        const ny = y + dy
        if (nx >= 0 && ny >= 0 && nx < size && ny < size && b[ny * size + nx] !== EMPTY) near = true
      }
    if (near) out.push(p)
  }
  return out.length ? out : [Math.floor(size / 2) * size + Math.floor(size / 2)]
}

function windowScore({ b, size }: Ctx, p: number, color: Color): number {
  const x = p % size
  const y = (p - x) / size
  let total = 0
  for (const [dx, dy] of DIRS) {
    for (let start = -4; start <= 0; start++) {
      let mine = 1
      let ok = true
      for (let k = start; k < start + 5 && ok; k++) {
        if (k === 0) continue
        const nx = x + k * dx
        const ny = y + k * dy
        if (nx < 0 || ny < 0 || nx >= size || ny >= size) ok = false
        else {
          const v = b[ny * size + nx]
          if (v === color) mine++
          else if (v !== EMPTY) ok = false
        }
      }
      if (ok) total += WINDOW[Math.min(mine, 4)]
    }
  }
  return total
}

const winning = (s: Shape) => s.openFours > 0 || s.fours >= 2 || (s.fours >= 1 && s.threes >= 1)

/** 흑이 렌주룰에서 둘 수 없는 자리는 위협도 아니다. */
function canPlay(ctx: Ctx, p: number, color: Color): boolean {
  return color !== BLACK || !forbiddenAt(ctx.b, ctx.size, p, ctx.rule)
}

/** `me` 가 `p` 에 두는 가치. */
function score(ctx: Ctx, p: number, me: Color): number {
  const opp = (1 - me) as Color
  const mine = analyze(ctx.b, ctx.size, p, me, ctx.rule)
  const theirs = canPlay(ctx, p, opp) ? analyze(ctx.b, ctx.size, p, opp, ctx.rule) : null

  if (mine.five) return 1e9
  if (theirs?.five) return 1e8
  if (winning(mine)) return 1e7 + mine.fours * 1000
  if (theirs && winning(theirs)) return 1e6 + theirs.fours * 1000
  let v = windowScore(ctx, p, me) + windowScore(ctx, p, opp) * 0.85
  v += mine.fours * 2200 + mine.threes * 1800
  if (mine.threes >= 2) v += 5e5
  if (theirs) {
    v += theirs.fours * 900 + theirs.threes * 1500
    if (theirs.threes >= 2) v += 4e5
  }
  return v
}

function ranked(ctx: Ctx, me: Color): { p: number; v: number }[] {
  return candidates(ctx)
    .filter((p) => canPlay(ctx, p, me))
    .map((p) => ({ p, v: score(ctx, p, me) }))
    .sort((a, b) => b.v - a.v)
}

/** 판 전체의 5칸 창을 세서 `me` 쪽이 얼마나 유리한지. 다음 차례인 상대 쪽 창에 가중치를 더 준다. */
function evaluate({ b, size }: Ctx, me: Color): number {
  let total = 0
  for (const [dx, dy] of DIRS) {
    for (let y = 0; y < size; y++)
      for (let x = 0; x < size; x++) {
        const ex = x + 4 * dx
        const ey = y + 4 * dy
        if (ex < 0 || ey < 0 || ex >= size || ey >= size) continue
        let mine = 0
        let theirs = 0
        for (let k = 0; k < 5; k++) {
          const v = b[(y + k * dy) * size + (x + k * dx)]
          if (v === me) mine++
          else if (v !== EMPTY) theirs++
        }
        if (mine && !theirs) total += WINDOW[Math.min(mine, 4)]
        else if (theirs && !mine) total -= WINDOW[Math.min(theirs, 4)] * 1.3
      }
  }
  return total
}

/** 두 수 앞: 내 수 후보마다 상대의 좋은 응수들을 두어 보고, 가장 나쁜 경우가 가장 나은 수를 고른다. */
function lookahead(ctx: Ctx, list: { p: number; v: number }[], me: Color): number {
  const opp = (1 - me) as Color
  let best = list[0].p
  let bestV = -Infinity
  for (const { p } of list.slice(0, 8)) {
    ctx.b[p] = me
    const replies = ranked(ctx, opp)
    let worst = Infinity
    // 상대가 바로 이기거나(1e9) 막을 수 없는 모양을 만든다(1e7). 1e8 은 내 오목을 막는 수라 괜찮다.
    const top = replies[0]?.v ?? 0
    if (top >= 1e9 || (top >= 1e7 && top < 1e8)) worst = -1e9
    else
      for (const { p: r } of replies.slice(0, 6)) {
        ctx.b[r] = opp
        const next = ranked(ctx, me)[0]?.v ?? 0
        const v = next >= 1e7 ? 1e8 : evaluate(ctx, me)
        ctx.b[r] = EMPTY
        worst = Math.min(worst, v)
      }
    ctx.b[p] = EMPTY
    if (worst > bestV) {
      bestV = worst
      best = p
    }
  }
  return best
}

/** 봇이 둘 칸. 둘 곳이 없으면 null. */
export function botMove(s: GameState, botId: string, level: BotLevel, rng: () => number = Math.random): number | null {
  const me = colorOf(s, botId)
  if (me === null || s.phase !== 'play') return null
  const ctx: Ctx = { b: boardOf(s), size: s.size, rule: s.rule }
  const list = ranked(ctx, me)
  if (!list.length) return null
  if (s.moves.length === 0) return list[0].p

  if (level === 'easy') {
    // 이길 수는 대체로 보지만, 막는 건 자주 놓친다.
    if (list[0].v >= 1e9 && rng() < 0.8) return list[0].p
    if (rng() < 0.35) return list[Math.floor(rng() * list.length)].p
    const top = list.slice(0, 4)
    return top[Math.floor(rng() * top.length)].p
  }

  // 결정적인 수가 있으면 내다볼 필요가 없다.
  if (list[0].v >= 1e6) return list[0].p
  if (level === 'normal') {
    const close = list.filter((c) => c.v >= list[0].v * 0.9).slice(0, 3)
    return close[Math.floor(rng() * close.length)].p
  }
  return lookahead(ctx, list, me)
}
