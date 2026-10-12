import { afterEach, describe, expect, it, vi } from 'vitest'
import { budgetDpr } from './dpr'

function screen(ratio: number, w: number, h: number) {
  vi.stubGlobal('window', { devicePixelRatio: ratio, innerWidth: w, innerHeight: h })
}

describe('budgetDpr', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('작은 화면은 기기 배율을 1.5 까지 그대로 쓴다', () => {
    screen(3, 390, 780)
    expect(budgetDpr()).toBe(1.5)
    screen(1, 1280, 800)
    expect(budgetDpr()).toBe(1)
  })

  it('픽셀이 많으면 배율을 낮추지만 1 아래로는 내리지 않는다', () => {
    screen(2, 1920, 1080)
    const d = budgetDpr()
    expect(d).toBeLessThan(1.1)
    expect(d * d * 1920 * 1080).toBeLessThanOrEqual(2_400_001)
    screen(1, 3840, 2160)
    expect(budgetDpr()).toBe(1)
  })

  it('캔버스 크기와 최대 배율을 따로 줄 수 있다', () => {
    screen(2, 1920, 1080)
    expect(budgetDpr(2, 600, 400)).toBe(2)
  })
})
