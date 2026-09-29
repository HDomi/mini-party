import * as THREE from 'three'
import { BIG_NODES, EDGES, NODE_POS } from '../game/board'
import { BOARD_SIZE } from './layout'

const INK = '#3a2a22'
const RED = '#c0392f'

function canvas(w: number, h = w) {
  const c = document.createElement('canvas')
  c.width = w
  c.height = h
  return [c, c.getContext('2d')!] as const
}

function finish(c: HTMLCanvasElement, repeat = 1) {
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  t.anisotropy = 8
  if (repeat !== 1) {
    t.wrapS = t.wrapT = THREE.RepeatWrapping
    t.repeat.set(repeat, repeat)
  }
  return t
}

function speckle(ctx: CanvasRenderingContext2D, w: number, h: number, n: number, alpha: number) {
  for (let i = 0; i < n; i++) {
    const g = Math.random() * 60
    ctx.fillStyle = `rgba(${90 + g},${60 + g},${30 + g},${Math.random() * alpha})`
    const x = Math.random() * w
    const y = Math.random() * h
    ctx.fillRect(x, y, 1 + Math.random() * 3, 1 + Math.random() * 1.5)
  }
}

/** Hanji-style board top with the yut paths drawn in ink. */
export function boardTexture(): THREE.CanvasTexture {
  const S = 2048
  const [c, ctx] = canvas(S)
  const grad = ctx.createRadialGradient(S / 2, S / 2, S * 0.1, S / 2, S / 2, S * 0.75)
  grad.addColorStop(0, '#fbf3e2')
  grad.addColorStop(1, '#efdcbc')
  ctx.fillStyle = grad
  ctx.fillRect(0, 0, S, S)
  speckle(ctx, S, S, 9000, 0.12)
  for (let i = 0; i < 260; i++) {
    ctx.strokeStyle = `rgba(150,110,70,${Math.random() * 0.08})`
    ctx.lineWidth = 1
    ctx.beginPath()
    const x = Math.random() * S
    const y = Math.random() * S
    ctx.moveTo(x, y)
    ctx.bezierCurveTo(x + 30, y + 10, x + 50, y - 20, x + 80 * Math.random(), y + 40 * Math.random())
    ctx.stroke()
  }

  const toPx = (v: number) => ((v + BOARD_SIZE / 2) / BOARD_SIZE) * S
  // double red frame
  ctx.strokeStyle = RED
  ctx.lineWidth = 10
  ctx.strokeRect(46, 46, S - 92, S - 92)
  ctx.lineWidth = 3
  ctx.strokeRect(70, 70, S - 140, S - 140)

  // paths
  ctx.strokeStyle = INK
  ctx.lineCap = 'round'
  ctx.lineWidth = 9
  for (const [a, b] of EDGES) {
    const [ax, az] = NODE_POS[a]
    const [bx, bz] = NODE_POS[b]
    ctx.beginPath()
    ctx.moveTo(toPx(ax), toPx(az))
    ctx.lineTo(toPx(bx), toPx(bz))
    ctx.stroke()
  }

  // stations
  for (const [id, [x, z]] of Object.entries(NODE_POS)) {
    const px = toPx(x)
    const pz = toPx(z)
    const big = BIG_NODES.has(id)
    const r = big ? 74 : 50
    ctx.fillStyle = '#fbf3e2'
    ctx.beginPath()
    ctx.arc(px, pz, r, 0, Math.PI * 2)
    ctx.fill()
    ctx.lineWidth = big ? 10 : 8
    ctx.strokeStyle = big ? RED : INK
    ctx.stroke()
    if (big) {
      ctx.lineWidth = 4
      ctx.beginPath()
      ctx.arc(px, pz, r - 18, 0, Math.PI * 2)
      ctx.stroke()
      ctx.fillStyle = 'rgba(192,57,47,0.14)'
      ctx.fill()
    } else {
      ctx.fillStyle = 'rgba(58,42,34,0.08)'
      ctx.beginPath()
      ctx.arc(px, pz, r - 16, 0, Math.PI * 2)
      ctx.fill()
    }
  }

  // start marker + direction arrow
  const [sx, sz] = NODE_POS.O0
  ctx.fillStyle = RED
  ctx.font = '600 64px Jua, sans-serif'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText('출발', toPx(sx) - 150, toPx(sz) - 10)
  ctx.save()
  ctx.translate(toPx(sx) + 2, toPx(sz) - 190)
  ctx.fillStyle = RED
  ctx.beginPath()
  ctx.moveTo(0, -36)
  ctx.lineTo(24, 4)
  ctx.lineTo(-24, 4)
  ctx.closePath()
  ctx.fill()
  ctx.restore()

  return finish(c)
}

