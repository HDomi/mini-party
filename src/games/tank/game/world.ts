// 포격전 월드: 지형(높이맵), 이동, 포탄 비행, 폭발. 순수 함수만 있다.
//
// 좌표는 월드 단위이고 y 는 위쪽이 + 다. 0 은 맵 바닥이다.
// 지형은 폭 `COL` 인 기둥 `COLS` 개의 높이로 저장한다. 기둥 사이는 선형 보간한다.

export const W = 1200
export const H = 700
export const COL = 3
export const COLS = W / COL

/** 이 높이 아래는 물이다. 탱크가 여기까지 떨어지면 탈락한다. */
export const WATER = 10
const MIN_GROUND = 120
const MAX_GROUND = 480

export const GRAVITY = 300
/** 파워 1당 발사 속도. 파워 100 이면 평지에서 맵 끝까지 넉넉히 날아간다. */
export const SPEED_PER_POWER = 7.2
/** 바람 1당 가로 가속도. */
export const WIND_ACCEL = 6
export const MAX_WIND = 10
export const DT = 1 / 100
/** 궤적은 이 스텝마다 한 점씩 저장한다. */
export const SAMPLE = 3
/** 10초. 이보다 오래 나는 포탄은 없고, 궤적이 DB 규칙의 게임 문자열 한도(20000자)를 넘지 않게 한다. */
const MAX_STEPS = 1000

export const TANK_W = 30
/** 충돌·피해 판정용 반지름. 중심은 `bodyCenter`. */
export const TANK_R = 14
/** 포신이 도는 점의 높이(탱크 바닥 기준). */
export const TURRET_Y = 14
export const BARREL = 22
const SHELL_R = 3

/** 한 턴에 쓸 수 있는 연료. 평지에서 1 단위 움직이면 1 을 쓴다. */
export const FUEL = 180
/** 1 단위 전진할 때 오를 수 있는 높이. 이보다 가파르면 막힌다. */
const MAX_CLIMB = 1.8
/** 오르막에서 높이 1 당 더 드는 연료. */
const CLIMB_COST = 1.5

export type Terrain = number[]

export interface Rng {
  next(): number
  /** 지금까지 뽑은 뒤의 내부 상태. 게임 상태에 저장했다가 이어서 뽑는다. */
  readonly seed: number
}

/** mulberry32. `applyAction` 이 순수 함수로 남도록 난수 상태를 게임 상태에 둔다. */
export function makeRng(seed: number): Rng {
  let a = seed >>> 0
  return {
    next() {
      a = (a + 0x6d2b79f5) >>> 0
      let t = a
      t = Math.imul(t ^ (t >>> 15), t | 1)
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296
    },
    get seed() {
      return a
    },
  }
}

export const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v))

/** 기둥 중심 사이를 선형 보간한 지표 높이. */
export function surface(h: Terrain, x: number): number {
  const f = x / COL - 0.5
  if (f <= 0) return h[0]
  if (f >= h.length - 1) return h[h.length - 1]
  const i = Math.floor(f)
  return h[i] + (h[i + 1] - h[i]) * (f - i)
}

/** 사인파 몇 개를 겹친 언덕. `pads` 의 x 자리는 탱크가 설 수 있게 평평하게 다진다. */
export function makeTerrain(rand: () => number, pads: number[]): Terrain {
  const base = 210 + rand() * 90
  const waves = Array.from({ length: 4 }, (_, k) => ({
    amp: k === 0 ? 60 + rand() * 60 : (40 + rand() * 30) / k,
    freq: k === 0 ? 0.6 + rand() * 0.9 : 1 + k + rand() * 2,
    phase: rand() * Math.PI * 2,
  }))
  const h: number[] = []
  for (let i = 0; i < COLS; i++) {
    const u = (i + 0.5) / COLS
    let v = base
    for (const w of waves) v += w.amp * Math.sin(Math.PI * 2 * w.freq * u + w.phase)
    h.push(clamp(v, MIN_GROUND, MAX_GROUND))
  }
  const PAD = 18
  for (const px of pads) {
    const level = surface(h, px)
    for (let i = 0; i < COLS; i++) {
      const d = Math.abs((i + 0.5) * COL - px)
      if (d >= PAD * 2) continue
      const t = d <= PAD ? 1 : 1 - (d - PAD) / PAD
      h[i] = h[i] + (level - h[i]) * t
    }
  }
  return h.map(Math.round)
}

/**
 * 원 모양으로 땅을 파낸다. 높이맵이라 원 위쪽에 남은 흙은 아래로 무너져 내린다.
 * 새 배열을 돌려준다.
 */
export function applyCrater(h: Terrain, cx: number, cy: number, r: number): Terrain {
  const out = h.slice()
  const first = Math.max(0, Math.floor((cx - r) / COL))
  const last = Math.min(h.length - 1, Math.ceil((cx + r) / COL))
  for (let i = first; i <= last; i++) {
    const dx = (i + 0.5) * COL - cx
    if (Math.abs(dx) >= r) continue
    const dy = Math.sqrt(r * r - dx * dx)
    const cut = Math.min(out[i], cy + dy) - Math.max(0, cy - dy)
    if (cut > 0) out[i] = Math.max(0, Math.round(out[i] - cut))
  }
  return out
}

