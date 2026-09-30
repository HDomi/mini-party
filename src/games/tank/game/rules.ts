// 포격전 규칙. 순수 함수만 있다: 방(transaction)과 봇이 같은 reducer 를 쓴다.
//
// 발사 한 번은 액션 하나다. `applyAction` 이 포탄 비행을 끝까지 계산해 지형·체력·탈락을 확정하고,
// 폭발과 피해를 `lastShot` 에 남긴다. 궤적은 저장하지 않는다: 화면은 발사 직전 상태에서 `shotFlights` 로
// 똑같이 다시 계산한다(비행 계산은 기기마다 같은 값이 나온다, world.ts 참고). 난수는 `rng` 에 저장한 상태에서만 뽑는다.

import { generateMap } from './maps'
import {
  applyCrater,
  blastDamage,
  clamp,
  decodeTerrain,
  drowned,
  encodeTerrain,
  fallDamage,
  fly,
  FUEL,
  groundBelow,
  makeRng,
  MAPS,
  MAX_WIND,
  muzzle,
  SPEED_PER_POWER,
  walk,
  type Flight,
  type MapKind,
  type Rng,
  type Terrain,
} from './world'

export type Weapon = 'shell' | 'heavy' | 'triple' | 'drill'
export type LimitedWeapon = Exclude<Weapon, 'shell'>
export const WEAPON_LIST: Weapon[] = ['shell', 'heavy', 'triple', 'drill']

export interface WeaponSpec {
  name: string
  /** 폭발 반지름. 이만큼 땅을 파고 피해가 미친다. */
  r: number
  /** 한가운데에 맞았을 때 피해. */
  dmg: number
  /** 한 판에 쓸 수 있는 개수. null 이면 무제한. */
  ammo: number | null
  hint: string
}

export const WEAPONS: Record<Weapon, WeaponSpec> = {
  shell: { name: '기본탄', r: 30, dmg: 30, ammo: null, hint: '무제한' },
  heavy: { name: '대형탄', r: 50, dmg: 48, ammo: 2, hint: '크게 터져요' },
  triple: { name: '3연발', r: 22, dmg: 16, ammo: 2, hint: '세 발이 퍼져요' },
  drill: { name: '굴착탄', r: 64, dmg: 8, ammo: 2, hint: '땅을 크게 파요' },
}
/** 3연발의 양옆 포탄이 벌어지는 각도. */
export const TRIPLE_SPREAD = 4
export const MAX_HP = 100

/** 개인전은 자리마다 한 색, 팀전은 팀마다 한 계열. */
export const COLORS = ['#e8574a', '#2f8fd8', '#4caf50', '#f2b53a']
export const TEAM_COLORS = [
  ['#e8574a', '#f39a6b'],
  ['#2f8fd8', '#6fc0f0'],
]
export const COLOR_NAME = ['빨강', '파랑', '초록', '노랑']
export const TEAM_NAME = ['빨강팀', '파랑팀']
export const SLOTS = 4

export interface Tank {
  id: string
  name: string
  /** 팀전이면 0 / 1, 개인전이면 자리 번호라 모두 다르다. */
  team: number
  color: string
  x: number
  /** 탱크 바닥의 높이. 지형 위에 서 있다. */
  y: number
  hp: number
  facing: 1 | -1
  /** 마지막으로 쏜 각도(0~90, 바라보는 쪽 기준). */
  angle: number
  /** 마지막으로 쏜 파워. 게이지에 표시한다. */
  power: number
  ammo: Record<LimitedWeapon, number>
  alive: boolean
  /** `fall` 은 맵 아래로 떨어짐, `sea` 는 바다에 빠짐. */
  out: 'hp' | 'fall' | 'sea' | 'resign' | null
}

/** 맵 아래로 떨어진 탱크의 y. JSON 에 -Infinity 를 넣을 수 없어서 이 값으로 둔다. */
export const FELL_Y = -100

export interface Boom {
  x: number
  y: number
  r: number
  /** 터진 시각(스텝). */
  steps: number
  hits: { id: string; dmg: number }[]
}

export interface Shot {
  /** 이 발사로 만들어진 상태의 `seq`. 발사 직전 상태는 `seq - 1` 이다. 화면은 이 값이 같을 때만 재생한다. */
  seq: number
  by: string
  weapon: Weapon
  angle: number
  power: number
  facing: 1 | -1
  /** 터진 순서대로. */
  booms: Boom[]
  falls: { id: string; dmg: number }[]
  deaths: string[]
}

