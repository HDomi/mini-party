import { play } from '@/audio/sound'
import { absoluteDeg, FELL_Y, shotFlights, terrainOf, type GameState, type Shot } from '../game/rules'
import { applyCrater, BARREL, clamp, dir, DT, groundBelow, MAPS, TURRET_Y, type Flight, type MapSpec, type Terrain } from '../game/world'
import { buildTerrainArt, drawGround, drawSea, drawSky, PALETTES, type TerrainArt } from './terrainArt'

// 전장 캔버스. React 밖에서 매 프레임 그린다.
//
// 화면에 보이는 지형·탱크는 `target`(서버가 확정한 상태)을 그대로 쓰지 않는다. 발사가 오면
// 발사 직전 상태에서 궤적을 다시 계산해 재생하고 폭발을 차례로 보여 준 뒤 `target` 으로 맞춘다.

/** 좁은 화면에서도 가로로 이만큼은 보인다. 나머지는 카메라가 따라간다. */
const MIN_VIEW_W = 720
/** 기본 배율 대비 확대 한도. 축소는 맵 전체 폭이 보일 때까지만 된다. */
const MAX_ZOOM = 3
/** 카메라가 맵 높이보다 이만큼 더 올라갈 수 있다. 높이 뜬 포탄도 따라간다. */
const CEIL_EXTRA = 300
/** 위쪽 HUD 에 양보하는 높이(px). 낮은 화면에서는 화면 높이의 10% 까지만. */
const TOP_RESERVE = 60
/** 조작판이 화면을 이 비율 넘게 가려도 전장은 이만큼만 올린다. */
const MAX_INSET = 0.45
/** 시뮬레이션 1초를 화면에서 몇 배 빠르게 재생할지. */
const PLAY_SPEED = 1.15
/** 다른 사람이 움직인 탱크가 화면에서 굴러가는 속도. */
const ROLL_SPEED = 110
const FALL_ACCEL = 900
/** 마지막 폭발 뒤 결과를 확정하기까지 기다리는 시간. */
const SETTLE_MS = 650
/** 포탄 꼬리 길이(스텝). */
const TRAIL = 30

const INK = '#3a2a22'
const DEAD = '#7a716a'

export interface LocalAim {
  /** 내 탱크를 서버 상태 대신 이 값으로 그린다. 이동·조준 미리보기. */
  id: string
  x: number
  y: number
  facing: 1 | -1
  angle: number
  guide: boolean
}

interface Shown {
  id: string
  name: string
  color: string
  x: number
  /** 굴러갈 목표 x. */
  tx: number
  y: number
  vy: number
  hp: number
  alive: boolean
  facing: 1 | -1
  angle: number
}

type Fx =
  | { kind: 'blast'; x: number; y: number; r: number; t0: number }
  | { kind: 'splash'; x: number; y: number; t0: number }
  | { kind: 'text'; x: number; y: number; text: string; color: string; t0: number }
  | { kind: 'bit'; x: number; y: number; vx: number; vy: number; t0: number; color: string }

interface Playing {
  shot: Shot
  /** 발사 직전 상태에서 다시 계산한 비행. 직전 상태를 못 받았으면 비어 있고 폭발만 보여 준다. */
  flights: Flight[]
  /** 물에 떨어진 것을 이미 보여 준 포탄. */
  splashed: boolean[]
  t0: number
  /** 아직 안 터진 첫 폭발. */
  next: number
  /** 모든 포탄이 끝난 시각. */
  doneAt: number | null
}

/** 뒤 배경의 먼 산. 화면마다 같다. */
const RIDGE = Array.from({ length: 41 }, (_, i) => {
  const u = i / 40
  return 330 + 60 * Math.sin(u * 7.1 + 1.3) + 35 * Math.sin(u * 17.3 + 0.4)
})
const CLOUDS = [
  { x: 120, y: 610, s: 1 },
  { x: 520, y: 660, s: 0.8 },
  { x: 880, y: 590, s: 1.2 },
  { x: 1300, y: 640, s: 0.9 },
]

