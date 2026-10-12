// 화면을 채우는 캔버스는 픽셀 수가 프레임 시간을 좌우한다. 큰 모니터나 레티나에서 픽셀이 이보다 많으면 배율을 낮춘다.
export const PIXEL_BUDGET = 2_400_000

/**
 * 캔버스의 시작 배율. 기기 배율과 `max` 중 작은 값에서 시작하고, 그래도 픽셀이 `PIXEL_BUDGET` 을 넘으면 낮춘다.
 * 1 아래로는 내리지 않는다(글씨와 선이 흐려진다). `w`, `h` 는 캔버스의 CSS 픽셀 크기이고 기본은 창 크기다.
 */
export function budgetDpr(max = 1.5, w?: number, h?: number): number {
  if (typeof window === 'undefined') return 1
  const ratio = window.devicePixelRatio || 1
  const px = (w ?? window.innerWidth) * (h ?? window.innerHeight)
  const fit = px > 0 ? Math.sqrt(PIXEL_BUDGET / px) : max
  return Math.min(ratio, max, Math.max(1, fit))
}
