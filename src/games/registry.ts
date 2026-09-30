import type { ComponentType } from 'react'
import { YutnoriApp } from './yutnori/YutnoriApp'

export interface GameEntry {
  /** `RoomData.gameType`. */
  id: string
  /** URL 첫 segment. `/yut/ABCD` 의 `yut`. */
  slug: string
  title: string
  tagline: string
  players: string
  /** 없으면 메인화면에 "준비 중"으로만 보인다. `sub` 는 slug 뒤의 경로(`''`, `bot`, `ABCD`). */
  App?: ComponentType<{ sub: string }>
}

export const GAMES: GameEntry[] = [
  { id: 'yutnori', slug: 'yut', title: '윷놀이', tagline: '던지고, 업고, 잡고', players: '2~6명 · 팀전 · 봇', App: YutnoriApp },
  { id: 'omok', slug: 'omok', title: '오목', tagline: '다섯 알을 먼저 잇기', players: '2명' },
]

export const gameBySlug = (slug: string) => GAMES.find((g) => g.slug === slug && g.App)
export const gameById = (id: string) => GAMES.find((g) => g.id === id && g.App)
