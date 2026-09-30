import type { AnchorHTMLAttributes, MouseEvent } from 'react'
import { navigate, toUrl } from './history'

/** 새로고침 없이 이동하는 `<a>`. 새 탭 열기(⌘/Ctrl/휠 클릭)는 브라우저에 맡긴다. */
export function Link({ to, onClick, ...props }: { to: string } & AnchorHTMLAttributes<HTMLAnchorElement>) {
  const handle = (e: MouseEvent<HTMLAnchorElement>) => {
    onClick?.(e)
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return
    e.preventDefault()
    navigate(to)
  }
  return <a href={toUrl(to)} onClick={handle} {...props} />
}
