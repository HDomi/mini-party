import { describe, expect, it } from 'vitest'
import {
  applyAction,
  BLACK,
  boardOf,
  createGame,
  currentPlayer,
  forbiddenAt,
  RuleError,
  SIZE,
  WHITE,
  type GameState,
  type Rule,
} from './rules'

const at = (x: number, y: number) => y * SIZE + x

function game(rule: Rule = 'free'): GameState {
  return createGame({ black: { id: 'b', name: '흑돌이' }, white: { id: 'w', name: '백돌이' }, rule })
}

/** 번갈아 둔다. `null` 은 멀리 떨어진 곳에 아무렇게나 둔다. */
function play(s: GameState, cells: ([number, number] | null)[]): GameState {
  let filler = 0
  for (const c of cells) {
    let p: number
    if (c) p = at(c[0], c[1])
    else {
      const b = boardOf(s)
      while (b[filler] !== -1 || Math.floor(filler / SIZE) > 1) filler += filler % SIZE === SIZE - 1 ? 1 : 2
      p = filler
    }
    s = applyAction(s, { type: 'place', by: currentPlayer(s), at: p })
  }
  return s
}

/** 흑 돌만 놓인 판. 백은 판 구석에 둔다. */
function blackStones(cells: [number, number][], rule: Rule = 'renju') {
  const out: ([number, number] | null)[] = []
  for (const c of cells) out.push(c, null)
  return play(game(rule), out)
}

describe('place', () => {
  it('alternates and rejects wrong turns and occupied cells', () => {
    let s = game()
    s = applyAction(s, { type: 'place', by: 'b', at: at(7, 7) })
    expect(currentPlayer(s)).toBe('w')
    expect(() => applyAction(s, { type: 'place', by: 'b', at: at(0, 0) })).toThrow(RuleError)
    expect(() => applyAction(s, { type: 'place', by: 'w', at: at(7, 7) })).toThrow(RuleError)
    expect(() => applyAction(s, { type: 'place', by: 'w', at: -1 })).toThrow(RuleError)
    expect(() => applyAction(s, { type: 'place', by: 'x', at: at(0, 0) })).toThrow(RuleError)
  })

  it('wins with five in every direction', () => {
    const lines: [number, number][][] = [
      [0, 1, 2, 3, 4].map((i) => [3 + i, 7]),
      [0, 1, 2, 3, 4].map((i) => [7, 3 + i]),
      [0, 1, 2, 3, 4].map((i) => [3 + i, 3 + i]),
      [0, 1, 2, 3, 4].map((i) => [3 + i, 11 - i]),
    ]
    for (const l of lines) {
      const s = blackStones(l.slice(0, 4), 'free')
      const won = applyAction(s, { type: 'place', by: 'b', at: at(...l[4]) })
      expect(won.winner).toBe(BLACK)
      expect(won.end).toBe('five')
      expect([...won.line].sort((a, b) => a - b)).toEqual(l.map(([x, y]) => at(x, y)).sort((a, b) => a - b))
    }
  })

  it('lets overline win under free rule but not for black under renju', () => {
    const six: [number, number][] = [2, 3, 4, 6, 7].map((x) => [x, 7])
    const free = blackStones(six, 'free')
    expect(applyAction(free, { type: 'place', by: 'b', at: at(5, 7) }).winner).toBe(BLACK)

    const renju = blackStones(six, 'renju')
    expect(forbiddenAt(boardOf(renju), SIZE, at(5, 7), 'renju')).toBe('overline')
    expect(() => applyAction(renju, { type: 'place', by: 'b', at: at(5, 7) })).toThrow(/장목/)
  })

  it('lets white win with an overline under renju', () => {
    let s = game('renju')
    const white = [2, 3, 4, 6, 7]
    for (const x of white) s = play(s, [[x, 12], [x, 7]])
    s = play(s, [[9, 12], [5, 7]])
    expect(s.winner).toBe(WHITE)
  })

  it('ends in a draw on a full board', () => {
    // (x + 2y) mod 4 로 칠한 무늬는 어느 방향으로도 같은 색이 두 알 넘게 이어지지 않는다. 흑 113, 백 112.
    const blacks: number[] = []
    const whites: number[] = []
    for (let y = 0; y < SIZE; y++) for (let x = 0; x < SIZE; x++) ((x + 2 * y) % 4 < 2 ? blacks : whites).push(at(x, y))
    const moves = blacks.flatMap((p, i) => (i < whites.length ? [p, whites[i]] : [p]))
    const last = moves.pop()!
    const end = applyAction({ ...game('free'), moves }, { type: 'place', by: 'b', at: last })
    expect(end.end).toBe('draw')
    expect(end.winner).toBeNull()
  })
})

