import { useEffect, useState } from 'react'
import { quality, rememberedParam, renderStats } from '@/utils/quality'
import styles from './DebugHud.module.scss'

/**
 * 주소에 `?debug` 를 붙이면 왼쪽 아래에 렌더링 상태를 띄운다(`?debug=0` 이면 끈다). 이 탭에서 기억한다.
 * 렉이 걸리는 PC 에서 스크린샷 한 장으로 원인(그래픽 가속, 주사율, 배율)을 가르기 위한 것이다.
 */
export function DebugHud() {
  const [on] = useState(() => {
    const v = rememberedParam('debug')
    return v !== null && v !== '0' && v !== 'false'
  })
  const [info, setInfo] = useState({ fps: 0, hz: 0, cpu: 0, pokes: 0 })

  useEffect(() => {
    if (!on) return
    let raf = 0
    let ticks = 0
    let busy = 0
    let last = performance.now()
    let frames = renderStats.frames
    let pokes = renderStats.pokes
    // 브라우저 화면 갱신 횟수(모니터 주사율에 가깝다)와, 프레임 사이 간격이 길어진 정도로 메인 스레드 부하를 어림한다.
    let prev = last
    const tick = (t: number) => {
      ticks++
      busy += Math.max(0, t - prev - 1000 / 60)
      prev = t
      if (t - last >= 1000) {
        const sec = (t - last) / 1000
        setInfo({
          fps: Math.round((renderStats.frames - frames) / sec),
          hz: Math.round(ticks / sec),
          cpu: Math.min(100, Math.round((busy / (t - last)) * 100)),
          pokes: Math.round((renderStats.pokes - pokes) / sec),
        })
        frames = renderStats.frames
        pokes = renderStats.pokes
        ticks = 0
        busy = 0
        last = t
      }
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [on])

  if (!on) return null
  const q = quality()
  return (
    <aside className={styles.hud} aria-label="렌더링 진단">
      <b>
        그리기 {info.fps}fps · 화면 {info.hz}Hz · 지연 {info.cpu}% · 활동 {info.pokes}/s
      </b>
      <span>
        화질 {q.low ? '낮음' : '보통'}({q.source === 'forced' ? '주소로 지정' : '자동'}) · 최대 {q.fps}fps · 배율 {renderStats.dpr ? renderStats.dpr.toFixed(2) : '-'}
        {' '}(기기 {window.devicePixelRatio})
      </span>
      <span>
        창 {window.innerWidth}×{window.innerHeight} · {q.renderer}
      </span>
    </aside>
  )
}
