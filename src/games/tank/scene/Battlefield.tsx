import { useEffect, useLayoutEffect, useRef } from 'react'
import type { GameState } from '../game/rules'
import { BattleScene, type LocalAim } from './BattleScene'

/** `BattleScene` 을 캔버스에 붙이고 매 프레임 돌린다. */
export function Battlefield({
  game,
  getLocal,
  inset = 0,
  labels = true,
  sound = true,
  onBusy,
  className,
}: {
  game: GameState
  /** 매 프레임 읽는다. 이동 미리보기가 React 렌더 없이 움직인다. */
  getLocal?: () => LocalAim | null
  /** 아래 조작판 높이(px). */
  inset?: number
  labels?: boolean
  sound?: boolean
  /** 발사 재생을 시작하면 true, 끝났거나 재생할 것이 없으면 false. */
  onBusy?: (busy: boolean) => void
  className?: string
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const sceneRef = useRef<BattleScene | null>(null)
  const localRef = useRef(getLocal)
  const busyRef = useRef(onBusy)
  useLayoutEffect(() => {
    localRef.current = getLocal
    busyRef.current = onBusy
  })

  useEffect(() => {
    const canvas = canvasRef.current!
    const scene = new BattleScene(canvas)
    scene.labels = labels
    scene.sound = sound
    scene.onBusy = (b) => busyRef.current?.(b)
    sceneRef.current = scene

    const fit = () => {
      const r = canvas.getBoundingClientRect()
      scene.resize(r.width, r.height, Math.min(2, window.devicePixelRatio || 1))
    }
    fit()
    const ro = new ResizeObserver(fit)
    ro.observe(canvas)

    let raf = 0
    const tick = (now: number) => {
      scene.local = localRef.current?.() ?? null
      scene.frame(now)
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)

    // 좁은 화면에서는 끌어서 전장을 둘러본다.
    let drag: { x: number; id: number } | null = null
    const down = (e: PointerEvent) => {
      drag = { x: e.clientX, id: e.pointerId }
    }
    const move = (e: PointerEvent) => {
      if (!drag || drag.id !== e.pointerId) return
      scene.pan(e.clientX - drag.x)
      drag.x = e.clientX
    }
    const up = () => {
      drag = null
    }
    canvas.addEventListener('pointerdown', down)
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
    window.addEventListener('pointercancel', up)

    return () => {
      cancelAnimationFrame(raf)
      ro.disconnect()
      canvas.removeEventListener('pointerdown', down)
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      window.removeEventListener('pointercancel', up)
      sceneRef.current = null
    }
    // 장면은 한 번만 만든다. 바뀌는 값은 아래 effect 와 ref 로 넘긴다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // 처음에는 inset 을 바로 적용해야 하므로 sync 보다 먼저 둔다.
  useEffect(() => {
    sceneRef.current?.setInset(inset)
  }, [inset])

  // 재생할 것이 없으면 바로 끝났다고 알린다.
  useEffect(() => {
    const scene = sceneRef.current
    if (!scene) return
    scene.sync(game)
    if (!scene.busy) busyRef.current?.(false)
  }, [game])

  return <canvas ref={canvasRef} className={className} style={{ touchAction: 'none' }} />
}
