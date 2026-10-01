import { describe, expect, it } from 'vitest'
import {
  applyAction,
  bonusLost,
  CATS,
  createGame,
  currentPlayer,
  ranking,
  RuleError,
  scoreOf,
  seededRng,
  StaleError,
  totalsOf,
  type Cat,
  type GameState,
} from './rules'

const NONE = [false, false, false, false, false]

function game(ids = ['a', 'b']): GameState {
  // 순서를 섞지 않도록 rng 가 항상 0.999 를 준다(마지막 자리와 바꾸는 일이 없다).
  return createGame({ players: ids.map((id) => ({ id, name: id.toUpperCase() })) }, () => 0.999)
}

/** 다음 굴림에서 정확히 이 눈들이 나오는 rng. 굴리는 주사위 순서대로 쓴다. */
function rigged(values: number[]) {
  const q = [...values]
  return () => (q.length ? (q.shift()! - 1) / 6 + 0.01 : 0.5)
}

function rollTo(s: GameState, dice: number[]): GameState {
  return applyAction(s, { type: 'roll', by: currentPlayer(s), held: NONE }, rigged(dice))
}

function score(s: GameState, cat: Cat): GameState {
  return applyAction(s, { type: 'score', by: currentPlayer(s), cat })
}

describe('점수 계산', () => {
  it.each<[Cat, number[], number]>([
    ['ones', [1, 1, 2, 3, 1], 3],
    ['sixes', [6, 6, 6, 2, 6], 24],
    ['choice', [1, 2, 3, 4, 6], 16],
    ['fourKind', [4, 4, 4, 4, 2], 18],
    ['fourKind', [5, 5, 5, 5, 5], 25],
    ['fourKind', [4, 4, 4, 2, 2], 0],
    ['fullHouse', [3, 3, 3, 6, 6], 21],
    ['fullHouse', [3, 3, 3, 3, 6], 0],
    ['fullHouse', [2, 2, 2, 2, 2], 0],
    ['smallStraight', [1, 2, 3, 4, 6], 15],
    ['smallStraight', [3, 4, 5, 6, 6], 15],
    ['smallStraight', [1, 2, 3, 5, 6], 0],
    ['largeStraight', [2, 3, 4, 5, 6], 30],
    ['largeStraight', [1, 2, 3, 4, 6], 0],
    ['yacht', [6, 6, 6, 6, 6], 50],
    ['yacht', [6, 6, 6, 6, 5], 0],
  ])('%s %j = %d', (cat, dice, want) => {
    expect(scoreOf(cat, dice)).toBe(want)
  })

  it('윗칸 63점 이상이면 보너스 35점', () => {
    const sheet = [3, 6, 9, 12, 15, 18, null, null, null, null, null, null]
    expect(totalsOf(sheet)).toEqual({ upper: 63, bonus: 35, lower: 0, total: 98 })
    expect(totalsOf([...sheet.slice(0, 5), 12, ...sheet.slice(6)]).bonus).toBe(0)
  })

  it('남은 윗칸을 다 채워도 63점이 안 되면 보너스를 잃었다', () => {
    expect(bonusLost(CATS.map(() => null))).toBe(false)
    expect(bonusLost([0, 0, 0, 0, null, null, null, null, null, null, null, null])).toBe(true)
    expect(bonusLost([1, 2, 3, 8, 10, 12, null, null, null, null, null, null])).toBe(true)
    expect(bonusLost([5, 10, 15, null, null, null, null, null, null, null, null, null])).toBe(false)
  })
})

