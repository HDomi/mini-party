import { describe, expect, it } from 'vitest'
import { botAction, chooseMove, expectedThrows, THROW_ODDS, type BotLevel } from './bot'
import {
  applyAction,
  createGame,
  currentPlayer,
  GOAL,
  HOME,
  legalMoves,
  seededRng,
  throwSticks,
  type GameState,
  type Result,
} from './rules'

function duel(seed: number, pieces = 4): GameState {
  return createGame({
    players: [
      { id: 'a', name: 'A', team: 0 },
      { id: 'b', name: 'B', team: 0 },
    ],
    teamMode: false,
    piecesPerTeam: pieces,
    rng: seededRng(seed),
  })
}

type Player = BotLevel | 'random'

/** Plays a full game and returns the winning player's id. */
function playOut(seed: number, players: Record<string, Player>, pieces = 4): string {
  const rng = seededRng(seed * 7919 + 1)
  let s = duel(seed, pieces)
  for (let step = 0; step < 5000; step++) {
    if (s.phase === 'over') return s.teams[s.winner!].members[0]
    const id = currentPlayer(s)
    const who = players[id]
    let action = botAction(s, id, who === 'random' ? 'easy' : who, rng)
    if (who === 'random' && action?.type === 'move') {
      const all = s.pending.flatMap((r, i) => legalMoves(s, r).map((m) => ({ i, id: m.piece.id })))
      const pick = all[Math.floor(rng() * all.length)]
      action = { type: 'move', by: id, pendingIndex: pick.i, pieceId: pick.id }
    }
    expect(action).not.toBeNull()
    s = applyAction(s, action!, { rng })
  }
  throw new Error('game did not finish')
}

function winRate(level: BotLevel, against: Player, games: number): number {
  let wins = 0
  for (let g = 0; g < games; g++) {
    // Swap seats every game so turn order doesn't favor either side.
    const botSeat = g % 2 === 0 ? 'a' : 'b'
    const players = botSeat === 'a' ? { a: level, b: against } : { a: against, b: level }
    if (playOut(g + 1, players) === botSeat) wins++
  }
  return wins / games
}

/** A two-player state with the pieces placed by hand, team 0 to move. */
function board(pending: Result[], place: Record<string, { pos: string; trail?: string[] }>): GameState {
  const s = duel(1)
  s.turn = 0
  s.phase = 'move'
  s.pending = pending
  s.throwsLeft = 0
  for (const p of s.pieces) {
    const at = place[p.id]
    p.pos = at?.pos ?? HOME
    p.trail = at?.trail ?? (at && at.pos !== HOME && at.pos !== GOAL ? [at.pos] : [])
  }
  return s
}

describe('throw odds', () => {
  it('match the sticks', () => {
    const counts: Record<string, number> = {}
    for (let mask = 0; mask < 16; mask++) {
      const faces = [0, 1, 2, 3].map((i) => ((mask >> i) & 1 ? 0.1 : 0.9))
      let i = 0
      const { result } = throwSticks(() => faces[i++])
      counts[result] = (counts[result] ?? 0) + 1
    }
    for (const [r, odds] of Object.entries(THROW_ODDS)) expect(counts[r] / 16).toBeCloseTo(odds)
  })
})

describe('expectedThrows', () => {
  it('shrinks toward the goal and rewards corners', () => {
    expect(expectedThrows({ pos: GOAL, trail: [] })).toBe(0)
    const home = expectedThrows({ pos: HOME, trail: [] })
    const o1 = expectedThrows({ pos: 'O1', trail: ['O0', 'O1'] })
    const o4 = expectedThrows({ pos: 'O4', trail: ['O3', 'O4'] })
    const o5 = expectedThrows({ pos: 'O5', trail: ['O4', 'O5'] })
    const o6 = expectedThrows({ pos: 'O6', trail: ['O5', 'O6'] })
    expect(o1).toBeLessThan(home)
    expect(o5).toBeLessThan(o4)
    // Past the first corner without taking it is the long way round.
    expect(o6).toBeGreaterThan(o5)
    // One step from done; only 빽도 can push it back.
    const o0 = expectedThrows({ pos: 'O0', trail: ['E2', 'O0'] })
    expect(o0).toBeGreaterThan(1)
    expect(o0).toBeLessThan(expectedThrows({ pos: 'E2', trail: ['E1', 'E2'] }))
  })
})

describe('chooseMove', () => {
  const pick = (s: GameState, level: BotLevel = 'hard') => chooseMove(s, level, seededRng(1))

  it('captures when it can', () => {
    // 개 takes 0-0 from O2 onto 1-0 at O4. The alternative is a new piece stacking on O2.
    const s = board(['gae'], { '0-0': { pos: 'O2' }, '1-0': { pos: 'O4' } })
    expect(pick(s)).toEqual({ pendingIndex: 0, pieceId: '0-0' })
  })

  it('finishes a piece when it can', () => {
    const s = board(['do'], { '0-0': { pos: 'O0', trail: ['E2', 'O0'] }, '0-1': { pos: 'O8' } })
    expect(pick(s)).toEqual({ pendingIndex: 0, pieceId: '0-0' })
  })

  it('does not walk into a capture', () => {
    // 1-0 on O12 hits O14 with 개 (6/16). 걸 would carry 0-0 from O11 right there; entering a new piece is safe.
    const s = board(['geol'], { '0-0': { pos: 'O11' }, '1-0': { pos: 'O12', trail: ['O11', 'O12'] } })
    expect(pick(s)?.pieceId).not.toBe('0-0')
  })

  it('orders several results to take the corner', () => {
    // 도 first would leave 0-0 on O2 and 윷 would carry it past O5. 윷 first stops on the corner.
    let s = board(['do', 'yut'], { '0-0': { pos: 'O1' }, '1-0': { pos: 'O10', trail: ['O9', 'O10'] } })
    for (let i = 0; i < 2 && s.phase === 'move'; i++) s = applyAction(s, { type: 'move', by: currentPlayer(s), ...pick(s)! })
    const front = s.pieces.filter((p) => p.team === 0).map((p) => p.pos)
    expect(front.some((pos) => pos === 'O5' || pos === 'R1')).toBe(true)
    expect(front).not.toContain('O6')
  })

  it('returns null outside the move phase', () => {
    const s = duel(3)
    expect(chooseMove(s, 'hard')).toBeNull()
    expect(botAction(s, 'nobody', 'hard')).toBeNull()
  })
})

describe('full games', () => {
  it('only ever makes legal moves, at every level and piece count', () => {
    let g = 0
    for (const level of ['easy', 'normal', 'hard'] as const)
      for (const pieces of [2, 5]) playOut(++g, { a: level, b: level }, pieces)
  })

  it('hard beats random play', () => {
    expect(winRate('hard', 'random', 120)).toBeGreaterThan(0.7)
  }, 60_000)

  it('hard beats easy', () => {
    expect(winRate('hard', 'easy', 120)).toBeGreaterThan(0.55)
  }, 60_000)
})
