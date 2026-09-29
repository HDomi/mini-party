import { Html } from '@react-three/drei'
import { useEffect, useState, type ComponentProps } from 'react'

/**
 * drei's <Html> creates its own React root. Mounting it inside a synchronous
 * (click-triggered) render makes React drop the root, so mount on the next task.
 * setTimeout rather than rAF: rAF never fires in background tabs.
 */
export function SafeHtml(props: ComponentProps<typeof Html>) {
  const [ready, setReady] = useState(false)
  useEffect(() => {
    const id = window.setTimeout(() => setReady(true), 0)
    return () => window.clearTimeout(id)
  }, [])
  return ready ? <Html zIndexRange={[10, 0]} {...props} /> : null
}
