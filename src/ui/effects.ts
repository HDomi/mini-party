import confetti from 'canvas-confetti'
import type { Result } from '../game/rules'

const base = { disableForReducedMotion: true, zIndex: 26 } as const

function palette(color: string) {
  return [color, '#ffd35a', '#ffffff', '#ff8fa3', '#8fd3ff']
}

/** Burst for 윷 and 모; 모 gets side cannons and stars on top. */
export function celebrateThrow(result: Result, color: string) {
  const colors = palette(color)
  if (result === 'yut') {
    void confetti({ ...base, particleCount: 90, spread: 80, startVelocity: 42, origin: { x: 0.5, y: 0.55 }, colors })
    return
  }
  if (result !== 'mo') return
  void confetti({ ...base, particleCount: 140, spread: 110, startVelocity: 50, origin: { x: 0.5, y: 0.55 }, colors, scalar: 1.1 })
  void confetti({ ...base, particleCount: 40, spread: 360, startVelocity: 28, origin: { x: 0.5, y: 0.45 }, shapes: ['star'], colors: ['#ffd35a', '#ffb300'], scalar: 1.6, ticks: 160 })
  window.setTimeout(() => {
    void confetti({ ...base, particleCount: 60, angle: 60, spread: 60, origin: { x: 0, y: 0.8 }, colors })
    void confetti({ ...base, particleCount: 60, angle: 120, spread: 60, origin: { x: 1, y: 0.8 }, colors })
  }, 180)
}

/** Keeps firing from both sides for a few seconds. Returns a cancel fn. */
export function celebrateWin(color: string): () => void {
  const colors = palette(color)
  const end = Date.now() + 3200
  const id = window.setInterval(() => {
    if (Date.now() > end) return window.clearInterval(id)
    void confetti({ ...base, zIndex: 35, particleCount: 7, angle: 60, spread: 58, origin: { x: 0, y: 0.7 }, colors })
    void confetti({ ...base, zIndex: 35, particleCount: 7, angle: 120, spread: 58, origin: { x: 1, y: 0.7 }, colors })
  }, 90)
  return () => window.clearInterval(id)
}
