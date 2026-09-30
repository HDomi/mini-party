import { describe, expect, it } from 'vitest'
import { generateMap } from './maps'
import {
  applyAction,
  createGame,
  currentTank,
  FELL_Y,
  RuleError,
  shotFlights,
  StaleError,
  terrainOf,
  WEAPONS,
  type Entrant,
  type GameState,
  type Tank,
} from './rules'
import {
  applyCrater,
  COL,
  dir,
  encodeTerrain,
  fly,
  FUEL,
  groundBelow,
  makeRng,
  MAP_KINDS,
  MAPS,
  MAX_WIND,
  muzzle,
  solidAt,
  SPEED_PER_POWER,
  topAt,
  walk,
  type MapKind,
  type Terrain,
} from './world'

const P = (id: string, slot: number): Entrant => ({ id, name: id.toUpperCase(), slot })

/** 폭 1200 평지. */
function flat(height = 200, kind: MapKind = 'hills'): Terrain {
  return { kind, cols: Array.from({ length: MAPS[kind].w / COL }, () => [0, height]) }
}

/** 지형 위 원하는 자리에 탱크를 세운 상태. 바람은 없다. */
function arena(xs: number[], opts: { teamMode?: boolean; terrain?: Terrain } = {}): GameState {
  const ids = xs.map((_, i) => String.fromCharCode(97 + i))
  const terrain = opts.terrain ?? flat()
  const s = createGame({ players: ids.map((id, i) => P(id, i)), teamMode: !!opts.teamMode, map: terrain.kind, seed: 1 })
  const tanks: Tank[] = ids.map((id, i) => {
    const t = s.tanks.find((x) => x.id === id)!
    return { ...t, x: xs[i], y: topAt(terrain, xs[i]) }
  })
  return { ...s, tanks, terrain: encodeTerrain(terrain), wind: 0, current: 0 }
}

/** 바람 없이 `angle`, `power` 로 쏘면 떨어지는 x. */
function landing(s: GameState, angle: number, power: number): number {
  const me = currentTank(s)
  return fly({
    t: terrainOf(s),
    from: muzzle(me, angle),
    deg: angle,
    speed: power * SPEED_PER_POWER,
    wind: 0,
    tanks: [],
    shooter: me.id,
  }).x
}

describe('dir', () => {
  it('matches Math.sin / cos closely', () => {
    for (let deg = -30; deg <= 210; deg += 7.5) {
      const d = dir(deg)
      expect(d.x).toBeCloseTo(Math.cos((deg * Math.PI) / 180), 12)
      expect(d.y).toBeCloseTo(Math.sin((deg * Math.PI) / 180), 12)
    }
  })
})

describe('maps', () => {
  for (const kind of MAP_KINDS) {
    it(`${kind}: places every tank on open ground`, () => {
      for (const n of [2, 3, 4]) {
        for (let seed = 1; seed <= 15; seed++) {
          const { terrain, spots } = generateMap(kind, makeRng(seed * 7919), n)
          expect(spots).toHaveLength(n)
          for (const p of spots) {
            // 발밑이 흙이고, 위는 탱크 높이만큼 비어 있다. 물에 잠기지 않는다.
            expect(groundBelow(terrain, p.x, p.y)).toBeCloseTo(p.y, 0)
            expect(solidAt(terrain, p.x, p.y + 8)).toBe(false)
            expect(solidAt(terrain, p.x, p.y + 20)).toBe(false)
            expect(p.y).toBeGreaterThan(MAPS[kind].sea + 10)
          }
          // 너무 붙어 서지 않는다(바위 상자는 위아래로 떨어져 있을 수 있다).
          for (let i = 0; i < n; i++)
            for (let j = i + 1; j < n; j++) expect(Math.hypot(spots[i].x - spots[j].x, spots[i].y - spots[j].y)).toBeGreaterThan(40)
        }
      }
    })
  }

  it('islands leave open sea between the islands', () => {
    const { terrain } = generateMap('islands', makeRng(3), 3)
    const empty = terrain.cols.filter((c) => c.length === 0).length
    expect(empty).toBeGreaterThan(terrain.cols.length * 0.1)
  })

  it('box has floating rock (more than one span in some column)', () => {
    const { terrain } = generateMap('box', makeRng(5), 4)
    expect(terrain.cols.some((c) => c.length >= 4)).toBe(true)
  })
})