export class BattleScene {
  private ctx: CanvasRenderingContext2D
  private target: GameState | null = null
  private pending: GameState | null = null
  private spec: MapSpec = MAPS.hills
  private terrain: Terrain = { kind: 'hills', cols: [] }
  private art: TerrainArt | null = null
  private tanks = new Map<string, Shown>()
  private playing: Playing | null = null
  private fx: Fx[] = []
  private camX = MAPS.hills.w / 2
  private camY = 0
  /** 드래그·줌으로 직접 옮긴 카메라 중심. 다음 발사나 차례가 오면 다시 따라간다. */
  private manual: { x: number; y: number } | null = null
  /** 사용자가 고른 배율. 차례가 바뀌어도 유지한다. 버튼으로 바꾸면 `zoomGoal` 까지 부드럽게 움직인다. */
  private zoom = 1
  private zoomGoal = 1
  /** "내 탱크" 로 고정해 따라가는 탱크. 없으면 차례인 탱크를 따라간다. */
  private track: string | null = null
  private inset = 0
  private insetGoal = 0
  private last = 0
  private shakeUntil = 0
  private cloudShift = 0
  private w = 1
  private h = 1
  private dpr = 1

  local: LocalAim | null = null
  /** 이름표와 체력바. 메뉴 배경에서는 끈다. */
  labels = true
  sound = true
  onBusy: ((busy: boolean) => void) | null = null

  constructor(private canvas: HTMLCanvasElement) {
    this.ctx = canvas.getContext('2d')!
  }

  get busy() {
    return this.playing !== null
  }

  resize(w: number, h: number, dpr: number) {
    this.w = Math.max(1, w)
    this.h = Math.max(1, h)
    this.dpr = dpr
    this.canvas.width = Math.round(this.w * dpr)
    this.canvas.height = Math.round(this.h * dpr)
  }

  /** 아래쪽 조작판에 가리지 않도록 땅을 이만큼(px) 올린다. */
  setInset(px: number) {
    if (!Number.isFinite(px)) return
    this.insetGoal = px
    if (!this.target) this.inset = px
  }

  /** 기본 배율이나 카메라 위치에서 벗어났는지. 초기화 버튼을 보일지 정한다. */
  get custom() {
    return this.zoomGoal !== 1 || this.manual !== null || this.track !== null
  }

  /** 기본 배율에서 이미 맵 전체 폭이 보이는지. 그러면 "전체" 버튼이 할 일이 없다. */
  get fitsAtDefault() {
    return this.minZoom(this.view().fit) >= 1
  }

  /** 끌어서 카메라를 옮긴다(px). 손가락을 따라 전장이 움직인다. */
  pan(dxPx: number, dyPx: number) {
    const v = this.view()
    const c = this.clampCam(this.camX - dxPx / v.s, this.camY + dyPx / v.s, v)
    this.camX = c.x
    this.camY = c.y
    this.manual = c
  }

  /** 화면의 (px, py) 지점을 고정한 채 배율을 `factor` 배 한다. */
  zoomAt(factor: number, px: number, py: number) {
    const v0 = this.view()
    const z = clamp(this.zoom * factor, this.minZoom(v0.fit), MAX_ZOOM)
    if (z === this.zoom) return
    const wx = this.camX - v0.width / 2 + px / v0.s
    const wy = this.camY + (v0.base - py) / v0.s
    this.zoom = this.zoomGoal = z
    const v1 = this.view()
    const c = this.clampCam(wx - px / v1.s + v1.width / 2, wy - (v1.base - py) / v1.s, v1)
    this.camX = c.x
    this.camY = c.y
    this.manual = c
  }

  resetView() {
    this.zoomGoal = 1
    this.manual = null
    this.track = null
  }

