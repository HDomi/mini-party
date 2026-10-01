import * as THREE from 'three'

const INK = '#2b1d12'
const PIP_RED = '#d94436'

function canvas(w: number, h = w) {
  const c = document.createElement('canvas')
  c.width = w
  c.height = h
  return [c, c.getContext('2d')!] as const
}

function finish(c: HTMLCanvasElement) {
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  t.anisotropy = 8
  return t
}

// 3×3 칸 중 눈이 찍히는 자리. (0, 0) 이 왼쪽 위.
const PIPS: Record<number, [number, number][]> = {
  1: [[1, 1]],
  2: [
    [0, 0],
    [2, 2],
  ],
  3: [
    [0, 0],
    [1, 1],
    [2, 2],
  ],
  4: [
    [0, 0],
    [2, 0],
    [0, 2],
    [2, 2],
  ],
  5: [
    [0, 0],
    [2, 0],
    [1, 1],
    [0, 2],
    [2, 2],
  ],
  6: [
    [0, 0],
    [2, 0],
    [0, 1],
    [2, 1],
    [0, 2],
    [2, 2],
  ],
}

/** 주사위 한 면. 1은 크고 빨간 눈 하나다. */
export function faceTexture(value: number): THREE.CanvasTexture {
  const S = 256
  const [c, ctx] = canvas(S)
  ctx.fillStyle = '#fffaf1'
  ctx.fillRect(0, 0, S, S)
  // 가장자리를 살짝 어둡게 해서 둥근 모서리와 이어지게 한다.
  const edge = ctx.createRadialGradient(S / 2, S / 2, S * 0.3, S / 2, S / 2, S * 0.75)
  edge.addColorStop(0, 'rgba(0,0,0,0)')
  edge.addColorStop(1, 'rgba(120,90,60,0.16)')
  ctx.fillStyle = edge
  ctx.fillRect(0, 0, S, S)

  const one = value === 1
  const r = one ? S * 0.15 : S * 0.085
  for (const [gx, gy] of PIPS[value]) {
    const x = S * (0.24 + gx * 0.26)
    const y = S * (0.24 + gy * 0.26)
    // 눈은 파인 홈처럼 보이게 위쪽에 얇은 그림자를 둔다.
    ctx.fillStyle = 'rgba(0,0,0,0.18)'
    ctx.beginPath()
    ctx.arc(x, y - r * 0.12, r * 1.06, 0, Math.PI * 2)
    ctx.fill()
    ctx.fillStyle = one ? PIP_RED : INK
    ctx.beginPath()
    ctx.arc(x, y, r, 0, Math.PI * 2)
    ctx.fill()
  }
  return finish(c)
}

/** 쟁반 바닥 펠트. 잔 점을 흩뿌려 결을 낸다. */
export function feltTexture(): THREE.CanvasTexture {
  const S = 1024
  const [c, ctx] = canvas(S)
  ctx.fillStyle = '#2f7d5b'
  ctx.fillRect(0, 0, S, S)
  for (let i = 0; i < 26000; i++) {
    const light = Math.random() < 0.5
    ctx.fillStyle = light ? `rgba(160,230,190,${Math.random() * 0.08})` : `rgba(10,40,25,${Math.random() * 0.12})`
    ctx.fillRect(Math.random() * S, Math.random() * S, 1 + Math.random() * 2, 1 + Math.random() * 2)
  }
  const t = finish(c)
  t.wrapS = t.wrapT = THREE.RepeatWrapping
  t.repeat.set(2, 1.5)
  return t
}

/** 쟁반 테두리 나무. 가로로 흐르는 결. */
export function woodTexture(): THREE.CanvasTexture {
  const W = 1024
  const H = 256
  const [c, ctx] = canvas(W, H)
  const grad = ctx.createLinearGradient(0, 0, 0, H)
  grad.addColorStop(0, '#a5683a')
  grad.addColorStop(1, '#8a532c')
  ctx.fillStyle = grad
  ctx.fillRect(0, 0, W, H)
  for (let i = 0; i < 140; i++) {
    const y = Math.random() * H
    const amp = 2 + Math.random() * 6
    const freq = 0.004 + Math.random() * 0.006
    const phase = Math.random() * Math.PI * 2
    ctx.strokeStyle = `rgba(60,30,12,${Math.random() * 0.25})`
    ctx.lineWidth = 0.6 + Math.random() * 2
    ctx.beginPath()
    for (let x = 0; x <= W; x += 16) {
      const yy = y + Math.sin(x * freq + phase) * amp
      if (x === 0) ctx.moveTo(x, yy)
      else ctx.lineTo(x, yy)
    }
    ctx.stroke()
  }
  return finish(c)
}