describe('renju forbidden points', () => {
  it('detects double three', () => {
    const s = blackStones([
      [6, 7],
      [7, 6],
      [8, 7],
      [7, 8],
    ])
    // (7,7) 에 두면 가로 _XXX_, 세로 _XXX_ 가 동시에 생긴다.
    expect(forbiddenAt(boardOf(s), SIZE, at(7, 7), 'renju')).toBe('double-three')
    expect(forbiddenAt(boardOf(s), SIZE, at(7, 7), 'free')).toBeNull()
  })

  it('detects split double three', () => {
    // (7,7) 에 두면 가로 XXX 와 대각 X_XX(→ (8,6) 에 두면 열린 4)가 생긴다.
    const s = blackStones([
      [5, 7],
      [6, 7],
      [9, 5],
      [10, 4],
    ])
    expect(forbiddenAt(boardOf(s), SIZE, at(7, 7), 'renju')).toBe('double-three')
    // 한 방향만 3이면 괜찮다.
    expect(forbiddenAt(boardOf(s), SIZE, at(4, 7), 'renju')).toBeNull()
  })

  it('does not count a blocked three', () => {
    let s = game('renju')
    // 흑 (6,7)(8,7), 백 (5,7) — 가로는 막힌 3. 흑 (7,6)(7,8) — 세로는 열린 3.
    s = play(s, [
      [6, 7],
      [5, 7],
      [8, 7],
      [0, 0],
      [7, 6],
      [9, 7],
      [7, 8],
      [0, 1],
    ])
    expect(forbiddenAt(boardOf(s), SIZE, at(7, 7), 'renju')).toBeNull()
  })

  it('detects double four, including two fours on one line', () => {
    const s = blackStones([
      [4, 7],
      [5, 7],
      [6, 7],
      [7, 4],
      [7, 5],
      [7, 6],
    ])
    expect(forbiddenAt(boardOf(s), SIZE, at(7, 7), 'renju')).toBe('double-four')

    const line = blackStones([
      [3, 7],
      [5, 7],
      [6, 7],
      [9, 7],
    ])
    // X_XX?_X → (7,7) 에 두면 X_XXX_X: 양쪽 빈칸이 각각 오목 자리
    expect(forbiddenAt(boardOf(line), SIZE, at(7, 7), 'renju')).toBe('double-four')
  })

  it('allows a forbidden shape when it also makes exactly five', () => {
    const s = blackStones([
      [3, 7],
      [4, 7],
      [5, 7],
      [6, 7],
      [7, 4],
      [7, 5],
      [7, 6],
    ])
    expect(forbiddenAt(boardOf(s), SIZE, at(7, 7), 'renju')).toBeNull()
    expect(applyAction(s, { type: 'place', by: 'b', at: at(7, 7) }).winner).toBe(BLACK)
  })

  it('never restricts white', () => {
    let s = game('renju')
    s = play(s, [
      [0, 0],
      [6, 7],
      [0, 2],
      [7, 6],
      [0, 4],
      [8, 7],
      [0, 6],
      [7, 8],
      [0, 8],
    ])
    expect(currentPlayer(s)).toBe('w')
    expect(() => applyAction(s, { type: 'place', by: 'w', at: at(7, 7) })).not.toThrow()
  })
})

describe('resign, undo, rematch', () => {
  it('resigning gives the other side the win', () => {
    const s = applyAction(game(), { type: 'resign', by: 'b' })
    expect(s.winner).toBe(WHITE)
    expect(s.end).toBe('resign')
    expect(() => applyAction(s, { type: 'place', by: 'w', at: 0 })).toThrow(RuleError)
  })

  it('undo rolls back to my turn, even after a loss', () => {
    let s = play(game(), [
      [7, 7],
      [8, 8],
      [6, 6],
    ])
    s = applyAction(s, { type: 'undo', by: 'w' })
    expect(s.moves).toEqual([at(7, 7)])
    expect(currentPlayer(s)).toBe('w')

    const four = blackStones([0, 1, 2, 3].map((i) => [3 + i, 7]), 'free')
    const lost = applyAction(four, { type: 'place', by: 'b', at: at(7, 7) })
    expect(lost.winner).toBe(BLACK)
    const back = applyAction(lost, { type: 'undo', by: 'w' })
    expect(back.phase).toBe('play')
    expect(back.winner).toBeNull()
    expect(currentPlayer(back)).toBe('w')
    expect(() => applyAction(game(), { type: 'undo', by: 'b' })).toThrow(RuleError)
  })

  it('rematch swaps colors and bumps the round', () => {
    const over = applyAction(game(), { type: 'resign', by: 'w' })
    const next = applyAction(over, { type: 'rematch', by: 'w' })
    expect(next.players).toEqual(['w', 'b'])
    expect(next.round).toBe(1)
    expect(next.moves).toEqual([])
    expect(next.phase).toBe('play')
    expect(() => applyAction(next, { type: 'rematch', by: 'w' })).toThrow(RuleError)
  })
})