  /** 맵 전체 폭이 보이도록 줄인다. */
  fitMap() {
    this.zoomGoal = this.minZoom(this.view().fit)
    this.manual = null
    this.track = null
  }

  /** 이 탱크를 크게 보고 계속 따라간다. 발사 중에는 포탄을 먼저 따라간다. */
  focusTank(id: string) {
    this.zoomGoal = Math.min(MAX_ZOOM, 2)
    this.manual = null
    this.track = id
  }

  /** 맵 전체 폭이 보이는 배율. 넓은 화면은 기본 배율에서 이미 다 보인다. */
  private minZoom(fit: number) {
    return Math.min(1, this.w / (this.spec.w * fit))
  }

  private clampCam(x: number, y: number, v: ReturnType<BattleScene['view']>) {
    const W = this.spec.w
    const half = v.width / 2
    return {
      x: v.width >= W ? W / 2 : clamp(x, half, W - half),
      y: clamp(y, 0, Math.max(0, this.spec.h + CEIL_EXTRA - v.visH)),
    }
  }

  sync(g: GameState) {
    if (this.playing) {
      this.pending = g
      return
    }
    const prev = this.target
    this.target = g
    if (!prev || prev.round !== g.round || prev.map !== g.map) return this.snap(false)
    if (prev.current !== g.current) this.manual = null
    if (g.lastShot && g.lastShot.seq === g.seq && prev.seq < g.seq) return this.startShot(g.lastShot, prev)
    this.snap(true)
  }

  private setTerrain(t: Terrain) {
    this.terrain = t
    this.art = buildTerrainArt(t)
  }

  /** 화면을 `target` 에 맞춘다. `roll` 이면 움직인 탱크는 굴러서 간다. */
  private snap(roll: boolean) {
    const g = this.target!
    if (this.spec !== MAPS[g.map]) {
      this.spec = MAPS[g.map]
      this.camX = this.spec.w / 2
    }
    this.setTerrain(terrainOf(g))
    const next = new Map<string, Shown>()
    for (const t of g.tanks) {
      const d = roll ? this.tanks.get(t.id) : undefined
      next.set(t.id, {
        id: t.id,
        name: t.name,
        color: t.color,
        x: d ? d.x : t.x,
        tx: t.x,
        y: d && t.y > FELL_Y ? d.y : t.y,
        vy: 0,
        hp: t.hp,
        alive: t.alive,
        facing: t.facing,
        angle: t.angle,
      })
    }
    this.tanks = next
  }

  private startShot(shot: Shot, prev: GameState) {
    const by = this.tanks.get(shot.by)
    if (by) {
      by.facing = shot.facing
      by.angle = shot.angle
    }
    // 바로 직전 상태를 봤을 때만 궤적을 똑같이 다시 계산할 수 있다. 중간 상태를 건너뛰었으면 폭발만 보여 준다.
    const flights = prev.seq === shot.seq - 1 ? shotFlights(prev, terrainOf(prev), shot) : []
    this.manual = null
    this.playing = { shot, flights, splashed: flights.map(() => false), t0: performance.now(), next: 0, doneAt: null }
    if (this.sound) play('throw')
    this.onBusy?.(true)
  }

  private finishShot() {
    const p = this.playing!
    const now = performance.now()
    for (const f of p.shot.falls) {
      const d = this.tanks.get(f.id)
      if (d) this.fx.push({ kind: 'text', x: d.x, y: d.y + 50, text: `-${f.dmg}`, color: '#d9822b', t0: now })
    }
    this.playing = null
    this.snap(true)
    const pending = this.pending
    this.pending = null
    if (pending) this.sync(pending)
    if (!this.playing) this.onBusy?.(false)
  }

