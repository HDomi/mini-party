import { describe, expect, it } from 'vitest'
import {
  applyAction,
  createGame,
  currentTank,
  RuleError,
  StaleError,
  WEAPONS,
  type Entrant,
  type GameState,
  type Tank,
} from './rules'
import { applyCrater, COLS, fly, FUEL, MAX_WIND, muzzle, SPEED_PER_POWER, surface, walk, WATER } from './world'

const P = (id: string, slot: number): Entrant => ({ id, name: id.toUpperCase(), slot })

function flat(height = 200) {
  return Array.from({ length: COLS }, () => height)
}

/** 평지에 탱크를 원하는 자리에 세운 상태. 바람은 없다. */
function arena(xs: number[], opts: { teamMode?: boolean; terrain?: number[] } = {}): GameState {
  const ids = xs.map((_, i) => String.fromCharCode(97 + i))
  const s = createGame({ players: ids.map((id, i) => P(id, i)), teamMode: !!opts.teamMode, seed: 1 })
  const terrain = opts.terrain ?? flat()
  const tanks: Tank[] = ids.map((id, i) => {
    const t = s.tanks.find((x) => x.id === id)!
    return { ...t, x: xs[i], y: surface(terrain, xs[i]) }
  })
  return { ...s, tanks, terrain, wind: 0, current: 0 }
}

/** 바람 없이 평지에서 `angle`, `power` 로 쏘면 떨어지는 x. */
function landing(s: GameState, angle: number, power: number): number {
  const me = currentTank(s)
  return fly({
    h: s.terrain,
    from: muzzle(me, angle),
    deg: angle,
    speed: power * SPEED_PER_POWER,
    wind: 0,
    tanks: [],
    shooter: me.id,
  }).x
}

describe('createGame', () => {
  it('seats everyone on the ground with full hp', () => {
    const s = createGame({ players: [P('a', 0), P('b', 1), P('c', 2), P('d', 3)], teamMode: false, seed: 7 })
    expect(s.tanks).toHaveLength(4)
    expect(new Set(s.tanks.map((t) => t.team)).size).toBe(4)
    for (const t of s.tanks) {
      expect(t.hp).toBe(100)
      expect(t.y).toBeCloseTo(surface(s.terrain, t.x))
    }
    expect(Math.abs(s.wind)).toBeLessThanOrEqual(MAX_WIND)
    expect(s.terrain).toHaveLength(COLS)
  })

  it('alternates teams in team mode', () => {
    const s = createGame({ players: [P('a', 0), P('b', 1), P('c', 2), P('d', 3)], teamMode: true, seed: 3 })
    const teams = s.tanks.map((t) => t.team)
    expect(teams[0]).not.toBe(teams[1])
    expect(teams[1]).not.toBe(teams[2])
    expect(teams[2]).not.toBe(teams[3])
    // 서 있는 자리도 번갈아 있다.
    const byX = [...s.tanks].sort((p, q) => p.x - q.x).map((t) => t.team)
    expect(byX[0]).not.toBe(byX[1])
  })

  it('is deterministic for a seed', () => {
    const a = createGame({ players: [P('a', 0), P('b', 1)], teamMode: false, seed: 42 })
    const b = createGame({ players: [P('a', 0), P('b', 1)], teamMode: false, seed: 42 })
    expect(a).toEqual(b)
  })
})

describe('walk', () => {
  it('spends fuel on flat ground', () => {
    const r = walk(flat(), 300, 350, FUEL)
    expect(r.x).toBe(350)
    expect(r.fuel).toBe(FUEL - 50)
  })

  it('stops when fuel runs out', () => {
    const r = walk(flat(), 300, 900, FUEL)
    expect(r.x).toBe(300 + FUEL)
    expect(r.fuel).toBe(0)
  })

  it('is blocked by a cliff', () => {
    const h = flat()
    for (let i = 120; i < COLS; i++) h[i] = 400
    const r = walk(h, 300, 450, FUEL)
    expect(r.x).toBeLessThan(360)
    expect(r.x).toBeGreaterThan(340)
  })
})

