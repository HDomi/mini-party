import { Canvas, useFrame, useThree, type CanvasProps } from '@react-three/fiber'
import { useEffect, useMemo } from 'react'
import { framePacer, isRealInput, quality, renderStats } from '@/utils/quality'

/**
 * 게임의 3D 캔버스. r3f `Canvas` 에 렌더링 품질(`quality`)을 입힌다.
 *
 * - 그리는 때는 이 컴포넌트만 정한다(`frameloop="never"` + `advance`). OrbitControls 같은 것이 invalidate 를 불러도
 *   더 그리지 않는다.
 * - 모니터 주사율과 관계없이 1초에 `fps` 번까지만, 판이 바뀌거나 입력이 없으면 `idleFps` 번만 그린다.
 * - 그래픽 가속이 없으면 그림자와 안티에일리어싱을 끄고 배율을 낮춘다.
 */
export function PartyCanvas({
  backdrop,
  shadows,
  dpr = 1,
  children,
  ...rest
}: Omit<CanvasProps, 'frameloop' | 'dpr' | 'gl'> & {
  /** 메뉴 배경처럼 흐리게 깔리는 화면. 더 적게 그린다. */
  backdrop?: boolean
  dpr?: number
}) {
  const q = quality()
  const pacer = useMemo(
    () => (backdrop ? framePacer(q.backdropFps, q.backdropFps) : framePacer(q.fps, q.idleFps)),
    [backdrop, q.backdropFps, q.fps, q.idleFps],
  )
  // 부모가 다시 그려졌다는 건 판이 바뀌었다는 뜻이다. 연출이 끝날 때까지 부드럽게 그린다.
  useEffect(() => pacer.poke())
  return (
    <Canvas
      {...rest}
      frameloop="never"
      shadows={q.low ? false : shadows}
      dpr={q.low ? Math.min(dpr, 0.75) : dpr}
      gl={{ alpha: true, antialias: !q.low, powerPreference: 'high-performance' }}
    >
      <Pacer pacer={pacer} track={!backdrop} />
      {children}
    </Canvas>
  )
}

function Pacer({ pacer, track }: { pacer: ReturnType<typeof framePacer>; track: boolean }) {
  const advance = useThree((s) => s.advance)
  const canvas = useThree((s) => s.gl.domElement)

  useEffect(() => {
    let raf = 0
    let start = -1
    const tick = (t: number) => {
      raf = requestAnimationFrame(tick)
      if (start < 0) start = t
      // 시계는 이 캔버스가 처음 그린 때부터의 초다. 덜 그려도 애니메이션 속도는 같다.
      if (pacer.due(t)) advance((t - start) / 1000)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [pacer, advance])

  // 판을 돌리거나 구멍·돌을 고르는 동안에도 부드럽게 그린다.
  useEffect(() => {
    const poke = (e: Event) => {
      if (isRealInput(e)) pacer.poke()
    }
    const types = ['pointerdown', 'pointermove', 'wheel'] as const
    for (const t of types) canvas.addEventListener(t, poke, { passive: true })
    return () => {
      for (const t of types) canvas.removeEventListener(t, poke)
    }
  }, [pacer, canvas])

  useFrame(({ gl }) => {
    if (!track) return
    renderStats.frames++
    renderStats.dpr = gl.getPixelRatio()
  })
  return null
}
