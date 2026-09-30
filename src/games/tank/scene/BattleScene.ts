import { play } from '@/audio/sound'
import { absoluteDeg, type GameState, type Shot } from '../game/rules'
import { applyCrater, BARREL, clamp, DT, H, SAMPLE, surface, TURRET_Y, W, WATER } from '../game/world'

// 전장 캔버스. React 밖에서 매 프레임 그린다.
//
// 화면에 보이는 지형·탱크는 `target`(서버가 확정한 상태)을 그대로 쓰지 않는다. 발사가 오면
// 이전 화면에서 출발해 궤적과 폭발을 재생하고, 끝나면 `target` 으로 맞춘다.

/** 좁은 화면에서도 가로로 이만큼은 보인다. 나머지는 카메라가 따라간다. */
const MIN_VIEW_W = 720
/** 위쪽 HUD 에 양보하는 높이(px). */
const TOP_RESERVE = 60
/** 시뮬레이션 1초를 화면에서 몇 배 빠르게 재생할지. */
const PLAY_SPEED = 1.15
/** 다른 사람이 움직인 탱크가 화면에서 굴러가는 속도. */
const ROLL_SPEED = 110
const FALL_ACCEL = 900
/** 마지막 폭발 뒤 결과를 확정하기까지 기다리는 시간. */
const SETTLE_MS = 650

const INK = '#3a2a22'
const DEAD = '#7a716a'

export interface LocalAim {
  /** 내 탱크를 서버 상태 대신 이 값으로 그린다. 이동·조준 미리보기. */
  id: string
  x: number
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
  | { kind: 'text'; x: number; y: number; text: string; color: string; t0: number }
  | { kind: 'bit'; x: number; y: number; vx: number; vy: number; t0: number; color: string }

interface Playing {
  shot: Shot
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
  private terrain: number[] = []
  private tanks = new Map<string, Shown>()
  private playing: Playing | null = null
  private fx: Fx[] = []
  private camX = W / 2
  private manual: number | null = null
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
    this.insetGoal = px
    if (!this.target) this.inset = px
  }

  /** 드래그로 카메라를 옮긴다. 다음 발사나 차례가 오면 다시 따라간다. */
  pan(dxPx: number) {
    const view = this.view()
    if (view.width >= W) return
    const from = this.manual ?? this.camX
    this.manual = Math.min(W - view.width / 2, Math.max(view.width / 2, from - dxPx / view.s))
  }

  sync(g: GameState) {
    if (this.playing) {
      this.pending = g
      return
    }
    const prev = this.target
    this.target = g
    if (!prev || prev.round !== g.round) return this.snap(false)
    if (prev.current !== g.current) this.manual = null
    if (g.lastShot && g.lastShot.seq === g.seq && prev.seq < g.seq) return this.startShot(g.lastShot)
    this.snap(true)
  }

  /** 화면을 `target` 에 맞춘다. `roll` 이면 움직인 탱크는 굴러서 간다. */
  private snap(roll: boolean) {
    const g = this.target!
    this.terrain = g.terrain.slice()
    const next = new Map<string, Shown>()
    for (const t of g.tanks) {
      const d = roll ? this.tanks.get(t.id) : undefined
      next.set(t.id, {
        id: t.id,
        name: t.name,
        color: t.color,
        x: d ? d.x : t.x,
        tx: t.x,
        y: d ? d.y : t.y,
        vy: 0,
        hp: t.hp,
        alive: t.alive,
        facing: t.facing,
        angle: t.angle,
      })
    }
    this.tanks = next
  }

  private startShot(shot: Shot) {
    const g = this.target!
    const by = this.tanks.get(shot.by)
    const t = g.tanks.find((x) => x.id === shot.by)
    if (by && t) {
      by.facing = t.facing
      by.angle = t.angle
    }
    this.manual = null
    this.playing = { shot, t0: performance.now(), next: 0, doneAt: null }
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
    this.terrain = applyCrater(this.terrain, b.x, b.y, b.r)
    this.fx.push({ kind: 'blast', x: b.x, y: b.y, r: b.r, t0: now })
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
        color: i % 3 ? '#9a6a3e' : '#6cbf4a',
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
    const s = Math.min((this.h - this.inset - TOP_RESERVE) / H, this.w / MIN_VIEW_W)
    const width = this.w / s
    return { s, width, base: this.h - this.inset }
  }

  /** 포탄 `k` 의 위치. 끝났으면 null. */
  private shellAt(f: Shot['flights'][number], step: number): { x: number; y: number; k: number } | null {
    if (step >= f.steps) return null
    const last = f.path.length / 2 - 1
    const k = Math.min(last, Math.floor(step / SAMPLE))
    const n = Math.min(last, k + 1)
    const t0 = k * SAMPLE
    const t1 = n === last ? f.steps : n * SAMPLE
    const u = t1 > t0 ? (step - t0) / (t1 - t0) : 0
    return {
      x: f.path[k * 2] + (f.path[n * 2] - f.path[k * 2]) * u,
      y: f.path[k * 2 + 1] + (f.path[n * 2 + 1] - f.path[k * 2 + 1]) * u,
      k,
    }
  }

