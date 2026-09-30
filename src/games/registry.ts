import type { ComponentType } from 'react'
import { OmokApp } from './omok/OmokApp'
import omokCover from './omok/assets/cover.webp'
import yutCover from './yutnori/assets/cover.webp'
import { YutnoriApp } from './yutnori/YutnoriApp'

/** 커버 사진 출처. 라이선스가 저작자 표시를 요구하므로 메인화면 아래에 보인다. */
export interface CoverCredit {
  author: string
  title: string
  url: string
  license: string
  licenseUrl: string
}

export interface GameEntry {
  /** `RoomData.gameType`. */
  id: string
  /** URL 첫 segment. `/yut/ABCD` 의 `yut`. */
  slug: string
  title: string
  tagline: string
  tags: string[]
  /** 메인화면 타일의 강조색. */
  color: string
  /** 타일 배경에 옅게 까는 사진. */
  cover: string
  credit: CoverCredit
  /** 없으면 메인화면에 "준비 중"으로만 보인다. `sub` 는 slug 뒤의 경로(`''`, `bot`, `ABCD`). */
  App?: ComponentType<{ sub: string }>
}

export const GAMES: GameEntry[] = [
  {
    id: 'yutnori',
    slug: 'yut',
    title: '윷놀이',
    tagline: '던지고, 업고, 잡고!',
    tags: ['2~6명', '팀전', '봇'],
    color: '#e8574a',
    cover: yutCover,
    credit: {
      author: '국립국어원',
      title: 'Yut-nori',
      url: 'https://commons.wikimedia.org/wiki/File:Yut-nori.jpg',
      license: 'CC BY-SA 2.0 KR',
      licenseUrl: 'https://creativecommons.org/licenses/by-sa/2.0/kr/',
    },
    App: YutnoriApp,
  },
  {
    id: 'omok',
    slug: 'omok',
    title: '오목',
    tagline: '다섯 알을 먼저 잇기',
    tags: ['2명', '관전', '봇'],
    color: '#2f8fd8',
    cover: omokCover,
    credit: {
      author: 'Dietmar Rabich / Wikimedia Commons',
      title: 'Go — 2021 — 6732',
      url: 'https://commons.wikimedia.org/wiki/File:Go_--_2021_--_6732.jpg',
      license: 'CC BY-SA 4.0',
      licenseUrl: 'https://creativecommons.org/licenses/by-sa/4.0/',
    },
    App: OmokApp,
  },
]

export const gameBySlug = (slug: string) => GAMES.find((g) => g.slug === slug && g.App)
export const gameById = (id: string) => GAMES.find((g) => g.id === id && g.App)
