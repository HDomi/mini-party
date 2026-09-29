import { describe, expect, it } from 'vitest'
import {
  applyAction,
  createGame,
  currentPlayer,
  destination,
  GOAL,
  HOME,
  seededRng,
  throwSticks,
  type GameState,
  type Piece,
  type Result,
} from './rules'

const piece = (pos: Piece['pos'], trail: string[] = []): Piece => ({ id: 'x', team: 0, pos, trail })

function game(players = 2, teamMode = false): GameState {
  return createGame({
    players: Array.from({ length: players }, (_, i) => ({ id: `p${i}`, name: `P${i}`, team: i % 2 })),
    teamMode,
    piecesPerTeam: 4,
    rng: seededRng(7),
  })
}

/** rng that yields a fixed throw result, then anything. */
function rigged(result: Result): () => number {
  const faces: Record<Result, boolean[]> = {
    backdo: [true, false, false, false],
    do: [false, true, false, false],
    gae: [true, true, false, false],
    geol: [true, true, true, false],
    yut: [true, true, true, true],
    mo: [false, false, false, false],
  }
  const seq = faces[result].map((flat) => (flat ? 0.1 : 0.9))
  let i = 0
  return () => (i < seq.length ? seq[i++] : 0.5)
}

describe('throwSticks', () => {
  it('maps flat counts to results', () => {
    for (const r of ['backdo', 'do', 'gae', 'geol', 'yut', 'mo'] as Result[]) {
      expect(throwSticks(rigged(r)).result).toBe(r)
    }
  })
})

describe('destination', () => {
  it('enters the board from home', () => {
    expect(destination(piece(HOME), 'do')?.to).toBe('O1')
    expect(destination(piece(HOME), 'mo')?.to).toBe('O5')
    expect(destination(piece(HOME), 'backdo')).toBeNull()
  })

  it('takes the shortcut when stopping on a corner', () => {
    expect(destination(piece('O5', ['O4', 'O5']), 'do')?.to).toBe('R1')
    expect(destination(piece('O5', ['O4', 'O5']), 'geol')?.to).toBe('C')
    expect(destination(piece('O10', ['O9', 'O10']), 'geol')?.to).toBe('C')
  })

  it('goes straight through the center, but turns home when stopping on it', () => {
    expect(destination(piece('R2', ['R1', 'R2']), 'gae')?.to).toBe('F1')
    expect(destination(piece('L2', ['L1', 'L2']), 'gae')?.to).toBe('E1')
    expect(destination(piece('C', ['R2', 'C']), 'do')?.to).toBe('E1')
  })

  it('finishes only after passing the start', () => {
    expect(destination(piece('O19', ['O18', 'O19']), 'do')?.to).toBe('O0')
    expect(destination(piece('O19', ['O18', 'O19']), 'gae')?.to).toBe(GOAL)
    expect(destination(piece('O0', ['O19', 'O0']), 'do')?.to).toBe(GOAL)
    expect(destination(piece('E2', ['E1', 'E2']), 'gae')?.to).toBe(GOAL)
  })

  it('backdo follows the trail', () => {
    expect(destination(piece('C', ['L2', 'C']), 'backdo')?.to).toBe('L2')
    expect(destination(piece('C', ['R2', 'C']), 'backdo')?.to).toBe('R2')
    expect(destination(piece('O1', ['O0', 'O1']), 'backdo')?.to).toBe('O0')
    expect(destination(piece('O15', ['F2', 'O15']), 'backdo')?.to).toBe('F2')
  })
})

describe('applyAction', () => {
  it('rejects the wrong player', () => {
    const s = game()
    const other = s.teams[1].members[0]
    expect(() => applyAction(s, { type: 'throw', by: other })).toThrow()
  })

  it('gives another throw on yut and mo', () => {
    let s = game()
    const me = currentPlayer(s)
    s = applyAction(s, { type: 'throw', by: me }, { rng: rigged('yut') })
    expect(s.phase).toBe('throw')
    s = applyAction(s, { type: 'throw', by: me }, { rng: rigged('gae') })
    expect(s.phase).toBe('move')
    expect(s.pending).toEqual(['yut', 'gae'])
  })

  it('skips the turn on backdo with no pieces on board', () => {
    let s = game()
    const first = s.turn
    s = applyAction(s, { type: 'throw', by: currentPlayer(s) }, { rng: rigged('backdo') })
    expect(s.turn).not.toBe(first)
    expect(s.phase).toBe('throw')
  })

  it('captures, sends home and grants a throw', () => {
    let s = game()
    const me = currentPlayer(s)
    const mine = s.pieces.find((p) => p.team === s.turn)!
    const theirs = s.pieces.find((p) => p.team !== s.turn)!
    theirs.pos = 'O3'
    theirs.trail = ['O2', 'O3']
    s = applyAction(s, { type: 'throw', by: me }, { rng: rigged('geol') })
    s = applyAction(s, { type: 'move', by: me, pendingIndex: 0, pieceId: mine.id })
    expect(s.pieces.find((p) => p.id === theirs.id)!.pos).toBe(HOME)
    expect(s.phase).toBe('throw')
    expect(s.throwsLeft).toBe(1)
    expect(currentPlayer(s)).toBe(me)
  })

  it('stacks own pieces and moves them together', () => {
    let s = game()
    const me = currentPlayer(s)
    const [a, b] = s.pieces.filter((p) => p.team === s.turn)
    a.pos = 'O2'
    a.trail = ['O1', 'O2']
    s = applyAction(s, { type: 'throw', by: me }, { rng: rigged('gae') })
    s = applyAction(s, { type: 'move', by: me, pendingIndex: 0, pieceId: b.id })
    expect(s.pieces.filter((p) => p.pos === 'O2')).toHaveLength(2)
    const me2 = currentPlayer(s)
    s = applyAction(s, { type: 'throw', by: me2 }, { rng: rigged('backdo') })
    // the other team has nothing on board, so backdo skipped back to us
    s = applyAction(s, { type: 'throw', by: currentPlayer(s) }, { rng: rigged('geol') })
    s = applyAction(s, { type: 'move', by: currentPlayer(s), pendingIndex: 0, pieceId: a.id })
    expect(s.pieces.filter((p) => p.pos === 'O5').map((p) => p.id).sort()).toEqual([a.id, b.id].sort())
  })

  it('declares the winner when every piece is home', () => {
    let s = game()
    const me = currentPlayer(s)
    const mine = s.pieces.filter((p) => p.team === s.turn)
    mine.forEach((p, i) => {
      p.pos = i === 0 ? 'O19' : GOAL
      p.trail = i === 0 ? ['O18', 'O19'] : []
    })
    s = applyAction(s, { type: 'throw', by: me }, { rng: rigged('gae') })
    s = applyAction(s, { type: 'move', by: me, pendingIndex: 0, pieceId: mine[0].id })
    expect(s.phase).toBe('over')
    expect(s.winner).toBe(s.turn)
  })

  it('rotates members inside a team', () => {
    let s = game(4, true)
    expect(s.teams).toHaveLength(2)
    const t0 = s.turn
    const firstMember = currentPlayer(s)
    // backdo with an empty board skips instantly, cycling turns
    s = applyAction(s, { type: 'throw', by: currentPlayer(s) }, { rng: rigged('backdo') })
    s = applyAction(s, { type: 'throw', by: currentPlayer(s) }, { rng: rigged('backdo') })
    expect(s.turn).toBe(t0)
    expect(currentPlayer(s)).not.toBe(firstMember)
    expect(s.teams[t0].members).toContain(currentPlayer(s))
  })
})