describe('createGame', () => {
  it('seats everyone on the ground with full hp', () => {
    for (const map of MAP_KINDS) {
      const s = createGame({ players: [P('a', 0), P('b', 1), P('c', 2), P('d', 3)], teamMode: false, map, seed: 7 })
      const t = terrainOf(s)
      expect(s.tanks).toHaveLength(4)
      expect(new Set(s.tanks.map((x) => x.team)).size).toBe(4)
      for (const x of s.tanks) {
        expect(x.hp).toBe(100)
        expect(groundBelow(t, x.x, x.y)).toBeCloseTo(x.y, 0)
      }
      expect(Math.abs(s.wind)).toBeLessThanOrEqual(MAX_WIND)
      expect(t.cols).toHaveLength(MAPS[map].w / COL)
    }
  })

  it('alternates teams in team mode', () => {
    const s = createGame({ players: [P('a', 0), P('b', 1), P('c', 2), P('d', 3)], teamMode: true, map: 'hills', seed: 3 })
    const teams = s.tanks.map((t) => t.team)
    expect(teams[0]).not.toBe(teams[1])
    expect(teams[1]).not.toBe(teams[2])
    expect(teams[2]).not.toBe(teams[3])
    // 서 있는 자리도 번갈아 있다.
    const byX = [...s.tanks].sort((p, q) => p.x - q.x).map((t) => t.team)
    expect(byX[0]).not.toBe(byX[1])
  })

  it('is deterministic for a seed', () => {
    const a = createGame({ players: [P('a', 0), P('b', 1)], teamMode: false, map: 'box', seed: 42 })
    const b = createGame({ players: [P('a', 0), P('b', 1)], teamMode: false, map: 'box', seed: 42 })
    expect(a).toEqual(b)
  })
})

describe('walk', () => {
  it('spends fuel on flat ground', () => {
    const r = walk(flat(), 300, 200, 350, FUEL)
    expect(r.x).toBe(350)
    expect(r.y).toBe(200)
    expect(r.fuel).toBe(FUEL - 50)
  })

  it('stops when fuel runs out', () => {
    const r = walk(flat(), 300, 200, 900, FUEL)
    expect(r.x).toBe(300 + FUEL)
    expect(r.fuel).toBe(0)
  })

  it('is blocked by a cliff', () => {
    const t = flat()
    for (let i = 120; i < t.cols.length; i++) t.cols[i] = [0, 400]
    const r = walk(t, 300, 200, 450, FUEL)
    expect(r.x).toBeLessThan(360)
    expect(r.x).toBeGreaterThan(340)
  })

  it('is blocked by a low ceiling', () => {
    const t = flat()
    for (let i = 120; i < 140; i++) t.cols[i] = [0, 200, 210, 300]
    const r = walk(t, 300, 200, 450, FUEL)
    expect(r.x).toBeLessThan(362)
  })

  it('does not drive into the sea', () => {
    const t = flat(200, 'islands')
    for (let i = 120; i < t.cols.length; i++) t.cols[i] = []
    const r = walk(t, 300, 200, 450, FUEL)
    expect(r.x).toBeLessThan(362)
    expect(r.y).toBeCloseTo(200, 0)
  })
})

