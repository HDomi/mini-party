import { useEffect, useState } from 'react'
import { newerDeployed } from '@/version'
import styles from './UpdateBanner.module.scss'

/** 새 배포를 몇 분마다, 그리고 탭으로 돌아올 때 확인한다. */
const CHECK_MS = 3 * 60 * 1000

/** 새 버전이 배포되면 새로고침하라고 알린다. 게임 중일 수 있으므로 저절로 새로고침하지는 않는다. */
export function UpdateBanner() {
  const [stale, setStale] = useState(false)
  const [hidden, setHidden] = useState(false)

  useEffect(() => {
    if (stale) return
    let alive = true
    const check = () => {
      if (document.visibilityState !== 'visible') return
      void newerDeployed().then((v) => alive && v && setStale(true))
    }
    check()
    const id = window.setInterval(check, CHECK_MS)
    document.addEventListener('visibilitychange', check)
    window.addEventListener('focus', check)
    return () => {
      alive = false
      window.clearInterval(id)
      document.removeEventListener('visibilitychange', check)
      window.removeEventListener('focus', check)
    }
  }, [stale])

  if (!stale || hidden) return null
  return (
    <div className={styles.banner} role="status">
      <span>새 버전이 나왔어요</span>
      <button className="btn primary small" onClick={() => window.location.reload()}>
        새로고침
      </button>
      <button className={styles.close} aria-label="닫기" onClick={() => setHidden(true)}>
        ×
      </button>
    </div>
  )
}
