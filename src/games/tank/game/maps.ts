// 맵 생성. 판을 만드는 기기에서 한 번만 돌고 결과 지형은 게임 상태에 저장되므로, 여기서는 Math.sin 등을 써도 된다.
// 각 생성기는 지형과 탱크 `n` 대가 설 자리(x 순)를 돌려준다.

import { clamp, COL, cutSpan, fillSpan, MAPS, topAt, type MapKind, type Rng, type Terrain } from './world'

export interface Spot {
  x: number
  y: number
}

export interface Generated {
  terrain: Terrain
  spots: Spot[]
}

/** 탱크 자리 반폭. 이 안을 평평하게 다지고 위를 비운다. */
const PAD = 16

export function generateMap(kind: MapKind, rng: Rng, n: number): Generated {
  if (kind === 'box') return box(rng, n)
  if (kind === 'islands') return islands(rng, n)
  return hills(rng, n)
}

const colsOf = (w: number) => Math.round(w / COL)
const centerX = (i: number) => (i + 0.5) * COL

/** `x` 자리를 `level` 높이로 다진다. 아래는 채우고 위는 비운다. */
function pad(cols: number[][], x: number, level: number, depth = 14) {
  const first = Math.max(0, Math.floor((x - PAD) / COL))
  const last = Math.min(cols.length - 1, Math.ceil((x + PAD) / COL))
  for (let i = first; i <= last; i++) {
    cols[i] = fillSpan(cutSpan(cols[i], level, level + 44), level - depth, level)
  }
}

/** 높이 목록을 열마다 [0, h] 구간 하나로. 높이 0 이하는 빈 열. */
const fromHeights = (h: number[]) => h.map((v) => (v >= 1 ? [0, Math.round(v)] : []))

/** 어느 자리가 먼저 쏠지와 상관없이, 자리는 왼쪽부터 고르게 퍼진다. */
function spread(rng: Rng, n: number, lo: number, hi: number) {
  const step = n > 1 ? (hi - lo) / (n - 1) : 0
  return Array.from({ length: n }, (_, k) => Math.round(lo + k * step + (rng.next() - 0.5) * 40))
}

// ── 언덕 평야: 사인파 몇 개를 겹친 높이맵 ──
function hills(rng: Rng, n: number): Generated {
  const { w } = MAPS.hills
  const count = colsOf(w)
  const xs = spread(rng, n, 80, w - 80)
  const base = 210 + rng.next() * 90
  const waves = Array.from({ length: 4 }, (_, k) => ({
    amp: k === 0 ? 60 + rng.next() * 60 : (40 + rng.next() * 30) / k,
    freq: k === 0 ? 0.6 + rng.next() * 0.9 : 1 + k + rng.next() * 2,
    phase: rng.next() * Math.PI * 2,
  }))
  const h: number[] = []
  for (let i = 0; i < count; i++) {
    const u = (i + 0.5) / count
    let v = base
    for (const wave of waves) v += wave.amp * Math.sin(Math.PI * 2 * wave.freq * u + wave.phase)
    h.push(clamp(v, 120, 480))
  }
  smoothPads(h, xs)
  const terrain: Terrain = { kind: 'hills', cols: fromHeights(h) }
  return { terrain, spots: xs.map((x) => ({ x, y: topAt(terrain, x) })) }
}

/** 높이맵에서 탱크 자리를 주변과 매끄럽게 이어지도록 평평하게 만든다. */
function smoothPads(h: number[], xs: number[]) {
  for (const px of xs) {
    const i = clamp(Math.floor(px / COL), 0, h.length - 1)
    const level = h[i]
    for (let k = 0; k < h.length; k++) {
      const d = Math.abs(centerX(k) - px)
      if (d >= PAD * 2.2) continue
      const t = d <= PAD ? 1 : 1 - (d - PAD) / (PAD * 1.2)
      h[k] = h[k] + (level - h[k]) * t
    }
  }
}

