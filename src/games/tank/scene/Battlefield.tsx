import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { GameState } from '../game/rules'
import { BattleScene, type LocalAim } from './BattleScene'
import styles from './Battlefield.module.scss'

/** 이만큼(px) 넘게 움직여야 드래그로 본다. 탭이 카메라를 건드리지 않게 한다. */
const DRAG_SLOP = 5
const DOUBLE_TAP_MS = 300

/**
 * `BattleScene` 을 캔버스에 붙이고 매 프레임 돌린다.
 * 뷰포트: 드래그(마우스·한 손가락)로 이동, 휠·핀치로 확대/축소, 더블클릭·더블탭으로 기본 보기.
 */
export function Battlefield({
  game,
  getLocal,
  inset = 0,
  labels = true,
  sound = true,
  interactive = true,
  myId,
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
  /** 끄면 뷰포트 조작과 보기 버튼이 없다(메뉴 배경). */
  interactive?: boolean
  /** "내 탱크" 버튼이 확대할 탱크. 관전자는 없다. */
  myId?: string
  /** 발사 재생을 시작하면 true, 끝났거나 재생할 것이 없으면 false. */
  onBusy?: (busy: boolean) => void
  className?: string
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const sceneRef = useRef<BattleScene | null>(null)
  const localRef = useRef(getLocal)
  const busyRef = useRef(onBusy)
  const [custom, setCustom] = useState(false)
  const [fits, setFits] = useState(false)
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
    // 자동화로 카메라 값을 확인하기 위한 테스트 훅. 프로덕션 빌드에서는 제거된다
    if (import.meta.env.DEV && interactive) (window as unknown as Record<string, unknown>).__scene = scene

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
      // 값이 같으면 React 가 렌더를 건너뛴다.
      setCustom(scene.custom)
      setFits(scene.fitsAtDefault)
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)

    const offs: (() => void)[] = []
    const on = <K extends keyof HTMLElementEventMap>(type: K, fn: (e: HTMLElementEventMap[K]) => void, opts?: AddEventListenerOptions) => {
      canvas.addEventListener(type, fn, opts)
      offs.push(() => canvas.removeEventListener(type, fn, opts))
    }

    if (interactive) {
      const at = (e: { clientX: number; clientY: number }) => {
        const r = canvas.getBoundingClientRect()
        return { x: e.clientX - r.left, y: e.clientY - r.top }
      }
      const pts = new Map<number, { x: number; y: number }>()
      const pair = () => {
        const [a, b] = [...pts.values()]
        return { d: Math.max(1, Math.hypot(a.x - b.x, a.y - b.y)), x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }
      }
      let pinch: ReturnType<typeof pair> | null = null
      let travel = 0
      let lastTap = 0

      on('pointerdown', (e) => {
        if (e.pointerType === 'mouse' && e.button !== 0) return
        canvas.setPointerCapture(e.pointerId)
        pts.set(e.pointerId, at(e))
        if (pts.size === 1) travel = 0
        pinch = pts.size === 2 ? pair() : null
      })
      on('pointermove', (e) => {
        const prev = pts.get(e.pointerId)
        if (!prev) return
        const p = at(e)
        pts.set(e.pointerId, p)
        if (pts.size === 1) {
          travel += Math.hypot(p.x - prev.x, p.y - prev.y)
          if (travel > DRAG_SLOP) scene.pan(p.x - prev.x, p.y - prev.y)
        } else if (pts.size === 2 && pinch) {
          // 두 손가락: 벌린 만큼 확대하고, 가운데가 움직인 만큼 옮긴다.
          const next = pair()
          scene.zoomAt(next.d / pinch.d, next.x, next.y)
          scene.pan(next.x - pinch.x, next.y - pinch.y)
          pinch = next
          travel = Infinity
        }
      })
      const up = (e: PointerEvent) => {
        if (!pts.delete(e.pointerId)) return
        pinch = pts.size === 2 ? pair() : null
        // 마우스는 dblclick 으로 처리한다. 손가락은 짧게 두 번 톡톡 치면 기본 보기.
        if (pts.size === 0 && e.pointerType !== 'mouse' && travel <= DRAG_SLOP) {
          if (e.timeStamp - lastTap < DOUBLE_TAP_MS) {
            scene.resetView()
            lastTap = 0
          } else lastTap = e.timeStamp
        }
      }
      on('pointerup', up)
      on('pointercancel', up)
      on(
        'wheel',
        (e) => {
          e.preventDefault()
          // 트랙패드 핀치는 ctrlKey 가 붙은 wheel 로 오고 delta 가 작다.
          const p = at(e)
          scene.zoomAt(Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : 0.0015)), p.x, p.y)
        },
        { passive: false },
      )
      on('dblclick', () => scene.resetView())
      // iOS Safari 는 캔버스 위 핀치를 페이지 확대로 가져가려 한다.
      const stop = (e: Event) => e.preventDefault()
      canvas.addEventListener('gesturestart', stop)
      offs.push(() => canvas.removeEventListener('gesturestart', stop))
    }

    return () => {
      cancelAnimationFrame(raf)
      ro.disconnect()
      offs.forEach((off) => off())
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

  return (
    <>
      <canvas ref={canvasRef} className={className} style={{ touchAction: 'none' }} />
      {interactive && (
        <div className={styles.view}>
          {myId && (
            <button title="내 탱크 확대" onClick={() => sceneRef.current?.focusTank(myId)}>
              <b aria-hidden>⌖</b>내 탱크
            </button>
          )}
          {(!fits || custom) && (
            <button title="맵 전체 보기" onClick={() => sceneRef.current?.fitMap()}>
              <b aria-hidden>⤢</b>전체
            </button>
          )}
          {custom && (
            <button title="기본 보기(더블클릭·더블탭)" onClick={() => sceneRef.current?.resetView()}>
              <b aria-hidden>↺</b>기본
            </button>
          )}
        </div>
      )}
    </>
  )
}
