import type { MutableRefObject } from 'react'

/**
 * 마지막 칼 한 번의 연출 시계. 씬 안의 여러 부분(칼, 불꽃, 개구리, 통 흔들림)이 같은 시각을 기준으로 움직이도록
 * `FrogScene` 이 프레임마다 갱신하고 나머지는 읽기만 한다. `start` 는 three 시계(초)이고, 처음 그릴 때 이미 있던
 * 칼은 아주 옛날에 시작한 것으로 둬서 연출 없이 끝난 모습으로 보인다.
 */
export interface Timeline {
  seq: number
  start: number
  hole: number
  popped: boolean
}

export type TimelineRef = MutableRefObject<Timeline>

export const LONG_AGO = -1e6

/** 마지막 칼 연출이 시작된 뒤 지난 초. */
export const since = (tl: Timeline, now: number) => now - tl.start
