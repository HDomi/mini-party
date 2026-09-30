import { useSyncExternalStore } from 'react'

// History API 기반 라우터. GitHub Pages는 SPA fallback이 없으므로 빌드가 index.html을 404.html로도
// 복사해 두고(package.json `build`), 없는 경로로 들어와도 같은 앱이 뜨게 한다.

/** vite `base`. dev에서는 `/`, 배포에서는 `/mini-party/`. 항상 `/`로 끝난다. */
const BASE = import.meta.env.BASE_URL

/** 앱 안의 경로. base를 뺀 나머지로, `/`로 시작하고 끝의 `/`는 없다(루트는 `/`). */
export function currentPath(): string {
  const p = location.pathname
  const rest = p.startsWith(BASE) ? p.slice(BASE.length) : p === BASE.slice(0, -1) ? '' : p.slice(1)
  return `/${rest.replace(/\/+$/, '')}`
}

/** 앱 경로를 실제 URL pathname으로 바꾼다. */
export function toUrl(path: string): string {
  return BASE + path.replace(/^\/+/, '')
}

/** 공유용 전체 URL. */
export function absoluteUrl(path: string): string {
  return location.origin + toUrl(path)
}

const listeners = new Set<() => void>()

export function navigate(path: string, { replace = false } = {}) {
  const url = toUrl(path)
  if (replace) history.replaceState(null, '', url)
  else if (url !== location.pathname) history.pushState(null, '', url)
  listeners.forEach((fn) => fn())
}

function subscribe(fn: () => void) {
  listeners.add(fn)
  window.addEventListener('popstate', fn)
  return () => {
    listeners.delete(fn)
    window.removeEventListener('popstate', fn)
  }
}

export function usePath(): string {
  return useSyncExternalStore(subscribe, currentPath)
}
