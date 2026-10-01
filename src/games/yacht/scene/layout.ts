import * as THREE from 'three'
import { DICE, seededRng } from '../game/rules'

/** 주사위 한 변. */
export const DIE = 1
/** 쟁반 안쪽 크기(x, z). 카메라 쪽(+z)이 앞이다. */
export const TRAY_W = 11
export const TRAY_D = 8.2
export const RIM = 0.45
export const RIM_H = 0.75
/** 잡은 주사위가 앞쪽 띠에 한 줄로 선다. */
export const HELD_Z = TRAY_D / 2 - 1.05
export const HELD_GAP = 1.5
/** 앞쪽 띠와 굴리는 곳을 나누는 선. */
export const DIVIDER_Z = HELD_Z - 0.95

/** 굴린 주사위가 멈추는 곳. 쟁반 벽과 앞쪽 띠에서 떨어져 있다. */
const AREA = { x0: -TRAY_W / 2 + 0.9, x1: TRAY_W / 2 - 0.9, z0: -TRAY_D / 2 + 0.9, z1: DIVIDER_Z - 0.85 }
/** 두 주사위 중심 사이의 최소 거리. 돌려 놓아도 겹치지 않는다. */
const MIN_GAP = 1.6

export interface Spot {
  x: number
  z: number
  yaw: number
}

export const heldSpot = (i: number): Spot => ({ x: (i - (DICE - 1) / 2) * HELD_GAP, z: HELD_Z, yaw: 0 })

/** 굴림마다 다섯 주사위가 멈출 자리. 같은 seed 면 모든 화면에서 같다. */
export function scatter(seed: number): Spot[] {
  const rng = seededRng(seed + 1)
  const out: Spot[] = []
  for (let i = 0; i < DICE; i++) {
    let spot: Spot | null = null
    for (let tries = 0; tries < 60 && !spot; tries++) {
      const x = AREA.x0 + rng() * (AREA.x1 - AREA.x0)
      const z = AREA.z0 + rng() * (AREA.z1 - AREA.z0)
      if (out.every((o) => Math.hypot(o.x - x, o.z - z) >= MIN_GAP)) spot = { x, z, yaw: 0 }
    }
    // 자리를 못 찾으면 가운데 줄에 나란히 둔다.
    spot ??= { x: (i - (DICE - 1) / 2) * 1.9, z: (AREA.z0 + AREA.z1) / 2, yaw: 0 }
    spot.yaw = (rng() - 0.5) * 1.4
    out.push(spot)
  }
  return out
}

// BoxGeometry 면 순서(+x, -x, +y, -y, +z, -z)에 붙인 눈. 마주 보는 면의 합이 7이다.
export const FACE_VALUES = [2, 5, 1, 6, 3, 4]

const X = new THREE.Vector3(1, 0, 0)
const Y = new THREE.Vector3(0, 1, 0)
const Z = new THREE.Vector3(0, 0, 1)

/** 눈 v 가 위를 보게 하는 회전. */
const FACE_UP: Record<number, THREE.Quaternion> = {
  1: new THREE.Quaternion(),
  6: new THREE.Quaternion().setFromAxisAngle(X, Math.PI),
  2: new THREE.Quaternion().setFromAxisAngle(Z, Math.PI / 2),
  5: new THREE.Quaternion().setFromAxisAngle(Z, -Math.PI / 2),
  3: new THREE.Quaternion().setFromAxisAngle(X, -Math.PI / 2),
  4: new THREE.Quaternion().setFromAxisAngle(X, Math.PI / 2),
}

/** 눈 `value` 가 위를 보고 세로축으로 `yaw` 만큼 돈 자세. */
export function restQuat(value: number, yaw: number, out = new THREE.Quaternion()): THREE.Quaternion {
  return out.setFromAxisAngle(Y, yaw).multiply(FACE_UP[value] ?? FACE_UP[1])
}