  frame(now: number) {
    const dt = this.last ? Math.min(0.05, (now - this.last) / 1000) : 0
    this.last = now
    this.inset += (this.insetGoal - this.inset) * Math.min(1, dt * 6)
    this.cloudShift += (this.target?.wind ?? 2) * 4 * dt

    // 발사 재생
    let focus: number | null = null
    const p = this.playing
    if (p) {
      const step = (((now - p.t0) / 1000) * PLAY_SPEED) / DT
      const booms = p.shot.booms
      while (p.next < booms.length && booms[p.next].steps <= step) this.boom(booms[p.next++], now)
      for (const f of p.shot.flights) {
        const at = this.shellAt(f, step)
        if (at) {
          focus = at.x
          break
        }
      }
      if (focus === null && booms.length) focus = booms[booms.length - 1].x
      const flying = p.shot.flights.some((f) => f.steps > step)
      if (!flying && p.next >= booms.length) {
        p.doneAt ??= now
        const falling = [...this.tanks.values()].some((d) => d.vy !== 0)
        if (!falling && now - p.doneAt > SETTLE_MS) this.finishShot()
      }
    }

    // 탱크: 굴러가고, 발밑이 꺼지면 떨어진다.
    for (const d of this.tanks.values()) {
      if (this.local && this.local.id === d.id) {
        d.x = d.tx = this.local.x
        d.facing = this.local.facing
        d.angle = this.local.angle
      } else if (d.x !== d.tx) {
        const stepX = ROLL_SPEED * dt
        d.x = Math.abs(d.tx - d.x) <= stepX ? d.tx : d.x + Math.sign(d.tx - d.x) * stepX
      }
      const ground = surface(this.terrain, d.x)
      if (d.y > ground + 0.5 && (d.vy !== 0 || this.playing)) {
        d.vy += FALL_ACCEL * dt
        d.y = Math.max(ground, d.y - d.vy * dt)
        if (d.y === ground) d.vy = 0
      } else {
        d.y = ground
        d.vy = 0
      }
    }

    // 카메라
    const view = this.view()
    if (focus === null) {
      const g = this.target
      const cur = g && g.phase === 'play' ? this.tanks.get(g.tanks[g.current].id) : null
      focus = this.manual ?? cur?.x ?? W / 2
    }
    const half = view.width / 2
    const goal = view.width >= W ? W / 2 : Math.min(W - half, Math.max(half, focus))
    this.camX += (goal - this.camX) * Math.min(1, dt * (p ? 5 : 3))
    if (view.width >= W) this.camX = W / 2

    this.draw(now, view, p)
    this.fx = this.fx.filter((f) => now - f.t0 < (f.kind === 'text' ? 1300 : f.kind === 'blast' ? 600 : 1000))
  }