describe('applyCrater', () => {
  it('digs a round hole and leaves the ground above floating', () => {
    const t = applyCrater(flat(), 600, 200, 30)
    expect(topAt(t, 600)).toBe(170)
    expect(topAt(t, 500)).toBe(200)
    // 지표보다 아래에서 터지면 동굴이 생긴다. 흙은 무너지지 않는다.
    const deep = applyCrater(flat(), 600, 100, 30)
    expect(topAt(deep, 600)).toBe(200)
    expect(solidAt(deep, 600, 100)).toBe(false)
    expect(groundBelow(deep, 600, 125)).toBe(70)
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
    expect(topAt(terrainOf(next), x)).toBeLessThan(200 - WEAPONS.shell.r * 0.8)
  })

  it('replays the same flights from the state before the shot', () => {
    const s = createGame({ players: [P('a', 0), P('b', 1), P('c', 2)], teamMode: false, map: 'box', seed: 11 })
    const by = currentTank(s).id
    const next = applyAction(s, { type: 'fire', by, weapon: 'triple', angle: 55, power: 70, facing: 1 })
    const shot = next.lastShot!
    const flights = shotFlights(JSON.parse(JSON.stringify(s)), terrainOf(s), shot)
    expect(flights).toHaveLength(3)
    const landed = flights.filter((f) => f.end === 'ground' || f.end === 'tank').sort((p, q) => p.steps - q.steps)
    expect(landed.map((f) => [Math.round(f.x), Math.round(f.y), f.steps])).toEqual(shot.booms.map((b) => [b.x, b.y, b.steps]))
  })

  it('fires three shells with triple and uses ammo', () => {
    const s = arena([300, 1000])
    const next = applyAction(s, { type: 'fire', by: 'a', weapon: 'triple', angle: 45, power: 60, facing: 1 })
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

  it('sinks a tank that ends up half under the sea', () => {
    // 섬 맵: 오른쪽 땅이 해수면 바로 위. 굴착탄으로 발밑을 파면 물에 잠긴다.
    const t = flat(MAPS.islands.sea + 12, 'islands')
    for (let i = 0; i < 170; i++) t.cols[i] = [0, 200]
    const x = landing(arena([300, 1100], { terrain: t }), 45, 60)
    expect(x).toBeGreaterThan(520)
    const next = applyAction(arena([300, x], { terrain: t }), { type: 'fire', by: 'a', weapon: 'drill', angle: 45, power: 60, facing: 1 })
    const b = next.tanks.find((k) => k.id === 'b')!
    expect(b.alive).toBe(false)
    expect(b.out).toBe('sea')
  })

  it('shells that hit the sea do not explode', () => {
    const t = flat(200, 'islands')
    for (let i = 150; i < t.cols.length; i++) t.cols[i] = []
    const s = arena([300, 350], { terrain: t })
    const next = applyAction(s, { type: 'fire', by: 'a', weapon: 'heavy', angle: 45, power: 70, facing: 1 })
    expect(next.lastShot?.booms).toHaveLength(0)
  })

  it('drops a tank out of a bottomless map when the floor is gone', () => {
    const t = flat(200, 'box')
    const s = arena([150, 700], { terrain: t })
    const x = landing(s, 45, 60)
    // 얇은 발판 위에 선 b 발밑을 파면 끝없이 떨어진다.
    const thin: Terrain = { kind: 'box', cols: t.cols.map((c, i) => (Math.abs((i + 0.5) * COL - x) < 80 ? [180, 200] : c)) }
    const next = applyAction(arena([150, x], { terrain: thin }), { type: 'fire', by: 'a', weapon: 'heavy', angle: 45, power: 60, facing: 1 })
    const b = next.tanks.find((k) => k.id === 'b')!
    expect(b.alive).toBe(false)
    expect(b.out).toBe('fall')
    expect(b.y).toBe(FELL_Y)
    // 상태에 -Infinity 같은 값이 들어가지 않는다.
    expect(JSON.parse(JSON.stringify(next))).toEqual(next)
  })

  it('keeps the serialized state well under the DB limit', () => {
    // 바위 상자에서 한참 싸운 판.
    let s = createGame({ players: [P('a', 0), P('b', 1), P('c', 2), P('d', 3)], teamMode: false, map: 'box', seed: 4 })
    const rng = makeRng(9)
    let longest = 0
    for (let n = 0; n < 80 && s.phase === 'play'; n++) {
      const by = currentTank(s).id
      s = applyAction(s, { type: 'fire', by, weapon: n % 5 === 0 ? 'shell' : 'triple', angle: 20 + rng.next() * 70, power: 30 + rng.next() * 70, facing: rng.next() < 0.5 ? 1 : -1 })
      s = { ...s, tanks: s.tanks.map((t) => ({ ...t, ammo: { heavy: 2, triple: 2, drill: 2 } })) }
      longest = Math.max(longest, JSON.stringify(s).length)
    }
    expect(longest).toBeLessThan(15_000)
  })

  it('does not mutate its input and survives a JSON round trip', () => {
    const s = createGame({ players: [P('a', 0), P('b', 1), P('c', 2)], teamMode: false, map: 'islands', seed: 9 })
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
    expect(next.tanks[0].y).toBe(200)
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

  it('rematch rotates the first shooter and keeps the map', () => {
    const s0 = createGame({ players: [P('a', 0), P('b', 1)], teamMode: false, map: 'islands', seed: 2 })
    const s = applyAction(s0, { type: 'resign', by: s0.tanks[1].id })
    const next = applyAction(s, { type: 'rematch', by: 'a' })
    expect(next.round).toBe(s.round + 1)
    expect(next.phase).toBe('play')
    expect(next.map).toBe('islands')
    expect(next.terrain).not.toBe(s.terrain)
    expect(next.tanks.map((t) => t.id)).toEqual([s0.tanks[1].id, s0.tanks[0].id])
    expect(next.tanks.every((t) => t.hp === 100 && t.alive)).toBe(true)
  })
})