export interface GameState {
  teamMode: boolean
  map: MapKind
  /** 차례 순서대로. 탈락한 탱크도 잔해로 남는다. */
  tanks: Tank[]
  /** `encodeTerrain` 문자열. `terrainOf` 로 푼다. */
  terrain: string
  /** -MAX_WIND ~ MAX_WIND. + 면 오른쪽으로 분다. */
  wind: number
  rng: number
  /** 차례가 넘어갈 때마다 올라간다. 시간 초과가 늦게 도착해도 한 번만 처리된다. */
  turn: number
  current: number
  /** 지금 차례인 탱크의 남은 연료. */
  fuel: number
  phase: 'play' | 'over'
  /** 이긴 team. 모두 탈락하면 null(무승부). */
  winner: number | null
  lastShot: Shot | null
  seq: number
  /** 한 판 더 할 때마다 올라간다. 화면이 이 값으로 다시 마운트된다. */
  round: number
}

export type Action =
  | { type: 'move'; by: string; x: number; facing: 1 | -1 }
  | { type: 'fire'; by: string; weapon: Weapon; angle: number; power: number; facing: 1 | -1 }
  /** 시간 초과·오프라인으로 차례를 넘긴다. 누구나 보낼 수 있고 `turn` 이 맞을 때만 처리된다. */
  | { type: 'skip'; by: string; turn: number }
  | { type: 'resign'; by: string }
  /** 같은 사람들로 새 판. 먼저 쏘는 사람이 한 칸씩 밀린다. */
  | { type: 'rematch'; by: string }

export class RuleError extends Error {}

/** 이미 처리된 요청(예: 늦게 도착한 시간 초과). 메시지가 비어 있어 사용자에게 보이지 않는다. */
export class StaleError extends RuleError {
  constructor() {
    super('')
  }
}

export interface Entrant {
  id: string
  name: string
  /** 로비 자리 0~3. 개인전 색과 팀전 팀(짝수 빨강, 홀수 파랑)을 정한다. */
  slot: number
}

export const teamOfSlot = (slot: number, teamMode: boolean) => (teamMode ? slot % 2 : slot)

export function createGame(opts: { players: Entrant[]; teamMode: boolean; map: MapKind; seed: number }): GameState {
  const rng = makeRng(opts.seed)
  const sorted = [...opts.players].sort((a, b) => a.slot - b.slot)
  const base = sorted.map((p) => ({
    id: p.id,
    name: p.name,
    team: teamOfSlot(p.slot, opts.teamMode),
    color: opts.teamMode ? TEAM_COLORS[p.slot % 2][p.slot >> 1] : COLORS[p.slot],
  }))
  let order: typeof base
  if (opts.teamMode) {
    // 두 팀이 번갈아 쏜다. 어느 팀이 먼저인지는 무작위.
    const first = rng.next() < 0.5 ? 0 : 1
    const a = base.filter((t) => t.team === first)
    const b = base.filter((t) => t.team !== first)
    order = []
    for (let i = 0; i < Math.max(a.length, b.length); i++) {
      if (a[i]) order.push(a[i])
      if (b[i]) order.push(b[i])
    }
  } else {
    const k = Math.floor(rng.next() * base.length)
    order = [...base.slice(k), ...base.slice(0, k)]
  }
  return newRound(order, opts.teamMode, MAPS[opts.map] ? opts.map : 'hills', rng, 0)
}

function newRound(
  order: Pick<Tank, 'id' | 'name' | 'team' | 'color'>[],
  teamMode: boolean,
  map: MapKind,
  rng: Rng,
  round: number,
): GameState {
  const { terrain, spots } = generateMap(map, rng, order.length)
  // 자리는 x 순이다. 팀전은 차례 순서(번갈아)대로 서서 같은 팀이 붙지 않는다. 개인전은 섞는다.
  if (!teamMode) {
    for (let i = spots.length - 1; i > 0; i--) {
      const j = Math.floor(rng.next() * (i + 1))
      ;[spots[i], spots[j]] = [spots[j], spots[i]]
    }
  }
  const mid = MAPS[map].w / 2
  const tanks: Tank[] = order.map((t, k) => {
    const { x, y } = spots[k]
    return {
      ...t,
      x,
      y,
      hp: MAX_HP,
      facing: x < mid ? 1 : -1,
      angle: 45,
      power: 60,
      ammo: { heavy: WEAPONS.heavy.ammo!, triple: WEAPONS.triple.ammo!, drill: WEAPONS.drill.ammo! },
      alive: true,
      out: null,
    }
  })
  const wind = nextWind(rng)
  return {
    teamMode,
    map,
    tanks,
    terrain: encodeTerrain(terrain),
    wind,
    rng: rng.seed,
    turn: 1,
    current: 0,
    fuel: FUEL,
    phase: 'play',
    winner: null,
    lastShot: null,
    seq: 1,
    round,
  }
}

