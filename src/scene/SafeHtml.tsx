import { Html } from '@react-three/drei'
import { useEffect, useState, type ComponentProps } from 'react'

/**
 * drei 의 <Html> 은 자체 React 루트를 만든다. 동기(클릭으로 시작된) 렌더 안에서
 * 마운트하면 React 가 그 루트를 버리므로 다음 태스크에서 마운트한다.
 * rAF 대신 setTimeout 을 쓴다: 백그라운드 탭에서는 rAF 가 전혀 실행되지 않는다.
 */
export function SafeHtml(props: ComponentProps<typeof Html>) {
  const [ready, setReady] = useState(false)
  useEffect(() => {
    const id = window.setTimeout(() => setReady(true), 0)
    return () => window.clearTimeout(id)
  }, [])
  return ready ? <Html zIndexRange={[10, 0]} {...props} /> : null
}
