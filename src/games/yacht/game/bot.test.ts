import { describe, expect, it } from 'vitest'
import { botStep, type BotLevel } from './bot'
import { applyAction, CATS, createGame, currentPlayer, scoreOf, seededRng, totalsOf, type GameState } from './rules'

/** 봇 혼자 한 판을 끝까지 한다. 봇이 규칙을 어기면 applyAction 이 던진다. */
function solo(level: BotLevel, seed: number): number {
  const rng = seededRng(seed)
  let s = createGame({ players: [{ id: 'bot', name: '봇' }] }, rng)
  while (s.phase === 'play') {
    const step = botStep(s, level, rng)
    s = applyAction(s, step.type === 'roll' ? { type: 'roll', by: 'bot', held: step.held } : { type: 'score', by: 'bot', cat: step.cat }, rng)
  }
  return totalsOf(s.scores.bot).total
}

const average = (level: BotLevel, n: number) => {
  let sum = 0
  for (let i = 0; i < n; i++) sum += solo(level, 1000 + i)
  return sum / n
}

/** 첫 굴림이 `dice` 로 나온 상태. */
function rolled(dice: number[], fill: Partial<Record<(typeof CATS)[number], number>> = {}): GameState {
  const s = createGame({ players: [{ id: 'bot', name: '봇' }] })
  const scores = CATS.map((c) => fill[c] ?? null)
  return { ...s, dice, rolls: 1, scores: { bot: scores } }
}

describe('요트 봇', () => {
  it('어려울수록 평균 점수가 높다', () => {
    const easy = average('easy', 100)
    const normal = average('normal', 100)
    const hard = average('hard', 100)
    expect(normal).toBeGreaterThan(easy + 15)
    expect(hard).toBeGreaterThan(normal)
    expect(hard).toBeGreaterThan(170)
  })

  it('요트가 나오면 바로 요트에 적는다', () => {
    for (const level of ['easy', 'normal', 'hard'] as const) {
      expect(botStep(rolled([4, 4, 4, 4, 4]), level, () => 0.5)).toEqual({ type: 'score', cat: 'yacht' })
    }
  })

  it('L. 스트레이트가 나오면 적는다', () => {
    expect(botStep(rolled([3, 5, 2, 6, 4]), 'hard')).toEqual({ type: 'score', cat: 'largeStraight' })
  })

  it('같은 눈 넷이면 그 넷을 남기고 굴린다', () => {
    const step = botStep(rolled([6, 2, 6, 6, 6]), 'hard')
    expect(step).toEqual({ type: 'roll', held: [true, false, true, true, true] })
  })

  it('세 번 다 굴렸으면 빈칸에 적는다', () => {
    const s = { ...rolled([1, 2, 3, 5, 6], { choice: 20 }), rolls: 3 }
    const step = botStep(s, 'hard')
    expect(step.type).toBe('score')
    if (step.type === 'score') expect(s.scores.bot[CATS.indexOf(step.cat)]).toBeNull()
  })

  it('남은 칸이 하나면 0점이어도 그 칸에 적는다', () => {
    const fill = Object.fromEntries(CATS.filter((c) => c !== 'yacht').map((c) => [c, 0]))
    const s = { ...rolled([1, 2, 3, 5, 6], fill), rolls: 3 }
    expect(botStep(s, 'normal')).toEqual({ type: 'score', cat: 'yacht' })
    expect(scoreOf('yacht', s.dice)).toBe(0)
  })

  it('한 수를 빨리 고른다', () => {
    const s = rolled([1, 3, 3, 5, 6])
    const t = performance.now()
    for (let i = 0; i < 10; i++) botStep(s, 'hard')
    expect((performance.now() - t) / 10).toBeLessThan(150)
  })

  it('차례인 봇이 아직 안 굴렸으면 굴린다', () => {
    const s = createGame({ players: [{ id: 'bot', name: '봇' }] })
    expect(currentPlayer(s)).toBe('bot')
    expect(botStep(s, 'hard')).toEqual({ type: 'roll', held: [false, false, false, false, false] })
  })
})
