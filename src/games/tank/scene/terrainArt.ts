import { COL, MAPS, type MapKind, type Terrain } from '../game/world'

// 지형 그리기. 전장 캔버스와 로비 썸네일이 같이 쓴다.
//
// 열마다 흙 구간을 세로 띠로 그린다. 옆 열에서 윗면이 서로 가장 가까운 짝이면 두 열 가운데를 사선으로 이어
// 경사가 매끄럽다(구간이 하나인 언덕은 예전 높이맵 다각형과 같다). 짝이 없으면(절벽, 바위 끝) 띠 끝까지 평평하다.

export interface TerrainArt {
  body: Path2D
  /** 흙 윗면(바닥). 풀·모래를 그린다. 바위 아랫면은 들어가지 않는다. */
  top: Path2D
  /** 가장 높은 윗면. 흙 색 그라데이션 기준. */
  peak: number
}

interface Palette {
  sky: [string, string, string]
  ridge: string
  soilTop: string
  soilBottom: string
  top: string
  /** 월드 0 아래. null 이면 그리지 않는다(바닥 없는 바위 상자). */
  bedrock: string | null
  water: string
  /** 물을 탱크 앞에 반투명하게 그린다(섬: 잠긴 탱크가 보이게). 아니면 땅 뒤에 그린다. */
  waterFront: boolean
}

export const PALETTES: Record<MapKind, Palette> = {
  hills: {
    sky: ['#7cc6f2', '#cdeefc', '#fdf1d8'],
    ridge: 'rgba(120, 160, 150, 0.45)',
    soilTop: '#c98f55',
    soilBottom: '#8a5a33',
    top: '#6cbf4a',
    bedrock: '#5a3a22',
    water: '#4aa3d8',
    waterFront: false,
  },
  box: {
    sky: ['#4b5a86', '#8b9cc4', '#e4d9c6'],
    ridge: 'rgba(60, 70, 100, 0.35)',
    soilTop: '#a39486',
    soilBottom: '#6c5f53',
    top: '#86b35a',
    bedrock: null,
    water: '#4aa3d8',
    waterFront: false,
  },
  islands: {
    sky: ['#6cc3f5', '#c6ecfb', '#fff4dc'],
    ridge: 'rgba(120, 170, 190, 0.35)',
    soilTop: '#e2c689',
    soilBottom: '#a8763f',
    top: '#7ccc55',
    bedrock: '#1b4f78',
    water: 'rgba(40, 140, 205, 0.8)',
    waterFront: true,
  },
}

/** 두 구간이 세로로 겹치는지. */
const overlaps = (b0: number, t0: number, b1: number, t1: number) => b0 < t1 && b1 < t0

/** 열 `a` 의 각 구간에 대해, 열 `b` 에서 겹치는 구간 중 윗면이 가장 높은 것의 번호(없으면 -1). */
function bestTops(a: number[], b: number[]): number[] {
  const out: number[] = []
  for (let k = 0; k < a.length; k += 2) {
    let best = -1
    for (let j = 0; j < b.length; j += 2) {
      if (overlaps(a[k], a[k + 1], b[j], b[j + 1]) && (best < 0 || b[j + 1] > b[best + 1])) best = j
    }
    out.push(best)
  }
  return out
}

export function buildTerrainArt(t: Terrain): TerrainArt {
  const body = new Path2D()
  const top = new Path2D()
  let peak = 0
  const cols = t.cols
  const n = cols.length
  // right[i][k]: 열 i 의 k 번째 구간과 짝인 열 i+1 구간 번호. 서로 가장 가까운 윗면일 때만 짝이다.
  const right: number[][] = []
  const left: number[][] = []
  for (let i = 0; i < n; i++) left.push(cols[i].length ? new Array(cols[i].length / 2).fill(-1) : [])
  for (let i = 0; i < n; i++) {
    right.push(cols[i].length ? new Array(cols[i].length / 2).fill(-1) : [])
    if (i + 1 >= n) continue
    const fwd = bestTops(cols[i], cols[i + 1])
    const back = bestTops(cols[i + 1], cols[i])
    fwd.forEach((j, k) => {
      if (j >= 0 && back[j / 2] === k * 2) {
        right[i][k] = j
        left[i + 1][j / 2] = k * 2
      }
    })
  }
  for (let i = 0; i < n; i++) {
    const col = cols[i]
    const xl = i * COL
    const xc = xl + COL / 2
    const xr = xl + COL
    for (let k = 0; k < col.length; k += 2) {
      const b = col[k]
      const tp = col[k + 1]
      peak = Math.max(peak, tp)
      const r = right[i][k / 2]
      const l = left[i][k / 2]
      const tr = r >= 0 ? (tp + cols[i + 1][r + 1]) / 2 : tp
      const tl = l >= 0 ? (tp + cols[i - 1][l + 1]) / 2 : tp
      // 가장자리 띠는 조금 겹치게 그려 열 사이에 틈이 보이지 않게 한다.
      body.moveTo(xl - 0.2, b)
      body.lineTo(xl - 0.2, tl)
      body.lineTo(xc, tp)
      body.lineTo(xr + 0.2, tr)
      body.lineTo(xr + 0.2, b)
      body.closePath()
      top.moveTo(xl, tl)
      top.lineTo(xc, tp)
      top.lineTo(xr, tr)
    }
  }
  return { body, top, peak }
}