describe('차례', () => {
  it('세 번까지 굴리고, 잡은 주사위는 그대로 둔다', () => {
    let s = rollTo(game(), [1, 2, 3, 4, 5])
    expect(s.dice).toEqual([1, 2, 3, 4, 5])
    expect(s.roll?.rolled).toEqual([0, 1, 2, 3, 4])
    s = applyAction(s, { type: 'roll', by: 'a', held: [true, false, true, false, false] }, rigged([6, 6, 6]))
    expect(s.dice).toEqual([1, 6, 3, 6, 6])
    expect(s.roll?.rolled).toEqual([1, 3, 4])
    s = applyAction(s, { type: 'roll', by: 'a', held: NONE }, rigged([2, 2, 2, 2, 2]))
    expect(s.rolls).toBe(3)
    expect(() => applyAction(s, { type: 'roll', by: 'a', held: NONE })).toThrow(RuleError)
  })

  it('처음 굴릴 때는 앞사람 주사위를 잡을 수 없다', () => {
    const s = applyAction(game(), { type: 'roll', by: 'a', held: [true, true, true, true, true] }, rigged([6, 6, 6, 6, 6]))
    expect(s.dice).toEqual([6, 6, 6, 6, 6])
    expect(s.held).toEqual(NONE)
  })

  it('다섯 개를 다 잡으면 굴릴 수 없다', () => {
    const s = rollTo(game(), [1, 2, 3, 4, 5])
    expect(() => applyAction(s, { type: 'roll', by: 'a', held: [true, true, true, true, true] })).toThrow('굴릴 주사위가 없어요')
  })

  it('내 차례가 아니면 굴리거나 적을 수 없다', () => {
    const s = rollTo(game(), [1, 2, 3, 4, 5])
    expect(() => applyAction(s, { type: 'roll', by: 'b', held: NONE })).toThrow('내 차례가 아니에요')
    expect(() => applyAction(s, { type: 'score', by: 'b', cat: 'choice' })).toThrow('내 차례가 아니에요')
    expect(() => applyAction(s, { type: 'roll', by: 'x', held: NONE })).toThrow('이 판의 플레이어가 아니에요')
  })

  it('굴리기 전에는 적을 수 없고, 적은 칸에는 다시 적을 수 없다', () => {
    expect(() => score(game(), 'choice')).toThrow('먼저 주사위를 굴려 주세요')
    let s = score(rollTo(game(), [2, 3, 4, 5, 6]), 'largeStraight')
    s = score(rollTo(s, [1, 1, 1, 1, 1]), 'yacht')
    expect(() => score(rollTo(s, [2, 3, 4, 5, 6]), 'largeStraight')).toThrow('이미 적은 칸이에요')
  })

  it('적으면 다음 사람 차례가 되고 잡은 주사위가 풀린다', () => {
    let s = rollTo(game(), [1, 2, 3, 4, 5])
    s = applyAction(s, { type: 'hold', by: 'a', held: [true, false, false, false, false] })
    expect(s.held[0]).toBe(true)
    const turn = s.turn
    s = score(s, 'largeStraight')
    expect(s.scores.a[CATS.indexOf('largeStraight')]).toBe(30)
    expect(s.last).toMatchObject({ by: 'a', cat: 'largeStraight', score: 30, auto: false })
    expect(currentPlayer(s)).toBe('b')
    expect(s.rolls).toBe(0)
    expect(s.held).toEqual(NONE)
    expect(s.turn).toBe(turn + 1)
  })

  it('잘못된 주사위 배열은 받지 않는다', () => {
    const s = rollTo(game(), [1, 2, 3, 4, 5])
    expect(() => applyAction(s, { type: 'hold', by: 'a', held: [true] })).toThrow(RuleError)
    expect(() => applyAction(s, { type: 'roll', by: 'a', held: 'x' as unknown as boolean[] })).toThrow(RuleError)
  })
})

