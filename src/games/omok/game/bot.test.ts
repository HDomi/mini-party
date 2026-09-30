import { describe, expect, it } from 'vitest'
import { botMove, type BotLevel } from './bot'
import { applyAction, createGame, currentPlayer, SIZE, seededRng, type GameState, type Rule } from './rules'

const at = (x: number, y: number) => y * SIZE + x

function game(rule: Rule = 'renju'): GameState {
  return createGame({ black: { id: 'b', name: 'B' }, white: { id: 'w', name: 'W' }, rule })
}

function place(s: GameState, cells: [number, number][]): GameState {
  for (const [x, y] of cells) s = applyAction(s, { type: 'place', by: currentPlayer(s), at: at(x, y) })
  return s
}

/** 끝날 때까지 둔다. 봇이 규칙을 어기면 applyAction 이 던진다. */
function match(black: BotLevel, white: BotLevel, rule: Rule, seed: number): GameState {
  const rng = seededRng(seed)
  let s = game(rule)
  // 같은 판만 반복되지 않도록 첫 두 수는 가운데 근처에 무작위로 둔다.
  s = place(s, [[7, 7]])
  s = place(s, [[6 + Math.floor(rng() * 3), 6 + Math.floor(rng() * 2) * 2]])
  while (s.phase === 'play') {
    const id = currentPlayer(s)
    const p = botMove(s, id, id === 'b' ? black : white, rng)
    expect(p).not.toBeNull()
    s = applyAction(s, { type: 'place', by: id, at: p! })
  }
  return s
}

describe('botMove', () => {
  it('opens in the center', () => {
    expect(botMove(game(), 'b', 'normal')).toBe(at(7, 7))
  })

  it('takes a win', () => {
    // 흑 가로 넷, 백 차례에 백도 넷 — 흑 차례면 흑은 막지 않고 이긴다.
    const s = place(game('free'), [
      [3, 7],
      [3, 9],
      [4, 7],
      [4, 9],
      [5, 7],
      [5, 9],
      [6, 7],
      [6, 9],
    ])
    for (const level of ['normal', 'hard'] as const) expect([at(2, 7), at(7, 7)]).toContain(botMove(s, 'b', level))
  })

  it('blocks a four', () => {
    const s = place(game('free'), [
      [3, 7],
      [0, 0],
      [4, 7],
      [14, 14],
      [5, 7],
      [0, 14],
      [6, 7],
    ])
    for (const level of ['normal', 'hard'] as const) expect([at(2, 7), at(7, 7)]).toContain(botMove(s, 'w', level))
  })

  it('blocks an open three', () => {
    const s = place(game('free'), [
      [5, 7],
      [0, 0],
      [6, 7],
      [14, 14],
      [7, 7],
    ])
    for (const level of ['normal', 'hard'] as const)
      expect([at(3, 7), at(4, 7), at(8, 7), at(9, 7)]).toContain(botMove(s, 'w', level))
  })

  it('hard beats easy', () => {
    let wins = 0
    for (let i = 0; i < 10; i++) {
      const hardIsBlack = i % 2 === 0
      const s = match(hardIsBlack ? 'hard' : 'easy', hardIsBlack ? 'easy' : 'hard', i % 4 < 2 ? 'renju' : 'free', 100 + i)
      if (s.winner === (hardIsBlack ? 0 : 1)) wins++
    }
    expect(wins).toBeGreaterThanOrEqual(9)
  }, 60_000)

  it('hard holds its own against normal', () => {
    let wins = 0
    for (let i = 0; i < 8; i++) {
      const hardIsBlack = i % 2 === 0
      const s = match(hardIsBlack ? 'hard' : 'normal', hardIsBlack ? 'normal' : 'hard', 'renju', 200 + i)
      if (s.winner === (hardIsBlack ? 0 : 1)) wins++
    }
    expect(wins).toBeGreaterThanOrEqual(4)
  }, 60_000)
})