/** Woven straw mat (멍석) under the board. */
export function matTexture(): THREE.CanvasTexture {
  const S = 512
  const [c, ctx] = canvas(S)
  ctx.fillStyle = '#d6b07a'
  ctx.fillRect(0, 0, S, S)
  const cell = 32
  for (let y = 0; y < S; y += cell) {
    for (let x = 0; x < S; x += cell) {
      const horiz = ((x + y) / cell) % 2 === 0
      const g = ctx.createLinearGradient(x, y, horiz ? x : x + cell, horiz ? y + cell : y)
      g.addColorStop(0, '#c99c62')
      g.addColorStop(0.5, '#e2bf8b')
      g.addColorStop(1, '#bf8f55')
      ctx.fillStyle = g
      ctx.fillRect(x + 1, y + 1, cell - 2, cell - 2)
      ctx.strokeStyle = 'rgba(120,80,40,0.25)'
      ctx.lineWidth = 1
      for (let k = 6; k < cell; k += 7) {
        ctx.beginPath()
        if (horiz) {
          ctx.moveTo(x + 2, y + k)
          ctx.lineTo(x + cell - 2, y + k)
        } else {
          ctx.moveTo(x + k, y + 2)
          ctx.lineTo(x + k, y + cell - 2)
        }
        ctx.stroke()
      }
    }
  }
  speckle(ctx, S, S, 1500, 0.2)
  return finish(c, 10)
}

function woodGrain(ctx: CanvasRenderingContext2D, w: number, h: number, base: string, line: string) {
  ctx.fillStyle = base
  ctx.fillRect(0, 0, w, h)
  ctx.strokeStyle = line
  for (let i = 0; i < 26; i++) {
    ctx.lineWidth = 1 + Math.random() * 2
    ctx.globalAlpha = 0.25 + Math.random() * 0.3
    const y = Math.random() * h
    ctx.beginPath()
    ctx.moveTo(0, y)
    for (let x = 0; x <= w; x += 32) ctx.lineTo(x, y + Math.sin(x / 50 + i) * 4)
    ctx.stroke()
  }
  ctx.globalAlpha = 1
}

function drawX(ctx: CanvasRenderingContext2D, x: number, y: number, s: number, color: string, width: number) {
  ctx.strokeStyle = color
  ctx.lineWidth = width
  ctx.lineCap = 'round'
  ctx.beginPath()
  ctx.moveTo(x - s, y - s)
  ctx.lineTo(x + s, y + s)
  ctx.moveTo(x + s, y - s)
  ctx.lineTo(x - s, y + s)
  ctx.stroke()
}

/** Stick textures. Canvas x runs along the stick length. */
export function stickTextures() {
  const W = 512
  const H = 96
  const [rc, r] = canvas(W, H)
  woodGrain(r, W, H, '#a86a3c', '#6b3f1f')
  for (const x of [W * 0.28, W * 0.5, W * 0.72]) drawX(r, x, H / 2, 16, '#3b2112', 6)

  const [fc, f] = canvas(W, H)
  woodGrain(f, W, H, '#f1d9ae', '#c89a62')

  const [mc, m] = canvas(W, H)
  woodGrain(m, W, H, '#f1d9ae', '#c89a62')
  drawX(m, W / 2, H / 2, 22, RED, 9)

  return { round: finish(rc), flat: finish(fc), marked: finish(mc) }
}
