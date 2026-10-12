import * as THREE from 'three'

function finish(c: HTMLCanvasElement) {
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  t.anisotropy = 8
  return t
}

/** 통 옆면. 세로로 선 나무판(staves) 16장과 그 사이 이음매, 세로 결. */
export function staveTexture(): THREE.CanvasTexture {
  const W = 2048
  const H = 512
  const c = document.createElement('canvas')
  c.width = W
  c.height = H
  const ctx = c.getContext('2d')!
  const STAVES = 16
  const sw = W / STAVES
  for (let i = 0; i < STAVES; i++) {
    const tone = 0.85 + Math.random() * 0.3
    const grad = ctx.createLinearGradient(i * sw, 0, (i + 1) * sw, 0)
    grad.addColorStop(0, `rgb(${150 * tone},${92 * tone},${48 * tone})`)
    grad.addColorStop(0.5, `rgb(${178 * tone},${112 * tone},${60 * tone})`)
    grad.addColorStop(1, `rgb(${146 * tone},${88 * tone},${45 * tone})`)
    ctx.fillStyle = grad
    ctx.fillRect(i * sw, 0, sw, H)
    // 세로 결
    for (let k = 0; k < 14; k++) {
      const x = i * sw + Math.random() * sw
      ctx.strokeStyle = `rgba(70,35,12,${0.08 + Math.random() * 0.18})`
      ctx.lineWidth = 0.8 + Math.random() * 2
      ctx.beginPath()
      ctx.moveTo(x, 0)
      for (let y = 0; y <= H; y += 32) ctx.lineTo(x + Math.sin(y * 0.02 + k) * 3, y)
      ctx.stroke()
    }
    // 옹이 하나쯤
    if (Math.random() < 0.4) {
      const x = i * sw + sw * (0.3 + Math.random() * 0.4)
      const y = Math.random() * H
      ctx.fillStyle = 'rgba(70,35,12,0.45)'
      ctx.beginPath()
      ctx.ellipse(x, y, 7, 13, 0, 0, Math.PI * 2)
      ctx.fill()
    }
    ctx.fillStyle = 'rgba(40,18,6,0.85)'
    ctx.fillRect(i * sw - 2, 0, 4, H)
  }
  return finish(c)
}