  private boom(b: Shot['booms'][number], now: number) {
    this.setTerrain(applyCrater(this.terrain, b.x, b.y, b.r))
    this.fx.push({ kind: 'blast', x: b.x, y: b.y, r: b.r, t0: now })
    const pal = PALETTES[this.target?.map ?? 'hills']
    for (let i = 0; i < 14; i++) {
      const a = Math.random() * Math.PI
      const v = 120 + Math.random() * 220
      this.fx.push({
        kind: 'bit',
        x: b.x,
        y: b.y,
        vx: Math.cos(a) * v,
        vy: Math.sin(a) * v,
        t0: now,
        color: i % 3 ? pal.soilBottom : pal.top,
      })
    }
    for (const hit of b.hits) {
      const d = this.tanks.get(hit.id)
      if (!d) continue
      d.hp = Math.max(0, d.hp - hit.dmg)
      if (d.hp === 0) d.alive = false
      this.fx.push({ kind: 'text', x: d.x, y: d.y + 50, text: `-${hit.dmg}`, color: '#e8574a', t0: now })
    }
    this.shakeUntil = now + 260
    if (this.sound) play(b.r >= 50 ? 'capture' : 'land', b.r >= 50 ? 1 : 0.9)
  }

  private view() {
    // 가로로 눕힌 휴대폰처럼 낮은 화면에서도 남는 높이가 0 이하가 되면 안 된다. 배율이 음수가 되면 전장이 뒤집힌다.
    const inset = Math.min(this.inset, this.h * MAX_INSET)
    const top = Math.min(TOP_RESERVE, this.h * 0.1)
    const base = this.h - inset
    const fit = Math.max(0.05, Math.min((base - top) / this.spec.fitH, this.w / MIN_VIEW_W))
    const s = fit * this.zoom
    return { fit, s, width: this.w / s, base, visH: (base - top) / s }
  }

  /**
   * 재생 시각의 시뮬레이션 스텝. rAF 가 넘겨 주는 프레임 시각은 재생을 시작한 `performance.now()` 보다 이를 수 있어
   * 음수가 나온다. 그대로 쓰면 궤적을 -1 번째 점부터 읽어 NaN 이 되고 카메라가 망가진다.
   */
  private stepAt(p: Playing, now: number) {
    return Math.max(0, (((now - p.t0) / 1000) * PLAY_SPEED) / DT)
  }

  /** 스텝 `step` 에서 포탄 위치. 끝났으면 null. */
  private shellAt(f: Flight, step: number): { x: number; y: number; k: number } | null {
    if (step >= f.steps) return null
    const k = Math.floor(step)
    const u = step - k
    const x0 = f.path[k * 2]
    const y0 = f.path[k * 2 + 1]
    return { x: x0 + (f.path[k * 2 + 2] - x0) * u, y: y0 + (f.path[k * 2 + 3] - y0) * u, k }
  }

