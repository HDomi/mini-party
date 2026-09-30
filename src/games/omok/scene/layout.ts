import { SIZE } from '../game/rules'

/** 줄 간격이 1 이다. 판은 바깥 줄에서 한 칸씩 여유를 둔다. */
export const HALF = (SIZE - 1) / 2
export const BOARD_SIZE = SIZE + 1
export const BOARD_TOP = 0.7
export const STONE_R = 0.46
export const STONE_H = 0.2

export type Vec3 = [number, number, number]

export function cellPos(p: number, y = BOARD_TOP): Vec3 {
  const x = p % SIZE
  const z = (p - x) / SIZE
  return [x - HALF, y, z - HALF]
}

/** 판 위의 점(월드 좌표)에서 가장 가까운 교차점. 교차점에서 너무 멀면 null. */
export function nearestCell(x: number, z: number): number | null {
  const cx = Math.round(x + HALF)
  const cz = Math.round(z + HALF)
  if (cx < 0 || cz < 0 || cx >= SIZE || cz >= SIZE) return null
  if (Math.hypot(x + HALF - cx, z + HALF - cz) > 0.55) return null
  return cz * SIZE + cx
}

/** 화점(별). 15줄 판의 네 귀와 한가운데(천원). */
export const STAR_POINTS: [number, number][] = [
  [3, 3],
  [11, 3],
  [7, 7],
  [3, 11],
  [11, 11],
]
