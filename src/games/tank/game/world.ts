// 포격전 월드: 지형, 이동, 포탄 비행, 폭발. 순수 함수만 있다.
//
// 좌표는 월드 단위이고 y 는 위쪽이 + 다. 0 은 맵 바닥이다.
// 지형은 폭 `COL` 인 열마다 흙이 차 있는 구간 목록 `[아래0, 위0, 아래1, 위1, ...]`(오름차순, 정수)이다.
// 언덕처럼 구간이 하나면 높이맵과 같고, 여러 개면 떠 있는 바위·동굴 천장이 생긴다.
//
// 포탄 비행(`fly`)은 발사한 기기만 계산하지 않는다. 보는 기기도 발사 직전 상태에서 다시 계산해 궤적을 그린다.
// 그래서 비행에 쓰는 계산은 모든 브라우저에서 비트까지 같아야 한다: 사칙연산과 Math.sqrt 만 쓰고,
// 엔진마다 마지막 자리가 다를 수 있는 Math.sin·cos·hypot 은 쓰지 않는다.

export const COL = 3

export type MapKind = 'hills' | 'box' | 'islands'
export const MAP_KINDS: MapKind[] = ['hills', 'box', 'islands']

export interface MapSpec {
  name: string
  hint: string
  w: number
  h: number
  /**
   * 해수면. 탱크 몸체 절반 이상이 이 아래로 잠기면 파괴되고, 포탄은 여기 닿으면 터지지 않고 가라앉는다.
   * 0 이면 물이 없고 맵 아래로 떨어지면 끝이다.
   */
  sea: number
  /** 기본 배율에서 세로로 담는 월드 높이. 가장 높은 땅 위의 탱크와 이름표까지. */
  fitH: number
}

export const MAPS: Record<MapKind, MapSpec> = {
  hills: { name: '언덕 평야', hint: '언덕이 이어진 평지', w: 1200, h: 700, sea: 10, fitH: 560 },
  box: { name: '바위 상자', hint: '정사각형 안에 뜬 바위들. 바닥이 없어요', w: 900, h: 900, sea: 0, fitH: 900 },
  islands: { name: '세 섬', hint: '바다에 빠지면 파괴돼요', w: 1200, h: 700, sea: 80, fitH: 560 },
}

export const GRAVITY = 300
/** 파워 1당 발사 속도. 파워 100 이면 평지에서 맵 끝까지 넉넉히 날아간다. */
export const SPEED_PER_POWER = 7.2
/** 바람 1당 가로 가속도. */
export const WIND_ACCEL = 6
export const MAX_WIND = 10
export const DT = 1 / 100
/** 10초. 이보다 오래 나는 포탄은 없다. */
const MAX_STEPS = 1000

export const TANK_W = 30
/** 충돌·피해 판정용 반지름. 중심은 `bodyCenter`. */
export const TANK_R = 14
/** 포신이 도는 점의 높이(탱크 바닥 기준). */
export const TURRET_Y = 14
export const BARREL = 22
/** 차체 높이. 절반 넘게 물에 잠기면 파괴된다. */
export const TANK_H = 13
const SHELL_R = 3
/** 탱크가 지나가려면 발밑에서 이만큼 위까지 비어 있어야 한다. */
const HEADROOM = 16

/** 한 턴에 쓸 수 있는 연료. 평지에서 1 단위 움직이면 1 을 쓴다. */
export const FUEL = 180
/** 1 단위 전진할 때 오를 수 있는 높이. 이보다 가파르면 막힌다. */
const MAX_CLIMB = 1.8
/** 오르막에서 높이 1 당 더 드는 연료. */
const CLIMB_COST = 1.5
/** 이보다 깊은 낭떠러지로는 스스로 내려가지 않는다. */
const MAX_DROP = 60
/** 발밑을 찾을 때 지금 높이보다 이만큼 위의 땅까지 발밑으로 본다(경사에서 옆 열이 조금 높은 경우). */
const FOOT_TOL = 4

export interface Terrain {
  kind: MapKind
  cols: number[][]
}

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

const PI = 3.141592653589793

/** 사칙연산만 쓴 sin(라디안). 모든 브라우저에서 같은 값이 나온다. */
function dsin(rad: number): number {
  let x = rad
  while (x > PI) x -= 2 * PI
  while (x < -PI) x += 2 * PI
  const x2 = x * x
  let term = x
  let sum = x
  for (let n = 1; n < 14; n++) {
    term *= -x2 / (2 * n * (2 * n + 1))
    sum += term
  }
  return sum
}

/** 수평 기준 각도(도)의 방향 벡터. 0 = 오른쪽, 90 = 위, 180 = 왼쪽. */
export function dir(deg: number): { x: number; y: number } {
  const rad = deg * (PI / 180)
  return { x: dsin(rad + PI / 2), y: dsin(rad) }
}

// ── 지형 ──

export const widthOf = (t: Terrain) => t.cols.length * COL

