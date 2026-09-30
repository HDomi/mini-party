import { describe, expect, it } from 'vitest'
import { botPlan, type BotLevel } from './bot'
import { applyAction, createGame, currentTank, type GameState } from './rules'
import { COL, encodeTerrain, makeRng, MAPS, type MapKind, type Terrain } from './world'

function duel(): GameState {
  const s = createGame({
    players: [
      { id: 'a', name: 'A', slot: 0 },
      { id: 'b', name: 'B', slot: 1 },
    ],
    teamMode: false,
    map: 'hills',
    seed: 5,
  })
  const terrain: Terrain = { kind: 'hills', cols: Array.from({ length: MAPS.hills.w / COL }, () => [0, 200]) }
  const xs: Record<string, number> = { a: 250, b: 850 }
  return {
    ...s,
    terrain: encodeTerrain(terrain),
    wind: 0,
    tanks: s.tanks.map((t) => ({ ...t, x: xs[t.id], y: 200 })),
  }
}

/** 끝날 때까지 봇끼리 쏜다. 봇이 규칙을 어기면 applyAction 이 던진다. */
function match(levels: BotLevel[], teamMode: boolean, seed: number, map: MapKind = 'hills', maxTurns = 120): GameState {
  const rng = makeRng(seed)
  const players = levels.map((_, i) => ({ id: `p${i}`, name: `P${i}`, slot: i }))
  let s = createGame({ players, teamMode, map, seed })
  for (let n = 0; s.phase === 'play' && n < maxTurns; n++) {
    const me = currentTank(s)
    const plan = botPlan(s, me.id, levels[Number(me.id.slice(1))], rng.next)
    s = applyAction(s, { type: 'fire', by: me.id, ...plan })
  }
  return s
}

describe('botPlan', () => {
  it('hits a tank on open ground', () => {
    const s = duel()
    const first = currentTank(s)
    const plan = botPlan(s, first.id, 'hard', makeRng(1).next)
    expect(plan.facing).toBe(first.x < 600 ? 1 : -1)
    const next = applyAction(s, { type: 'fire', by: first.id, ...plan })
    const other = next.tanks.find((t) => t.id !== first.id)!
    expect(other.hp).toBeLessThan(100)
  })

  it('finishes a free-for-all', () => {
    const s = match(['hard', 'normal', 'hard'], false, 11)
    expect(s.phase).toBe('over')
  }, 30_000)

  it('finishes a team game', () => {
    const s = match(['hard', 'hard', 'normal', 'normal'], true, 23)
    expect(s.phase).toBe('over')
  }, 30_000)

  it('finishes games on the other maps', () => {
    for (const map of ['box', 'islands'] as const) {
      const s = match(['hard', 'normal', 'hard'], false, 31, map)
      expect(s.phase).toBe('over')
    }
  }, 60_000)
})
