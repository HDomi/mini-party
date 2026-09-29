import { describe, expect, it } from 'vitest'
import { roomsRoot } from './paths'

describe('roomsRoot', () => {
  it('nests rooms under the key', () => {
    expect(roomsRoot('abcdef0123456789')).toBe('yutnori/abcdef0123456789/rooms')
  })

  it('rejects missing, short or path-breaking keys', () => {
    for (const k of [undefined, '', 'short', 'abcdef0123456789.x', 'abcdef0123456789/x']) expect(() => roomsRoot(k)).toThrow()
  })
})
