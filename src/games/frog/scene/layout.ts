import * as THREE from 'three'
import { HOLES } from '../game/rules'

// 통은 원점에 서 있다. 카메라 쪽(+z)이 앞이다.

export const HALF_H = 2.1
/** 위아래 끝의 반지름. 가운데는 볼록하다. */
export const R_END = 1.7
export const R_MID = 2.05
/** 통 벽 두께. 위에서 들여다보면 보인다. */
export const WALL = 0.12

export const radiusAt = (y: number) => R_END + (R_MID - R_END) * (1 - (y / HALF_H) ** 2)
const slopeAt = (y: number) => (R_MID - R_END) * ((-2 * y) / HALF_H ** 2)

/** 구멍 줄의 높이. 줄마다 8개, 둘째 줄은 반 칸 어긋난다. */
export const ROWS = [-1.15, -0.1, 0.95]
export const PER_ROW = HOLES / ROWS.length
/** 쇠테 높이. 구멍 줄 사이에 있다. */
export const HOOPS = [-1.85, -0.62, 0.42, 1.85]

export interface Hole {
  pos: THREE.Vector3
  /** 바깥쪽 법선. */
  normal: THREE.Vector3
  /** 로컬 +z 를 법선에 맞추는 회전. 구멍과 칼이 이 자세로 놓인다. */
  quat: THREE.Quaternion
}

const Z = new THREE.Vector3(0, 0, 1)

export const HOLE_LIST: Hole[] = Array.from({ length: HOLES }, (_, i) => {
  const row = Math.floor(i / PER_ROW)
  const col = i % PER_ROW
  const a = ((col + (row % 2) * 0.5) / PER_ROW) * Math.PI * 2
  const y = ROWS[row]
  const r = radiusAt(y)
  const pos = new THREE.Vector3(Math.sin(a) * r, y, Math.cos(a) * r)
  const normal = new THREE.Vector3(Math.sin(a), -slopeAt(y), Math.cos(a)).normalize()
  return { pos, normal, quat: new THREE.Quaternion().setFromUnitVectors(Z, normal) }
})

// ── 칼 한 번의 연출(초). 상태가 도착한 순간부터 잰다. ──

/** 칼을 뒤로 빼며 뜸 들이는 시간. */
export const WINDUP = 0.32
/** 찌르는 시간. */
export const THRUST = 0.07
/** 칼이 박히는 순간. 불꽃이 튀고 개구리가 움찔한다. */
export const IMPACT = WINDUP + THRUST
/** 당첨이면 박히자마자 개구리가 튀어나간다. */
export const POP = IMPACT + 0.03
/** 개구리가 날아올랐다가 다시 통에 떨어질 때까지. */
export const FLIGHT = 1.6
export const LAND = POP + FLIGHT

/** 다음 사람이 고를 수 있을 때까지(ms). */
export const STAB_MS = Math.round((IMPACT + 0.45) * 1000)
/** 결과 카드를 띄울 때까지(ms). 개구리가 떨어져 어지러워할 시간을 준다. */
export const RESULT_MS = Math.round((LAND + 1.1) * 1000)
