import * as THREE from 'three'
import { describe, expect, it } from 'vitest'
import { FACE_VALUES, restQuat, scatter } from './layout'

// BoxGeometry 면 순서의 바깥쪽 법선.
const NORMALS = [
  [1, 0, 0],
  [-1, 0, 0],
  [0, 1, 0],
  [0, -1, 0],
  [0, 0, 1],
  [0, 0, -1],
].map(([x, y, z]) => new THREE.Vector3(x, y, z))

describe('주사위 자세', () => {
  it('restQuat 은 그 눈의 면을 위로 돌린다', () => {
    for (let v = 1; v <= 6; v++) {
      for (const yaw of [0, 0.7, -1.2]) {
        const n = NORMALS[FACE_VALUES.indexOf(v)].clone().applyQuaternion(restQuat(v, yaw))
        expect(n.y).toBeCloseTo(1, 6)
      }
    }
  })

  it('마주 보는 면의 합은 7이다', () => {
    for (let i = 0; i < 6; i += 2) expect(FACE_VALUES[i] + FACE_VALUES[i + 1]).toBe(7)
  })

  it('굴린 주사위끼리 겹치지 않고, 같은 seed 면 같은 자리다', () => {
    for (let seed = 0; seed < 200; seed++) {
      const s = scatter(seed)
      for (let i = 0; i < s.length; i++)
        for (let j = i + 1; j < s.length; j++) expect(Math.hypot(s[i].x - s[j].x, s[i].z - s[j].z)).toBeGreaterThanOrEqual(1.5)
    }
    expect(scatter(42)).toEqual(scatter(42))
  })
})
