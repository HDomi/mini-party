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

// Single-player opponent. It never needs hand-written cases: every legal way to spend the
// pending throws is played out through the real reducer and the resulting boards are scored.

export type BotLevel = 'easy' | 'normal' | 'hard'

/** Odds of each throw with four fair sticks (see throwSticks). */
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
  /** Share of turns where the bot just plays any legal move. */
  random: number
  /** How much it fears its pieces being caught next turn. */
  danger: number
  /** How much it values lining up a capture for its next turn. */
  threat: number
}

const LEVELS: Record<BotLevel, Tuning> = {
  easy: { random: 0.4, danger: 0, threat: 0 },
  normal: { random: 0.1, danger: 0.5, threat: 0.15 },
  hard: { random: 0, danger: 1, threat: 0.3 },
}

/** Worth of an extra throw, in throws. */
const EXTRA_THROW = 1
const WIN = 1e6
/** Caps the search on long yut/mo chains; past it, boards are scored as they stand. */
const SEARCH_BUDGET = 4000

// ---------- piece progress ----------

/** A piece's future depends on where it is and where it came from (the center fork and 빽도). */
function keyOf(p: Pick<Piece, 'pos' | 'trail'>): string {
  if (p.pos === HOME || p.pos === GOAL) return p.pos
  return `${p.trail[p.trail.length - 2] ?? ''}>${p.pos}`
}

/**
 * Expected number of throws a lone piece still needs to finish, per position.
 * Solved once by value iteration over every state a piece can reach from home.
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

/** Fallback for trails the table never saw: the best known value at that station. */
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

/** Throws already saved by this piece compared to one still at home. */
function progress(p: Piece): number {
  return FROM_HOME - expectedThrows(p)
}

// ---------- board evaluation ----------

/** Chance that one of `hunter`'s groups lands on `pos` with its next throw. */
function hitChance(s: GameState, hunter: number, pos: string): number {
  let odds = 0
  for (const r of RESULTS) {
    if (movableGroups(s, hunter).some((g) => destination(g, r)?.to === pos)) odds += THROW_ODDS[r]
  }
  return odds
}

/** Board groups of a team, as [station, pieces there]. */
function groupsOnBoard(s: GameState, team: number): [string, Piece[]][] {
  const m = new Map<string, Piece[]>()
  for (const p of s.pieces) {
    if (p.team !== team || p.pos === HOME || p.pos === GOAL) continue
    m.set(p.pos, [...(m.get(p.pos) ?? []), p])
  }
  return [...m]
}

/** Expected throws lost if the group is caught: its progress plus the capturer's bonus throw. */
function exposure(group: Piece[]): number {
  return group.reduce((sum, p) => sum + progress(p), 0) + EXTRA_THROW
}

/** Board score from `team`'s side, in throws. Higher is better. */
export function evaluate(s: GameState, team: number, level: BotLevel = 'hard'): number {
  if (s.winner !== null) return s.winner === team ? WIN : -WIN
  const t = LEVELS[level]
  const opponents = s.teams.map((_, i) => i).filter((i) => i !== team)

  const raw = (side: number) => s.pieces.filter((p) => p.team === side).reduce((sum, p) => sum + progress(p), 0)
  let mine = raw(team)

  // Still my turn (a capture's bonus throw): leftover results and throws are mine to use, and I move before anyone can hit me.
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

// ---------- move search ----------

export interface Move {
  pendingIndex: number
  pieceId: string
}

/** Every distinct way to spend one pending result. Equal results share a move, so only the first index is kept. */
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

/** Best score reachable by spending the rest of this turn's results, before the next throw. */
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

/** The move the bot makes now, or null when there is nothing to move. */
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

/** What `botId` does right now, or null when it isn't its turn. */
export function botAction(s: GameState, botId: string, level: BotLevel, rng: () => number = Math.random): Action | null {
  if (s.phase === 'over' || currentPlayer(s) !== botId) return null
  if (s.phase === 'throw') return { type: 'throw', by: botId }
  const m = chooseMove(s, level, rng)
  return m && { type: 'move', by: botId, ...m }
}
