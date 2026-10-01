import { describe, expect, it } from 'vitest'
import { roomSkew } from './skew'

describe('roomSkew', () => {
  it('ignores rooms made before versions were stored', () => {
    expect(roomSkew(undefined, 2)).toBeNull()
  })

  it('tells which side is out of date', () => {
    expect(roomSkew(2, 2)).toBeNull()
    expect(roomSkew(3, 2)).toBe('reload')
    expect(roomSkew(1, 2)).toBe('old-room')
  })
})
