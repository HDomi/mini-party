import {
  applyAction,
  currentPlayer,
  destination,
  GOAL,
  HOME,
  legalMoves,
  movableGroups,
  RESULT_STEPS,
  type Action,
  type GameState,
  type Piece,
  type Result,
} from './rules'

// 혼자하기용 상대. 경우를 손으로 짤 필요가 없다: 남은 던지기 결과를 쓰는 모든 합법적인 방법을
// 실제 reducer 로 진행해 보고, 그 결과로 나온 판을 채점한다.

export type BotLevel = 'easy' | 'normal' | 'hard'

/** 공정한 윷가락 네 개로 던질 때 각 결과의 확률 (throwSticks 참고). */
export const THROW_ODDS: Record<Result, number> = {
  backdo: 1 / 16,
  do: 3 / 16,
  gae: 6 / 16,
  geol: 4 / 16,
  yut: 1 / 16,
  mo: 1 / 16,
}
const RESULTS = Object.keys(THROW_ODDS) as Result[]
const AVG_STEPS = RESULTS.reduce((sum, r) => sum + THROW_ODDS[r] * RESULT_STEPS[r], 0)

interface Tuning {
  /** 봇이 아무 합법적인 수나 그냥 두는 턴의 비율. */
  random: number
  /** 다음 턴에 자기 말이 잡히는 것을 얼마나 경계하는지. */
  danger: number
  /** 다음 턴에 잡을 수 있는 자리를 만들어 두는 것을 얼마나 중시하는지. */
  threat: number
}

const LEVELS: Record<BotLevel, Tuning> = {
  easy: { random: 0.4, danger: 0, threat: 0 },
  normal: { random: 0.1, danger: 0.5, threat: 0.15 },
  hard: { random: 0, danger: 1, threat: 0.3 },
}

/** 추가 던지기 한 번의 가치 (던지기 횟수 단위). */
const EXTRA_THROW = 1
const WIN = 1e6
/** 긴 윷/모 연쇄에서 탐색 깊이를 제한한다. 이를 넘으면 판을 현재 상태 그대로 채점한다. */
const SEARCH_BUDGET = 4000

// ---------- 말 진행도 ----------

/** 말의 앞날은 현재 위치와 직전 위치(중앙 갈림길과 빽도)에 따라 달라진다. */
function keyOf(p: Pick<Piece, 'pos' | 'trail'>): string {
  if (p.pos === HOME || p.pos === GOAL) return p.pos
  return `${p.trail[p.trail.length - 2] ?? ''}>${p.pos}`
}

/**
 * 위치별로, 혼자 있는 말이 완주하기까지 더 필요한 던지기 횟수의 기댓값.
 * 집에서 도달할 수 있는 모든 상태에 대해 value iteration 으로 한 번만 계산한다.
 */
const EXPECTED_THROWS: Map<string, number> = (() => {
  const next = new Map<string, (string | null)[]>()
  const queue: Piece[] = [{ id: '', team: 0, pos: HOME, trail: [] }]
  while (queue.length) {
    const p = queue.pop()!
    const k = keyOf(p)
    if (next.has(k)) continue
    next.set(
      k,
      RESULTS.map((r) => {
        const d = destination(p, r)
        if (!d) return null
        const q: Piece = { ...p, pos: d.to, trail: d.trail.slice(-2) }
        queue.push(q)
        return keyOf(q)
      }),
    )
  }

  const v = new Map<string, number>()
  for (const k of next.keys()) v.set(k, 0)
  for (let iter = 0; iter < 2000; iter++) {
    let delta = 0
    for (const [k, outs] of next) {
      if (k === GOAL) continue
      let e = 1
      outs.forEach((o, i) => (e += THROW_ODDS[RESULTS[i]] * v.get(o ?? k)!))
      delta = Math.max(delta, Math.abs(e - v.get(k)!))
      v.set(k, e)
    }
    if (delta < 1e-9) break
  }
  return v
})()

/** 표에 없는 trail 에 대한 대체값: 해당 칸에서 알려진 가장 좋은 값. */
const BY_POS: Map<string, number> = (() => {
  const m = new Map<string, number>()
  for (const [k, e] of EXPECTED_THROWS) {
    const pos = k.split('>').pop()!
    m.set(pos, Math.min(m.get(pos) ?? Infinity, e))
  }
  return m
})()

const FROM_HOME = EXPECTED_THROWS.get(HOME)!

export function expectedThrows(p: Pick<Piece, 'pos' | 'trail'>): number {
  return EXPECTED_THROWS.get(keyOf(p)) ?? BY_POS.get(p.pos as string) ?? FROM_HOME
}

/** 아직 집에 있는 말과 비교해 이 말이 이미 줄여 둔 던지기 횟수. */
function progress(p: Piece): number {
  return FROM_HOME - expectedThrows(p)
}

// ---------- 판 평가 ----------

/** `hunter` 의 그룹 중 하나가 다음 던지기로 `pos` 에 도착할 확률. */
function hitChance(s: GameState, hunter: number, pos: string): number {
  let odds = 0
  for (const r of RESULTS) {
    if (movableGroups(s, hunter).some((g) => destination(g, r)?.to === pos)) odds += THROW_ODDS[r]
  }
  return odds
}