  private draw(now: number, view: { s: number; width: number; base: number }, p: Playing | null) {
    const { ctx, dpr } = this
    const { s, base } = view
    let left = this.camX - view.width / 2
    if (now < this.shakeUntil) left += (Math.random() - 0.5) * 6
    const toX = (x: number) => (x - left) * s
    const toY = (y: number) => base - y * s
    const world = () => ctx.setTransform(s * dpr, 0, 0, -s * dpr, -left * s * dpr, base * dpr)
    const screen = () => ctx.setTransform(dpr, 0, 0, dpr, 0, 0)

    // 하늘
    screen()
    const sky = ctx.createLinearGradient(0, 0, 0, this.h)
    sky.addColorStop(0, '#7cc6f2')
    sky.addColorStop(0.7, '#cdeefc')
    sky.addColorStop(1, '#fdf1d8')
    ctx.fillStyle = sky
    ctx.fillRect(0, 0, this.w, this.h)
    ctx.fillStyle = 'rgba(255, 240, 180, 0.9)'
    ctx.beginPath()
    ctx.arc(this.w * 0.82, Math.max(60, toY(620)), 34, 0, Math.PI * 2)
    ctx.fill()

    // 구름은 바람 쪽으로 흘러간다.
    ctx.fillStyle = 'rgba(255, 255, 255, 0.85)'
    for (const c of CLOUDS) {
      const span = view.width + 400
      const wx = ((((c.x + this.cloudShift - left * 0.5) % span) + span) % span) - 200
      const cx = wx * s
      const cy = toY(c.y)
      const r = 26 * c.s * Math.max(0.7, s)
      ctx.beginPath()
      ctx.arc(cx, cy, r, 0, Math.PI * 2)
      ctx.arc(cx + r * 1.1, cy + r * 0.25, r * 0.8, 0, Math.PI * 2)
      ctx.arc(cx - r * 1.1, cy + r * 0.3, r * 0.7, 0, Math.PI * 2)
      ctx.fill()
    }

    // 먼 산(시차)
    ctx.fillStyle = 'rgba(120, 160, 150, 0.45)'
    ctx.beginPath()
    ctx.moveTo(0, this.h)
    for (let i = 0; i < RIDGE.length; i++) {
      const wx = (i / (RIDGE.length - 1)) * (W + 400) - 200
      ctx.lineTo((wx - left * 0.35) * s, toY(RIDGE[i]))
    }
    ctx.lineTo(this.w, this.h)
    ctx.fill()

    world()
    // 물, 땅, 그 아래 암반
    ctx.fillStyle = '#4aa3d8'
    ctx.fillRect(left - 10, 0, view.width + 20, WATER)
    const h = this.terrain
    if (h.length) {
      const dirt = ctx.createLinearGradient(0, 480, 0, 0)
      dirt.addColorStop(0, '#c98f55')
      dirt.addColorStop(1, '#8a5a33')
      ctx.fillStyle = dirt
      ctx.beginPath()
      ctx.moveTo(0, 0)
      const colW = W / h.length
      for (let i = 0; i < h.length; i++) ctx.lineTo((i + 0.5) * colW, h[i])
      ctx.lineTo(W, h[h.length - 1])
      ctx.lineTo(W, 0)
      ctx.closePath()
      ctx.fill()
      ctx.strokeStyle = '#6cbf4a'
      ctx.lineWidth = 6
      ctx.lineJoin = 'round'
      ctx.beginPath()
      ctx.moveTo(0, h[0] - 2)
      for (let i = 0; i < h.length; i++) ctx.lineTo((i + 0.5) * colW, h[i] - 2)
      ctx.lineTo(W, h[h.length - 1] - 2)
      ctx.stroke()
    }
    ctx.fillStyle = '#5a3a22'
    ctx.fillRect(left - 10, -2000, view.width + 20, 2000)

    // 탱크
    const g = this.target
    const current = g && g.phase === 'play' && !p ? g.tanks[g.current].id : null
    for (const d of this.tanks.values()) this.drawTank(d)

    // 조준선
    const aim = this.local
    const mine = aim && !p ? this.tanks.get(aim.id) : null
    if (aim?.guide && mine) {
      const deg = absoluteDeg(aim.angle, aim.facing)
      const a = (deg * Math.PI) / 180
      const px = mine.x
      const py = mine.y + TURRET_Y
      ctx.strokeStyle = 'rgba(58, 42, 34, 0.55)'
      ctx.lineWidth = 2.5
      ctx.setLineDash([6, 7])
      ctx.beginPath()
      ctx.moveTo(px + Math.cos(a) * (BARREL + 6), py + Math.sin(a) * (BARREL + 6))
      ctx.lineTo(px + Math.cos(a) * (BARREL + 80), py + Math.sin(a) * (BARREL + 80))
      ctx.stroke()
      ctx.setLineDash([])
    }

    // 포탄과 꼬리
    if (p) {
      const step = (((now - p.t0) / 1000) * PLAY_SPEED) / DT
      for (const f of p.shot.flights) {
        const at = this.shellAt(f, step)
        if (!at) continue
        ctx.strokeStyle = 'rgba(58, 42, 34, 0.3)'
        ctx.lineWidth = 3
        ctx.beginPath()
        for (let k = Math.max(0, at.k - 10); k <= at.k; k++) {
          if (k === Math.max(0, at.k - 10)) ctx.moveTo(f.path[k * 2], f.path[k * 2 + 1])
          else ctx.lineTo(f.path[k * 2], f.path[k * 2 + 1])
        }
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
      } else if (f.kind === 'bit') {
        const x = f.x + f.vx * t
        const y = f.y + f.vy * t - 0.5 * 700 * t * t
        ctx.fillStyle = f.color
        ctx.fillRect(x - 2, y - 2, 4, 4)
      }
    }

    // 이름표·체력·글자는 화면 좌표로 그린다.
    screen()
    if (this.labels) {
      for (const d of this.tanks.values()) this.drawLabel(d, toX(d.x), toY(d.y + 38), d.id === current, now)
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
    const tilt = clamp(Math.atan2(surface(this.terrain, d.x + 8) - surface(this.terrain, d.x - 8), 16), -0.4, 0.4)

    // 포신은 차체 기울기와 상관없이 조준한 방향을 가리킨다(발사 계산과 같다).
    const deg = d.alive ? absoluteDeg(d.angle, d.facing) : d.facing > 0 ? -15 : 195
    const a = (deg * Math.PI) / 180
    const px = d.x
    const py = d.y + TURRET_Y
    ctx.lineCap = 'round'
    ctx.strokeStyle = INK
    ctx.lineWidth = 6
    ctx.beginPath()
    ctx.moveTo(px, py)
    ctx.lineTo(px + Math.cos(a) * BARREL, py + Math.sin(a) * BARREL)
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
