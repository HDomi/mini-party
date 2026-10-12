import { describe, expect, it } from 'vitest'
import { applyAction, createGame, currentPlayer, HOLES, openHoles, RuleError, seededRng, StaleError, type GameState } from './rules'

/** 절대 안 튀어나오는 rng(0.999 × 남은 구멍 ≥ 1). 마지막 구멍은 예외다. */
const SAFE = () => 0.999
const POP = () => 0

function game(ids = ['a', 'b', 'c']): GameState {
  // 첫 rng 값 0 이면 자리 순서 그대로 a 부터 시작한다.
  return createGame({ players: ids.map((id, slot) => ({ id, name: id.toUpperCase(), slot })) }, () => 0)
}

const stab = (s: GameState, hole: number, rng = SAFE) => applyAction(s, { type: 'stab', by: currentPlayer(s), hole }, rng)

describe('깜짝 개구리', () => {
  it('자리 순서대로 돌아가며 꽂는다', () => {
    let s = game()
    expect(currentPlayer(s)).toBe('a')
    s = stab(s, 0)
    expect(currentPlayer(s)).toBe('b')
    s = stab(s, 1)
    s = stab(s, 2)
    expect(currentPlayer(s)).toBe('a')
    expect(s.stabs.map((x) => x.by)).toEqual(['a', 'b', 'c'])
    expect(openHoles(s)).toHaveLength(HOLES - 3)
  })

  it('튀어나오면 꽂은 사람이 당첨되고 끝난다', () => {
    const s = stab(stab(game(), 3), 7, POP)
    expect(s.phase).toBe('over')
    expect(s.loser).toBe('b')
    expect(() => stab(s, 8)).toThrow('게임이 끝났어요')
  })

  it('마지막 구멍은 반드시 튀어나온다', () => {
    let s = game()
    for (let h = 0; h < HOLES - 1; h++) s = stab(s, h)
    expect(s.phase).toBe('play')
    s = stab(s, HOLES - 1)
    expect(s.phase).toBe('over')
  })

  it('남은 구멍 중 하나가 고르게 당첨된다', () => {
    const rng = seededRng(3)
    const counts = Array(HOLES).fill(0)
    const N = 24000
    for (let i = 0; i < N; i++) {
      let s = game()
      let k = 0
      while (s.phase === 'play') s = stab(s, k++, rng)
      counts[k - 1]++
    }
    for (const c of counts) expect(Math.abs(c - N / HOLES)).toBeLessThan((N / HOLES) * 0.15)
  })

  it('꽂힌 구멍, 없는 구멍, 남의 차례는 막는다', () => {
    const s = stab(game(), 5)
    expect(() => stab(s, 5)).toThrow('이미 칼이 꽂힌 구멍이에요')
    expect(() => stab(s, HOLES)).toThrow(RuleError)
    expect(() => applyAction(s, { type: 'stab', by: 'a', hole: 6 })).toThrow('내 차례가 아니에요')
    expect(() => applyAction(s, { type: 'stab', by: 'x', hole: 6 })).toThrow('이 판의 플레이어가 아니에요')
  })

  it('고르는 구멍은 차례인 사람만 바꾸고, 꽂으면 지워진다', () => {
    let s = applyAction(game(), { type: 'aim', by: 'a', hole: 4 })
    expect(s.aim).toBe(4)
    expect(() => applyAction(s, { type: 'aim', by: 'b', hole: 2 })).toThrow('내 차례가 아니에요')
    s = stab(s, 4)
    expect(s.aim).toBeNull()
  })

  it('대신 꽂기는 빈 구멍에 꽂고, 늦게 오면 무시된다', () => {
    const s = stab(game(), 0)
    const next = applyAction(s, { type: 'auto', by: 'a', turn: s.turn }, SAFE)
    expect(next.stabs.at(-1)).toMatchObject({ by: 'b', auto: true })
    expect(next.stabs.at(-1)!.hole).not.toBe(0)
    expect(() => applyAction(next, { type: 'auto', by: 'a', turn: s.turn })).toThrow(StaleError)
  })

  it('한 판 더 하면 당첨된 사람이 먼저 꽂는다', () => {
    const over = stab(stab(game(), 0), 1, POP)
    const next = applyAction(over, { type: 'rematch', by: 'a' })
    expect(next.players).toEqual(['b', 'c', 'a'])
    expect(next.stabs).toEqual([])
    expect(next.round).toBe(1)
    expect(next.slots).toEqual({ a: 0, b: 1, c: 2 })
  })
})