/** DB 에 넣는 문자열. 열은 `;`, 값은 `,` 로 나누고 36진수로 줄인다. */
export function encodeTerrain(t: Terrain): string {
  return t.cols.map((c) => c.map((v) => v.toString(36)).join(',')).join(';')
}

export function decodeTerrain(kind: MapKind, s: string): Terrain {
  return { kind, cols: s.split(';').map((c) => (c ? c.split(',').map((v) => parseInt(v, 36)) : [])) }
}

/** 구간 목록에서 [lo, hi] 를 파낸다. 새 배열을 돌려준다. */
export function cutSpan(col: number[], lo: number, hi: number): number[] {
  const out: number[] = []
  const push = (b: number, t: number) => {
    if (t - b >= 1) out.push(b, t)
  }
  for (let k = 0; k < col.length; k += 2) {
    const b = col[k]
    const t = col[k + 1]
    if (t <= lo || b >= hi) {
      out.push(b, t)
      continue
    }
    if (b < lo) push(b, Math.max(b, Math.floor(lo)))
    if (t > hi) push(Math.min(t, Math.ceil(hi)), t)
  }
  return out
}

/** 구간 목록에 [lo, hi] 를 채운다. 겹치거나 붙은 구간은 합친다. */
export function fillSpan(col: number[], lo: number, hi: number): number[] {
  const b0 = Math.max(0, Math.floor(lo))
  const t0 = Math.ceil(hi)
  if (t0 - b0 < 1) return col.slice()
  const spans: [number, number][] = [[b0, t0]]
  for (let k = 0; k < col.length; k += 2) spans.push([col[k], col[k + 1]])
  spans.sort((p, q) => p[0] - q[0])
  const out: number[] = []
  for (const [b, t] of spans) {
    if (out.length && b <= out[out.length - 1]) out[out.length - 1] = Math.max(out[out.length - 1], t)
    else out.push(b, t)
  }
  return out
}

/** 열 `col` 에서 높이 `y` 이하에 있는 가장 높은 흙 윗면. 없으면 -Infinity. */
function footIn(col: number[], y: number): number {
  let best = -Infinity
  for (let k = 1; k < col.length; k += 2) if (col[k] <= y) best = col[k]
  return best
}

/**
 * `(x, y)` 에 선 탱크의 발밑 높이. `y + tol` 이하의 땅만 본다. 이웃한 두 열의 윗면을 선형 보간해 경사가 매끄럽다.
 * 발밑이 비어 있으면 -Infinity.
 */
export function groundBelow(t: Terrain, x: number, y: number, tol = FOOT_TOL): number {
  const n = t.cols.length
  const f = x / COL - 0.5
  const i0 = clamp(Math.floor(f), 0, n - 1)
  const i1 = clamp(Math.floor(f) + 1, 0, n - 1)
  const u = clamp(f - Math.floor(f), 0, 1)
  const g0 = footIn(t.cols[i0], y + tol)
  const g1 = footIn(t.cols[i1], y + tol)
  if (g0 === -Infinity) return g1
  if (g1 === -Infinity) return g0
  return g0 + (g1 - g0) * u
}

/** 맨 위 흙 윗면. 탱크를 처음 세울 때와 미리보기에 쓴다. */
export function topAt(t: Terrain, x: number): number {
  return groundBelow(t, x, Infinity, 0)
}

export function solidAt(t: Terrain, x: number, y: number): boolean {
  const i = Math.floor(x / COL)
  if (i < 0 || i >= t.cols.length) return false
  const col = t.cols[i]
  for (let k = 0; k < col.length; k += 2) if (col[k] <= y && y <= col[k + 1]) return true
  return false
}

/** 발밑 `y` 에서 탱크 높이만큼 위에 천장이 있는지(발밑 흙 자체는 빼고). */
function ceilingAt(t: Terrain, x: number, y: number): boolean {
  const i = Math.floor(x / COL)
  if (i < 0 || i >= t.cols.length) return false
  const col = t.cols[i]
  for (let k = 0; k < col.length; k += 2) if (col[k] > y + 2 && col[k] < y + HEADROOM) return true
  return false
}

/** 원 모양으로 땅을 파낸다. 위에 남은 흙은 그대로 떠 있다. 새 지형을 돌려준다. */
export function applyCrater(t: Terrain, cx: number, cy: number, r: number): Terrain {
  const cols = t.cols.slice()
  const first = Math.max(0, Math.floor((cx - r) / COL))
  const last = Math.min(cols.length - 1, Math.ceil((cx + r) / COL))
  for (let i = first; i <= last; i++) {
    const dx = (i + 0.5) * COL - cx
    if (Math.abs(dx) >= r) continue
    const dy = Math.sqrt(r * r - dx * dx)
    cols[i] = cutSpan(cols[i], cy - dy, cy + dy)
  }
  return { kind: t.kind, cols }
}