describe('applyCrater', () => {
  it('digs a bowl and collapses overhangs', () => {
    const h = applyCrater(flat(), 600, 200, 30)
    expect(surface(h, 600)).toBe(170)
    expect(surface(h, 500)).toBe(200)
    // 지표보다 아래에서 터지면 위의 흙이 무너져 그만큼 낮아진다.
    const deep = applyCrater(flat(), 600, 100, 30)
    expect(surface(deep, 600)).toBe(140)
  })
})

describe('fire', () => {
  it('hits a tank where the shell lands', () => {
    let s = arena([300, 900])
    const x = landing(s, 45, 60)
    s = arena([300, x])
    const next = applyAction(s, { type: 'fire', by: 'a', weapon: 'shell', angle: 45, power: 60, facing: 1 })
    const b = next.tanks.find((t) => t.id === 'b')!
    expect(b.hp).toBeLessThan(100 - WEAPONS.shell.dmg * 0.7)
    expect(next.lastShot?.booms[0].hits.map((h) => h.id)).toContain('b')
    expect(next.lastShot?.seq).toBe(next.seq)
    expect(currentTank(next).id).toBe('b')
    expect(next.fuel).toBe(FUEL)
    expect(next.turn).toBe(s.turn + 1)
  })

  it('digs the ground where it lands', () => {
    const s = arena([300, 1000])
    const x = landing(s, 45, 60)
    const next = applyAction(s, { type: 'fire', by: 'a', weapon: 'shell', angle: 45, power: 60, facing: 1 })
    expect(surface(next.terrain, x)).toBeLessThan(200 - WEAPONS.shell.r * 0.8)
  })

  it('fires three shells with triple and uses ammo', () => {
    const s = arena([300, 1000])
    const next = applyAction(s, { type: 'fire', by: 'a', weapon: 'triple', angle: 45, power: 60, facing: 1 })
    expect(next.lastShot?.flights).toHaveLength(3)
    expect(next.lastShot?.booms).toHaveLength(3)
    expect(next.tanks[0].ammo.triple).toBe(WEAPONS.triple.ammo! - 1)
  })

  it('refuses an empty weapon and out-of-turn shots', () => {
    const s = arena([300, 900])
    const empty = { ...s, tanks: s.tanks.map((t, i) => (i === 0 ? { ...t, ammo: { ...t.ammo, heavy: 0 } } : t)) }
    expect(() => applyAction(empty, { type: 'fire', by: 'a', weapon: 'heavy', angle: 45, power: 50, facing: 1 })).toThrow(RuleError)
    expect(() => applyAction(s, { type: 'fire', by: 'b', weapon: 'shell', angle: 45, power: 50, facing: 1 })).toThrow(RuleError)
  })

  it('damages yourself at point-blank', () => {
    const s = arena([300, 900])
    const next = applyAction(s, { type: 'fire', by: 'a', weapon: 'shell', angle: 0, power: 2, facing: 1 })
    expect(next.tanks[0].hp).toBeLessThan(100)
  })

  it('ends the game when the last enemy dies', () => {
    let s = arena([300, 900])
    const x = landing(s, 45, 60)
    s = arena([300, x])
    s = { ...s, tanks: s.tanks.map((t) => (t.id === 'b' ? { ...t, hp: 5 } : t)) }
    const next = applyAction(s, { type: 'fire', by: 'a', weapon: 'shell', angle: 45, power: 60, facing: 1 })
    expect(next.phase).toBe('over')
    expect(next.winner).toBe(next.tanks[0].team)
    expect(next.lastShot?.deaths).toEqual(['b'])
  })

  it('keeps going while a teammate lives', () => {
    let s = arena([300, 900, 600, 1100], { teamMode: true })
    const target = s.tanks.find((t) => t.team !== s.tanks[0].team)!
    const x = landing(s, 45, 60)
    s = { ...s, tanks: s.tanks.map((t) => (t.id === target.id ? { ...t, x, y: 200, hp: 5 } : t)) }
    const next = applyAction(s, { type: 'fire', by: s.tanks[0].id, weapon: 'shell', angle: 45, power: 60, facing: 1 })
    expect(next.phase).toBe('play')
    // 죽은 탱크는 차례에서 빠진다.
    expect(currentTank(next).alive).toBe(true)
    expect(currentTank(next).id).not.toBe(target.id)
  })

  it('drops a tank into the water when the ground is gone', () => {
    // 오른쪽 절반이 물 바로 위까지 낮은 땅. b 발밑에 굴착탄을 쏴 마저 판다.
    const low = flat().map((h, i) => ((i + 0.5) * 3 > 500 ? WATER + 5 : h))
    const x = landing(arena([300, 1100], { terrain: low }), 45, 60)
    expect(x).toBeGreaterThan(560)
    const s2 = arena([300, x], { terrain: low })
    const next = applyAction(s2, { type: 'fire', by: 'a', weapon: 'drill', angle: 45, power: 60, facing: 1 })
    const b = next.tanks.find((t) => t.id === 'b')!
    expect(b.alive).toBe(false)
  })

  it('keeps the serialized state well under the DB limit', () => {
    let longest = 0
    for (const angle of [30, 45, 60, 75, 85, 90]) {
      for (const facing of [1, -1] as const) {
        const s = { ...arena([100, 1100], { terrain: flat(20) }), wind: facing * 10 }
        const next = applyAction(s, { type: 'fire', by: 'a', weapon: 'triple', angle, power: 100, facing })
        longest = Math.max(longest, JSON.stringify(next).length)
      }
    }
    expect(longest).toBeLessThan(15_000)
  })

  it('does not mutate its input and survives a JSON round trip', () => {
    const s = createGame({ players: [P('a', 0), P('b', 1), P('c', 2)], teamMode: false, seed: 9 })
    const before = JSON.stringify(s)
    const by = currentTank(s).id
    const action = { type: 'fire', by, weapon: 'heavy', angle: 50, power: 70, facing: 1 } as const
    const a = applyAction(s, action)
    expect(JSON.stringify(s)).toBe(before)
    const b = applyAction(JSON.parse(before), action)
    expect(JSON.stringify(b)).toBe(JSON.stringify(a))
  })
})

