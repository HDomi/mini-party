// 봇: 각도·파워를 촘촘히 훑어 실제 비행을 시뮬레이션하고, 적에게 가장 큰 피해를 주는 조합을 고른다.
// 난이도는 고른 조합에 섞는 오차로 정한다. 움직이지는 않는다.

import { absoluteDeg, TRIPLE_SPREAD, WEAPON_LIST, WEAPONS, tankOf, terrainOf, type GameState, type Tank, type Weapon } from './rules'
import { blastDamage, bodyCenter, clamp, fly, muzzle, SPEED_PER_POWER, type Terrain } from './world'

export type BotLevel = 'easy' | 'normal' | 'hard'

export interface Plan {
  weapon: Weapon
  angle: number
  power: number
  facing: 1 | -1
}

/** 표준편차. 파워 1 은 먼 거리에서 20 단위쯤 차이 난다. */
const NOISE: Record<BotLevel, { angle: number; power: number }> = {
  easy: { angle: 7, power: 9 },
  normal: { angle: 2.5, power: 3.5 },
  hard: { angle: 0.8, power: 1.2 },
}

/** 우리 편이 맞는 피해는 이만큼 무겁게 본다. */
const FRIENDLY = 1.5
const KILL_BONUS = 20

interface Score {
  /** 적 피해 - 아군 피해. 양수면 쓸 만한 수다. */
  value: number
  /** 떨어진 자리에서 가장 가까운 적까지의 거리. 맞힐 수 없을 때 가까운 쪽을 고른다. */
  miss: number
}

function evaluate(s: GameState, terrain: Terrain, me: Tank, weapon: Weapon, angle: number, power: number, facing: 1 | -1): Score {
  const spec = WEAPONS[weapon]
  const deg = absoluteDeg(angle, facing)
  const degs = weapon === 'triple' ? [deg - TRIPLE_SPREAD, deg, deg + TRIPLE_SPREAD] : [deg]
  const alive = s.tanks.filter((t) => t.alive)
  const enemies = alive.filter((t) => t.team !== me.team)
  const from = muzzle(me, deg)
  const dealt = new Map<string, number>()
  let miss = Infinity
  for (const d of degs) {
    const f = fly({ t: terrain, from, deg: d, speed: power * SPEED_PER_POWER, wind: s.wind, tanks: alive, shooter: me.id })
    if (f.end === 'out' || f.end === 'water') continue
    for (const e of enemies) {
      const c = bodyCenter(e)
      miss = Math.min(miss, Math.hypot(c.x - f.x, c.y - f.y))
    }
    for (const t of alive) {
      const dmg = blastDamage({ x: f.x, y: f.y, r: spec.r, dmg: spec.dmg }, t)
      if (dmg > 0) dealt.set(t.id, (dealt.get(t.id) ?? 0) + dmg)
    }
  }
  let value = 0
  for (const t of alive) {
    const dmg = Math.min(t.hp, dealt.get(t.id) ?? 0)
    if (t.team === me.team) value -= dmg * FRIENDLY
    else value += dmg + (dmg >= t.hp ? KILL_BONUS : 0)
  }
  return { value, miss }
}

const better = (a: Score, b: Score) => (a.value > 0 || b.value > 0 ? a.value > b.value : a.miss < b.miss)

/** 평균 0, 표준편차 1 쯤 되는 난수. */
const gauss = (rand: () => number) => (rand() + rand() + rand() - 1.5) * 2

export function botPlan(s: GameState, id: string, level: BotLevel, rand: () => number = Math.random): Plan {
  const me = tankOf(s, id)
  if (!me) throw new Error(`no tank ${id}`)
  const terrain = terrainOf(s)

  let best = { score: { value: -Infinity, miss: Infinity } as Score, angle: me.angle, power: me.power, facing: me.facing }
  for (const facing of [1, -1] as const) {
    for (let angle = 6; angle <= 86; angle += 2) {
      for (let power = 25; power <= 100; power += 1.5) {
        const score = evaluate(s, terrain, me, 'shell', angle, power, facing)
        if (better(score, best.score)) best = { score, angle, power, facing }
      }
    }
  }

  // 같은 조준으로 다른 무기가 더 나은지 본다. 쉬움은 주로 기본탄만 쓴다.
  let weapon: Weapon = 'shell'
  if (level !== 'easy' || rand() < 0.3) {
    let top = best.score.value
    for (const w of WEAPON_LIST) {
      if (w === 'shell' || me.ammo[w] <= 0) continue
      const v = evaluate(s, terrain, me, w, best.angle, best.power, best.facing).value
      if (v > top * 1.15 && v > top + 4) {
        top = v
        weapon = w
      }
    }
    // 아무도 맞힐 수 없으면(산에 막히는 등) 굴착탄으로 길을 판다.
    if (best.score.value <= 0 && level !== 'easy' && me.ammo.drill > 0) weapon = 'drill'
  }

  const noise = NOISE[level]
  return {
    weapon,
    angle: clamp(Math.round(best.angle + gauss(rand) * noise.angle), 0, 90),
    power: clamp(Math.round((best.power + gauss(rand) * noise.power) * 10) / 10, 0, 100),
    facing: best.facing,
  }
}