  frame(now: number) {
    const dt = this.last ? clamp((now - this.last) / 1000, 0, 0.05) : 0
    this.last = now
    // 카메라 값이 한 번이라도 NaN 이 되면 setTransform 이 무시되어 전장이 화면 좌표로(위아래 뒤집혀) 그려진다.
    // 원인과 상관없이 기본 보기로 되돌린다.
    if (![this.camX, this.camY, this.zoom, this.zoomGoal, this.inset].every(Number.isFinite)) {
      if (import.meta.env.DEV)
        console.warn('battle camera reset', JSON.stringify({ camX: this.camX, camY: this.camY, zoom: this.zoom, zoomGoal: this.zoomGoal, inset: this.inset, insetGoal: this.insetGoal, w: this.w, h: this.h, map: this.target?.map }))
      this.camX = this.spec.w / 2
      this.camY = 0
      this.zoom = this.zoomGoal = 1
      this.manual = null
      this.inset = this.insetGoal
    }
    this.inset += (this.insetGoal - this.inset) * Math.min(1, dt * 6)
    this.cloudShift += (this.target?.wind ?? 2) * 4 * dt

    // 발사 재생
    let focus: { x: number; y: number } | null = null
    const p = this.playing
    if (p) {
      const step = this.stepAt(p, now)
      const booms = p.shot.booms
      while (p.next < booms.length && booms[p.next].steps <= step) this.boom(booms[p.next++], now)
      p.flights.forEach((f, i) => {
        if (f.end !== 'water' || p.splashed[i] || step < f.steps) return
        p.splashed[i] = true
        this.fx.push({ kind: 'splash', x: f.x, y: this.spec.sea, t0: now })
        if (this.sound) play('step', 0.8)
      })
      for (const f of p.flights) {
        const at = this.shellAt(f, step)
        if (at) {
          focus = at
          break
        }
      }
      if (focus === null && booms.length) focus = booms[booms.length - 1]
      const lastStep = Math.max(0, ...p.flights.map((f) => f.steps), ...booms.map((b) => b.steps))
      if (step >= lastStep && p.next >= booms.length) {
        p.doneAt ??= now
        const falling = [...this.tanks.values()].some((d) => d.vy !== 0)
        if (!falling && now - p.doneAt > SETTLE_MS) this.finishShot()
      }
    }

    // 탱크: 굴러가고, 발밑이 꺼지면 떨어진다. 흙은 무너지지 않는다.
    for (const d of this.tanks.values()) {
      if (this.local && this.local.id === d.id) {
        d.x = d.tx = this.local.x
        d.y = this.local.y
        d.vy = 0
        d.facing = this.local.facing
        d.angle = this.local.angle
        continue
      }
      let rolling = false
      if (d.x !== d.tx) {
        const stepX = ROLL_SPEED * dt
        d.x = Math.abs(d.tx - d.x) <= stepX ? d.tx : d.x + Math.sign(d.tx - d.x) * stepX
        rolling = true
      }
      if (d.y <= FELL_Y) continue
      const ground = groundBelow(this.terrain, d.x, d.y, rolling ? 8 : 0.5)
      const floor = ground === -Infinity ? FELL_Y : ground
      if (d.y > floor + 0.5 && (d.vy !== 0 || this.playing || ground === -Infinity)) {
        d.vy += FALL_ACCEL * dt
        d.y = Math.max(floor, d.y - d.vy * dt)
        if (d.y === floor) d.vy = 0
      } else {
        d.y = floor
        d.vy = 0
      }
    }

    // 카메라
    // 직접 옮겼으면 그 자리에 둔다(화면 크기·조작판 높이가 바뀌면 범위만 다시 맞춘다).
    // 아니면 포탄이나 차례인 탱크를 따라간다. 확대했을 때는 세로로도 따라간다.
    const lo = this.minZoom(this.view().fit)
    this.zoomGoal = clamp(this.zoomGoal, lo, MAX_ZOOM)
    this.zoom = clamp(this.zoom, lo, MAX_ZOOM)
    if (this.zoom !== this.zoomGoal) {
      const next = this.zoom + (this.zoomGoal - this.zoom) * Math.min(1, dt * 7)
      this.zoom = Math.abs(next - this.zoomGoal) < 0.002 ? this.zoomGoal : next
    }
    const view = this.view()
    if (this.manual) {
      this.manual = this.clampCam(this.manual.x, this.manual.y, view)
      this.camX = this.manual.x
      this.camY = this.manual.y
    } else {
      if (focus === null) {
        const g = this.target
        const cur = g && g.phase === 'play' ? this.tanks.get(g.tanks[g.current].id) : null
        focus = (this.track && this.tanks.get(this.track)) || cur || { x: this.spec.w / 2, y: 0 }
      }
      // 따라가는 대상이 화면 위쪽 여백 안으로 들어올 때만 카메라를 올린다. 평소에는 바닥을 기준선에 둔다.
      const margin = Math.min(120, view.visH * 0.35)
      const goal = this.clampCam(focus.x, focus.y + margin - view.visH, view)
      const k = Math.min(1, dt * (p ? 5 : 3))
      this.camX += (goal.x - this.camX) * k
      this.camY += (goal.y - this.camY) * k
      if (view.width >= this.spec.w) this.camX = this.spec.w / 2
    }

    this.draw(now, view, p)
    this.fx = this.fx.filter((f) => now - f.t0 < (f.kind === 'text' ? 1300 : f.kind === 'blast' || f.kind === 'splash' ? 600 : 1000))
  }