describe('판', () => {
  it('모두 12칸을 채우면 끝나고 가장 높은 사람이 이긴다', () => {
    const rng = seededRng(7)
    let s = game(['a', 'b', 'c'])
    let guard = 0
    while (s.phase === 'play' && guard++ < 100) {
      const id = currentPlayer(s)
      s = applyAction(s, { type: 'roll', by: id, held: NONE }, rng)
      const open = CATS.find((_, i) => s.scores[id][i] === null)!
      s = score(s, open)
    }
    expect(guard).toBe(36)
    expect(s.phase).toBe('over')
    expect(s.end).toBe('done')
    const top = Math.max(...s.players.map((id) => totalsOf(s.scores[id]).total))
    expect(s.winners.length).toBeGreaterThan(0)
    for (const id of s.winners) expect(totalsOf(s.scores[id]).total).toBe(top)
  })

  it('둘이 하다가 한 명이 기권하면 남은 사람이 이긴다', () => {
    const s = applyAction(game(), { type: 'resign', by: 'b' })
    expect(s.phase).toBe('over')
    expect(s.end).toBe('resign')
    expect(s.winners).toEqual(['a'])
  })

  it('셋 이상이면 기권한 사람만 빠지고 계속한다', () => {
    let s = game(['a', 'b', 'c'])
    s = applyAction(s, { type: 'resign', by: 'a' })
    expect(s.phase).toBe('play')
    expect(currentPlayer(s)).toBe('b')
    s = score(rollTo(s, [1, 1, 1, 1, 1]), 'yacht')
    expect(currentPlayer(s)).toBe('c')
    s = score(rollTo(s, [1, 1, 1, 1, 2]), 'ones')
    // a 를 건너뛴다.
    expect(currentPlayer(s)).toBe('b')
    expect(ranking(s).map((r) => r.id)).toEqual(['b', 'c', 'a'])
  })

  it('혼자 하던 판에서 기권하면 승자 없이 끝난다', () => {
    const s = applyAction(game(['a']), { type: 'resign', by: 'a' })
    expect(s.phase).toBe('over')
    expect(s.winners).toEqual([])
  })

  it('대신 두기는 굴리고 가장 높은 칸에 적으며, 늦게 오면 무시된다', () => {
    const s = game()
    const next = applyAction(s, { type: 'auto', by: 'b', turn: s.turn }, rigged([6, 6, 6, 6, 6]))
    expect(next.scores.a[CATS.indexOf('yacht')]).toBe(50)
    expect(next.last?.auto).toBe(true)
    expect(currentPlayer(next)).toBe('b')
    expect(() => applyAction(next, { type: 'auto', by: 'b', turn: s.turn })).toThrow(StaleError)
  })

  it('이미 굴린 차례는 대신 두기가 그 주사위로 적는다', () => {
    const s = rollTo(game(), [2, 3, 4, 5, 6])
    const next = applyAction(s, { type: 'auto', by: 'b', turn: s.turn })
    expect(next.scores.a[CATS.indexOf('largeStraight')]).toBe(30)
  })

  it('한 판 더 하면 점수표를 비우고 먼저 굴리는 사람이 바뀐다', () => {
    let s = applyAction(game(['a', 'b', 'c']), { type: 'resign', by: 'a' })
    s = applyAction(s, { type: 'resign', by: 'b' })
    expect(s.phase).toBe('over')
    const next = applyAction(s, { type: 'rematch', by: 'c' })
    expect(next.players).toEqual(['b', 'c', 'a'])
    expect(next.out).toEqual([])
    expect(next.round).toBe(1)
    expect(Object.values(next.scores).every((row) => row.every((v) => v === null))).toBe(true)
  })

  it('같은 점수는 같은 등수다', () => {
    let s = game(['a', 'b', 'c'])
    s = score(rollTo(s, [1, 1, 1, 1, 1]), 'yacht')
    s = score(rollTo(s, [2, 2, 2, 2, 2]), 'yacht')
    s = score(rollTo(s, [1, 2, 3, 4, 6]), 'ones')
    expect(ranking(s).map((r) => [r.id, r.place])).toEqual([
      ['a', 1],
      ['b', 1],
      ['c', 3],
    ])
  })
})