/** 약한 바람이 더 자주 분다. */
function nextWind(rng: Rng): number {
  const u = rng.next() * 2 - 1
  return Math.round(Math.sign(u) * u * u * MAX_WIND)
}

export const currentTank = (s: GameState): Tank => s.tanks[s.current]
export const terrainOf = (s: Pick<GameState, 'map' | 'terrain'>): Terrain => decodeTerrain(s.map, s.terrain)
export const tankOf = (s: GameState, id: string): Tank | undefined => s.tanks.find((t) => t.id === id)
export const aliveTeams = (s: Pick<GameState, 'tanks'>): Set<number> => new Set(s.tanks.filter((t) => t.alive).map((t) => t.team))

/** 바라보는 쪽 기준 각도를 수평 기준 각도로 바꾼다. */
export const absoluteDeg = (angle: number, facing: 1 | -1) => (facing > 0 ? angle : 180 - angle)

/** 승자 이름. 팀전은 팀 이름, 개인전은 탱크 이름. */
export function winnerName(s: GameState): string | null {
  if (s.winner === null) return null
  if (s.teamMode) return TEAM_NAME[s.winner]
  return s.tanks.find((t) => t.team === s.winner)?.name ?? null
}

export function applyAction(s: GameState, a: Action): GameState {
  if (a.type === 'rematch') {
    if (s.phase !== 'over') throw new RuleError('아직 게임 중이에요')
    const order = [...s.tanks.slice(1), s.tanks[0]].map(({ id, name, team, color }) => ({ id, name, team, color }))
    return newRound(order, s.teamMode, s.map, makeRng(s.rng), s.round + 1)
  }
  if (s.phase !== 'play') throw new RuleError('게임이 끝났어요')
  switch (a.type) {
    case 'skip':
      if (a.turn !== s.turn) throw new StaleError()
      return advance({ ...s, lastShot: null, seq: s.seq + 1 })
    case 'resign':
      return resign(s, a.by)
    case 'move':
      return move(s, a)
    case 'fire':
      return fire(s, a)
  }
}

function requireTurn(s: GameState, by: string): Tank {
  const t = currentTank(s)
  if (t.id !== by) throw new RuleError('내 차례가 아니에요')
  return t
}

const finite = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)

function move(s: GameState, a: Extract<Action, { type: 'move' }>): GameState {
  const t = requireTurn(s, a.by)
  if (!finite(a.x)) throw new RuleError('잘못된 위치예요')
  const r = walk(terrainOf(s), t.x, t.y, a.x, s.fuel)
  const tank: Tank = { ...t, x: r.x, y: r.y, facing: a.facing === -1 ? -1 : 1 }
  return { ...s, tanks: s.tanks.map((x) => (x.id === t.id ? tank : x)), fuel: r.fuel, seq: s.seq + 1 }
}