/** 한 팀의 판 위 그룹들. [칸, 그 칸의 말들] 형태. */
function groupsOnBoard(s: GameState, team: number): [string, Piece[]][] {
  const m = new Map<string, Piece[]>()
  for (const p of s.pieces) {
    if (p.team !== team || p.pos === HOME || p.pos === GOAL) continue
    m.set(p.pos, [...(m.get(p.pos) ?? []), p])
  }
  return [...m]
}

/** 그룹이 잡혔을 때 잃는 던지기 횟수의 기댓값: 그 그룹의 진행도에 잡은 쪽의 보너스 던지기를 더한 값. */
function exposure(group: Piece[]): number {
  return group.reduce((sum, p) => sum + progress(p), 0) + EXTRA_THROW
}

/** `team` 입장에서 본 판 점수 (던지기 횟수 단위). 높을수록 좋다. */
export function evaluate(s: GameState, team: number, level: BotLevel = 'hard'): number {
  if (s.winner !== null) return s.winner === team ? WIN : -WIN
  const t = LEVELS[level]
  const opponents = s.teams.map((_, i) => i).filter((i) => i !== team)

  const raw = (side: number) => s.pieces.filter((p) => p.team === side).reduce((sum, p) => sum + progress(p), 0)
  let mine = raw(team)

  // 아직 내 턴이다 (잡기 보너스 던지기): 남은 결과와 던지기는 내가 쓰고, 누가 나를 잡기 전에 내가 먼저 움직인다.
  const stillMine = s.turn === team && s.phase !== 'over'
  if (stillMine) {
    mine += s.throwsLeft * EXTRA_THROW
    mine += s.pending.reduce((sum, r) => sum + Math.max(0, RESULT_STEPS[r]) / AVG_STEPS, 0)
  }

  if (t.danger > 0) {
    const fear = stillMine ? t.danger / 2 : t.danger
    for (const [pos, group] of groupsOnBoard(s, team)) {
      const odds = Math.min(1, opponents.reduce((sum, o) => sum + hitChance(s, o, pos), 0))
      mine -= fear * odds * exposure(group)
    }
  }

  let best = -Infinity
  for (const o of opponents) {
    let theirs = raw(o)
    if (t.threat > 0) {
      for (const [pos, group] of groupsOnBoard(s, o)) theirs -= t.threat * hitChance(s, team, pos) * exposure(group)
    }
    best = Math.max(best, theirs)
  }
  return mine - best
}

// ---------- 수 탐색 ----------

export interface Move {
  pendingIndex: number
  pieceId: string
}

/** 남은 결과 하나를 쓰는 서로 다른 모든 방법. 같은 결과는 같은 수가 되므로 첫 인덱스만 남긴다. */
function options(s: GameState): Move[] {
  const out: Move[] = []
  const seen = new Set<Result>()
  s.pending.forEach((r, pendingIndex) => {
    if (seen.has(r)) return
    seen.add(r)
    for (const { piece } of legalMoves(s, r)) out.push({ pendingIndex, pieceId: piece.id })
  })
  return out
}

function play(s: GameState, m: Move): GameState {
  return applyAction(s, { type: 'move', by: currentPlayer(s), ...m })
}

function stateKey(s: GameState): string {
  return `${s.turn}|${s.phase}|${s.throwsLeft}|${[...s.pending].sort().join(',')}|${s.pieces.map(keyOf).join(',')}`
}

/** 다음 던지기 전에 이번 턴의 남은 결과를 모두 써서 얻을 수 있는 최고 점수. */
function searchTurn(s: GameState, team: number, level: BotLevel, memo: Map<string, number>, budget: { left: number }): number {
  if (s.phase !== 'move' || s.turn !== team || budget.left <= 0) return evaluate(s, team, level)
  const key = stateKey(s)
  const hit = memo.get(key)
  if (hit !== undefined) return hit
  let best = -Infinity
  for (const m of options(s)) {
    if (budget.left-- <= 0) break
    best = Math.max(best, searchTurn(play(s, m), team, level, memo, budget))
  }
  if (best === -Infinity) best = evaluate(s, team, level)
  memo.set(key, best)
  return best
}

/** 봇이 지금 둘 수. 움직일 것이 없으면 null. */
export function chooseMove(s: GameState, level: BotLevel, rng: () => number = Math.random): Move | null {
  if (s.phase !== 'move') return null
  const moves = options(s)
  if (!moves.length) return null
  if (rng() < LEVELS[level].random) return moves[Math.floor(rng() * moves.length)]

  const team = s.turn
  const memo = new Map<string, number>()
  const budget = { left: SEARCH_BUDGET }
  let best: Move[] = []
  let bestScore = -Infinity
  for (const m of moves) {
    const score = searchTurn(play(s, m), team, level, memo, budget)
    if (score > bestScore + 1e-9) {
      best = [m]
      bestScore = score
    } else if (score > bestScore - 1e-9) best.push(m)
  }
  return best[Math.floor(rng() * best.length)]
}

/** `botId` 가 지금 할 행동. 자기 턴이 아니면 null. */
export function botAction(s: GameState, botId: string, level: BotLevel, rng: () => number = Math.random): Action | null {
  if (s.phase === 'over' || currentPlayer(s) !== botId) return null
  if (s.phase === 'throw') return { type: 'throw', by: botId }
  const m = chooseMove(s, level, rng)
  return m && { type: 'move', by: botId, ...m }
}