describe('move', () => {
  it('uses the shared fuel and keeps the tank on the ground', () => {
    const s = arena([300, 900])
    const next = applyAction(s, { type: 'move', by: 'a', x: 360, facing: 1 })
    expect(next.tanks[0].x).toBe(360)
    expect(next.fuel).toBe(FUEL - 60)
    const again = applyAction(next, { type: 'move', by: 'a', x: 1000, facing: 1 })
    expect(again.tanks[0].x).toBe(300 + FUEL)
    expect(again.fuel).toBe(0)
    expect(again.turn).toBe(s.turn)
  })
})

describe('skip / resign / rematch', () => {
  it('skips only the matching turn', () => {
    const s = arena([300, 900])
    const next = applyAction(s, { type: 'skip', by: 'b', turn: s.turn })
    expect(currentTank(next).id).toBe('b')
    expect(() => applyAction(next, { type: 'skip', by: 'a', turn: s.turn })).toThrow(StaleError)
  })

  it('resigning passes the turn and can end the game', () => {
    const s = arena([300, 900, 600])
    const r1 = applyAction(s, { type: 'resign', by: 'a' })
    expect(currentTank(r1).id).toBe('b')
    expect(r1.phase).toBe('play')
    const r2 = applyAction(r1, { type: 'resign', by: 'c' })
    expect(currentTank(r2).id).toBe('b')
    expect(r2.phase).toBe('over')
    expect(r2.winner).toBe(r2.tanks.find((t) => t.id === 'b')!.team)
  })

  it('rematch rotates the first shooter', () => {
    const s = applyAction(arena([300, 900]), { type: 'resign', by: 'b' })
    const next = applyAction(s, { type: 'rematch', by: 'a' })
    expect(next.round).toBe(s.round + 1)
    expect(next.phase).toBe('play')
    expect(next.tanks.map((t) => t.id)).toEqual(['b', 'a'])
    expect(next.tanks.every((t) => t.hp === 100 && t.alive)).toBe(true)
  })
})