/** 탱크가 이 발밑 높이면 물에 절반 넘게 잠긴다. */
export const drowned = (t: Terrain, y: number) => {
  const sea = MAPS[t.kind].sea
  return sea > 0 && y + TANK_H / 2 < sea
}

/**
 * `x` 에서 `target` 쪽으로 1 단위씩 굴러간다. 너무 가파르거나, 천장이 낮거나, 낭떠러지·물이거나,
 * 연료가 모자라면 그 자리에서 멈춘다. 화면의 미리보기와 `applyAction` 이 같은 입력으로 부르므로 결과가 항상 같다.
 */
export function walk(t: Terrain, x: number, y: number, target: number, fuel: number): { x: number; y: number; fuel: number } {
  const to = clamp(target, TANK_W / 2, widthOf(t) - TANK_W / 2)
  let cx = x
  let cy = y
  let f = fuel
  while (cx !== to) {
    const nx = to > cx ? Math.min(to, cx + 1) : Math.max(to, cx - 1)
    const dx = Math.abs(nx - cx)
    const ny = groundBelow(t, nx, cy + MAX_CLIMB * dx, 0)
    // 발밑 바로 위가 흙이면 벽이다(옆 열이 너무 높아 발밑 후보에서 빠진 경우).
    if (ny === -Infinity || cy - ny > MAX_DROP || drowned(t, ny) || solidAt(t, nx, ny + 4) || ceilingAt(t, nx, ny)) break
    const cost = dx + Math.max(0, ny - cy) * CLIMB_COST
    if (cost > f) break
    f -= cost
    cx = nx
    cy = ny
  }
  return { x: cx, y: cy, fuel: f }
}

export interface Body {
  id: string
  x: number
  /** 탱크 바닥의 높이. */
  y: number
}

export const bodyCenter = (t: { x: number; y: number }) => ({ x: t.x, y: t.y + 9 })

export function muzzle(t: { x: number; y: number }, deg: number) {
  const d = dir(deg)
  return { x: t.x + d.x * BARREL, y: t.y + TURRET_Y + d.y * BARREL }
}

export interface Flight {
  /** 매 스텝 위치 `[x0, y0, x1, y1, ...]`(시작점 포함). 화면 재생용. */
  path: number[]
  /** 끝날 때까지 걸린 스텝 수. 시간은 `steps * DT` 초. */
  steps: number
  /** `out` 은 맵 옆·아래로 나갔거나 너무 오래 날았다. `water` 는 바다에 떨어졌다. */
  end: 'ground' | 'tank' | 'out' | 'water'
  x: number
  y: number
  hit: string | null
}

export function fly(opts: {
  t: Terrain
  from: { x: number; y: number }
  deg: number
  speed: number
  wind: number
  tanks: Body[]
  shooter: string
}): Flight {
  const { t, from, speed, tanks, shooter } = opts
  const w = widthOf(t)
  const sea = MAPS[t.kind].sea
  const d = dir(opts.deg)
  let x = from.x
  let y = from.y
  let vx = d.x * speed
  let vy = d.y * speed
  const ax = opts.wind * WIND_ACCEL
  const path = [x, y]
  const centers = tanks.map((b) => ({ id: b.id, ...bodyCenter(b) }))
  const hitR2 = (TANK_R + SHELL_R) * (TANK_R + SHELL_R)
  // 쏜 탱크 몸체를 한 번 벗어나야 자기 탱크에도 맞는다.
  let armed = false

  for (let step = 1; step <= MAX_STEPS; step++) {
    vx += ax * DT
    vy -= GRAVITY * DT
    x += vx * DT
    y += vy * DT
    path.push(x, y)
    if (x < 0 || x >= w || y < -50) return { path, steps: step, end: 'out', x, y, hit: null }
    if (sea > 0 && y < sea) return { path, steps: step, end: 'water', x, y, hit: null }
    for (const c of centers) {
      const d2 = (c.x - x) * (c.x - x) + (c.y - y) * (c.y - y)
      if (c.id === shooter && !armed) {
        if (d2 > hitR2) armed = true
        continue
      }
      if (d2 < hitR2) return { path, steps: step, end: 'tank', x, y, hit: c.id }
    }
    if (solidAt(t, x, y)) return { path, steps: step, end: 'ground', x, y, hit: null }
  }
  return { path, steps: MAX_STEPS, end: 'out', x, y, hit: null }
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
  const d = Math.max(0, Math.sqrt((c.x - b.x) * (c.x - b.x) + (c.y - b.y) * (c.y - b.y)) - TANK_R)
  if (d >= b.r) return 0
  return Math.max(1, Math.round(b.dmg * (1 - d / b.r)))
}

const FALL_SAFE = 20

/** 이 높이 이하로 떨어지면 다치지 않는다. */
export function fallDamage(drop: number): number {
  return drop <= FALL_SAFE ? 0 : Math.min(40, Math.round((drop - FALL_SAFE) * 0.5))
}