  private draw(now: number, view: ReturnType<BattleScene['view']>, p: Playing | null) {
    const { ctx, dpr } = this
    const { s } = view
    const kind = this.target?.map ?? 'hills'
    // 카메라가 올라가면 월드 0 이 조작판 위 기준선보다 아래로 내려간다.
    const base = view.base + this.camY * s
    let left = this.camX - view.width / 2
    if (now < this.shakeUntil) left += (Math.random() - 0.5) * 6
    const toX = (x: number) => (x - left) * s
    const toY = (y: number) => base - y * s
    const world = () => ctx.setTransform(s * dpr, 0, 0, -s * dpr, -left * s * dpr, base * dpr)
    const screen = () => ctx.setTransform(dpr, 0, 0, dpr, 0, 0)

    // 하늘
    screen()
    drawSky(ctx, kind, this.w, this.h)
    ctx.fillStyle = 'rgba(255, 240, 180, 0.9)'
    ctx.beginPath()
    ctx.arc(this.w * 0.82, Math.max(60, toY(this.spec.h - 80)), 34, 0, Math.PI * 2)
    ctx.fill()

    // 구름은 바람 쪽으로 흘러간다.
    ctx.fillStyle = 'rgba(255, 255, 255, 0.85)'
    for (const c of CLOUDS) {
      const span = view.width + 400
      const wx = ((((c.x + this.cloudShift - left * 0.5) % span) + span) % span) - 200
      const cx = wx * s
      const cy = toY(c.y + this.spec.h - 700)
      const r = 26 * c.s * Math.max(0.7, s)
      ctx.beginPath()
      ctx.arc(cx, cy, r, 0, Math.PI * 2)
      ctx.arc(cx + r * 1.1, cy + r * 0.25, r * 0.8, 0, Math.PI * 2)
      ctx.arc(cx - r * 1.1, cy + r * 0.3, r * 0.7, 0, Math.PI * 2)
      ctx.fill()
    }

    // 먼 산(시차)
    ctx.fillStyle = PALETTES[kind].ridge
    ctx.beginPath()
    ctx.moveTo(0, this.h)
    for (let i = 0; i < RIDGE.length; i++) {
      const wx = (i / (RIDGE.length - 1)) * (this.spec.w + 400) - 200
      ctx.lineTo((wx - left * 0.35) * s, toY(RIDGE[i]))
    }
    ctx.lineTo(this.w, this.h)
    ctx.fill()

    world()
    if (this.art) drawGround(ctx, kind, this.art, left, view.width)

    // 탱크
    const g = this.target
    const current = g && g.phase === 'play' && !p ? g.tanks[g.current].id : null
    for (const d of this.tanks.values()) if (d.y > FELL_Y + 20) this.drawTank(d)

    // 조준선
    const aim = this.local
    const mine = aim && !p ? this.tanks.get(aim.id) : null
    if (aim?.guide && mine) {
      const a = dir(absoluteDeg(aim.angle, aim.facing))
      const px = mine.x
      const py = mine.y + TURRET_Y
      ctx.strokeStyle = 'rgba(58, 42, 34, 0.55)'
      ctx.lineWidth = 2.5
      ctx.setLineDash([6, 7])
      ctx.beginPath()
      ctx.moveTo(px + a.x * (BARREL + 6), py + a.y * (BARREL + 6))
      ctx.lineTo(px + a.x * (BARREL + 80), py + a.y * (BARREL + 80))
      ctx.stroke()
      ctx.setLineDash([])
    }

    // 포탄과 꼬리
    if (p) {
      const step = this.stepAt(p, now)
      for (const f of p.flights) {
        const at = this.shellAt(f, step)
        if (!at) continue
        ctx.strokeStyle = 'rgba(58, 42, 34, 0.3)'
        ctx.lineWidth = 3
        ctx.beginPath()
        const from = Math.max(0, at.k - TRAIL)
        ctx.moveTo(f.path[from * 2], f.path[from * 2 + 1])
        for (let k = from + 1; k <= at.k; k++) ctx.lineTo(f.path[k * 2], f.path[k * 2 + 1])
        ctx.lineTo(at.x, at.y)
        ctx.stroke()
        ctx.fillStyle = INK
        ctx.beginPath()
        ctx.arc(at.x, at.y, 4.5, 0, Math.PI * 2)
        ctx.fill()
      }
    }

    // 폭발과 흙 조각
    for (const f of this.fx) {
      const t = (now - f.t0) / 1000
      if (f.kind === 'blast') {
        const u = Math.min(1, t / 0.6)
        const r = f.r * (0.45 + 0.55 * (1 - (1 - u) * (1 - u)))
        ctx.fillStyle = `rgba(255, 170, 60, ${0.85 * (1 - u)})`
        ctx.beginPath()
        ctx.arc(f.x, f.y, r, 0, Math.PI * 2)
        ctx.fill()
        if (u < 0.35) {
          ctx.fillStyle = `rgba(255, 250, 210, ${1 - u / 0.35})`
          ctx.beginPath()
          ctx.arc(f.x, f.y, r * 0.55, 0, Math.PI * 2)
          ctx.fill()
        }
      } else if (f.kind === 'splash') {
        const u = Math.min(1, t / 0.6)
        ctx.fillStyle = `rgba(230, 245, 255, ${0.9 * (1 - u)})`
        for (const dx of [-8, 0, 8]) {
          ctx.beginPath()
          ctx.ellipse(f.x + dx * (1 + u), f.y + 6 + 30 * u * (dx === 0 ? 1.4 : 1), 4, 9 * (1 - u) + 3, 0, 0, Math.PI * 2)
          ctx.fill()
        }
      } else if (f.kind === 'bit') {
        const x = f.x + f.vx * t
        const y = f.y + f.vy * t - 0.5 * 700 * t * t
        ctx.fillStyle = f.color
        ctx.fillRect(x - 2, y - 2, 4, 4)
      }
    }

    drawSea(ctx, kind, left, view.width, now)

    // 이름표·체력·글자는 화면 좌표로 그린다.
    screen()
    if (this.labels) {
      for (const d of this.tanks.values()) if (d.y > FELL_Y + 20) this.drawLabel(d, toX(d.x), toY(d.y + 38), d.id === current, now)
    }
    ctx.textAlign = 'center'
    ctx.lineJoin = 'round'
    for (const f of this.fx) {
      if (f.kind !== 'text') continue
      const t = (now - f.t0) / 1300
      ctx.globalAlpha = Math.min(1, (1 - t) * 2.5)
      ctx.font = `bold ${Math.round(22 + 6 * Math.max(0, 1 - t * 4))}px Jua, sans-serif`
      ctx.strokeStyle = '#fff'
      ctx.lineWidth = 5
      const y = toY(f.y) - t * 46
      ctx.strokeText(f.text, toX(f.x), y)
      ctx.fillStyle = f.color
      ctx.fillText(f.text, toX(f.x), y)
      ctx.globalAlpha = 1
    }
  }

