import * as THREE from 'three'
import { SIZE } from '../game/rules'
import { BOARD_SIZE, STAR_POINTS } from './layout'

const INK = '#2b1d12'

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

/** 비자나무 느낌의 결. 가로로 흐르는 옅은 곡선을 여러 겹 긋는다. */
function grain(ctx: CanvasRenderingContext2D, w: number, h: number, n: number, alpha: number) {
  for (let i = 0; i < n; i++) {
    const y = Math.random() * h
    const amp = 4 + Math.random() * 14
    const freq = 0.002 + Math.random() * 0.004
    const phase = Math.random() * Math.PI * 2
    ctx.strokeStyle = `rgba(${120 + Math.random() * 40},${70 + Math.random() * 30},${25},${Math.random() * alpha})`
    ctx.lineWidth = 0.6 + Math.random() * 2.2
    ctx.beginPath()
    for (let x = 0; x <= w; x += 16) {
      const yy = y + Math.sin(x * freq + phase) * amp
      if (x === 0) ctx.moveTo(x, yy)
      else ctx.lineTo(x, yy)
    }
    ctx.stroke()
  }
}

/** 판 윗면: 나뭇결 위에 먹선 15줄과 화점. */
export function boardTexture(): THREE.CanvasTexture {
  const S = 2048
  const [c, ctx] = canvas(S)
  const grad = ctx.createLinearGradient(0, 0, S, S)
  grad.addColorStop(0, '#e9b86a')
  grad.addColorStop(0.5, '#dfa753')
  grad.addColorStop(1, '#d49a45')
  ctx.fillStyle = grad
  ctx.fillRect(0, 0, S, S)
  grain(ctx, S, S, 420, 0.22)

  const cell = S / BOARD_SIZE
  const toPx = (i: number) => cell + i * cell
  ctx.strokeStyle = INK
  ctx.lineCap = 'square'
  for (let i = 0; i < SIZE; i++) {
    ctx.lineWidth = i === 0 || i === SIZE - 1 ? 6 : 3.2
    ctx.beginPath()
    ctx.moveTo(toPx(0), toPx(i))
    ctx.lineTo(toPx(SIZE - 1), toPx(i))
    ctx.moveTo(toPx(i), toPx(0))
    ctx.lineTo(toPx(i), toPx(SIZE - 1))
    ctx.stroke()
  }
  ctx.fillStyle = INK
  for (const [x, y] of STAR_POINTS) {
    ctx.beginPath()
    ctx.arc(toPx(x), toPx(y), 13, 0, Math.PI * 2)
    ctx.fill()
  }
  return finish(c)
}

/** 판 옆면. 윗면보다 조금 짙은 나뭇결. */
export function sideTexture(): THREE.CanvasTexture {
  const [c, ctx] = canvas(512, 128)
  ctx.fillStyle = '#c98f45'
  ctx.fillRect(0, 0, 512, 128)
  grain(ctx, 512, 128, 60, 0.35)
  return finish(c)
}

/** 판을 올려 둔 탁자의 천. 가운데가 밝은 원형 그라데이션에 잔 얼룩. */
export function tableTexture(): THREE.CanvasTexture {
  const S = 1024
  const [c, ctx] = canvas(S)
  const grad = ctx.createRadialGradient(S / 2, S / 2, S * 0.05, S / 2, S / 2, S * 0.55)
  grad.addColorStop(0, '#6f8f6a')
  grad.addColorStop(1, '#3f5a44')
  ctx.fillStyle = grad
  ctx.fillRect(0, 0, S, S)
  for (let i = 0; i < 16000; i++) {
    const g = Math.random() * 40
    ctx.fillStyle = `rgba(${20 + g},${40 + g},${25 + g},${Math.random() * 0.15})`
    ctx.fillRect(Math.random() * S, Math.random() * S, 1 + Math.random() * 2, 1 + Math.random() * 2)
  }
  return finish(c)
}