/** 하늘과 먼 산. 화면 좌표. */
export function drawSky(ctx: CanvasRenderingContext2D, kind: MapKind, w: number, h: number) {
  const p = PALETTES[kind]
  const sky = ctx.createLinearGradient(0, 0, 0, h)
  sky.addColorStop(0, p.sky[0])
  sky.addColorStop(0.7, p.sky[1])
  sky.addColorStop(1, p.sky[2])
  ctx.fillStyle = sky
  ctx.fillRect(0, 0, w, h)
}

/** 암반, 뒤쪽 물, 흙, 윗면. 월드 좌표(y 위쪽 +)로 변환된 상태에서 부른다. `left`~`left + width` 가 보이는 범위. */
export function drawGround(ctx: CanvasRenderingContext2D, kind: MapKind, art: TerrainArt, left: number, width: number) {
  const p = PALETTES[kind]
  const spec = MAPS[kind]
  if (!p.waterFront && spec.sea > 0) {
    ctx.fillStyle = p.water
    ctx.fillRect(left - 10, 0, width + 20, spec.sea)
  }
  const soil = ctx.createLinearGradient(0, Math.max(200, art.peak), 0, 0)
  soil.addColorStop(0, p.soilTop)
  soil.addColorStop(1, p.soilBottom)
  ctx.fillStyle = soil
  ctx.fill(art.body)
  ctx.strokeStyle = p.top
  ctx.lineWidth = 6
  ctx.lineJoin = 'round'
  ctx.lineCap = 'round'
  ctx.save()
  // 윗면 선은 흙 안쪽으로 조금 내려 그린다.
  ctx.translate(0, -2)
  ctx.stroke(art.top)
  ctx.restore()
  if (p.bedrock) {
    ctx.fillStyle = p.bedrock
    ctx.fillRect(left - 10, -2000, width + 20, 2000)
  }
  if (kind === 'box') {
    // 정사각형 맵의 테두리. 이 밖으로 나간 포탄은 사라진다.
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.35)'
    ctx.lineWidth = 3
    ctx.setLineDash([12, 10])
    ctx.strokeRect(0, 0, spec.w, spec.h)
    ctx.setLineDash([])
  }
}

/** 앞쪽 물(섬). 탱크를 그린 뒤에 부른다. */
export function drawSea(ctx: CanvasRenderingContext2D, kind: MapKind, left: number, width: number, now = 0) {
  const p = PALETTES[kind]
  const sea = MAPS[kind].sea
  if (!p.waterFront || sea <= 0) return
  // 깊을수록 진해져 물속 땅이 바닥 쪽에서 흐려진다.
  const deep = ctx.createLinearGradient(0, sea, 0, 0)
  deep.addColorStop(0, p.water)
  deep.addColorStop(1, 'rgba(27, 79, 120, 0.97)')
  ctx.fillStyle = deep
  ctx.fillRect(left - 10, 0, width + 20, sea)
  ctx.fillStyle = 'rgba(27, 79, 120, 0.97)'
  ctx.fillRect(left - 10, -2000, width + 20, 2000)
  // 물결
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.55)'
  ctx.lineWidth = 3
  ctx.beginPath()
  const phase = (now / 900) % (Math.PI * 2)
  for (let x = Math.floor(left / 40) * 40 - 40; x < left + width + 40; x += 8) {
    const y = sea + 2.5 * Math.sin(x / 26 + phase)
    if (x === Math.floor(left / 40) * 40 - 40) ctx.moveTo(x, y)
    else ctx.lineTo(x, y)
  }
  ctx.stroke()
}