  private drawTank(d: Shown) {
    const { ctx } = this
    const color = d.alive ? d.color : DEAD
    // 가파른 비탈에서 차체가 포탑과 어긋나 보이지 않도록 기울기를 제한한다.
    const gl = groundBelow(this.terrain, d.x - 8, d.y, 8)
    const gr = groundBelow(this.terrain, d.x + 8, d.y, 8)
    const tilt = gl === -Infinity || gr === -Infinity ? 0 : clamp(Math.atan2(gr - gl, 16), -0.4, 0.4)

    // 포신은 차체 기울기와 상관없이 조준한 방향을 가리킨다(발사 계산과 같다).
    const a = dir(d.alive ? absoluteDeg(d.angle, d.facing) : d.facing > 0 ? -15 : 195)
    const px = d.x
    const py = d.y + TURRET_Y
    ctx.lineCap = 'round'
    ctx.strokeStyle = INK
    ctx.lineWidth = 6
    ctx.beginPath()
    ctx.moveTo(px, py)
    ctx.lineTo(px + a.x * BARREL, py + a.y * BARREL)
    ctx.stroke()
    ctx.strokeStyle = color
    ctx.lineWidth = 2.6
    ctx.stroke()

    ctx.save()
    ctx.translate(d.x, d.y)
    ctx.rotate(tilt)
    ctx.lineWidth = 2
    ctx.strokeStyle = INK
    // 궤도
    ctx.fillStyle = INK
    ctx.beginPath()
    ctx.roundRect(-15, 0, 30, 7, 3.5)
    ctx.fill()
    ctx.fillStyle = '#9b8b7b'
    for (const wx of [-10.5, -3.5, 3.5, 10.5]) {
      ctx.beginPath()
      ctx.arc(wx, 3.5, 2.2, 0, Math.PI * 2)
      ctx.fill()
    }
    // 차체
    ctx.fillStyle = color
    ctx.beginPath()
    ctx.moveTo(-14, 6)
    ctx.lineTo(14, 6)
    ctx.lineTo(10.5, 13)
    ctx.lineTo(-10.5, 13)
    ctx.closePath()
    ctx.fill()
    ctx.stroke()
    ctx.restore()

    // 포탑
    ctx.fillStyle = color
    ctx.strokeStyle = INK
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.arc(d.x, d.y + 12, 7.5, 0, Math.PI)
    ctx.closePath()
    ctx.fill()
    ctx.stroke()
    ctx.fillStyle = 'rgba(255, 255, 255, 0.45)'
    ctx.beginPath()
    ctx.arc(d.x - 2.5 * d.facing, d.y + 15.5, 2, 0, Math.PI * 2)
    ctx.fill()
  }

