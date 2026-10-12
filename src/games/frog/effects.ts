import confetti from 'canvas-confetti'

const base = { disableForReducedMotion: true, zIndex: 35 } as const

/** 몇 초 동안 양쪽에서 계속 쏜다. 취소 함수를 반환한다. */
export function celebrateWin(colors: string[]): () => void {
  const palette = [...colors, '#ffd35a', '#8fd3ff']
  const end = Date.now() + 2800
  const id = window.setInterval(() => {
    if (Date.now() > end) return window.clearInterval(id)
    void confetti({ ...base, particleCount: 7, angle: 60, spread: 58, origin: { x: 0, y: 0.7 }, colors: palette })
    void confetti({ ...base, particleCount: 7, angle: 120, spread: 58, origin: { x: 1, y: 0.7 }, colors: palette })
  }, 90)
  return () => window.clearInterval(id)
}