function fire(s: GameState, a: Extract<Action, { type: 'fire' }>): GameState {
  const t = requireTurn(s, a.by)
  const spec = WEAPONS[a.weapon]
  if (!spec) throw new RuleError('없는 무기예요')
  if (a.weapon !== 'shell' && t.ammo[a.weapon] <= 0) throw new RuleError(`${spec.name}이 남지 않았어요`)
  if (!finite(a.angle) || !finite(a.power)) throw new RuleError('각도와 파워를 다시 맞춰 주세요')
  const angle = clamp(Math.round(a.angle), 0, 90)
  const power = clamp(Math.round(a.power * 10) / 10, 0, 100)
  const facing = a.facing === -1 ? -1 : 1
  const before = terrainOf(s)
  const flights = shotFlights(s, before, { by: t.id, weapon: a.weapon, angle, power, facing })

  const tanks = s.tanks.map((x) => ({ ...x, ammo: { ...x.ammo } }))
  const me = tanks[s.current]
  me.angle = angle
  me.power = power
  me.facing = facing
  if (a.weapon !== 'shell') me.ammo[a.weapon]--

  let terrain = before
  const booms: Boom[] = []
  const landed = flights.filter((f) => f.end === 'ground' || f.end === 'tank').sort((p, q) => p.steps - q.steps)
  for (const f of landed) {
    terrain = applyCrater(terrain, f.x, f.y, spec.r)
    const hits: Boom['hits'] = []
    for (const tk of tanks) {
      if (!tk.alive || tk.hp <= 0) continue
      const dmg = blastDamage({ x: f.x, y: f.y, r: spec.r, dmg: spec.dmg }, tk)
      if (dmg <= 0) continue
      tk.hp = Math.max(0, tk.hp - dmg)
      hits.push({ id: tk.id, dmg })
    }
    booms.push({ x: Math.round(f.x), y: Math.round(f.y), r: spec.r, steps: f.steps, hits })
  }

  // 발밑이 파이면 떨어진다. 잔해도 같이 떨어진다. 흙은 무너지지 않는다.
  const falls: Shot['falls'] = []
  const deaths: string[] = []
  for (const tk of tanks) {
    const ground = tk.y <= FELL_Y ? -Infinity : groundBelow(terrain, tk.x, tk.y)
    const ny = ground === -Infinity ? FELL_Y : ground
    const drop = tk.y - ny
    tk.y = ny
    if (!tk.alive) continue
    if (ground === -Infinity) {
      tk.hp = 0
      tk.out = 'fall'
    } else if (drowned(terrain, ny)) {
      tk.hp = 0
      tk.out = 'sea'
    } else if (tk.hp > 0) {
      const dmg = fallDamage(drop)
      if (dmg > 0) {
        tk.hp = Math.max(0, tk.hp - dmg)
        falls.push({ id: tk.id, dmg })
      }
    }
    if (tk.hp <= 0) {
      tk.alive = false
      tk.out = tk.out ?? 'hp'
      deaths.push(tk.id)
    }
  }

  const seq = s.seq + 1
  const shot: Shot = { seq, by: t.id, weapon: a.weapon, angle, power, facing, booms, falls, deaths }
  return finish({ ...s, tanks, terrain: encodeTerrain(terrain), lastShot: shot, seq })
}

/**
 * 발사 직전 상태 `s` 에서 쏜 포탄들의 비행. `applyAction` 과 화면 재생이 같은 함수를 쓴다.
 * `terrain` 은 `terrainOf(s)`(여러 번 부를 때 다시 풀지 않도록 받는다).
 */
export function shotFlights(
  s: GameState,
  terrain: Terrain,
  shot: Pick<Shot, 'by' | 'weapon' | 'angle' | 'power' | 'facing'>,
): Flight[] {
  const t = tankOf(s, shot.by)
  if (!t) return []
  const deg = absoluteDeg(shot.angle, shot.facing)
  const degs = shot.weapon === 'triple' ? [deg - TRIPLE_SPREAD, deg, deg + TRIPLE_SPREAD] : [deg]
  const from = muzzle(t, deg)
  const bodies = s.tanks.filter((x) => x.alive)
  return degs.map((d) => fly({ t: terrain, from, deg: d, speed: shot.power * SPEED_PER_POWER, wind: s.wind, tanks: bodies, shooter: t.id }))
}

function resign(s: GameState, by: string): GameState {
  const i = s.tanks.findIndex((t) => t.id === by)
  if (i === -1) throw new RuleError('참가자가 아니에요')
  if (!s.tanks[i].alive) throw new RuleError('이미 탈락했어요')
  const tanks = s.tanks.map((t, k) => (k === i ? { ...t, hp: 0, alive: false, out: 'resign' as const } : t))
  const next = { ...s, tanks, seq: s.seq + 1 }
  if (aliveTeams(next).size <= 1) return finish(next)
  return i === s.current ? advance(next) : next
}

/** 살아남은 팀이 하나 이하면 끝낸다. 아니면 차례를 넘긴다. */
function finish(s: GameState): GameState {
  const teams = aliveTeams(s)
  if (teams.size <= 1) return { ...s, phase: 'over', winner: teams.size ? [...teams][0] : null }
  return advance(s)
}

/** 다음으로 살아 있는 탱크에게 차례를 넘기고 바람을 바꾼다. */
function advance(s: GameState): GameState {
  const n = s.tanks.length
  let next = s.current
  for (let k = 1; k <= n; k++) {
    const j = (s.current + k) % n
    if (s.tanks[j].alive) {
      next = j
      break
    }
  }
  const rng = makeRng(s.rng)
  const wind = nextWind(rng)
  return { ...s, current: next, turn: s.turn + 1, fuel: FUEL, wind, rng: rng.seed }
}