  private drawLabel(d: Shown, x: number, y: number, current: boolean, now: number) {
    const { ctx } = this
    ctx.textAlign = 'center'
    ctx.textBaseline = 'alphabetic'
    ctx.font = '14px Jua, sans-serif'
    ctx.lineJoin = 'round'
    ctx.lineWidth = 4
    ctx.strokeStyle = 'rgba(255, 250, 241, 0.95)'
    ctx.strokeText(d.name, x, y - 9)
    ctx.fillStyle = d.alive ? INK : DEAD
    ctx.fillText(d.name, x, y - 9)
    if (d.alive) {
      const bw = 36
      ctx.fillStyle = INK
      ctx.fillRect(x - bw / 2 - 1.5, y - 5.5, bw + 3, 8)
      ctx.fillStyle = '#fffaf1'
      ctx.fillRect(x - bw / 2, y - 4, bw, 5)
      ctx.fillStyle = d.hp > 50 ? '#4caf50' : d.hp > 25 ? '#f2b53a' : '#e8574a'
      ctx.fillRect(x - bw / 2, y - 4, (bw * d.hp) / 100, 5)
    }
    if (current) {
      const bob = Math.sin(now / 180) * 3
      const ty = y - 34 + bob
      ctx.fillStyle = d.color
      ctx.strokeStyle = INK
      ctx.lineWidth = 2
      ctx.beginPath()
      ctx.moveTo(x - 8, ty)
      ctx.lineTo(x + 8, ty)
      ctx.lineTo(x, ty + 10)
      ctx.closePath()
      ctx.fill()
      ctx.stroke()
    }
  }
}