/**
 * `x` 에서 `target` 쪽으로 1 단위씩 굴러간다. 너무 가파르거나 연료가 모자라면 그 자리에서 멈춘다.
 * 화면의 미리보기와 `applyAction` 이 같은 입력으로 부르므로 결과가 항상 같다.
 */
export function walk(h: Terrain, x: number, target: number, fuel: number): { x: number; fuel: number } {
  const to = clamp(target, TANK_W / 2, W - TANK_W / 2)
  let cx = x
  let f = fuel
  while (cx !== to) {
    const nx = to > cx ? Math.min(to, cx + 1) : Math.max(to, cx - 1)
    const dx = Math.abs(nx - cx)
    const rise = surface(h, nx) - surface(h, cx)
    if (rise > MAX_CLIMB * dx) break
    const cost = dx + Math.max(0, rise) * CLIMB_COST
    if (cost > f) break
    f -= cost
    cx = nx
  }
  return { x: cx, fuel: f }
}

export interface Body {
  id: string
  x: number
  /** 탱크 바닥의 높이. */
  y: number
}

export const bodyCenter = (t: { x: number; y: number }) => ({ x: t.x, y: t.y + 9 })

/** 수평 기준 각도(도, 0 = 오른쪽, 90 = 위, 180 = 왼쪽). */
export function muzzle(t: { x: number; y: number }, deg: number) {
  const a = (deg * Math.PI) / 180
  return { x: t.x + Math.cos(a) * BARREL, y: t.y + TURRET_Y + Math.sin(a) * BARREL }
}

export interface Flight {
  /** `SAMPLE` 스텝마다 저장한 위치. `[x0, y0, x1, y1, ...]`, 정수. 마지막 점은 끝난 자리다. */
  path: number[]
  /** 끝날 때까지 걸린 스텝 수. 시간은 `steps * DT` 초. */
  steps: number
  /** `out` 은 맵 옆으로 나갔거나 너무 오래 날았다. */
  end: 'ground' | 'tank' | 'out'
  x: number
  y: number
  hit: string | null
}

export function fly(opts: {
  h: Terrain
  from: { x: number; y: number }
  deg: number
  speed: number
  wind: number
  tanks: Body[]
  shooter: string
}): Flight {
  const { h, from, speed, tanks, shooter } = opts
  const a = (opts.deg * Math.PI) / 180
  let x = from.x
  let y = from.y
  let vx = Math.cos(a) * speed
  let vy = Math.sin(a) * speed
  const ax = opts.wind * WIND_ACCEL
  const path = [Math.round(x), Math.round(y)]
  const centers = tanks.map((t) => ({ id: t.id, ...bodyCenter(t) }))
  // 쏜 탱크 몸체를 한 번 벗어나야 자기 탱크에도 맞는다.
  let armed = false

  const done = (steps: number, end: Flight['end'], hit: string | null): Flight => {
    const lx = Math.round(x)
    const ly = Math.round(y)
    if (path[path.length - 2] !== lx || path[path.length - 1] !== ly) path.push(lx, ly)
    return { path, steps, end, x, y, hit }
  }

  for (let step = 1; step <= MAX_STEPS; step++) {
    vx += ax * DT
    vy -= GRAVITY * DT
    x += vx * DT
    y += vy * DT
    if (step % SAMPLE === 0) path.push(Math.round(x), Math.round(y))
    if (x < 0 || x >= W) return done(step, 'out', null)
    for (const c of centers) {
      const d = Math.hypot(c.x - x, c.y - y)
      if (c.id === shooter && !armed) {
        if (d > TANK_R + SHELL_R) armed = true
        continue
      }
      if (d < TANK_R + SHELL_R) return done(step, 'tank', c.id)
    }
    const ground = surface(h, x)
    if (y <= ground) {
      y = ground
      return done(step, 'ground', null)
    }
  }
  return done(MAX_STEPS, 'out', null)
}

export interface Blast {
  x: number
  y: number
  r: number
  dmg: number
}

/** 폭발 중심에서 탱크 몸체 가장자리까지의 거리에 비례해 줄어든다. */
export function blastDamage(b: Blast, t: { x: number; y: number }): number {
  const c = bodyCenter(t)
  const d = Math.max(0, Math.hypot(c.x - b.x, c.y - b.y) - TANK_R)
  if (d >= b.r) return 0
  return Math.max(1, Math.round(b.dmg * (1 - d / b.r)))
}

const FALL_SAFE = 20

/** 이 높이 이하로 떨어지면 다치지 않는다. */
export function fallDamage(drop: number): number {
  return drop <= FALL_SAFE ? 0 : Math.min(40, Math.round((drop - FALL_SAFE) * 0.5))
}