// ── 세 섬: 바다 위 섬 셋. 섬 사이는 비어 있어 떨어지면 바다에 빠진다 ──
function islands(rng: Rng, n: number): Generated {
  const { w, sea } = MAPS.islands
  const count = colsOf(w)
  const isles = [0.17, 0.5, 0.83].map((u) => ({
    c: u * w + (rng.next() - 0.5) * 60,
    half: 115 + rng.next() * 40,
    peak: sea + 110 + rng.next() * 150,
    bumps: rng.next() * Math.PI * 2,
  }))
  const h = new Array<number>(count).fill(0)
  for (let i = 0; i < count; i++) {
    const x = centerX(i)
    for (const isle of isles) {
      const u = Math.abs(x - isle.c) / isle.half
      if (u >= 1) continue
      // 가운데가 높고 가장자리는 해변처럼 완만하다. 해변 끝은 해수면 조금 아래.
      const shape = Math.pow(1 - u * u, 0.7)
      const bump = 14 * Math.sin((x - isle.c) / 23 + isle.bumps)
      h[i] = Math.max(h[i], sea - 30 + (isle.peak - sea + 30) * shape + bump * shape)
    }
  }
  // 섬마다 한두 대. 네 대면 한 섬에 두 대가 선다.
  const order = [0, 1, 2]
  for (let k = order.length - 1; k > 0; k--) {
    const j = Math.floor(rng.next() * (k + 1))
    ;[order[k], order[j]] = [order[j], order[k]]
  }
  const perIsle = [0, 0, 0]
  for (let k = 0; k < n; k++) perIsle[order[k % 3]]++
  const xs: number[] = []
  isles.forEach((isle, k) => {
    const m = perIsle[k]
    for (let j = 0; j < m; j++) {
      const off = m === 1 ? (rng.next() - 0.5) * 0.3 : (j === 0 ? -0.42 : 0.42) + (rng.next() - 0.5) * 0.1
      xs.push(Math.round(isle.c + off * isle.half))
    }
  })
  xs.sort((a, b) => a - b)
  smoothPads(h, xs)
  const terrain: Terrain = { kind: 'islands', cols: fromHeights(h) }
  return { terrain, spots: xs.map((x) => ({ x, y: topAt(terrain, x) })) }
}

// ── 바위 상자: 정사각형 안에 무작위 씨앗마다 바위 덩어리가 자란다(메타볼). 빈 곳 바위 위에 탱크를 세운다 ──
function box(rng: Rng, n: number): Generated {
  const { w, h: height } = MAPS.box
  const count = colsOf(w)
  // 씨앗끼리 너무 붙으면 전부 한 덩어리가 되므로 간격을 두고 뿌린다. 가로로 넓적해 위가 탱크 발판이 된다.
  const seeds: { x: number; y: number; r2: number; ax: number; ay: number }[] = []
  const want = 8 + Math.floor(rng.next() * 3)
  for (let tries = 0; seeds.length < want && tries < 400; tries++) {
    const s = {
      x: 70 + rng.next() * (w - 140),
      y: 90 + rng.next() * (height - 220),
      r2: (38 + rng.next() * 34) ** 2,
      ax: 1.3 + rng.next() * 1.1,
      ay: 0.55 + rng.next() * 0.35,
    }
    if (seeds.every((o) => (o.x - s.x) ** 2 + (o.y - s.y) ** 2 >= 165 * 165)) seeds.push(s)
  }
  const cell = 3
  let cols: number[][] = []
  for (let i = 0; i < count; i++) {
    const x = centerX(i)
    const col: number[] = []
    let start = -1
    for (let y = 0; y <= height; y += cell) {
      let field = 0
      for (const s of seeds) field += s.r2 / (((x - s.x) / s.ax) ** 2 + ((y - s.y) / s.ay) ** 2 + 1)
      const solid = field >= 1.15 && y < height
      if (solid && start < 0) start = y
      if (!solid && start >= 0) {
        col.push(start, y)
        start = -1
      }
    }
    cols.push(col)
  }

  // 설 자리 후보: 가장자리가 아니고, 위로 넉넉히 비어 있는 흙 윗면.
  const cands: Spot[] = []
  for (let i = 12; i < count - 12; i += 2) {
    const col = cols[i]
    for (let k = 1; k < col.length; k += 2) {
      const top = col[k]
      const above = k + 1 < col.length ? col[k + 1] : Infinity
      if (above - top > 60 && top > 30 && top < height - 60) cands.push({ x: centerX(i), y: top })
    }
  }
  for (let k = cands.length - 1; k > 0; k--) {
    const j = Math.floor(rng.next() * (k + 1))
    ;[cands[k], cands[j]] = [cands[j], cands[k]]
  }
  // 서로 멀리 떨어진 자리부터 고른다. 모자라면 간격을 줄인다.
  const spots: Spot[] = []
  for (const gap of [260, 190, 120, 60]) {
    for (const c of cands) {
      if (spots.length >= n) break
      if (spots.every((s) => (s.x - c.x) ** 2 + (s.y - c.y) ** 2 >= gap * gap)) spots.push(c)
    }
  }
  // 그래도 모자라면(바위가 거의 없는 판) 허공에 발판을 만든다.
  while (spots.length < n) {
    spots.push({ x: Math.round(80 + rng.next() * (w - 160)), y: Math.round(150 + rng.next() * (height - 350)) })
  }
  for (const s of spots) pad(cols, s.x, s.y)
  cols = cols.map((c) => c.map(Math.round))
  const terrain: Terrain = { kind: 'box', cols }
  spots.sort((a, b) => a.x - b.x)
  return { terrain, spots: spots.map((s) => ({ x: s.x, y: s.y })) }
}
